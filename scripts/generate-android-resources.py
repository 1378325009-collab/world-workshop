from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parent.parent
RESOURCE_ROOT = PROJECT_ROOT / "android" / "app" / "src" / "main" / "res"
ICON_PATH = PROJECT_ROOT / "assets" / "pwa" / "icon-512.png"
BACKGROUND = "#17211c"
ADAPTIVE_FOREGROUND_SCALE = 0.76
DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
FOREGROUND_DENSITIES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def load_icon(size):
    with Image.open(ICON_PATH) as source:
        return source.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def make_foreground(size):
    artwork_size = max(1, round(size * ADAPTIVE_FOREGROUND_SCALE))
    artwork = load_icon(artwork_size)
    mark = Image.new("RGBA", (size, size), BACKGROUND)
    mark.alpha_composite(artwork, ((size - artwork_size) // 2, (size - artwork_size) // 2))
    return mark


def make_icon(size, round_icon=False):
    base = load_icon(size)
    if round_icon:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        base.putalpha(mask)
    return base


def make_splash(width, height):
    canvas = Image.new("RGBA", (width, height), BACKGROUND)
    artwork_size = max(1, round(min(width, height) * 0.68))
    artwork = make_foreground(artwork_size)
    canvas.alpha_composite(artwork, ((width - artwork_size) // 2, (height - artwork_size) // 2))
    return canvas


def main():
    for density, size in DENSITIES.items():
        folder = RESOURCE_ROOT / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        load_icon(size).save(folder / "ic_launcher.png")
        make_icon(size, round_icon=True).save(folder / "ic_launcher_round.png")
        make_foreground(FOREGROUND_DENSITIES[density]).save(folder / "ic_launcher_foreground.png")

    for splash_path in RESOURCE_ROOT.rglob("splash.png"):
        with Image.open(splash_path) as source:
            splash = make_splash(*source.size)
        splash.save(splash_path)


if __name__ == "__main__":
    main()
