"""Autoclip engine configuration and paths."""
import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FONT_DIR = os.path.join(BASE_DIR, "fonts")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
FACE_MODEL_PATH = os.path.join(BASE_DIR, "faces", "yunet.onnx")
DB_PATH = os.path.join(DATA_DIR, "jobs.db")
FONTCONFIG_FILE = os.path.join(BASE_DIR, "fonts.conf")
LLM_BRIDGE_URL = os.environ.get("LLM_BRIDGE_URL", "http://127.0.0.1:8002")

ENGINE_PORT = int(os.environ.get("ENGINE_PORT", "8001"))

# Whisper settings (CPU box, 4GB RAM)
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE = "int8"

# RAM guard: refuse to load whisper if free RAM below this (MB)
MIN_FREE_MB_FOR_WHISPER = 1400

# Render
MAX_PARALLEL_RENDER = 1  # 2 CPU / 4GB box — serialize renders
LIBX264_PRESET = "veryfast"
LIBX264_CRF = "18"

# Recovery
MAX_RECOVERY = 3

# Sentence split gap (seconds) — karaoke timing stretches if we split mid-speech
SENTENCE_GAP = 0.55
SENTENCE_PAD = 0.3  # padding added around clip boundaries

ASPECTS = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "16:9": (1920, 1080),
}


def ensure_dirs():
    for d in (DATA_DIR, UPLOAD_DIR, FONT_DIR, os.path.dirname(FACE_MODEL_PATH)):
        os.makedirs(d, exist_ok=True)


def free_ram_mb() -> float:
    try:
        with open("/proc/meminfo") as f:
            info = {line.split(":")[0]: int(line.split()[1]) for line in f if ":" in line}
        return (info.get("MemAvailable", 0)) / 1024.0
    except Exception:
        return 4096.0


def engine_env() -> dict:
    """Environment for ffmpeg subprocesses (fontconfig sees engine fonts)."""
    env = dict(os.environ)
    env["FONTCONFIG_FILE"] = FONTCONFIG_FILE
    return env
