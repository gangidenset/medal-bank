"""Android アプリ（APK）用のアイコン・スプラッシュの元画像を assets/ に作る。

    python scripts/make_android_assets.py   （Pillow が必要）

www/icons の PWA アイコンから作る。CI ではこの元画像から
`npx capacitor-assets generate --android` で各解像度の画像を作る。
- icon-only.png        … Android 7 以前の通常アイコン
- icon-foreground.png  … Android 8 以降のアダプティブアイコンの前景
                          （capacitor-assets が 16.7% の余白を付けて見える範囲に収めるので、maskable をそのまま使う）
- icon-background.png  … 同・背景（アイコンと同じ藍色のグラデーション）
- splash.png / splash-dark.png … 起動画面
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'www' / 'icons'
OUT = ROOT / 'assets'
BG_TOP = (0x5B, 0x4F, 0xE0)
BG_BOTTOM = (0x24, 0x18, 0x7A)
SPLASH_BG = (0x14, 0x16, 0x1C)


def gradient(size):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)) + (255,)
        for x in range(size):
            px[x, y] = c
    return img


def centered(src, canvas, scale, bg=(0, 0, 0, 0)):
    out = Image.new('RGBA', (canvas, canvas), bg)
    s = round(canvas * scale)
    out.alpha_composite(src.resize((s, s), Image.LANCZOS), ((canvas - s) // 2, (canvas - s) // 2))
    return out


def main():
    OUT.mkdir(exist_ok=True)
    maskable = Image.open(ICONS / 'icon-maskable-512.png').convert('RGBA')
    rounded = Image.open(ICONS / 'icon-512.png').convert('RGBA')
    maskable.resize((1024, 1024), Image.LANCZOS).save(OUT / 'icon-only.png')
    maskable.resize((1024, 1024), Image.LANCZOS).save(OUT / 'icon-foreground.png')
    gradient(1024).save(OUT / 'icon-background.png')
    splash = centered(rounded, 2732, 0.22, SPLASH_BG + (255,)).convert('RGB')
    splash.save(OUT / 'splash.png')
    splash.save(OUT / 'splash-dark.png')


if __name__ == '__main__':
    main()
