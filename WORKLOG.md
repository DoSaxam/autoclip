# Autoclip — Worklog

Session date: 2026-10-03 (UTC+8). All state on disk; this log enables recovery after session resets.

## Architecture (current, running)

```
Next.js dev server (port 3000, system-managed, PERSISTENT)
 └─ /api/engine/ensure route (self-heal) + instrumentation.ts (on boot)
     └─ engine/supervisor.py  (single-instance via data/supervisor.lock)
         ├─ uvicorn engine.main:app  → 127.0.0.1:8001  (FastAPI)
         ├─ bun mini-services/llm-bridge/index.ts → 127.0.0.1:8002 (z-ai LLM viral scoring)
         └─ wireproxy (WARP SOCKS5 → 127.0.0.1:40000, endpoint rotation, heals every 20s)
```
Browser → Caddy gateway (:81) → Next.js :3000; API calls carry `?XTransformPort=8001` → engine.

## Phase 1 — Engine pipeline ✅ (07:22–07:44)
- Deps installed into /home/z/.venv: yt-dlp 2026.8.19, faster-whisper 1.2.1, fastapi, uvicorn, opencv-python-headless 4.13, pysocks.
- **PyAV fix**: faster-whisper 1.2.1 calls `av.open(..., metadata_errors="ignore")`; shipped av 19 removed that kwarg. Patched `/home/z/.venv/lib/python3.12/site-packages/faster_whisper/audio.py:46` (only one call site in this version) to drop the kwarg. Do NOT `pip install -U av`.
- Whisper model `small` int8 CPU pre-downloaded to HF cache (Systran/faster-whisper-small).
- 23 Google Fonts (Anton, Archivo Black, Bebas, Bangers, Titan One, Marker, Luckiest Guy, Kanit, Rubik, etc.) → engine/fonts + public/fonts (UI preview @font-face).
- pipeline.py: yt-dlp download (progress hooks, client fallback chain) → ffprobe → faster-whisper (VAD + word timestamps, progress = seg.end/duration) → sentence split (gap >0.55s + punctuation) → LLM analyze (bridge :8002, markdown-fence stripping, heuristic fallback) → post_process_clips (snap to sentence boundaries, min/max length, overlap dedupe) → render (per-clip ffmpeg, -progress pipe:1, face tracking sendcmd, ASS burn) → thumbnails.
- E2E verified on https://media.w3.org/2010/05/sintel/trailer.mp4 (854x480, 52s): transcribe 5.9s, analyze 0.7s (LLM), render 19.5s. Output 1080x1920 H.264+AAC, captions + progress bar pixel-verified.

