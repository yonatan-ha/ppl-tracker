"""Generate the PWA icons with no third-party dependencies (stdlib zlib + struct only).

Draws a dark rounded square with three stacked bars in the Push / Pull / Legs colors.

    python tools/make_icons.py
"""

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")

BG = (21, 21, 21, 255)
BARS = [
    (232, 93, 84, 255),    # push  - red
    (91, 143, 232, 255),   # pull  - blue
    (233, 205, 116, 255),  # legs  - light yellow
]


def rounded_rect_mask(size, radius):
    """Anti-aliased-ish coverage mask for a rounded square, sampled 2x2 per pixel."""
    mask = bytearray(size * size)
    for y in range(size):
        for x in range(size):
            hits = 0
            for oy in (0.25, 0.75):
                for ox in (0.25, 0.75):
                    px, py = x + ox, y + oy
                    cx = min(max(px, radius), size - radius)
                    cy = min(max(py, radius), size - radius)
                    dx, dy = px - cx, py - cy
                    if dx * dx + dy * dy <= radius * radius:
                        hits += 1
            mask[y * size + x] = hits * 63 + (3 if hits == 4 else 0)
    return mask


def blend(dst, src, alpha):
    """alpha 0..255 over an opaque destination."""
    a = alpha / 255.0
    return tuple(int(round(d * (1 - a) + s * a)) for d, s in zip(dst[:3], src[:3])) + (255,)


def make_icon(size, path, maskable_pad=0.0):
    radius = size * 0.225
    mask = rounded_rect_mask(size, radius)

    # transparent canvas
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]

    for y in range(size):
        for x in range(size):
            cov = mask[y * size + x]
            if cov:
                px[y][x] = (BG[0], BG[1], BG[2], cov)

    # three bars, centred, with a shrink factor for maskable safe-area
    inset = 0.20 + maskable_pad
    bar_x0 = int(size * inset)
    bar_x1 = int(size * (1 - inset))
    bar_h = int(size * 0.088)
    gap = int(size * 0.056)
    total = len(BARS) * bar_h + (len(BARS) - 1) * gap
    y0 = (size - total) // 2
    br = bar_h / 2.0

    for i, color in enumerate(BARS):
        top = y0 + i * (bar_h + gap)
        # slightly stagger the bar widths so it reads as a logo, not a menu icon
        x1 = bar_x1 - int(size * (0.0 if i == 1 else 0.055))
        for y in range(top, top + bar_h):
            for x in range(bar_x0, x1):
                # rounded bar ends
                cxl, cxr = bar_x0 + br, x1 - br
                cy = top + br
                if x < cxl:
                    dx, dy = x + 0.5 - cxl, y + 0.5 - cy
                    if dx * dx + dy * dy > br * br:
                        continue
                elif x > cxr:
                    dx, dy = x + 0.5 - cxr, y + 0.5 - cy
                    if dx * dx + dy * dy > br * br:
                        continue
                base = px[y][x]
                if base[3] == 0:
                    continue
                px[y][x] = blend(base, color, 255)

    write_png(path, size, px)


def write_png(path, size, px):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            raw.extend(px[y][x])

    def chunk(tag, data):
        out = struct.pack(">I", len(data)) + tag + data
        return out + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))

    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({len(png)} bytes)")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    make_icon(192, os.path.join(OUT_DIR, "icon-192.png"))
    make_icon(512, os.path.join(OUT_DIR, "icon-512.png"))
    make_icon(180, os.path.join(OUT_DIR, "apple-touch-icon.png"))
