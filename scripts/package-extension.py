"""Build a reproducible MV3 ZIP using only allowlisted release files."""
from pathlib import Path
import hashlib
import json
import zipfile
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
extension = root / 'extension'
for size in (16, 32, 48, 128):
    image = Image.new('RGBA', (size * 4, size * 4))
    draw = ImageDraw.Draw(image)
    s = size * 4
    draw.rounded_rectangle((0, 0, s-1, s-1), radius=s//4, fill='#146344')
    draw.ellipse((s*.23, s*.23, s*.77, s*.77), outline='white', width=max(2, s//10))
    draw.ellipse((s*.62, s*.14, s*.84, s*.36), fill='#b9ef93')
    image.resize((size, size), Image.Resampling.LANCZOS).save(extension / f'icon{size}.png')
files = ['manifest.json', 'background.js', 'content.js', 'popup.js', 'popup.html', 'popup.css', 'README.md']
files += [f'icon{s}.png' for s in (16, 32, 48, 128)]
output = root / 'public' / 'once-extension.zip'
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (extension / name).read_bytes())
print(json.dumps({'version': json.loads((extension/'manifest.json').read_text())['version'], 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
