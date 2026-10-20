"""アプリアイコン（PNG）を生成する。外部ライブラリ不要。

    python scripts/make_icons.py

藍色のグラデーション背景に金色のメダル（星入り）。maskable 用は全面塗り、通常用は角丸。
メダルは中央 80% のセーフゾーン内に収めている。
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'www' / 'icons'

TOP = (0x5B, 0x4F, 0xE0)
BOTTOM = (0x2E, 0x24, 0xA8)
GOLD = (0xF5, 0xC5, 0x42)
GOLD_DARK = (0xC8, 0x8E, 0x0E)
CX, CY, R = 0.5, 0.5, 0.30


def star_points(cx, cy, r_out, r_in):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


STAR = star_points(CX, CY + 0.005, 0.15, 0.065)


def in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def color_at(x, y):
    """None = 背景、それ以外はメダルの色"""
    d = math.hypot(x - CX, y - CY)
    if d > R:
        return None
    if d > R - 0.035:
        return GOLD_DARK  # 縁
    if d > R - 0.06:
        return GOLD
    if d > R - 0.072:
        return GOLD_DARK  # 内側の線
    if in_poly(x, y, STAR):
        return GOLD_DARK
    return GOLD


def in_rounded_rect(x, y, r):
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, rounded):
    ss = 4 if size <= 256 else 3  # スーパーサンプリングでアンチエイリアス
    rows = []
    for py in range(size):
        row = bytearray([0])
        t = py / (size - 1)
        base = [round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)]
        for px in range(size):
            acc = [0, 0, 0]
            bg = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    if rounded and not in_rounded_rect(x, y, 0.22):
                        continue
                    bg += 1
                    c = color_at(x, y) or base
                    for i in range(3):
                        acc[i] += c[i]
            if bg == 0:
                row += bytes(4)
                continue
            row += bytes([round(a / bg) for a in acc] + [round(255 * bg / (ss * ss))])
        rows.append(bytes(row))
    return png(size, size, b''.join(rows))


def png(w, h, raw):
    def chunk(kind, data):
        c = struct.pack('>I', len(data)) + kind + data
        return c + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


TARGETS = [
    ('icon-192.png', 192, True),
    ('icon-512.png', 512, True),
    ('icon-maskable-512.png', 512, False),
    ('apple-touch-icon.png', 180, False),  # iOS は自動で角丸にする
    ('favicon-32.png', 32, True),
]

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, rounded in TARGETS:
        (OUT / name).write_bytes(render(size, rounded))
        print('wrote', name)
