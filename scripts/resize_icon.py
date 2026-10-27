from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
TARGET_SIZE = (1000, 1000)
ICON_PATHS = (ROOT / "assets" / "icon.png", ROOT / "icon.png")


def resize_icon(path: Path) -> None:
    with Image.open(path) as image:
        resized = image.convert("RGBA").resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        resized.save(path, format="PNG", optimize=True)


if __name__ == "__main__":
    for icon_path in ICON_PATHS:
        resize_icon(icon_path)
        print(f"Resized {icon_path.relative_to(ROOT)} to 1000x1000")
