"""Autoclip processing pipeline. All progress is real: yt-dlp hooks,
whisper segment streaming, ffmpeg -progress pipe. Nothing simulated."""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback

from . import config, store, subs, effects
from . import faces as face_mod
from . import relay as relay_mod

import requests

from . import warp as warp_mod

RETRYABLE_YT_PATTERNS = [
    "page needs to be reloaded",
    "requested format",
    "http error 5",
    "temporarily unavailable",
    "connection reset",
    "timed out",
    "premature",
    "please install pysocks",
    "cloudflare anti-bot",   # retry with generic:impersonate (curl_cffi)
    "impersonation",
]
BOT_BLOCK_PATTERNS = [
    "sign in to confirm you",  # covers you're / you’re apostrophe variants
    "confirm you",             # ...you're not a bot / you're not a robot
    "login to access",
    "age-restricted",
    "private video",
    "members-only",
    "use --cookies",
]


class CanceledError(Exception):
    pass


def _check_cancel(job_id):
    row = store.get(job_id)
    if row and row["cancel_requested"]:
        raise CanceledError("canceled by user")


def _set(job_id, **kw):
    store.update(job_id, **kw)


def _stage_progress(job_id, status, stage, msg=""):
    _set(job_id, status=status, stage=stage, progress=0.0, message=msg)


# ---------------------------------------------------------------- download
def yt_client_chain():
    return [
        None,  # default clients
        {"generic": {"impersonate": ["chrome"]}},  # Cloudflare-403 bypass via curl_cffi
        {"youtube": {"player_client": ["android"]}},
        {"youtube": {"player_client": ["ios"]}},
        {"youtube": {"player_client": ["web_safari"]}},
        {"youtube": {"player_client": ["mweb"]}},
    ]


