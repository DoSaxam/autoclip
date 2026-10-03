"""Autoclip engine — FastAPI service on port 8001.
Persistent SQLite job queue + single worker thread (RAM-constrained box).
Endpoints are all real: create/cancel/retry jobs, uploads, previews, files, zip."""
import json
import os
import shutil
import subprocess
import threading
import time
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

from . import config, store, subs, pipeline, drive

app = FastAPI(title="Autoclip Engine")
config.ensure_dirs()
store.init_db()

_START = time.time()
_worker_stop = threading.Event()
_current_proc = None  # active ffmpeg subprocess for cancel-kill


class CreateJob(BaseModel):
    source_url: Optional[str] = None
    upload_id: Optional[str] = None
    settings: dict = {}


class EditTranscript(BaseModel):
    sentences: list


class RerenderBody(BaseModel):
    settings: dict = {}


class PreviewBody(BaseModel):
    t: float = 5.0
    settings: dict = {}


# ---------------------------------------------------------------- worker
def worker_loop():
    print("[engine] worker started", flush=True)
    while not _worker_stop.is_set():
        try:
            job = store.claim_next_queued()
        except Exception as e:
            print(f"[engine] claim error: {e}", flush=True)
            time.sleep(2)
            continue
        if not job:
            time.sleep(1.0)
            continue
        print(f"[engine] processing job {job['id']}", flush=True)
        # reset cancel flag when (re)starting
        store.update(job["id"], cancel_requested=0, error="", message="starting…")
        pipeline.process_job(job["id"])
    print("[engine] worker stopped", flush=True)


@app.on_event("startup")
async def on_startup():
    recovered, failed = store.recover_interrupted()
    if recovered or failed:
        print(f"[engine] recovered={recovered} failed_permanent={failed}", flush=True)
    threading.Thread(target=worker_loop, daemon=True, name="autoclip-worker").start()


# ---------------------------------------------------------------- health
@app.get("/engine/health")
def health():
    return {
        "ok": True, "uptime": round(time.time() - _START, 1),
        "whisper_loaded": pipeline._whisper_model is not None,
        "free_ram_mb": round(config.free_ram_mb()),
        "jobs_total": len(store.list_jobs(500)),
    }


# ---------------------------------------------------------------- presets/fonts
@app.get("/engine/api/presets")
def get_presets():
    return {"presets": subs.preset_list()}


@app.get("/engine/api/fonts")
def get_fonts():
    return {"fonts": subs.font_list()}


@app.get("/engine/api/aspects")
def get_aspects():
    return {"aspects": {k: {"w": v[0], "h": v[1]} for k, v in config.ASPECTS.items()}}


# ---------------------------------------------------------------- uploads
@app.post("/engine/api/upload")
async def upload_media(file: UploadFile = File(...)):
    config.ensure_dirs()
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"):
        raise HTTPException(400, f"unsupported file type {ext or '(none)'}")
    upload_id = uuid.uuid4().hex[:12]
    dest = os.path.join(config.UPLOAD_DIR, f"{upload_id}{ext}")
    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            out.write(chunk)
    if size < 1024:
        os.unlink(dest)
        raise HTTPException(400, "file is empty")
    return {"upload_id": upload_id, "path": dest, "size": size, "name": file.filename}


