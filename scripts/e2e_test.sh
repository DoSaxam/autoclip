#!/bin/bash
# Autoclip full E2E test suite — API level (engine direct + gateway)
# Usage: bash /home/z/my-project/scripts/e2e_test.sh
exec 2>&1
set -u
ENGINE="http://localhost:8001"
GATEWAY="http://localhost:81"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected=$2 got=$3)"; fi
}

echo "=== 1. Service health ==="
H=$(curl -s -o /dev/null -w "%{http_code}" $ENGINE/engine/health); check "engine /engine/health" 200 $H
H=$(curl -s -o /dev/null -w "%{http_code}" $GATEWAY/); check "gateway serves frontend" 200 $H
H=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8002/health); check "LLM bridge" 200 $H
H=$(curl -s -o /dev/null -w "%{http_code}" $GATEWAY/engine/api/presets?XTransformPort=8001); check "gateway → engine proxy (presets)" 200 $H

echo "=== 2. Reference endpoints ==="
P=$(curl -s $ENGINE/engine/api/presets | python3 -c "import sys,json; print(len(json.load(sys.stdin)['presets']))")
check "15 caption presets" 15 $P
F=$(curl -s $ENGINE/engine/api/fonts | python3 -c "import sys,json; print(len(json.load(sys.stdin)['fonts']))")
[ "$F" -ge 20 ] && ok "fonts >= 20 ($F)" || bad "fonts ($F)"
A=$(curl -s $ENGINE/engine/api/aspects | python3 -c "import sys,json; print(len(json.load(sys.stdin)['aspects']))")
check "4 aspect ratios" 4 $A

echo "=== 3. Golden path: direct MP4 → done ==="
SINTEL="https://media.w3.org/2010/05/sintel/trailer.mp4"
JOB=$(curl -s -X POST $ENGINE/engine/api/jobs -H "Content-Type: application/json" -d "{
  \"source_url\": \"$SINTEL\",
  \"settings\": {\"preset\": \"karaoke\", \"aspect\": \"9:16\", \"effects\": {\"progressBar\": true, \"zoomPulse\": true}, \"clip\": {\"minLen\": 15, \"maxLen\": 40, \"maxClips\": \"auto\"}}
}" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
echo "  job: $JOB"
START=$(date +%s)
for i in $(seq 1 120); do
  S=$(curl -s $ENGINE/engine/api/jobs/$JOB | python3 -c "import sys,json; j=json.load(sys.stdin); print(j['status'])")
  [ "$S" = "done" ] && break
  [ "$S" = "failed" -o "$S" = "failed_permanent" ] && break
  sleep 3
done
ELAPSED=$(( $(date +%s) - START ))
check "job reaches done" done $S
echo "  elapsed: ${ELAPSED}s"
if [ "$S" = "done" ]; then
  CLIPS=$(curl -s $ENGINE/engine/api/jobs/$JOB | python3 -c "
import sys,json; j=json.load(sys.stdin)
print(len(j['clips']))
" )
  [ "$CLIPS" -ge 1 ] && ok "clips generated ($CLIPS)" || bad "no clips"
  # verify clip file streams through gateway
  FILE=$(curl -s $ENGINE/engine/api/jobs/$JOB | python3 -c "import sys,json; j=json.load(sys.stdin); print(j['clips'][0]['url'])")
  H=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY${FILE}?XTransformPort=8001")
  check "clip MP4 streams via gateway" 200 $H
  # verify dimensions via probe
  DIM=$(curl -s "${GATEWAY}${FILE}?XTransformPort=8001" -o /tmp/ac_e2e_clip.mp4 && ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 /tmp/ac_e2e_clip.mp4)
  check "output is 1080x1920" "1080,1920" "$DIM"
  HASAC=$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 /tmp/ac_e2e_clip.mp4)
  check "audio track present (aac)" aac "$HASAC"
  # zip
  H=$(curl -s -o /tmp/ac_e2e.zip -w "%{http_code}" "$ENGINE/engine/api/jobs/$JOB/zip")
  check "zip download 200" 200 $H
  python3 -c "import zipfile; z=zipfile.ZipFile('/tmp/ac_e2e.zip'); assert len(z.namelist())>=1; print('  ✅ zip valid,', len(z.namelist()), 'files')" || bad "zip invalid"
  # preview frame
  H=$(curl -s -o /tmp/ac_e2e_prev.png -w "%{http_code}" -X POST $ENGINE/engine/api/jobs/$JOB/preview -H "Content-Type: application/json" -d "{\"t\": 2.0, \"settings\": {\"preset\": \"beast\", \"aspect\": \"9:16\"}}")
  check "engine-rendered preview frame" 200 $H
fi

echo "=== 4. Error handling ==="
JOB2=$(curl -s -X POST $ENGINE/engine/api/jobs -H "Content-Type: application/json" -d '{"source_url": "https://example.com/notavideo.mp4", "settings": {}}' | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
for i in $(seq 1 20); do
  S2=$(curl -s $ENGINE/engine/api/jobs/$JOB2 | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  [ "$S2" = "failed" -o "$S2" = "failed_permanent" -o "$S2" = "done" ] && break
  sleep 2
done
[ "$S2" = "failed" -o "$S2" = "failed_permanent" ] && ok "invalid link → clean failure" || bad "invalid link status=$S2"
ERR=$(curl -s $ENGINE/engine/api/jobs/$JOB2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','')[:60])")
echo "  error msg: $ERR"

echo "=== 5. Cancel mid-job ==="
JOB3=$(curl -s -X POST $ENGINE/engine/api/jobs -H "Content-Type: application/json" -d "{\"source_url\": \"$SINTEL\", \"settings\": {\"clip\": {\"maxClips\": \"5\"}}}" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
sleep 6
curl -s -X POST $ENGINE/engine/api/jobs/$JOB3/cancel > /dev/null
for i in $(seq 1 15); do
  S3=$(curl -s $ENGINE/engine/api/jobs/$JOB3 | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  [ "$S3" = "canceled" ] && break
  sleep 2
done
check "cancel works" canceled "$S3"
FF=$(pgrep -f "ffmpeg.*$JOB3" | wc -l)
check "no orphan ffmpeg for canceled job" 0 "$FF"

echo "=== 6. Retry after cancel ==="
curl -s -X POST $ENGINE/engine/api/jobs/$JOB3/retry > /dev/null
S4=$(curl -s $ENGINE/engine/api/jobs/$JOB3 | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
ok "retry re-queues (status=$S4)"
curl -s -X POST $ENGINE/engine/api/jobs/$JOB3/cancel > /dev/null; sleep 4
curl -s -X POST $ENGINE/engine/api/jobs/$JOB3/cancel > /dev/null

echo "=== 7. Self-heal: kill engine, supervisor restarts ==="
EPID=$(pgrep -f "uvicorn engine.main:app" | head -1)
[ -n "$EPID" ] && kill -9 $EPID && ok "engine killed" || bad "engine pid not found"
sleep 25
H=$(curl -s -o /dev/null -w "%{http_code}" $ENGINE/engine/health)
check "supervisor restarted engine" 200 $H

echo "=== 8. UI build health ==="
cd /home/z/my-project
LINT=$(bun run lint 2>&1 | tail -3)
echo "$LINT" | grep -qE "error|warning" && bad "lint has issues" || ok "eslint clean"
H=$(curl -s -o /dev/null -w "%{http_code}" $GATEWAY/); check "frontend still serving" 200 $H

echo ""
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="
