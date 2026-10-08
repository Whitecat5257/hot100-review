"""Render quote artwork, never modifying or redistributing the font software."""
import io
import json
from pathlib import Path
import sys
import zipfile

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
quotes = json.load(sys.stdin)
source = Path(sys.argv[1])
if zipfile.is_zipfile(source):
    with zipfile.ZipFile(source) as archive:
        font_bytes = archive.read(next(name for name in archive.namelist() if name.lower().endswith((".ttf", ".otf"))))
else:
    font_bytes = source.read_bytes()
font = ImageFont.truetype(io.BytesIO(font_bytes), 84)
coverage = TTFont(io.BytesIO(font_bytes)).getBestCmap()
missing = sorted({c for quote in quotes for c in quote["text"] if ord(c) not in coverage})
if missing:
    raise ValueError(f"Missing quote glyphs: {missing}")
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
punctuation = set("，。；：！？、")


def wrap(text, limit):
    lines = []
    while len(text) > limit:
        boundary = limit
        candidates = [i + 1 for i, c in enumerate(text[:limit]) if c in punctuation and i >= limit // 2]
        if candidates:
            boundary = candidates[-1]
        elif text[limit] in punctuation:
            boundary -= 1
        lines.append(text[:boundary])
        text = text[boundary:]
    lines.append(text)
    return lines


for index, quote in enumerate(quotes, 1):
    for mode, columns in (("desktop", 22), ("mobile", 14)):
        lines = wrap(quote["text"], columns)
        image = Image.new("RGBA", (columns * 84 + 24, len(lines) * 126), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        for row, line in enumerate(lines):
            draw.text((12, row * 126 + 2), line, font=font, fill=(25, 25, 23, 255))
        image.save(out / f"{index:03d}-{mode}.png", optimize=True)
print(f"Rendered {len(quotes)} quotes in desktop/mobile layouts at 3x density.")
