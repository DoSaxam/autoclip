"""Autoclip supervisor — keeps the engine (uvicorn :8001) and LLM bridge (bun :8002)
alive as its children. Started by Next.js instrumentation.ts so processes live in
the app-server process tree (never orphaned by tool-call exits).
Single instance enforced via lock file."""
import os
import signal
import subprocess
import sys
import threading
import time

# supervisor.py runs as a script (python engine/supervisor.py) — support both imports
try:
    from . import warp as warp_mod
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from engine import warp as warp_mod

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
LOCK = os.path.join(DATA, "supervisor.lock")
LOG = os.path.join(DATA, "supervisor.log")
PY = sys.executable
ROOT = os.path.dirname(BASE)  # project root

ENGINE_PORT = 8001
BRIDGE_PORT = 8002


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    try:
        with open(LOG, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass
    print(line, flush=True)


def lock_alive():
    try:
        with open(LOCK) as f:
            pid = int(f.read().strip() or 0)
        if pid <= 0:
            return False
        os.kill(pid, 0)  # raises if dead
        return True
    except (FileNotFoundError, ValueError, ProcessLookupError, PermissionError):
        return False


def acquire_lock():
    os.makedirs(DATA, exist_ok=True)
    if lock_alive():
        log("another supervisor is alive — exiting")
        return False
    with open(LOCK, "w") as f:
        f.write(str(os.getpid()))
    return True


def port_up(port, path="/engine/health", is_engine=True):
    import urllib.request
    url = f"http://127.0.0.1:{port}" + (path if is_engine else "/health")
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def start_engine():
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.Popen(
        [PY, "-m", "uvicorn", "engine.main:app", "--host", "127.0.0.1",
         "--port", str(ENGINE_PORT), "--log-level", "warning"],
        cwd=ROOT, env=env, start_new_session=False,
        stdout=open(os.path.join(DATA, "engine.log"), "ab"),
        stderr=subprocess.STDOUT,
    )
    log(f"engine started pid={proc.pid}")
    return proc


def start_bridge():
    env = dict(os.environ)
    proc = subprocess.Popen(
        ["bun", "run", "start"],
        cwd=os.path.join(ROOT, "mini-services", "llm-bridge"), env=env,
        stdout=open(os.path.join(DATA, "bridge.log"), "ab"),
        stderr=subprocess.STDOUT,
    )
    log(f"llm-bridge started pid={proc.pid}")
    return proc


def _spawn_wireproxy():
    return subprocess.Popen(
        [warp_mod.BIN, "-c", warp_mod.CONF],
        cwd=warp_mod.WARP_DIR,
        stdout=open(warp_mod.LOG, "ab"),
        stderr=subprocess.STDOUT,
    )


def start_warp():
    """Start wireproxy with endpoint rotation until handshake succeeds."""
    if not os.path.exists(warp_mod.PROFILE):
        log("warp: no profile — tunnel disabled (direct connections only)")
        return False
    # kill any stale instance holding the SOCKS port
    try:
        subprocess.run(["pkill", "-f", "wireproxy -c"], timeout=5)
        time.sleep(1)
    except Exception:
        pass
    ok = warp_mod.start_with_rotation(_spawn_wireproxy)
    if ok:
        log("warp: tunnel healthy")
        return True
    log("warp: tunnel failed to establish (engine will use direct)")
    return False


_warp_lock = threading.Lock()


def warp_heal():
    """Bring the tunnel up (full endpoint rotation). Runs in its own thread;
    skipped if another heal is already in progress."""
    if not _warp_lock.acquire(blocking=False):
        return
    try:
        start_warp()
    finally:
        _warp_lock.release()


def main():
    if not acquire_lock():
        sys.exit(0)
    log("supervisor up")
    procs = {}
    backoff = {"engine": 0, "bridge": 0}

    def shutdown(signum, frame):
        log("supervisor shutting down")
        for p in procs.values():
            try:
                p.terminate()
            except Exception:
                pass
        try:
            os.unlink(LOCK)
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # If ports already serve (e.g. previous supervisor died but children live),
    # adopt them instead of double-starting.
    if not port_up(ENGINE_PORT):
        procs["engine"] = start_engine()
    else:
        log("engine already up — adopting")
    if not port_up(BRIDGE_PORT, is_engine=False):
        procs["bridge"] = start_bridge()
    else:
        log("bridge already up — adopting")

    # WARP tunnel — initial bringup in a background thread; healed every 20s
    threading.Thread(target=warp_heal, daemon=True, name="warp-heal").start()
    warp_last_check = time.time() + 60  # grace period before first loop check
    warp_backoff = 0.0

    last_check = 0.0
    while True:
        time.sleep(3)
        now = time.time()
        if now - last_check < 2.5:
            continue
        last_check = now
        for name, port, starter, is_engine in (
            ("engine", ENGINE_PORT, start_engine, True),
            ("bridge", BRIDGE_PORT, start_bridge, False),
        ):
            if port_up(port, is_engine=is_engine):
                continue
            # child died -> restart with backoff
            dead = procs.pop(name, None)
            if dead is not None and dead.poll() is None:
                continue  # port check raced; process alive
            since = now - backoff[name]
            if since < 0:
                continue
            backoff[name] = now + (5 if name == "bridge" else 8)  # next allowed restart time
            log(f"{name} is DOWN — restarting")
            try:
                if dead is not None:
                    dead.kill()
            except Exception:
                pass
            procs[name] = starter()

        # --- WARP health (every 20s, full rotation heal on failure) ---
        if os.path.exists(warp_mod.PROFILE):
            if now - warp_last_check >= 20:
                warp_last_check = now
                try:
                    healthy = warp_mod.tunnel_healthy(timeout=8)
                except Exception:
                    healthy = False
                if not healthy and now >= warp_backoff:
                    warp_backoff = now + 90
                    log("warp: tunnel unhealthy — healing (endpoint rotation)")
                    threading.Thread(target=warp_heal, daemon=True).start()


if __name__ == "__main__":
    main()
