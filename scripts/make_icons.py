"""アプリアイコン（PWA・Android）を assets/icon-source.png から作る。

    pip install pillow
    python scripts/make_icons.py

デザイン：金色のメダルの山（貯メダル＝資産）・右肩上がりの矢印と棒グラフ（収支）・スロット台・分析レポート。
元画像は 1024×1024 の正方形で、背景を端まで塗ったもの（角丸・透過なし）。
主な絵は中央 60% 程度に収める（Android の丸い切り抜き・PWA の maskable 用）。
アイコンを変えるときは assets/icon-source.png を差し替えて実行し、
www/service-worker.js の CACHE の番号を上げる。

作るもの
- www/icons/        icon-192 / icon-512（角丸）・icon-maskable-512・apple-touch-icon・favicon-32
- assets/           icon-only・icon-foreground・icon-background・splash・splash-dark
                    （CI の `npx capacitor-assets generate --android` が各解像度の Android 用画像にする）
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'icon-source.png'
WEB = ROOT / 'www' / 'icons'
ASSETS = ROOT / 'assets'
SPLASH_BG = (0x14, 0x16, 0x1C)


def resized(img, size):
    return img.resize((size, size), Image.LANCZOS)


def rounded(img, size, radius=0.2):
    """角を丸めて外側を透過にする（4 倍で描いてなめらかに）。"""
    big = size * 4
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), round(big * radius), fill=255)
    out = resized(img, size).convert('RGBA')
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def main():
    src = Image.open(SRC).convert('RGB')
    WEB.mkdir(exist_ok=True)
    rounded(src, 192).save(WEB / 'icon-192.png', optimize=True)
    rounded(src, 512).save(WEB / 'icon-512.png', optimize=True)
    resized(src, 512).save(WEB / 'icon-maskable-512.png', optimize=True)
    resized(src, 180).save(WEB / 'apple-touch-icon.png', optimize=True)  # iPhone は自分で角を丸める
    rounded(src, 32, 0.22).save(WEB / 'favicon-32.png', optimize=True)

    ASSETS.mkdir(exist_ok=True)
    full = resized(src, 1024)
    full.save(ASSETS / 'icon-only.png')
    # capacitor-assets は前景に 16.7% の余白を付けて見える範囲に収めるので、全面の絵をそのまま前景にする
    full.save(ASSETS / 'icon-foreground.png')
    # 背景はほとんど見えないが、端が見える端末向けにぼかした絵にしておく
    full.filter(ImageFilter.GaussianBlur(40)).save(ASSETS / 'icon-background.png')
    splash = Image.new('RGBA', (2732, 2732), SPLASH_BG + (255,))
    icon = rounded(src, 600)
    splash.alpha_composite(icon, ((2732 - 600) // 2, (2732 - 600) // 2))
    splash = splash.convert('RGB')
    splash.save(ASSETS / 'splash.png')
    splash.save(ASSETS / 'splash-dark.png')


if __name__ == '__main__':
    main()