def download_source(job):
    job_id = job["id"]
    job_dir = os.path.join(config.DATA_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    url = job["source_url"]

    import yt_dlp

    # Route through the WARP tunnel when it is up (clean egress IP);
    # direct connection otherwise (direct MP4 links, most platforms).
    use_proxy = False
    try:
        use_proxy = warp_mod.tunnel_healthy(timeout=8)
    except Exception:
        use_proxy = warp_mod.proxy_alive()
    if use_proxy:
        _set(job_id, message="routing through WARP tunnel…")

    final_path = None
    last_err = None
    for attempt, extractor_args in enumerate(yt_client_chain()):
        _check_cancel(job_id)
        _set(job_id, status="downloading", stage="download",
             message=f"downloading (attempt {attempt + 1}/{len(yt_client_chain())})", progress=0.0)

        def hook(d):
            if d["status"] == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                done = d.get("downloaded_bytes", 0)
                pct = (done / total) if total else 0
                speed = d.get("speed") or 0
                eta = d.get("eta")
                speed_str = f"{speed / 1e6:.2f}MB/s" if speed else "--"
                eta_str = f"{eta}s" if eta is not None else "--"
                _set(job_id, progress=round(min(pct, 0.999), 4),
                     message=f"downloading {pct * 100:.0f}% {speed_str} ETA {eta_str}")
            elif d["status"] == "finished":
                _set(job_id, progress=0.999, message="merging streams…")

        opts = {
            "outtmpl": os.path.join(job_dir, "source.%(ext)s"),
            "format": ("bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/"
                       "bv*[height<=1080]+ba/b[height<=1080]/b"),
            "merge_output_format": "mp4",
            "progress_hooks": [hook],
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "socket_timeout": 20,
            "retries": 3,
            "fragment_retries": 5,
        }
        if extractor_args:
            opts["extractor_args"] = extractor_args
        if use_proxy:
            opts["proxy"] = warp_mod.PROXY_URL
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                if info is None:
                    raise RuntimeError("no video info returned")
                title = info.get("title") or os.path.basename(url)
                dur = float(info.get("duration") or 0)
                ext = (info.get("ext") or "mp4").lower()
                if ext != "mp4":  # merged output is mp4
                    ext = "mp4"
                final_path = os.path.join(job_dir, f"source.{ext}")
                if not os.path.exists(final_path):
                    # find whatever was written
                    cands = [f for f in os.listdir(job_dir) if f.startswith("source.")]
                    if not cands:
                        raise RuntimeError("download produced no file")
                    final_path = os.path.join(job_dir, cands[0])
                return final_path, title, dur
        except CanceledError:
            raise
        except Exception as e:
            last_err = str(e)
            low = last_err.lower()
            if any(p in low for p in BOT_BLOCK_PATTERNS):
                if use_proxy:
                    # tunnel egress may be burned — try direct as a last resort
                    use_proxy = False
                    continue
                if relay_mod.is_youtube(url):
                    # datacenter IP blocked by YouTube — relay through loader.to CDN
                    dest = os.path.join(job_dir, "source.mp4")
                    path, title = relay_mod.relay_download(
                        job, url, dest,
                        set_progress=lambda p, msg=None: _set(job_id, progress=p) if msg is None else _set(job_id, progress=p, message=msg),
                        check_cancel=_check_cancel,
                        on_message=lambda m: _set(job_id, message=m),
                    )
                    dur = probe_media(path)["duration"]
                    return path, title or os.path.basename(url), dur
                raise RuntimeError(
                    "This platform is asking for sign-in verification from this server "
                    "(datacenter IP restriction). Try a different link, a direct MP4 URL, "
                    "or upload the file instead."
                )
            if not any(p in low for p in RETRYABLE_YT_PATTERNS):
                raise RuntimeError(f"download failed: {last_err}")
            time.sleep(1.5)  # retryable -> next client
    raise RuntimeError(f"download failed after all fallbacks: {last_err}")


def direct_download(job):
    """Direct media URL via yt-dlp generic extractor (same progress path)."""
    return download_source(job)


# ---------------------------------------------------------------- probe
def probe_media(path):
    cmd = ["ffprobe", "-v", "error", "-show_entries",
           "stream=width,height,codec_type:format=duration,size", "-of", "json", path]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout
    data = json.loads(out)
    vstream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    astream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    if not vstream:
        raise RuntimeError("no video stream found in source")
    return {
        "w": int(vstream["width"]), "h": int(vstream["height"]),
        "duration": float(data.get("format", {}).get("duration") or 0),
        "has_audio": bool(astream),
        "size": int(data.get("format", {}).get("size") or 0),
    }


# ---------------------------------------------------------------- whisper
_whisper_model = None
_whisper_loaded_at = 0.0


def get_whisper():
    global _whisper_model, _whisper_loaded_at
    if _whisper_model is None:
        waited = 0
        while config.free_ram_mb() < config.MIN_FREE_MB_FOR_WHISPER and waited < 240:
            time.sleep(3)
            waited += 3
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(
            config.WHISPER_MODEL, device=config.WHISPER_DEVICE, compute_type=config.WHISPER_COMPUTE
        )
        _whisper_loaded_at = time.time()
    return _whisper_model


def unload_whisper():
    global _whisper_model
    if _whisper_model is not None:
        del _whisper_model
        _whisper_model = None
        import gc
        gc.collect()


def transcribe(job, media_path):
    job_id = job["id"]
    _set(job_id, status="transcribing", stage="transcribe", progress=0.0,
         message="loading speech model…")
    model = get_whisper()
    _set(job_id, message="transcribing…")
    duration = job["duration"]

    segments_gen, info = model.transcribe(
        media_path, vad_filter=True, word_timestamps=True,
        beam_size=1, condition_on_previous_text=False,
    )
    words_all = []
    sentences = []
    cur_words = []
    GAP = config.SENTENCE_GAP

    def flush():
        nonlocal cur_words
        if not cur_words:
            return
        text = " ".join(w["word"] for w in cur_words).strip()
        sentences.append({
            "start": round(cur_words[0]["start"], 3),
            "end": round(cur_words[-1]["end"], 3),
            "text": text,
            "words": cur_words,
        })
        cur_words = []

    lang = getattr(info, "language", None)
    for seg in segments_gen:
        _check_cancel(job_id)
        flush()  # whisper VAD segments already imply a speech gap
        for w in (seg.words or []):
            token = (w.word or "").strip()
            if not token:
                continue
            cur_words.append({"word": token, "start": round(w.start, 3), "end": round(w.end, 3)})
        if duration:
            _set(job_id, progress=round(min(seg.end / duration, 0.999), 4),
                 message=f"transcribing {seg.end:.0f}s / {duration:.0f}s")
    flush()

    # merge whisper-VAD fragments into proper sentences by gap + punctuation
    merged = []
    for s in sentences:
        if merged:
            prev = merged[-1]
            gap = s["start"] - prev["end"]
            ends_sentence = bool(re.search(r"[.!?…\"']$", prev["text"]))
            too_short = (s["end"] - s["start"]) < 1.2 and not ends_sentence
            if gap <= GAP and not ends_sentence and (len(prev["text"]) + len(s["text"]) < 90):
                prev["end"] = s["end"]
                prev["text"] = (prev["text"] + " " + s["text"]).strip()
                prev["words"] = prev["words"] + s["words"]
                continue
        merged.append(dict(s))

    transcript = {"language": lang, "sentences": merged, "words_total": len(words_all)}
    tpath = os.path.join(config.DATA_DIR, job_id, "transcript.json")
    with open(tpath, "w") as f:
        json.dump(transcript, f, ensure_ascii=False)
    _set(job_id, transcript=json.dumps(transcript, ensure_ascii=False), progress=1.0)
    return transcript


# ---------------------------------------------------------------- analysis
VIRAL_MARKERS = re.compile(
    r"(?i)\b(mistake|secret|never|always|biggest|huge|insane|crazy|truth|nobody|everyone|"
    r"why|how|stop|warning|shocking|million|billion|\$|\d+(?:k|m|x)\b|hack|trick|rule|"
    r"step|first|worst|best|fastest|proof|story|happened|actually|realize|realized|"
    r"learned|changed|everything|nobody|money|free|rich|broke|fail|failed|win|won)\b"
)


def heuristic_analysis(sentences, duration, min_len, max_len, max_clips):
    """Fallback picker when the LLM bridge is unavailable. Never breaks the pipeline."""
    scored = []
    for i, s in enumerate(sentences):
        text = s["text"]
        markers = len(VIRAL_MARKERS.findall(text))
        length_bonus = min(len(text) / 18.0, 1.4)
        question = 1.2 if "?" in text else 0.0
        exclam = 0.6 if "!" in text else 0.0
        numbers = 0.8 if re.search(r"\d", text) else 0.0
        score = min(100, int(markers * 16 + length_bonus * 20 + question * 10 + exclam * 10 + numbers * 10))
        scored.append((score, i))

    clips = []
    used = set()
    for score, i in sorted(scored, reverse=True):
        if len(clips) >= max_clips:
            break
        if i in used:
            continue
        # grow window around anchor sentence until length fits
        lo = hi = i
        while (sentences[hi]["end"] - sentences[lo]["start"]) < min_len and (hi + 1 < len(sentences) or lo > 0):
            if hi + 1 < len(sentences) and (hi + 1 not in used):
                hi += 1
            elif lo > 0 and (lo - 1 not in used):
                lo -= 1
            else:
                break
        while (sentences[hi]["end"] - sentences[lo]["start"]) > max_len and hi > lo:
            hi -= 1
        if any(x in used for x in range(lo, hi + 1)):
            continue
        span = sentences[hi]["end"] - sentences[lo]["start"]
        if span < min_len * 0.6:
            continue
        for x in range(lo, hi + 1):
            used.add(x)
        text = " ".join(sentences[k]["text"] for k in range(lo, hi + 1))
        words = text.split()
        title = " ".join(words[:6]).strip().strip(".,!?\"'") or "Highlight"
        clips.append({
            "start": sentences[lo]["start"], "end": sentences[hi]["end"],
            "title": title[:60], "score": max(35, min(95, score + 8)),
            "reason": "heuristic: keyword/emotion density",
        })
    clips.sort(key=lambda c: -c["score"])
    return clips[:max_clips]


def llm_analysis(sentences, duration, min_len, max_len, max_clips, video_title):
    payload = {
        "sentences": [
            {"id": i, "start": s["start"], "end": s["end"], "text": s["text"]}
            for i, s in enumerate(sentences)
        ],
        "duration": duration,
        "minLen": min_len, "maxLen": max_len, "maxClips": max_clips,
        "videoTitle": video_title,
    }
    r = requests.post(f"{config.LLM_BRIDGE_URL}/analyze", json=payload, timeout=180)
    r.raise_for_status()
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("error", "bridge error"))
    return data["clips"]


