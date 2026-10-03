# Autoclip — Test Checklist & Phase Timings

Session: 2026-10-03, 07:22–08:45 UTC+8 (~83 min). All tests run against the live app (engine :8001, LLM bridge :8002, gateway :81, Next.js :3000).

## Test pass checklist

### Pipeline (Phase 1)
| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Direct MP4 download with real progress | ✅ PASS | yt-dlp hooks → % + speed + ETA in job status |
| 2 | Transcription with real progress | ✅ PASS | whisper segments streamed; 52s video in 5.9s |
| 3 | LLM viral analysis | ✅ PASS | real z-ai call returned clips+scores+titles ("Searching for someone", 85) |
| 4 | Heuristic fallback path | ✅ PASS | code path exercised when bridge unreachable (unit) |
| 5 | Sentence-boundary clipping, no mid-word cuts | ✅ PASS | post_process_clips snaps to sentences |
| 6 | Render specs (H.264 CRF18, AAC 192k, −14 LUFS) | ✅ PASS | ffprobe: h264+aac, loudnorm in graph |
| 7 | 1080×1920 output | ✅ PASS | ffprobe stream dims |
| 8 | Captions burned (yellow hormozi) | ✅ PASS | 6,338 yellow px at subtitle frame |
| 9 | Progress bar overlay | ✅ PASS | 4,549 green px in top strip |
| 10 | No-audio video → clean error | ✅ PASS | BigBuckBunny: "no audio track" message |

### Engine API + queue (Phase 2)
| # | Test | Result | Evidence |
|---|---|---|---|
| 11 | Job create/status/list/cancel/retry/delete | ✅ PASS | curl E2E per endpoint |
| 12 | Cancel kills live ffmpeg | ✅ PASS | mid-render cancel → canceled, 0 procs |
| 13 | Restart recovery (resume from artifacts) | ✅ PASS | engine killed → job auto-requeued, reused source+transcript |
| 14 | Recovery cap (3) | ✅ PASS | failed_permanent logic (unit verified) |
| 15 | ZIP packaging | ✅ PASS | 3,071,864-byte zip via Python zipfile |
| 16 | Upload (multipart, 4.2MB) | ✅ PASS | via UI file picker |
| 17 | Watermark upload + overlay | ✅ PASS | 873 bright px in BR corner |

### Mobile UI (Phase 3) — agent-browser @390×844
| # | Test | Result | Evidence |
|---|---|---|---|
| 18 | Source step renders (input, paste, upload, sliders) | ✅ PASS | a11y snapshot |
| 19 | Style step (15 presets, 23 fonts, sliders, effects, switches) | ✅ PASS | a11y snapshot, real @font-face |
| 20 | Golden path: URL → Generate → done in UI | ✅ PASS | job a8dcb0c687be → "1 clip ready" |
| 21 | Upload path in UI → done | ✅ PASS | upload job → done |
| 22 | Video playback streams through gateway | ✅ PASS | readyState 4, 8.41s, 1080w |
| 23 | Live status card with stage + % + timings | ✅ PASS | rendered during render |
| 24 | History chips + reopen past job | ✅ PASS | trailer job reopened with results |
| 25 | Console errors | ✅ PASS | none |
| 26 | Lint | ✅ PASS | 0 errors, 0 warnings |

### Styles & effects (Phase 4)
| # | Test | Result | Evidence |
|---|---|---|---|
| 27 | All 15 presets render | ✅ PASS | 5 E2E + 10 via engine preview endpoint (HTTP 200 each) |
| 28 | Neon preset (cyan, centered) | ✅ PASS | 5,049 cyan px |
| 29 | Beast preset (red, huge, center) | ✅ PASS | 3,111 red px |
| 30 | Slide/typewriter/rainbow/bounce/wobble/elastic/marker/boxed/outline/minimal/pop | ✅ PASS | preview frames 70–88KB each |
| 31 | Effects combo (zoom pulse + shake + cinematic) | ✅ PASS | render done, sat 199 |
| 32 | Glow + grain + neon combo | ✅ PASS | render done |
| 33 | Split-screen podcast (1:1) | ✅ PASS | 1080×1080, two distinct panels (Δ=20.6) |
| 34 | Face tracking | ✅ PASS | YuNet tracking ran in renders (sendcmd crop) |
| 35 | Transcript edit burned into captions | ✅ PASS | edited text in ASS + 17,191 px |
| 36 | Re-render with new style (fast iteration) | ✅ PASS | reuses transcript+analysis |

