"""アプリアイコン（PNG）を生成する。外部ライブラリ不要。

    python scripts/make_icons.py

このアプリでできることを表すデザイン：
- 積み上がった金色のメダル … 貯メダルを「資産」として貯める
- 右上がりの矢印 … 資産の推移・収支の分析・将来予測
- 小さなキラキラ … ボーナスが光る瞬間（小役カウンター・設定推測）
背景はアプリの画面と同じ藍色のグラデーション。
maskable 用は全面塗り（主な絵は中央 80% のセーフゾーン内）、通常用は角丸。
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'www' / 'icons'

BG_TOP = (0x5B, 0x4F, 0xE0)
BG_BOTTOM = (0x24, 0x18, 0x7A)
GOLD_LIGHT = (0xFF, 0xD9, 0x5E)
GOLD = (0xF2, 0xB8, 0x2A)
GOLD_SIDE = (0xC8, 0x82, 0x0C)
GOLD_EDGE = (0x8A, 0x52, 0x05)
WHITE = (0xFF, 0xFF, 0xFF)
SHADOW = (0x14, 0x0C, 0x48)
SPARK = (0xFF, 0xE8, 0x8A)

# メダルの山（下から順に積む）
COIN_CX, COIN_RX, COIN_RY, COIN_T = 0.385, 0.205, 0.072, 0.058
COIN_BASE, COIN_STEP, COIN_N = 0.700, 0.082, 4

# 右上がりの矢印（折れ線）
ARROW = [(0.255, 0.585), (0.445, 0.425), (0.560, 0.500), (0.745, 0.300)]
ARROW_W = 0.052
HEAD_LEN, HEAD_W = 0.115, 0.075

SPARKS = [(0.665, 0.205, 0.048), (0.845, 0.420, 0.030), (0.205, 0.300, 0.026)]


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def in_rounded_rect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def ell(x, y, cx, cy):
    """楕円の内側なら 1 未満"""
    return ((x - cx) / COIN_RX) ** 2 + ((y - cy) / COIN_RY) ** 2


def coin_color(x, y):
    """上のメダルから順に見て、最初に当たったメダルの色"""
    for i in reversed(range(COIN_N)):
        yf = COIN_BASE - i * COIN_STEP  # 上面の中心
        top = ell(x, y, COIN_CX, yf)
        if top <= 1:
            # 上面：中央が明るく、ふちに濃い線、内側に輪
            if top > 0.86:
                return GOLD_EDGE
            r = math.sqrt(top)
            if 0.60 < r < 0.68:
                return GOLD_SIDE
            return mix(GOLD_LIGHT, GOLD, r * 0.9 + (y - yf) * 3)
        inside_band = abs(x - COIN_CX) <= COIN_RX and yf <= y <= yf + COIN_T
        bottom = ell(x, y, COIN_CX, yf + COIN_T)
        if inside_band or bottom <= 1:
            if bottom > 0.88 and y > yf + COIN_T - 0.004:
                return GOLD_EDGE
            # 側面：円柱らしく左右を暗く、細い溝を入れる
            u = (x - COIN_CX) / COIN_RX
            shade = 0.72 + 0.28 * math.cos(u * math.pi / 2.2)
            c = [GOLD_SIDE[k] * shade + 40 * (1 - abs(u)) for k in range(3)]
            if abs(((y - yf) / COIN_T) - 0.5) < 0.08:
                c = [v * 0.85 for v in c]
            return [min(255, v) for v in c]
    return None


def arrow_dist(x, y):
    return min(seg_dist(x, y, *ARROW[i], *ARROW[i + 1]) for i in range(len(ARROW) - 1))


def in_head(x, y):
    """矢印の先（三角形）"""
    (ax, ay), (bx, by) = ARROW[-2], ARROW[-1]
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    tip = (bx + ux * HEAD_LEN * 0.85, by + uy * HEAD_LEN * 0.85)
    base = (tip[0] - ux * HEAD_LEN, tip[1] - uy * HEAD_LEN)
    p1 = (base[0] - uy * HEAD_W, base[1] + ux * HEAD_W)
    p2 = (base[0] + uy * HEAD_W, base[1] - ux * HEAD_W)

    def side(a, b, p):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

    s1, s2, s3 = side(tip, p1, (x, y)), side(p1, p2, (x, y)), side(p2, tip, (x, y))
    return (s1 >= 0 and s2 >= 0 and s3 >= 0) or (s1 <= 0 and s2 <= 0 and s3 <= 0)


def arrow_hit(x, y):
    return arrow_dist(x, y) <= ARROW_W / 2 or in_head(x, y)


def spark_amount(x, y):
    core, glow = False, 0.0
    for sx, sy, s in SPARKS:
        dx, dy = abs(x - sx), abs(y - sy)
        if dx > s * 2.5 or dy > s * 2.5:
            continue
        if math.sqrt(dx) + math.sqrt(dy) < math.sqrt(s):
            core = True
        glow = max(glow, math.exp(-math.hypot(dx, dy) / (s * 0.5)) * 0.45)
    return core, glow


def color_at(x, y):
    c = mix(BG_TOP, BG_BOTTOM, (x * 0.35 + y * 0.9) / 1.1)
    # 床の影（メダルの山の下）
    sh = ((x - COIN_CX) / (COIN_RX * 1.25)) ** 2 + ((y - (COIN_BASE + COIN_T + 0.03)) / (COIN_RY * 1.1)) ** 2
    if sh < 1:
        c = mix(c, SHADOW, 0.45 * (1 - sh))
    coin = coin_color(x, y)
    if coin is not None:
        c = coin
    # 矢印：少し右下にずらした影 → 白い本体
    if arrow_hit(x - 0.012, y - 0.014):
        c = mix(c, SHADOW, 0.55)
    if arrow_hit(x, y):
        c = WHITE
    core, glow = spark_amount(x, y)
    if core:
        c = [255, 250, 225]
    elif glow:
        c = [min(255, c[k] + SPARK[k] * glow) for k in range(3)]
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
                    for k in range(3):
                        acc[k] += c[k]
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