@app.post("/engine/api/watermark")
async def upload_watermark(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(400, "watermark must be png/jpg/webp")
    wm_id = uuid.uuid4().hex[:10]
    dest = os.path.join(config.UPLOAD_DIR, f"wm_{wm_id}{ext}")
    with open(dest, "wb") as out:
        out.write(await file.read())
    return {"path": dest, "id": wm_id}


# ---------------------------------------------------------------- jobs
@app.post("/engine/api/jobs")
def create_job(body: CreateJob):
    if not body.source_url and not body.upload_id:
        raise HTTPException(400, "source_url or upload_id required")
    if body.upload_id:
        matches = [f for f in os.listdir(config.UPLOAD_DIR) if f.startswith(body.upload_id + ".")]
        if not matches:
            raise HTTPException(404, "upload not found — upload the file again")
        job_id = store.new_job("", "upload", os.path.join(config.UPLOAD_DIR, matches[0]),
                               body.settings)
    else:
        url = body.source_url.strip()
        if not url.startswith(("http://", "https://")):
            raise HTTPException(400, "URL must start with http(s)://")
        job_id = store.new_job(url, "url", "", body.settings)
    return {"job_id": job_id}


@app.get("/engine/api/jobs")
def list_jobs():
    return {"jobs": [_job_view(j) for j in store.list_jobs(60)]}


@app.get("/engine/api/jobs/{job_id}")
def get_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return _job_view(job)


@app.post("/engine/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if job["status"] in ("done", "canceled"):
        return {"ok": True, "status": job["status"]}
    store.update(job_id, cancel_requested=1, message="canceling…")
    # kill active ffmpeg
    proc = pipeline._whisper_model and None
    import signal
    global _current_proc
    if _current_proc and _current_proc.poll() is None:
        try:
            os.killpg(os.getpgid(_current_proc.pid), signal.SIGKILL)
        except Exception:
            pass
    return {"ok": True, "status": "canceling"}


@app.post("/engine/api/jobs/{job_id}/retry")
def retry_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if job["status"] not in ("failed", "canceled", "failed_permanent"):
        raise HTTPException(400, "job is not in a retryable state")
    if job["status"] == "failed_permanent":
        raise HTTPException(400, "recovery limit reached — create a new job")
    store.update(job_id, status="queued", stage="queued", progress=0, error="",
                 message="re-queued", cancel_requested=0, recovery_count=0)
    return {"ok": True}


@app.post("/engine/api/jobs/{job_id}/rerender")
def rerender_job(job_id: str, body: RerenderBody):
    """Re-render from existing transcript+analysis with new style settings."""
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    job_dir = os.path.join(config.DATA_DIR, job_id)
    if not os.path.exists(os.path.join(job_dir, "analysis.json")):
        raise HTTPException(400, "job has no finished analysis to re-render")
    # keep only source + transcript + analysis; wipe old clips
    for sub in ("clips", "thumbs"):
        d = os.path.join(job_dir, sub)
        if os.path.isdir(d):
            shutil.rmtree(d)
    store.update(job_id, settings=json.dumps(body.settings), status="queued",
                 stage="queued", progress=0, clips="[]", error="", message="re-rendering",
                 cancel_requested=0)
    # make pipeline skip download/transcribe/analyze via existing artifacts
    return {"ok": True}


@app.put("/engine/api/jobs/{job_id}/transcript")
def edit_transcript(job_id: str, body: EditTranscript):
    """Edit sentence text before rendering — edits are burned into subtitles."""
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    try:
        transcript = json.loads(job["transcript"])
    except Exception:
        raise HTTPException(400, "no transcript yet")
    if len(body.sentences) != len(transcript["sentences"]):
        raise HTTPException(400, "sentence count mismatch")
    for i, s in enumerate(body.sentences):
        text = str(s.get("text", "")).strip()
        if text:
            transcript["sentences"][i]["text"] = text
            # re-sync words: scale word timings proportionally to text length change
            words = transcript["sentences"][i].get("words") or []
            if words and text:
                old_text = " ".join(w["word"] for w in words)
                # simple realignment: distribute words of new text over old time span
                tokens = text.split()
                span = (words[-1]["end"] - words[0]["start"]) or 1.0
                if len(tokens) == len(words):
                    for w, tok in zip(words, tokens):
                        w["word"] = tok
                else:
                    new_words = []
                    dur = span / max(1, len(tokens))
                    st = words[0]["start"]
                    for k, tok in enumerate(tokens):
                        new_words.append({"word": tok, "start": round(st + k * dur, 3),
                                          "end": round(st + (k + 1) * dur, 3)})
                    transcript["sentences"][i]["words"] = new_words
    tpath = os.path.join(config.DATA_DIR, job_id, "transcript.json")
    with open(tpath, "w") as f:
        json.dump(transcript, f, ensure_ascii=False)
    store.update(job_id, transcript=json.dumps(transcript, ensure_ascii=False))
    return {"ok": True, "sentences": len(transcript["sentences"])}


@app.post("/engine/api/jobs/{job_id}/preview")
def preview_frame(job_id: str, body: PreviewBody):
    """Render a single styled frame at time t — live preview for style sliders."""
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    job_dir = os.path.join(config.DATA_DIR, job_id)
    src = os.path.join(job_dir, "source.mp4")
    if not os.path.exists(src):
        raise HTTPException(400, "source not ready yet")
    settings = body.settings
    aspect = settings.get("aspect", "9:16")
    out_w, out_h = config.ASPECTS.get(aspect, (1080, 1920))
    try:
        transcript = json.loads(job["transcript"] or "{}")
    except Exception:
        transcript = {}
    sentences = transcript.get("sentences", [])
    t = max(0.0, min(body.t, max(job["duration"] - 1, 0)))
    # sentence visible at t
    cur = next((s for s in sentences if s["start"] - 0.15 <= t <= s["end"] + 0.15), None)
    rel = []
    if cur:
        rel = [{
            "start": 0.0, "end": max(0.5, cur["end"] - cur["start"]),
            "text": cur["text"],
            "words": [{"word": w["word"], "start": w["start"] - cur["start"],
                       "end": w["end"] - cur["start"]} for w in cur.get("words", [])],
        }]
    ass_path = os.path.join(job_dir, "preview.ass")
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(subs.build_ass(rel, out_w, out_h, settings.get("preset", "karaoke"),
                               int(settings.get("position", 50)),
                               settings.get("font"),
                               float(settings.get("fontScale") or 1.0)))
    thumb_path = os.path.join(job_dir, "preview.jpg")
    esc = ass_path.replace(":", "\\:")
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1",
        "-vf", (f"scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{out_h},setsar=1,ass=filename='{esc}'"),
        "-q:v", "3", thumb_path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90,
                       env=config.engine_env())
    if not os.path.exists(thumb_path):
        raise HTTPException(500, f"preview render failed: {r.stderr[-300:]}")
    return FileResponse(thumb_path, media_type="image/jpeg",
                        headers={"Cache-Control": "no-store"})


@app.get("/engine/api/jobs/{job_id}/zip")
def zip_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    job_dir = os.path.join(config.DATA_DIR, job_id)
    clips_dir = os.path.join(job_dir, "clips")
    if not os.path.isdir(clips_dir) or not os.listdir(clips_dir):
        raise HTTPException(400, "no clips to package")
    zip_path = os.path.join(job_dir, "autoclip_clips.zip")
    if os.path.exists(zip_path):
        os.unlink(zip_path)
    import zipfile
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:
        for name in sorted(os.listdir(clips_dir)):
            if name.endswith(".mp4"):
                arcname = f"autoclip_{name}"
                zf.write(os.path.join(clips_dir, name), arcname)
    return FileResponse(zip_path, media_type="application/zip",
                        filename=f"autoclip_{job_id}.zip")


@app.delete("/engine/api/jobs/{job_id}")
def delete_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    if job["status"] in store.ACTIVE_STAGES:
        raise HTTPException(400, "cancel the job before deleting it")
    job_dir = os.path.join(config.DATA_DIR, job_id)
    if os.path.isdir(job_dir):
        shutil.rmtree(job_dir)
    import sqlite3
    conn = store.get_conn()
    conn.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    conn.commit()
    return {"ok": True}


# ---------------------------------------------------------------- drive
@app.get("/engine/api/drive/status")
def drive_status():
    return drive.status()


@app.get("/engine/api/drive/connect")
def drive_connect(redirect: str = "https://example.com"):
    if not drive.is_configured():
        raise HTTPException(400, "Google Drive is not configured on this server. "
                                 "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.")
    return {"auth_url": drive.auth_url(redirect.rstrip("/"))}


@app.get("/engine/api/drive/callback")
def drive_callback(code: str = "", error: str = "", state: str = ""):
    origin = state or "https://example.com"
    if error or not code:
        return JSONResponse({"ok": False, "error": error or "missing code"}, status_code=400)
    try:
        drive.exchange_code(code, origin)
        return RedirectResponse(url=f"{origin}/?drive=connected")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ---------------------------------------------------------------- files
app.mount("/engine/files", StaticFiles(directory=config.DATA_DIR), name="files")


def _job_view(job):
    view = {k: job[k] for k in (
        "id", "status", "stage", "progress", "message", "error", "source_url", "source_kind",
        "video_title", "duration", "settings", "clips", "create_time", "update_time",
        "start_time", "end_time", "recovery_count", "stage_timings", "cancel_requested")}
    try:
        view["settings"] = json.loads(job["settings"] or "{}")
    except Exception:
        view["settings"] = {}
    try:
        view["clips"] = json.loads(job["clips"] or "[]")
    except Exception:
        view["clips"] = []
    try:
        view["stage_timings"] = json.loads(job["stage_timings"] or "{}")
    except Exception:
        view["stage_timings"] = {}
    has_transcript = bool(job["transcript"])
    view["has_transcript"] = has_transcript
    if has_transcript and job["status"] in ("analyzing", "rendering", "done", "uploading"):
        try:
            tr = json.loads(job["transcript"])
            view["sentences"] = [{"start": s["start"], "end": s["end"], "text": s["text"]}
                                 for s in tr.get("sentences", [])][:400]
        except Exception:
            view["sentences"] = []
    return view
