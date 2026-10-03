"""FFmpeg filter graph builder: aspect crop, face tracking, effects,
subtitles, progress bar, watermark, split-screen. Single graph per clip."""
import os
import math

from . import config
from .pnggen import make_progress_bar, make_track_bar


def _face_crop_expr(keyframes, crop_w, crop_h, src_w, src_h):
    """keyframes: [(t, cx, cy)] sorted by t (seconds, clip-relative).
    Returns (x_expr, y_expr) strings with clamped static start (sendcmd handles updates)."""
    if not keyframes:
        x0 = max(0, min(src_w - crop_w, (src_w - crop_w) // 2))
        y0 = max(0, min(src_h - crop_h, int((src_h - crop_h) * 0.25)))  # top-biased
        return str(x0), str(y0)
    t0, cx, cy = keyframes[0]
    x0 = int(max(0, min(src_w - crop_w, cx - crop_w / 2)))
    y0 = int(max(0, min(src_h - crop_h, cy - crop_h * 0.40)))  # face in upper part of crop
    return str(x0), str(y0)


def build_sendcmd_file(path: str, keyframes, crop_w, crop_h, src_w, src_h):
    """Write sendcmd file targeting the named crop filter 'fc'.
    keyframes: [(t, cx, cy)] clip-relative seconds, already smoothed."""
    lines = []
    for t, cx, cy in keyframes:
        x = int(max(0, min(src_w - crop_w, cx - crop_w / 2)))
        y = int(max(0, min(src_h - crop_h, cy - crop_h * 0.40)))
        if t <= 0:
            continue
        lines.append(f"{t:.3f} fc x {x};")
        lines.append(f"{t:.3f} fc y {y};")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    return len(lines)


def _zoompan(clip_dur: float, mode: str, out_w: int, out_h: int) -> str:
    """mode: 'pulse' (rhythmic) or 'push' (slow push-in)."""
    fps = 30
    if mode == "pulse":
        z = "1.03+0.025*sin(2*PI*on/(30*1.6))"  # ~1.6s cycle
    else:  # push
        total_frames = max(1, int(clip_dur * fps))
        z = f"min(1+0.10*on/{total_frames},1.10)"
    return (
        f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={out_w}x{out_h}:fps={fps}"
    )


def build_video_chain(settings, src_w, src_h, clip_dur, aspect, face_keyframes=None,
                      sendcmd_path=None):
    """Returns (filter_chain_list, extra_inputs, final_label).
    filter_complex is assembled by the caller."""
    out_w, out_h = config.ASPECTS[aspect]
    fx = dict(settings.get("effects") or {})
    effects_on = {k for k, v in fx.items() if v}

    chain = []
    extra_inputs = []  # list of input args like ["-loop", "1", "-i", path]

    src_aspect = src_w / src_h
    tgt_aspect = out_w / out_h

    # 1) crop to target aspect (face-aware if keyframes given)
    if abs(src_aspect - tgt_aspect) > 0.01 or face_keyframes:
        if src_aspect > tgt_aspect:
            crop_h = src_h
            crop_w = int(round(src_h * tgt_aspect / 2) * 2)
        else:
            crop_w = src_w
            crop_h = int(round(src_w / tgt_aspect / 2) * 2)
        crop_w = min(crop_w, src_w)
        crop_h = min(crop_h, src_h)
        if face_keyframes:
            x0, y0 = _face_crop_expr(face_keyframes, crop_w, crop_h, src_w, src_h)
            cropf = f"crop@fc=w={crop_w}:h={crop_h}:x={x0}:y={y0}"
            if sendcmd_path:
                chain.append(f"sendcmd=f={sendcmd_path}")
        else:
            x0 = (src_w - crop_w) // 2
            y0 = int((src_h - crop_h) * 0.22) if src_aspect > tgt_aspect else (src_h - crop_h) // 2
            cropf = f"crop=w={crop_w}:h={crop_h}:x={x0}:y={y0}"
        chain.append(cropf)
    else:
        crop_w, crop_h = src_w, src_h

    # 2) fps normalize
    chain.append("fps=30")

    # 3) scale to exact target
    if (crop_w, crop_h) != (out_w, out_h):
        chain.append(f"scale={out_w}:{out_h}:flags=lanczos")
    chain.append("setsar=1")

    # 4) zoom effects (replace the plain scale when active)
    if "zoomPulse" in effects_on or "pushIn" in effects_on:
        mode = "pulse" if "zoomPulse" in effects_on else "push"
        # zoompan handles scaling itself
        chain = [c for c in chain if not c.startswith("scale=")]
        # re-add scale before zoompan if needed (zoompan s= handles final size)
        if (crop_w, crop_h) != (out_w, out_h):
            chain.append(f"scale={out_w}:{out_h}:flags=lanczos,setsar=1")
        chain.append(_zoompan(clip_dur, mode, out_w, out_h))

    # 5) shake (crop a slightly smaller window with sinusoidal offsets, scale back)
    if "shake" in effects_on:
        sw, sh = int(out_w * 0.94), int(out_h * 0.94)
        chain.append(
            f"crop={sw}:{sh}:"
            f"x='(in_w-out_w)/2+{int(out_w*0.008)}*sin(21*t)+{int(out_w*0.005)}*sin(37*t)':"
            f"y='(in_h-out_h)/2+{int(out_h*0.004)}*cos(17*t)+{int(out_h*0.003)}*sin(29*t)'"
        )
        chain.append(f"scale={out_w}:{out_h}:flags=lanczos")

    # 6) color effects
    if "mono" in effects_on:
        chain.append("hue=s=0")
    if "cinematic" in effects_on:
        chain.append("eq=contrast=1.07:brightness=-0.02:saturation=1.12")
        chain.append("colorbalance=rs=-0.05:bs=0.06:gm=0.02")
    if "vignette" in effects_on:
        chain.append("vignette=angle=PI/4.5")
    if "rgbSplit" in effects_on:
        chain.append("rgbashift=rh=4:bh=-4:gv=2")
    if "grain" in effects_on:
        chain.append("noise=alls=7:allf=t+u")

    return chain, extra_inputs, "vfx"


def build_render_filter(settings, src_w, src_h, clip_dur, aspect, ass_path, job_dir,
                        face_keyframes=None, watermark_path=None):
    """Assemble the complete filter_complex string + extra input args + map labels."""
    out_w, out_h = config.ASPECTS[aspect]
    fx = dict(settings.get("effects") or {})
    effects_on = {k for k, v in fx.items() if v}

    sendcmd_path = os.path.join(job_dir, "facecmd.txt") if face_keyframes else None
    if sendcmd_path:
        build_sendcmd_file(sendcmd_path, face_keyframes,
                           # crop dims computed inside build_video_chain; recompute:
                           _crop_dims(src_w, src_h, aspect), _crop_dims_h(src_w, src_h, aspect),
                           src_w, src_h)

    parts = []          # filter graph fragments
    extra_inputs = []   # -i args for overlays
    input_idx = 1       # 0 is the video

    split_screen = bool(settings.get("splitScreen"))
    if split_screen:
        # stacked podcast view: left/right halves stacked into two panels
        panel_w, panel_h = out_w, out_h // 2
        norm_w, norm_h = panel_w * 2, panel_h
        chain = [
            "fps=30",
            f"scale={norm_w}:{norm_h}:force_original_aspect_ratio=increase:flags=lanczos",
            f"crop={norm_w}:{norm_h}",
            "setsar=1",
        ]
        parts.append(f"[0:v]{','.join(chain[:-1])},split=2[n1][n2]")
        parts.append(f"[n1]crop={panel_w}:{panel_h}:0:0[top]")
        parts.append(f"[n2]crop={panel_w}:{panel_h}:{panel_w}:0[bot]")
        parts.append("[top][bot]vstack,setsar=1[vfx]")
        base_label = "vfx"
    else:
        chain, _, _ = build_video_chain(settings, src_w, src_h, clip_dur, aspect,
                                        face_keyframes, sendcmd_path)
        parts.append(f"[0:v]{','.join(chain)}[vfx]")
        base_label = "vfx"

    # glow needs split/blend
    label = base_label
    if "glow" in effects_on:
        parts.append(f"[{label}]split[glow_a][glow_b]")
        parts.append("[glow_b]gblur=sigma=18[glow_blurred]")
        parts.append("[glow_a][glow_blurred]blend=all_mode=screen[glowed]")
        label = "glowed"

    # fades / flash
    fade_bits = []
    if "flash" in effects_on:
        fade_bits.append("fade=t=in:st=0:d=0.18:color=white")
    if "fadeInOut" in effects_on:
        fade_bits.append("fade=t=in:st=0:d=0.30")
        fade_bits.append(f"fade=t=out:st={max(0, clip_dur - 0.30):.2f}:d=0.30")
    if fade_bits:
        parts.append(f"[{label}]{','.join(fade_bits)}[faded]")
        label = "faded"

    # subtitles
    if ass_path and os.path.exists(ass_path):
        ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        parts.append(f"[{label}]ass=filename='{ass_escaped}'[subbed]")
        label = "subbed"

    # progress bar (track + sliding fill PNG overlays)
    if "progressBar" in effects_on:
        bar_margin = 18
        bar_w = out_w - 2 * bar_margin
        track_png = os.path.join(job_dir, "bar_track.png")
        fill_png = os.path.join(job_dir, "bar_fill.png")
        make_track_bar(track_png, bar_w, 14)
        make_progress_bar(fill_png, bar_w, 14)
        extra_inputs += ["-loop", "1", "-i", track_png]
        track_idx = input_idx
        input_idx += 1
        extra_inputs += ["-loop", "1", "-i", fill_png]
        fill_idx = input_idx
        input_idx += 1
        parts.append(f"[{label}][{track_idx}:v]overlay=x={bar_margin}:y=16:shortest=1[pbt]")
        parts.append(
            f"[pbt][{fill_idx}:v]overlay=x='-overlay_w*(1-t/{clip_dur:.3f})':y=16:shortest=1[vout]"
        )
        label = "vout"

    # watermark
    if watermark_path and os.path.exists(watermark_path):
        wm = settings.get("watermark") or {}
        wm_scale = float(wm.get("size", 0.16))     # fraction of width
        wm_opacity = float(wm.get("opacity", 0.85))
        wm_pos = wm.get("pos", "br")
        extra_inputs += ["-i", watermark_path]
        wm_idx = input_idx
        input_idx += 1
        pos_map = {
            "br": f"W-w-{int(out_w*0.04)}:H-h-{int(out_h*0.03)}",
            "bl": f"{int(out_w*0.04)}:H-h-{int(out_h*0.03)}",
            "tr": f"W-w-{int(out_w*0.04)}:{int(out_h*0.03)}",
            "tl": f"{int(out_w*0.04)}:{int(out_h*0.03)}",
            "c": "(W-w)/2:(H-h)/2",
        }
        xy = pos_map.get(wm_pos, pos_map["br"])
        parts.append(
            f"[{wm_idx}:v]scale={int(out_w * wm_scale)}:-1,format=rgba,"
            f"colorchannelmixer=aa={wm_opacity:.2f}[wm]"
        )
        parts.append(f"[{label}][wm]overlay={xy}[vout]")
        label = "vout"

    return parts, extra_inputs, label


def _crop_dims(src_w, src_h, aspect):
    out_w, out_h = config.ASPECTS[aspect]
    tgt = out_w / out_h
    if src_w / src_h > tgt:
        return int(round(src_h * tgt / 2) * 2)
    return src_w


def _crop_dims_h(src_w, src_h, aspect):
    out_w, out_h = config.ASPECTS[aspect]
    tgt = out_w / out_h
    if src_w / src_h > tgt:
        return src_h
    return int(round(src_w / tgt / 2) * 2)


def build_ffmpeg_cmd(src_path, clip_start, clip_dur, settings, src_w, src_h, aspect,
                     ass_path, job_dir, out_path, face_keyframes=None, watermark_path=None):
    """Full ffmpeg command list. Returns (cmd_list, stderr_note)."""
    parts, extra_inputs, label = build_render_filter(
        settings, src_w, src_h, clip_dur, aspect, ass_path, job_dir,
        face_keyframes, watermark_path
    )
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-nostdin",
        "-ss", f"{clip_start:.3f}", "-i", src_path,
    ]
    cmd += extra_inputs
    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", f"[{label}]", "-map", "0:a?",
        "-t", f"{clip_dur:.3f}",
        "-c:v", "libx264", "-preset", config.LIBX264_PRESET, "-crf", str(config.LIBX264_CRF),
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
        "-movflags", "+faststart",
        out_path,
    ]
    return cmd