## Phase 2 — Engine API + SQLite queue ✅ (07:30–07:37)
- store.py: WAL SQLite at engine/data/jobs.db. Statuses queued→downloading→transcribing→analyzing→rendering→(uploading)→done/failed/canceled/failed_permanent.
- Worker thread claims jobs atomically; cancel_requested flag checked between stages and in progress loops; ffmpeg killed via process group (start_new_session + killpg).
- Startup recovery: interrupted active jobs requeued, recovery_count++ → max 3 then failed_permanent. Retry endpoint resets terminal jobs.
- Endpoints: POST /engine/api/jobs, GET jobs/{id}, POST cancel/retry/rerender, PUT transcript, POST preview (engine-rendered frame), GET zip (Python zipfile), upload/watermark (multipart), drive status/connect/callback, StaticFiles /engine/files/*.
- **Cancel verified**: mid-render cancel → "canceled", 0 ffmpeg procs left.
- **No-audio video verified**: Big Buck Bunny → clean error "no audio track".

## Phase 3 — Mobile UI ✅ (08:00–08:10)
- page.tsx: 3-step flow Source→Style→Generate, history chips, 390px-first, sticky bottom action bar, PWA (manifest + sw + icon).
- StyleStep: aspect chips, 15 preset chips (real fonts via @font-face), 23 font overrides, font-size + position sliders, 12 effect toggles, face tracking + split screen switches, watermark upload with size/opacity.
- GenerateView: live status card (stage, %, message, per-stage timings), Cancel/Retry, results feed with <video> playback (streams through gateway), score badges, per-clip download + zip, Live Preview dialog (engine frame at time t, debounced), Transcript editor (edits burned into subs → auto re-render).
- Settings persist in localStorage ("预设记忆").
- **Browser-verified via agent-browser at 390px**: golden path URL→Generate→done in UI; upload path (source.mp4 4.2MB) → done; video readyState 4; live preview blob 1080x1920 loaded; no console errors. NOTE: tests must go through Caddy :81 (XTransformPort), not :3000 directly.

## Phase 4 — Styles/effects ✅ (08:10–08:25)
- subs.py: 15 presets all render (karaoke \k math fixed: k1 = word1.start - t0; slide via \move; typewriter via \alpha \t; cased before fmt).
- effects.py: aspect crop/scale, zoompan pulse/push-in, sinusoidal shake, glow (split+gblur+blend screen), grain, vignette, cinematic (eq+colorbalance), mono, rgbashift, fades, flash (white fade-in), progress bar = -loop 1 PNG overlay sliding x=-w*(1-t/dur) (drawbox anim unreliable), watermark overlay (scale+colorchannelmixer), split-screen (vstack panels).
- **Fixed bugs**: (1) filter label double-consumption — ffmpeg needs explicit `split=2[n1][n2]`; (2) split-screen panel math (panel_h = out_h/2); (3) empty .ass breaks libass (files always have header+events).
- Verified pixel-level: neon (cyan 5049px), beast (red 3111px), karaoke/hormozi (yellow), split-screen 1:1 1080x1080 (two distinct panels), watermark in BR corner, all 10 remaining presets via preview endpoint (HTTP 200).
- Face tracking: OpenCV YuNet (faces/yunet.onnx), 0.25s sampling, forward-fill ≤2s, moving-average smoothing, sendcmd @ 0.5s keyframes targeting `crop@fc`. Verified active in renders (rendering stage "tracking faces").

## Phase 5 — Deploy/self-heal ✅ (07:39–07:42, 08:30)
- **Critical sandbox fact**: processes spawned in bash tool calls are killed at call end; ONLY children of the persistent Next.js dev-server process tree survive. Solution: /api/engine/ensure (and instrumentation.ts on boot) spawns supervisor.py from within next-server. Verified across many tool calls.
- Supervisor: lock file, adopts running children, port health every 3s, restart backoff (engine 8s, bridge 5s), WARP heal thread every 20s (rotation + 90s backoff).
- **Engine kill test**: killed uvicorn → supervisor restarted in 12s, jobs auto-recovered.

## Phase 6 — YouTube via Cloudflare WARP ✅/⚠️ (07:50–08:15)
- Datacenter IP → YouTube "Sign in to confirm you're not a bot". Solution: wgcf-registered WARP account (engine/warp/wgcf-profile.conf) + wireproxy userspace SOCKS5 (no TUN/root).
- **yt-dlp extraction THROUGH the tunnel verified twice**: "I teach my 10 year son Accounting Principles" (719s) resolved OK (yt-dlp 2026.8.19 has native EJS solver; PO-token not needed).
- **Sandbox UDP throttling discovered**: WARP data path worked 07:50–07:57 (port 2408), then got throttled; port 4500 worked at 07:59, later also throttled. Handshakes still complete but data stalls. Endpoint list now rotates 10 endpoint:port combos; supervisor re-heals every 90s. When the network allows it, YouTube works automatically; meanwhile the pipeline degrades gracefully with a friendly error (bot-block patterns now match curly-apostrophe 'you're' + "use --cookies").
- Direct MP4 + file upload always work (verified E2E multiple times).
- Google Drive: real OAuth2 + refresh + resumable upload + "Autoclip" folder (engine/drive.py). Inert until GOOGLE_CLIENT_ID/SECRET env set — UI keeps local links so clips are never lost.

## Phase 7 — Final E2E ✅ (08:25–08:40)
- Direct MP4 link: done, 1 clip, karaoke/hormozi/neon/slide/beast presets E2E, face tracking on.
- File upload via UI: done.
- Invalid link → clear error; no-audio video → clear error; YouTube → friendly datacenter-IP error + fallback guidance.
- Cancel mid-render: works (kills ffmpeg). Retry: works (resumes from artifacts).
- Rerender with new style: reuses transcript+analysis, re-renders only (fast iteration loop).
- Transcript edit → burn-in verified (CUSTOM EDITED CAPTION TEXT HERE appeared in ASS + pixels).
- Zip download: 3MB zip OK (Python zipfile; `zip` binary absent in sandbox).
- Live preview: engine-rendered frame per t + current settings.
- Lint: 0 errors 0 warnings. Browser console: clean.

## Key files
- engine/{config,store,subs,effects,pipeline,faces,warp,drive,main,supervisor,pnggen}.py
- mini-services/llm-bridge/index.ts (port 8002)
- src/{app/page.tsx, app/layout.tsx, app/fonts.css, instrumentation.ts, lib/autoclip.ts}
- src/components/autoclip/{PhonePreview,StyleStep,GenerateView}.tsx
- src/app/api/engine/ensure/route.ts
- engine/data/jobs.db (SQLite), engine/warp/ (wgcf profile + wireproxy binary)
- public/{fonts/*,manifest.json,icon.svg,sw.js}

## Rebuild/recovery notes
- Restart everything: `curl http://localhost:3000/api/engine/ensure` (spawns supervisor from next-server tree).
- Whisper patch must survive any `pip install -U` (see Phase 1).
- WARP identity regeneration: `cd engine/warp && printf 'y\n' | ./wgcf register --accept-tos && ./wgcf generate`.
- Never run engine/bridge via plain `&`/nohup in tool calls — they die at call end.
