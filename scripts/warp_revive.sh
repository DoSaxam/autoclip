#!/bin/bash
# Try to revive WARP: fresh identity + endpoint rotation, report working endpoint
exec 2>&1
cd /home/z/my-project/engine/warp

echo "=== 1. Kill existing wireproxy ==="
pkill -f "wireproxy" 2>/dev/null; sleep 2
pgrep -f wireproxy && echo "STILL RUNNING" || echo "killed OK"

echo "=== 2. Fresh WARP identity ==="
cp wgcf-account.toml wgcf-account.toml.bak 2>/dev/null
cp wgcf-profile.conf wgcf-profile.conf.bak 2>/dev/null
printf 'y\n' | ./wgcf register --accept-tos 2>&1 | tail -2
./wgcf generate 2>&1 | tail -2
echo "--- new profile ---"
grep -E "PrivateKey|Address|PublicKey" wgcf-profile.conf | head -5

echo "=== 3. Endpoint rotation with egress check ==="
ENDPOINTS=(
  "engage.cloudflareclient.com:2408"
  "162.159.192.1:2408"
  "162.159.195.4:2408"
  "162.159.192.1:4500"
  "162.159.193.10:4500"
  "188.114.97.1:4500"
  "162.159.192.1:500"
  "162.159.192.1:8787"
  "162.159.193.10:2408"
  "188.114.98.224:4500"
  "162.159.193.10:500"
  "162.159.196.229:2408"
)
FOUND=""
for ep in "${ENDPOINTS[@]}"; do
  # build conf for this endpoint
  priv=$(sed -n 's/^PrivateKey *= *//p' wgcf-profile.conf | tr -d ' ')
  pub=$(sed -n 's/^PublicKey *= *//p' wgcf-profile.conf | tr -d ' ')
  addr4=$(grep -E '^Address' wgcf-profile.conf | grep -v ':' | cut -d= -f2 | tr -d ' ')
  addr6=$(grep -E '^Address.*:' wgcf-profile.conf | cut -d= -f2 | tr -d ' ')
  [ -z "$addr4" ] && addr4="172.16.0.2/32"
  cat > test-warp.conf << EOF
[Interface]
PrivateKey = $priv
Address = $addr4
Address = $addr6
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = $pub
AllowedIPs = 0.0.0.0/0
Endpoint = $ep
PersistentKeepalive = 25

[Socks5]
BindAddress = 127.0.0.1:40001
EOF
  ./wireproxy -c test-warp.conf & WPID=$!
  sleep 6
  EG=$(/home/z/.venv/bin/python3 -c "
import socks, socket
s = socks.socksocket(); s.set_proxy(socks.SOCKS5, '127.0.0.1', 40001); s.settimeout(8)
try:
    s.connect(('api.ipify.org', 443))
    import ssl
    with ssl.create_default_context().wrap_socket(s, server_hostname='api.ipify.org') as ss:
        ss.sendall(b'GET / HTTP/1.1\r\nHost: api.ipify.org\r\nUser-Agent: curl/8\r\nConnection: close\r\n\r\n')
        d = b''
        while True:
            c = ss.recv(4096)
            if not c: break
            d += c
        print(d.split(b'\r\n\r\n',1)[-1].decode().strip()[:20])
except Exception as e:
    print('')
" 2>/dev/null)
  kill $WPID 2>/dev/null
  if [ -n "$EG" ]; then
    echo "✅ $ep → egress $EG  *** WORKS ***"
    FOUND="$ep"
    echo "$ep" > working_endpoint.txt
    break
  else
    echo "❌ $ep → no egress"
  fi
  sleep 1
done

if [ -n "$FOUND" ]; then
  echo "=== SUCCESS: $FOUND ==="
else
  echo "=== ALL ENDPOINTS FAILED — UDP path appears dead ==="
fi
