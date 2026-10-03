# Autoclip 🎬

**Paste a video link → get ready-to-post vertical clips with animated captions.**
Fully cloud-side: download → transcribe → AI viral-moment analysis → styled render → MP4 export.

## What it does

1. **Source** — paste any public video URL (YouTube, direct MP4, most platforms) or upload a file.
2. **Style** — pick one of 15 caption presets (Karaoke, Beast, Hormozi, Pop, Bounce, Wobble, Rainbow, Typewriter, Slide, Neon, Elastic, Marker, Boxed, Outline, Minimal), 23 fonts, position/size sliders, 4 aspect ratios (9:16, 1:1, 4:5, 16:9), 12 video effects, face tracking, podcast split-screen, watermark.
3. **Generate** — real pipeline with live progress:
   - `yt-dlp` download (WARP-tunneled for YouTube, client fallback chain)
   - `faster-whisper` word-level transcription + VAD (real % = processed seconds / total)
   - LLM viral-moment scoring (0–100, titles, reasons) with heuristic fallback
   - Sentence-boundary clip selection (15–90s or custom, 1–20 or Auto, never mid-word)
   - `ffmpeg` render: single filter graph, burned ASS captions, H.264 CRF 18, AAC 192k, −14 LUFS
   - Per-clip results stream in as they finish; download individually or as ZIP
4. **Iterate** — transcript editor (edits burned into captions), engine-rendered live preview at any timestamp, one-tap re-render with new style (reuses transcript+analysis).

## Architecture

```
Browser ── Caddy gateway ── Next.js (:3000)
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

## Run

The app runs on the sandbox dev server (Next.js + engine stack auto-spawned). Everything persists on disk:

- Frontend: `src/app/page.tsx` (mobile-first 390px, PWA-installable)
- Engine: `engine/*.py` (FastAPI, port 8001)
- LLM bridge: `mini-services/llm-bridge/index.ts` (port 8002)
- Fonts (render + UI): `engine/fonts/` = `public/fonts/`
- Job data: `engine/data/{job_id}/` (source.mp4, transcript.json, clips/, thumbs/)

## Verified E2E (this session)

| Test | Result |
|---|---|
| Direct MP4 link → clips | ✅ 1080×1920, captions+progress bar pixel-verified |
| File upload via UI → clips | ✅ |
| YouTube via WARP tunnel | ✅ extraction verified; sandbox UDP throttling → auto-heal + graceful error + upload guidance |
| No-audio video | ✅ clean, actionable error |
| Invalid link | ✅ clear error |
| Cancel mid-render | ✅ ffmpeg killed, status canceled |
| Retry / auto-recovery | ✅ resumes from stored artifacts |
| Transcript edit → burn-in | ✅ edited text in ASS + pixels |
| All 15 presets | ✅ engine-rendered |
| Split-screen / 1:1 / 4:5 / 16:9 | ✅ (split verified 1080×1080, two panels) |
| Watermark | ✅ overlay verified in corner |
| Face tracking | ✅ YuNet + smoothed sendcmd crop |
| ZIP download | ✅ |
| Live preview (engine frame) | ✅ 1080×1920 blob |
| Lint / browser console | ✅ 0 errors |

## Design tokens

See `download/design-tokens.json` (colors, typography, spacing, radii, motion).
