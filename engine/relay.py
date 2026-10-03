"""YouTube relay via loader.to — used when the datacenter IP is bot-blocked.

Flow: request processing → poll progress (real %) → stream the finished file
from the loader CDN with real bytes/speed/ETA progress. Cancel-aware at every
step. The CDN file is a normal MP4 (h264+aac) downloadable from any IP, which
is exactly what we need when youtube.com itself refuses our egress IP.
"""
import os
import re
import time

import requests

BASE = "https://loader.to"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# loader.to quality ladder — we never need more than 1080p
QUALITY = "1080"


class RelayError(Exception):
    pass


def is_youtube(url: str) -> bool:
    u = (url or "").lower()
    return any(h in u for h in (
        "youtube.com", "youtu.be", "youtube-nocookie.com", "music.youtube.com",
    ))


def _cd_title(cd: str) -> str:
    """Extract filename from Content-Disposition."""
    if not cd:
        return ""
    m = re.search(r'filename="?([^";]+)"?', cd)
    if not m:
        return ""
    name = m.group(1).strip()
    for ext in (".mp4", ".mkv", ".webm"):
        if name.lower().endswith(ext):
            name = name[: -len(ext)]
    return name[:100]


def relay_download(job, url, dest_path, set_progress, check_cancel, on_message):
    """Download a YouTube video through the loader.to relay.

    Returns (path, title). Raises RelayError on failure, CanceledError via
    check_cancel when the user cancels.
    """
    job_id = job["id"]
    s = requests.Session()
    s.headers.update({"User-Agent": UA})

    on_message("YouTube blocked this server's IP — using relay fallback…")
    # ---- 1. start processing ----
    try:
        r = s.get(f"{BASE}/ajax/download.php",
                  params={"format": QUALITY, "url": url}, timeout=30)
        data = r.json()
    except Exception as e:
        raise RelayError(f"relay request failed: {e}")
    purl = data.get("progress_url")
    if not data.get("id") or not purl:
        raise RelayError(f"relay rejected the link: {str(data)[:120]}")

    # ---- 2. poll processing progress (server-side transcode/mux) ----
    set_progress(0.02)
    deadline = time.time() + 420  # 7 min max for processing
    dl_url = None
    last_pct = -1
    while time.time() < deadline:
        check_cancel(job_id)
        try:
            p = s.get(purl, timeout=15).json()
        except Exception:
            time.sleep(2)
            continue
        pct = p.get("progress")
        if p.get("success") == 1 and p.get("download_url"):
            dl_url = p["download_url"]
            break
        if str(pct) == "1000":  # loader.to failure marker
            raise RelayError(f"relay processing failed: {str(p)[:160]}")
        try:
            pctf = float(pct)
        except (TypeError, ValueError):
            pctf = 0.0
        if pctf != last_pct:
            last_pct = pctf
            # processing phase maps to 0.02–0.30 of download stage
            set_progress(0.02 + min(max(pctf / 100.0, 0.0), 1.0) * 0.28)
            on_message(f"relay preparing video… {min(int(pctf), 99)}%")
        time.sleep(2.5)
    if not dl_url:
        raise RelayError("relay processing timed out")

    # ---- 3. stream the file with REAL byte progress ----
    check_cancel(job_id)
    title = ""
    try:
        with s.get(dl_url, stream=True, timeout=(15, 60), allow_redirects=True) as r:
            r.raise_for_status()
            title = _cd_title(r.headers.get("content-disposition", ""))
            total = int(r.headers.get("content-length") or 0)
            done = 0
            t0 = time.time()
            tmp = dest_path + ".part"
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(256 * 1024):
                    check_cancel(job_id)
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        speed = done / max(time.time() - t0, 0.1)
                        eta = (total - done) / speed if speed else 0
                        set_progress(0.30 + 0.699 * (done / total))
                        if done % (8 * 1024 * 1024) < 262144:  # ~ every 8MB
                            on_message(f"downloading {done / 1e6:.0f}/{total / 1e6:.0f}MB "
                                       f"{speed / 1e6:.2f}MB/s ETA {eta:.0f}s")
            os.replace(tmp, dest_path)
    except Exception as e:
        try:
            os.remove(dest_path + ".part")
        except OSError:
            pass
        if type(e).__name__ == "CanceledError":
            raise
        raise RelayError(f"relay download failed: {e}")

    if not os.path.exists(dest_path) or os.path.getsize(dest_path) < 100_000:
        raise RelayError("relay produced no usable file")

    set_progress(0.999)
    return dest_path, title
