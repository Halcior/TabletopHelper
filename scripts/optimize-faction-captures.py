"""Convert Playwright PNG evidence to pixel-identical lossless WebP (requires Pillow)."""
from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parents[1] / 'docs/faction-visuals/screenshots'
for source in sorted(folder.glob('*.png')):
    target = source.with_suffix('.webp')
    with Image.open(source) as image:
        image.save(target, 'WEBP', lossless=True, method=6)
    with Image.open(source) as original, Image.open(target) as encoded:
        if original.convert('RGBA').tobytes() != encoded.convert('RGBA').tobytes():
            raise RuntimeError(f'Pixel comparison failed for {source.name}')
    source.unlink()
print(f'{len(list(folder.glob("*.webp")))} lossless screenshots ready')