def analyze(job, transcript):
    job_id = job["id"]
    _set(job_id, status="analyzing", stage="analyze", progress=0.25, message="finding viral moments…")
    settings = json.loads(job["settings"] or "{}")
    s = settings.get("clip") or {}
    min_len = float(s.get("minLen", 15))
    max_len = float(s.get("maxLen", 90))
    max_clips_setting = str(s.get("maxClips", "auto")).lower()
    sentences = transcript["sentences"]
    duration = job["duration"]

    if max_clips_setting in ("auto", ""):
        max_clips = max(3, min(10, int(duration / 75) + 3))
    else:
        max_clips = max(1, min(20, int(float(max_clips_setting))))

    if not sentences:
        raise RuntimeError("No speech detected in this video — cannot auto-clip. "
                           "Try a video with spoken audio.")

    clips = None
    analyzer = "llm"
    try:
        raw = llm_analysis(sentences, duration, min_len, max_len, max_clips, job["video_title"])
        clips = post_process_clips(raw, sentences, duration, min_len, max_len)
    except Exception as e:
        print(f"[pipeline] LLM analysis failed ({e}); using heuristic", file=sys.stderr)
        analyzer = "heuristic"
        clips = None
    if not clips:
        analyzer = "heuristic"
        clips = heuristic_analysis(sentences, duration, min_len, max_len, max_clips)
        clips = post_process_clips(clips, sentences, duration, min_len, max_len)

    clips = clips[:max_clips]
    _set(job_id, progress=1.0, message=f"{len(clips)} moments selected ({analyzer})",
         analysis=json.dumps({"clips": clips, "analyzer": analyzer}))
    apath = os.path.join(config.DATA_DIR, job_id, "analysis.json")
    with open(apath, "w") as f:
        json.dump({"clips": clips, "analyzer": analyzer}, f)
    return clips