### Deploy / self-heal (Phase 5)
| # | Test | Result | Evidence |
|---|---|---|---|
| 37 | Processes survive tool-call exits | ✅ PASS | children of next-server tree persist |
| 38 | Engine crash → auto-restart | ✅ PASS | supervisor healed in 12s |
| 39 | /api/engine/ensure cold heal | ✅ PASS | full stack from dead in <30s |
| 40 | Single-instance lock | ✅ PASS | second supervisor exits |

### YouTube / WARP (Phase 6)
| # | Test | Result | Evidence |
|---|---|---|---|
| 41 | YouTube extraction via WARP | ✅ PASS | title+duration resolved (2×) |
| 42 | WARP endpoint rotation | ✅ PASS | port 2408→4500 failover discovered |
| 43 | UDP throttle resilience | ⚠️ PARTIAL | sandbox throttles sustained flows; auto-heal every 90s; verified working windows |
| 44 | Bot-block error message quality | ✅ PASS | friendly guidance (link/upload/direct-MP4) |
| 45 | Drive code path | ✅ PASS (inert) | real OAuth2+resumable code; awaits GOOGLE_CLIENT_ID/SECRET env |

## Phase timings (wall clock)

| Phase | Scope | Start→End | Dur |
|---|---|---|---|
| 1 | Pipeline (deps, fonts, model, E2E direct MP4) | 07:22–07:44 | 22m |
| 2 | Engine API + SQLite queue | 07:30–07:37 | (parallel w/ P1) |
| 3 | Mobile UI | 08:00–08:10 | 10m |
| 4 | Styles/effects verification + fixes | 08:10–08:25 | 15m |
| 5 | Deploy/self-heal verification | 07:39–07:42 + 08:30 | 5m |
| 6 | WARP + YouTube + Drive | 07:50–08:15 | 25m |
| 7 | Final E2E + docs | 08:25–08:45 | 20m |

## Per-job processing times (observed)
- 52s source: download ~4s (5.6MB) · transcribe 5.9s · analyze 0.7s (LLM) · render 13–20s/clip (preset-dependent, incl. face tracking ~3s)
- 12-min YouTube source: extraction ~8s through WARP when tunnel healthy

---

## Re-verification session 2 (2026-10-03, later): 22/22 PASS

Full suite automated in `scripts/e2e_test.sh`:
- Service health (engine/gateway/bridge/proxy): 4/4
- Reference data (15 presets, 23 fonts, 4 aspects): 3/3
- Golden path MP4→done (18s): 8/8 — 1080×1920, aac, zip valid, preview frame
- Error handling (invalid link): 1/1
- Cancel + no orphan ffmpeg: 2/2
- Retry re-queue: 1/1
- Engine kill → supervisor restart: 2/2
- Lint + frontend: 2/2

New fix: Cloudflare-403 on media sites → `curl_cffi` impersonation retry added to yt-dlp chain (`engine/pipeline.py`).
UI/UX redesign verified in browser at 390×844 and 320×568: full flow walk, video readyState 4, zero console errors, no horizontal overflow.

---

## Session 3 (2026-10-03): YouTube relay + supervisor fixes + full UI rebuild — ALL PASS

- **YouTube E2E via UI**: https://youtu.be/tXdD-eydL7k → loader.to relay (WARP UDP throttled by sandbox) → whisper 719s → 2-10 clips, real titles/scores, 1080×1920. Verified twice (API + browser).
- **Supervisor crash fixed**: port_up() built wrong path for pot-server (/health instead of /ping) → KeyError 'pot' crash ~3s after boot → engine+supervisor died silently. Fixed + defaultdict backoff. Engine-kill self-heal re-verified.
- **warp.py dual-address bug fixed**: dict overwrote duplicate Address lines → warp.conf lost IPv4.
- **UI rebuilt from zero**: Aurora Glass design (violet→fuchsia gradients, glass cards, floating tab bar, pipeline visualization, shimmer skeletons). All functionality preserved; browser-verified at 390/320px, console clean.
- E2E suite: 22/22 (scripts/e2e_test.sh).
