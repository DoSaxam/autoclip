"""Pure-stdlib PNG writer (RGBA, no PIL dependency)."""
import zlib
import struct


def write_png(path: str, width: int, height: int, pixel_fn):
    """pixel_fn(x, y) -> (r, g, b, a). Writes an RGBA PNG."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            r, g, b, a = pixel_fn(x, y)
            raw += bytes((r, g, b, a))

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def make_progress_bar(path: str, width: int, height: int = 14, radius: int = 7,
                      color=(34, 197, 94, 255)):
    """Rounded-corner solid bar PNG (fill)."""
    def px(x, y):
        # rounded rect SDF
        dx = max(radius - x, x - (width - 1 - radius), 0)
        dy = max(radius - y, y - (height - 1 - radius), 0)
        inside = (dx == 0 or x >= radius and x <= width - 1 - radius) and (dy == 0 or y >= radius and y <= height - 1 - radius)
        # simple check: corner circles
        cx = min(max(x, radius), width - 1 - radius)
        cy = min(max(y, radius), height - 1 - radius)
        d2 = (x - cx) ** 2 + (y - cy) ** 2
        return color if d2 <= radius * radius else (0, 0, 0, 0)

    write_png(path, width, height, px)


def make_track_bar(path: str, width: int, height: int = 14, radius: int = 7,
                   color=(0, 0, 0, 110)):
    make_progress_bar(path, width, height, radius, color)