def post_process_clips(raw, sentences, duration, min_len, max_len):
    """Snap to sentence boundaries, enforce lengths, dedupe overlaps."""
    by_time = sorted(sentences, key=lambda s: s["start"])
    result = []
    for c in raw:
        try:
            start = float(c.get("start", 0))
            end = float(c.get("end", 0))
        except (TypeError, ValueError):
            continue
        start = max(0.0, start)
        end = min(duration, end)
        if end - start < 2:
            continue
        # snap: first sentence that starts >= start-1 ; last sentence that ends <= end+1
        lo = min((i for i, s in enumerate(by_time) if s["start"] >= start - 1.0),
                 default=0)
        hi = max((i for i, s in enumerate(by_time) if s["end"] <= end + 1.0),
                 default=len(by_time) - 1)
        if hi < lo:
            lo, hi = hi, lo
        s_start = by_time[lo]["start"]
        s_end = by_time[hi]["end"]
        # enforce max by shrinking hi
        while hi > lo and (s_end - s_start) > max_len + 1.0:
            hi -= 1
            s_end = by_time[hi]["end"]
        # enforce min by growing (prefer forward)
        while (s_end - s_start) < min_len and (hi + 1 < len(by_time)):
            hi += 1
            s_end = by_time[hi]["end"]
        if hi + 1 < len(by_time) or True:
            # also try growing backward if still short
            while (s_end - s_start) < min_len * 0.7 and lo > 0:
                lo -= 1
                s_start = by_time[lo]["start"]
        # overlap dedupe
        if any(not (s_end <= r["start"] + 0.01 or s_start >= r["end"] - 0.01) for r in result):
            continue
        title = str(c.get("title") or "Highlight").strip()[:60] or "Highlight"
        try:
            score = int(max(0, min(100, int(c.get("score", 50)))))
        except (TypeError, ValueError):
            score = 50
        result.append({
            "start": round(s_start, 3), "end": round(min(s_end, duration), 3),
            "title": title, "score": score,
            "reason": str(c.get("reason") or "")[:140],
        })
    result.sort(key=lambda c: -c.get("score", 0))
    return result


