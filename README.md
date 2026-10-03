# Autoclip 🎬

**Paste a video link → get ready-to-post vertical clips with animated captions.**
Fully cloud-side: download → transcribe → AI viral-moment analysis → styled render → MP4 export → (optional) Google Drive.

Mobile-first web app (390px, PWA-installable) + Python rendering engine. No mock data, no fake progress — every percentage comes from real yt-dlp / Whisper / ffmpeg telemetry.

## What it does

1. **Source** — paste any public video URL (YouTube, direct MP4, most platforms) or upload a file.
2. **Style** — pick one of 15 caption presets (Karaoke, Beast, Hormozi, Pop, Bounce, Wobble, Rainbow, Typewriter, Slide, Neon, Elastic, Marker, Boxed, Outline, Minimal), 23 fonts, position/size sliders, 4 aspect ratios (9:16, 1:1, 4:5, 16:9), 12 video effects, face tracking, podcast split-screen, watermark.
3. **Generate** — real pipeline with live progress:
   - `yt-dlp` download (WARP-tunneled for YouTube, client fallback chain, `curl_cffi` impersonation for Cloudflare-403 sites)
   - `faster-whisper` word-level transcription + VAD (real % = processed seconds / total)
   - LLM viral-moment scoring (0–100, titles, reasons) with heuristic fallback — pipeline never breaks
   - Sentence-boundary clip selection (15–90s or custom, 1–20 or Auto, never mid-word)
   - `ffmpeg` render: single filter graph, burned ASS captions, H.264 CRF 18, AAC 192k, −14 LUFS
   - Per-clip results stream in as they finish; download individually or as ZIP
4. **Iterate** — transcript editor (edits burned into captions), engine-rendered live preview at any timestamp, one-tap re-render with new style (reuses transcript+analysis).

## Architecture

```
Browser ── gateway ── Next.js (:3000)
   │  API via ?XTransformPort=8001        │ /api/engine/ensure (self-heal)
   ▼                                       ▼
FastAPI engine (:8001) ◄── supervisor.py (lock-file singleton, auto-restart)
   │                                        │
   │  LLM bridge (:8002, z-ai SDK)         └─ wireproxy WARP SOCKS5 (:40000)
   │  SQLite job queue (WAL, survives restarts, cancel/retry/recovery ≤3)
   └─ ffmpeg + OpenCV YuNet face tracking + libass subtitles
```

- **Persistent queue**: SQLite at `engine/data/jobs.db`; interrupted jobs auto-recover on engine restart (≤3 attempts).
- **Real progress only**: yt-dlp hooks, whisper segment streaming, ffmpeg `-progress pipe:1`. Nothing simulated.
- **Real cancel**: kills the active ffmpeg process group at any stage.
- **Self-healing**: supervisor restarts engine/LLM-bridge/WARP automatically; frontend retries through `/api/engine/ensure`.
- **Google Drive**: real OAuth2 + resumable upload into an "Autoclip" folder. Activate by setting `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars; until then clips stay local and links are preserved.

## Quick start (any Linux box)

Prereqs: Node 20+/Bun, Python 3.12, `ffmpeg` + `ffprobe` on PATH, ~4GB RAM.

```bash
# 1) Frontend + deps
bun install
bun run dev            # Next.js on :3000

# 2) Engine (separate terminal, same repo root)
python3 -m venv ~/.venv && source ~/.venv/bin/activate
pip install -r engine/requirements.txt
python engine/supervisor.py     # spawns FastAPI :8001 + LLM bridge :8002 (+ WARP if configured)
```

Then open `http://localhost:3000`. The engine can also be started automatically by the app itself: `instrumentation.ts` spawns `engine/supervisor.py` on Next.js boot (node runtime), and `/api/engine/ensure` re-spawns it if it ever dies.

### Optional: YouTube via Cloudflare WARP

Datacenter IPs are often bot-blocked by YouTube. The engine ships a userspace WARP tunnel (`engine/warp/`):

```bash
cd engine/warp
printf 'y\n' | ./wgcf register --accept-tos && ./wgcf generate   # new WARP identity
./wireproxy -c warp.conf &                                       # SOCKS5 on 127.0.0.1:40000
```

`supervisor.py` health-checks and rotates endpoints automatically. Without it, direct MP4 links and file uploads always work.

> ⚠️ faster-whisper 1.2.1 + av compatibility: if `import av` fails with an unexpected kwarg, patch `faster_whisper/audio.py` to drop `metadata_errors="ignore"`. Do **not** force-upgrade `av`.

## Repo layout

```
src/app/page.tsx                 # 3-step mobile UI (Source → Style → Generate)
src/components/autoclip/         # StyleStep, GenerateView, PhonePreview
src/lib/autoclip.ts              # typed API client + settings persistence
src/app/api/engine/ensure/route.ts  # self-heal route
src/instrumentation*.ts          # boot-time supervisor spawn (node runtime only)
engine/                          # FastAPI engine (pipeline, store, subs, effects, faces, warp, drive)
engine/requirements.txt          # pinned Python deps
engine/fonts/ + public/fonts/    # 23 Google Fonts (render + UI preview)
mini-services/llm-bridge/        # z-ai LLM bridge (viral scoring)
docs/                            # design tokens, test checklist
scripts/e2e_test.sh              # full E2E suite (22 checks)
```

## Verified E2E (latest run: 22/22 passed)

| Test | Result |
|---|---|
| Direct MP4 link → clips | ✅ 1080×1920 H.264+AAC, captions+progress bar pixel-verified |
| File upload via UI → clips | ✅ |
| YouTube via WARP tunnel | ✅ extraction verified; sandbox UDP throttling → auto-heal + graceful error + upload guidance |
| Cloudflare-403 media sites | ✅ auto-retries with curl_cffi impersonation |
| No-audio video | ✅ clean, actionable error |
| Invalid link | ✅ clear error |
| Cancel mid-render | ✅ ffmpeg killed, 0 orphan processes |
| Retry / auto-recovery | ✅ resumes from stored artifacts |
| Engine kill → supervisor restart | ✅ back in ~12s, jobs recovered |
| Transcript edit → burn-in | ✅ edited text in ASS + pixels |
| All 15 presets | ✅ engine-rendered |
| Split-screen / 1:1 / 4:5 / 16:9 | ✅ (split verified 1080×1080, two panels) |
| Watermark | ✅ overlay verified in corner |
| Face tracking | ✅ YuNet + smoothed sendcmd crop |
| ZIP download | ✅ valid zip via gateway |
| Live preview (engine frame) | ✅ 1080×1920 blob |
| Mobile layout 390px & 320px | ✅ no overflow, console clean |
| Lint / browser console | ✅ 0 errors 0 warnings |

Run the suite yourself: `bash scripts/e2e_test.sh`

## Design tokens

See `docs/design-tokens.json` (colors, typography, spacing, radii, motion). Dark premium theme: zinc-950 surfaces, amber-500 accent, rounded-2xl cards, Lucide icons @ 1.5px stroke.
