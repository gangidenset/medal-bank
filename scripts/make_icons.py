"""アプリアイコン（PNG）を生成する。外部ライブラリ不要。

    python scripts/make_icons.py

ジャグラーの「ペカる」ランプをイメージした、暗い背景に光る「GOGO!」の文字とキラキラ。
文字は太い線（楕円の弧・線分）を距離で描き、外側に光のにじみを足している。
maskable 用は全面塗り（文字は中央 80% のセーフゾーン内）、通常用は角丸。
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'www' / 'icons'

BG_CENTER = (0x2C, 0x0A, 0x24)
BG_EDGE = (0x06, 0x03, 0x09)
PANEL = (0x16, 0x05, 0x10)
RIM = (0x6B, 0x1C, 0x3A)
CORE_HOT = (0xFF, 0xF4, 0xF8)
CORE_EDGE = (0xFF, 0x3D, 0x8B)
GLOW = (0xFF, 0x1F, 0x5A)
STAR = (0xFF, 0xE0, 0x66)

W = 0.036  # 文字の線の太さ
RX, RY = 0.064, 0.094  # 文字（楕円）の横・縦の半径
CY = 0.5
LETTERS = [('G', 0.232), ('O', 0.384), ('G', 0.536), ('O', 0.688), ('!', 0.800)]
STARS = [(0.20, 0.235, 0.050), (0.835, 0.285, 0.036), (0.775, 0.765, 0.044), (0.255, 0.745, 0.028)]
GAP = (-80.0, 0.0)  # G の切れ目（右上、度。y は下向き）


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def ellipse_point(cx, deg):
    a = math.radians(deg)
    return cx + RX * math.cos(a), CY + RY * math.sin(a)


def ring_dist(px, py, cx):
    """楕円の線までのおおよその距離（中心からの方向に沿って測る）"""
    dx, dy = px - cx, py - CY
    q = math.hypot(dx / RX, dy / RY)
    if q < 1e-9:
        return min(RX, RY)
    return abs(q - 1) * math.hypot(dx, dy) / q


def letter_dist(px, py, ch, cx):
    if ch == 'O':
        return ring_dist(px, py, cx)
    if ch == 'G':
        ang = math.degrees(math.atan2(py - CY, px - cx))
        if GAP[0] < ang < GAP[1]:
            ex1, ey1 = ellipse_point(cx, GAP[0])
            ex2, ey2 = ellipse_point(cx, GAP[1])
            d = min(math.hypot(px - ex1, py - ey1), math.hypot(px - ex2, py - ey2))
        else:
            d = ring_dist(px, py, cx)
        return min(d, seg_dist(px, py, cx + RX * 0.05, CY, cx + RX, CY))  # 真ん中の横棒
    # '!'
    return min(seg_dist(px, py, cx, CY - RY, cx, CY + RY * 0.38), math.hypot(px - cx, py - (CY + RY * 0.92)) - W * 0.1)


def text_dists(px, py):
    """各文字の線までの距離（範囲外なら空）"""
    if not (0.06 < px < 0.94 and 0.24 < py < 0.76):
        return []
    return [max(0.0, letter_dist(px, py, ch, cx)) for ch, cx in LETTERS]


def star_amount(px, py):
    """4つの角のキラキラ（アステロイド形）と、そのにじみ"""
    core = 0.0
    glow = 0.0
    for sx, sy, s in STARS:
        dx, dy = abs(px - sx), abs(py - sy)
        if dx > s * 2.2 or dy > s * 2.2:
            continue
        v = (math.sqrt(dx) + math.sqrt(dy)) / math.sqrt(s)
        if v < 1:
            core = max(core, 1.0)
        glow = max(glow, math.exp(-math.hypot(dx, dy) / (s * 0.45)) * 0.55)
    return core, glow


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def mix(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def color_at(x, y):
    # 背景：中央が少し明るい暗い紫
    t = min(1.0, math.hypot(x - 0.5, y - 0.5) / 0.72)
    c = mix(BG_CENTER, BG_EDGE, t)
    # ランプのパネル（角丸の枠）
    if in_rounded_rect(x, y, 0.105, 0.30, 0.895, 0.70, 0.11):
        rim = not in_rounded_rect(x, y, 0.117, 0.312, 0.883, 0.688, 0.098)
        c = RIM if rim else mix(PANEL, BG_CENTER, 0.25)
    # 文字：芯は白っぽく、外側ほどピンク。周りに赤いにじみ
    ds = text_dists(x, y)
    d = min(ds) if ds else 1.0
    if d < W / 2:
        c = mix(CORE_HOT, CORE_EDGE, (d / (W / 2)) ** 1.6)
    elif ds:
        # にじみは全部の文字の光を足し合わせる（文字の境目に筋が出ないように）
        g = min(1.0, sum(math.exp(-max(0.0, di - W / 2) / 0.032) for di in ds)) * 0.95
        c = [min(255, c[i] * (1 - g * 0.35) + GLOW[i] * g) for i in range(3)]
    # キラキラ
    core, glow = star_amount(x, y)
    if core:
        c = [255, 250, 220]
    elif glow:
        c = [min(255, c[i] + STAR[i] * glow) for i in range(3)]
    return c


def render(size, rounded):
    ss = 3 if size <= 256 else 2  # スーパーサンプリングでアンチエイリアス
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            n = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    if rounded and not in_rounded_rect(x, y, 0, 0, 1, 1, 0.22):
                        continue
                    c = color_at(x, y)
                    for i in range(3):
                        acc[i] += c[i]
                    n += 1
            if n == 0:
                row += bytes(4)
                continue
            row += bytes([round(a / n) for a in acc] + [round(255 * n / (ss * ss))])
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
