"""Cloudflare WARP tunnel management (userspace wireproxy SOCKS5, no TUN/root).
The supervisor runs wireproxy as a child; the pipeline routes yt-dlp through it
when healthy. Falls back to direct connection if the tunnel is down.
Endpoints rotate because handshakes fail on some of them ~50% of the time."""
import os
import socket
import subprocess
import time
import urllib.request

WARP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warp")
PROFILE = os.path.join(WARP_DIR, "wgcf-profile.conf")
CONF = os.path.join(WARP_DIR, "warp.conf")
LOG = os.path.join(WARP_DIR, "wireproxy.log")
BIN = os.path.join(WARP_DIR, "wireproxy")

PROXY_HOST = "127.0.0.1"
PROXY_PORT = 40000
PROXY_URL = f"socks5://{PROXY_HOST}:{PROXY_PORT}"

# Known WARP endpoints — multiple ports (2408 gets throttled on some networks;
# 4500/500/1701/8787 are alternates Cloudflare serves WireGuard on)
ENDPOINTS = [
    "162.159.192.1:4500",
    "engage.cloudflareclient.com:2408",
    "162.159.193.10:4500",
    "162.159.192.1:2408",
    "188.114.97.1:4500",
    "162.159.192.1:500",
    "162.159.195.4:2408",
    "188.114.98.224:4500",
    "162.159.192.1:8787",
    "162.159.193.10:2408",
]

_rotation_offset = 0


def _profile_fields():
    fields = {}
    addrs = []
    with open(PROFILE) as f:
        for line in f:
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                if k == "Address":
                    addrs.append(v.strip())  # keep BOTH IPv4 and IPv6 lines
                else:
                    fields[k] = v.strip()
    priv = fields.get("PrivateKey", "")
    pub = fields.get("PublicKey", "")
    return priv, addrs, pub


def write_conf(endpoint: str) -> str:
    priv, addrs, pub = _profile_fields()
    addr_lines = "\n".join(f"Address = {a}" for a in addrs)
    conf = f"""[Interface]
PrivateKey = {priv}
{addr_lines}
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = {pub}
AllowedIPs = 0.0.0.0/0
Endpoint = {endpoint}
PersistentKeepalive = 25

[Socks5]
BindAddress = {PROXY_HOST}:{PROXY_PORT}
"""
    with open(CONF, "w") as f:
        f.write(conf)
    return CONF


def proxy_alive(timeout=1.5) -> bool:
    """TCP check that the SOCKS5 port answers."""
    try:
        with socket.create_connection((PROXY_HOST, PROXY_PORT), timeout=timeout):
            return True
    except OSError:
        return False


def direct_ip(timeout=6) -> str:
    try:
        with urllib.request.urlopen("https://api.ipify.org", timeout=timeout) as r:
            return r.read().decode().strip()
    except Exception:
        return ""


def egress_ip(timeout=12) -> str:
    """IP as seen through the WARP proxy (empty string if tunnel broken)."""
    import socks  # PySocks
    s = socks.socksocket()
    s.set_proxy(socks.SOCKS5, PROXY_HOST, PROXY_PORT)
    s.settimeout(timeout)
    try:
        s.connect(("api.ipify.org", 443))
        import ssl
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(s, server_hostname="api.ipify.org") as ss:
            ss.sendall(b"GET / HTTP/1.1\r\nHost: api.ipify.org\r\nUser-Agent: curl/8\r\nConnection: close\r\n\r\n")
            data = b""
            while True:
                chunk = ss.recv(4096)
                if not chunk:
                    break
                data += chunk
            body = data.split(b"\r\n\r\n", 1)[-1].decode().strip()
            return body.split()[0] if body else ""
    except Exception:
        return ""
    finally:
        try:
            s.close()
        except Exception:
            pass


def tunnel_healthy(timeout=10) -> bool:
    """SOCKS port up AND traffic actually flows through the tunnel.
    (wireproxy only serves via the tunnel — no flow means broken handshake.)"""
    if not proxy_alive():
        return False
    return bool(egress_ip(timeout=timeout))


def start_with_rotation(proc_starter) -> bool:
    """Try endpoints in order until handshake succeeds. proc_starter() -> Popen.
    Each call starts from a different offset so a dead first endpoint doesn't
    get hammered on every heal."""
    global _rotation_offset
    order = ENDPOINTS[_rotation_offset % len(ENDPOINTS):] + ENDPOINTS[:_rotation_offset % len(ENDPOINTS)]
    _rotation_offset += 1
    for endpoint in order:
        write_conf(endpoint)
        proc = proc_starter()
        deadline = time.time() + 30
        while time.time() < deadline:
            time.sleep(2)
            if proc.poll() is not None:
                break  # process died, next endpoint
            if egress_ip(timeout=6):
                return True
        try:
            proc.kill()
        except Exception:
            pass
    return False