# ---------------------------------------------------------------- render
def render_job(job, clips, transcript):
    job_id = job["id"]
    settings = json.loads(job["settings"] or "{}")
    aspect = settings.get("aspect", "9:16")
    if aspect not in config.ASPECTS:
        aspect = "9:16"
    face_track = bool(settings.get("faceTrack"))
    preset_id = settings.get("preset", "karaoke")
    if preset_id not in subs.PRESETS:
        preset_id = "karaoke"
    position = int(settings.get("position", 50))
    font_override = settings.get("font")
    font_scale = float(settings.get("fontScale") or 1.0)

    src_path = job["_src_path"]
    job_dir = os.path.join(config.DATA_DIR, job_id)
    clips_dir = os.path.join(job_dir, "clips")
    thumbs_dir = os.path.join(job_dir, "thumbs")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(thumbs_dir, exist_ok=True)

    media = probe_media(src_path)
    src_w, src_h = media["w"], media["h"]

    sentences = transcript["sentences"]
    total_dur = sum(c["end"] - c["start"] for c in clips) or 1.0
    done_dur = 0.0
    results = []
    out_w, out_h = config.ASPECTS[aspect]

    tracker = None
    if face_track and face_mod.has_face_model():
        try:
            tracker = face_mod.FaceTracker()
        except Exception as e:
            print(f"[pipeline] face tracker init failed: {e}", file=sys.stderr)

    _set(job_id, status="rendering", stage="render", progress=0.0, message="rendering…")

    for idx, clip in enumerate(clips):
        _check_cancel(job_id)
        pad = config.SENTENCE_PAD
        start = max(0.0, clip["start"] - pad)
        end = min(media["duration"], clip["end"] + pad)
        clip_dur = end - start
        if clip_dur <= 0.5:
            continue

        # face tracking keyframes for this window
        keyframes = None
        if tracker is not None:
            try:
                _set(job_id, message=f"tracking faces (clip {idx + 1}/{len(clips)})…")
                keyframes = tracker.track(
                    src_path, start, end,
                    progress_cb=lambda p: _set(job_id, progress=round(
                        (done_dur + p * clip_dur * 0.25) / total_dur, 4)),
                    cancel_cb=lambda: (store.get(job_id) or {}).get("cancel_requested"),
                )
            except InterruptedError:
                raise CanceledError("canceled by user")
            except Exception as e:
                print(f"[pipeline] face track failed: {e}", file=sys.stderr)
                keyframes = None

        # subtitles: sentences fully inside clip window
        clip_sentences = [s for s in sentences if s["start"] >= start - 0.15 and s["end"] <= end + 0.15]
        if not clip_sentences:  # fallback: any overlapping
            clip_sentences = [s for s in sentences
                              if s["start"] < end and s["end"] > start]
        rel_sentences = []
        for s in clip_sentences:
            rel_words = [
                {"word": w["word"], "start": w["start"] - start, "end": w["end"] - start}
                for w in s.get("words", [])
                if w["start"] >= start - 0.1 and w["end"] <= end + 0.1
            ]
            if rel_words:
                rel_sentences.append({
                    "start": s["start"] - start, "end": s["end"] - start,
                    "text": s["text"], "words": rel_words,
                })

        ass_path = os.path.join(job_dir, f"subs_{idx}.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(subs.build_ass(rel_sentences, out_w, out_h, preset_id, position,
                                   font_override, font_scale))

        out_path = os.path.join(clips_dir, f"{idx}.mp4")
        wm_path = job.get("_watermark_path")
        cmd = effects.build_ffmpeg_cmd(
            src_path, start, clip_dur, settings, src_w, src_h, aspect,
            ass_path, job_dir, out_path, keyframes, wm_path,
        )
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, start_new_session=True, env=config.engine_env(),
        )
        # parse -progress pipe:1
        while True:
            _check_cancel(job_id)
            line = proc.stdout.readline() if proc.stdout else ""
            if not line:
                break
            m = re.match(r"out_time_ms=(\d+)", line.strip())
            if m:
                out_sec = int(m.group(1)) / 1e6
                p = (done_dur + min(out_sec / clip_dur, 1.0) * clip_dur) / total_dur
                _set(job_id, progress=round(min(p, 0.999), 4),
                     message=f"rendering clip {idx + 1}/{len(clips)}")
            if line.startswith("frame=") or "Error" in line or "error" in line:
                continue
        rc = proc.wait()
        _check_cancel(job_id)
        if rc != 0 or not os.path.exists(out_path):
            raise RuntimeError(f"ffmpeg failed rendering clip {idx + 1} (rc={rc})")

        # thumbnail
        thumb_path = os.path.join(thumbs_dir, f"{idx}.jpg")
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
             "-ss", f"{clip_dur / 2:.2f}", "-i", out_path, "-frames:v", "1",
             "-vf", f"scale={out_w // 2}:-2", thumb_path],
            timeout=60, capture_output=True, env=config.engine_env(),
        )

        done_dur += clip_dur
        results.append({
            "index": idx, "file": f"clips/{idx}.mp4", "thumb": f"thumbs/{idx}.jpg",
            "url": f"/engine/files/{job_id}/clips/{idx}.mp4",
            "thumbUrl": f"/engine/files/{job_id}/thumbs/{idx}.jpg",
            "title": clip["title"], "score": clip["score"], "reason": clip.get("reason", ""),
            "start": round(start, 2), "end": round(end, 2),
            "duration": round(clip_dur, 2),
            "size": os.path.getsize(out_path),
        })
        _set(job_id, clips=json.dumps(results), progress=round(done_dur / total_dur, 4),
             message=f"clip {idx + 1}/{len(clips)} ready")

    return results


# ---------------------------------------------------------------- drive
def upload_to_drive(job_id, clips):
    """Upload finished clips to Google Drive if connected. No-op otherwise."""
    from . import drive
    if not drive.is_configured():
        return None
    _set(job_id, status="uploading", stage="upload", message="uploading to Google Drive…")
    urls = []
    for c in clips:
        _check_cancel(job_id)
        try:
            local = os.path.join(config.DATA_DIR, job_id, c["file"])
            link = drive.upload_file(local, c["title"])
            c["driveUrl"] = link
            urls.append(link)
        except Exception as e:
            print(f"[pipeline] drive upload failed: {e}", file=sys.stderr)
    _set(job_id, clips=json.dumps(clips))
    return urls


# ---------------------------------------------------------------- orchestrator
def process_job(job_id):
    job = store.get(job_id)
    if not job:
        return
    timings = {}
    t0 = time.time()
    job_dir = os.path.join(config.DATA_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    def mark(stage):
        timings[stage] = round(time.time() - t0, 1)
        _set(job_id, stage_timings=json.dumps(timings))

    try:
        # ---------- stage 1: source ----------
        src_path = os.path.join(job_dir, "source.mp4")
        if not os.path.exists(src_path):
            if job["source_kind"] == "upload":
                if not job["upload_path"] or not os.path.exists(job["upload_path"]):
                    raise RuntimeError("uploaded file is missing — please upload again")
                shutil.copy(job["upload_path"], src_path)
                _set(job_id, status="downloading", stage="download", progress=1.0,
                     message="file received")
            else:
                src_path, title, dur = download_source(job)
                _set(job_id, video_title=title)
        mark("download")

        # ---------- stage 2: probe ----------
        media = probe_media(src_path)
        _set(job_id, duration=media["duration"],
             message=f"{media['w']}x{media['h']}, {media['duration']:.0f}s")
        job = store.get(job_id)
        job["_src_path"] = src_path

        # ---------- stage 3: transcribe ----------
        tpath = os.path.join(job_dir, "transcript.json")
        if os.path.exists(tpath):
            with open(tpath) as f:
                transcript = json.load(f)
            _set(job_id, status="transcribing", stage="transcribe", progress=1.0,
                 message="transcript restored")
        else:
            if not media["has_audio"]:
                raise RuntimeError("This video has no audio track — cannot transcribe or caption. "
                                   "Autoclip needs spoken content.")
            transcript = transcribe(job, src_path)
        mark("transcribe")

        # ---------- stage 4: analyze ----------
        apath = os.path.join(job_dir, "analysis.json")
        if os.path.exists(apath) and job.get("status") != "queued" and job["recovery_count"] > 0:
            with open(apath) as f:
                analysis = json.load(f)
            clips = analysis["clips"]
            _set(job_id, status="analyzing", stage="analyze", progress=1.0,
                 message="analysis restored")
        else:
            clips = analyze(job, transcript)
        mark("analyze")

        # ---------- stage 5: render ----------
        job = store.get(job_id)
        job["_src_path"] = src_path
        wm = settings_watermark_path(job)
        if wm:
            job["_watermark_path"] = wm
        clips_out = render_job(job, clips, transcript)
        mark("render")

        # ---------- stage 6: drive ----------
        upload_to_drive(job_id, clips_out)
        mark("upload")

        _set(job_id, status="done", stage="done", progress=1.0,
             message=f"{len(clips_out)} clips ready",
             end_time=time.time(), error="")
    except CanceledError:
        _set(job_id, status="canceled", stage="canceled", message="canceled by user",
             end_time=time.time())
    except Exception as e:
        traceback.print_exc()
        _set(job_id, status="failed", stage="failed", error=str(e)[:500],
             message="failed", end_time=time.time())
    finally:
        unload_whisper()


def settings_watermark_path(job):
    settings = json.loads(job["settings"] or "{}")
    wm = settings.get("watermark") or {}
    p = wm.get("path")
    if p and os.path.exists(p):
        return p
    # legacy: job-dir watermark.png
    cand = os.path.join(config.DATA_DIR, job["id"], "watermark.png")
    return cand if os.path.exists(cand) else None
