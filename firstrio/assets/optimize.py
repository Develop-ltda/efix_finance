"""Resize extracted images to web-friendly sizes (max 1600px wide, 82 q)."""
import os, glob
from PIL import Image

base = r"C:\Users\ernes\efix_finance\firstrio\assets"

# (subdir, max_width, quality, format)
specs = [
    ("renders",    1600, 80, "jpg"),
    ("masterplan", 1600, None, "png"),
    ("plants",     1200, 80, None),  # mixed jpg/png
    ("brand",      800,  None, "png"),
]

for sub, maxw, q, fmt in specs:
    for path in glob.glob(os.path.join(base, sub, "*")):
        if path.endswith(".py"):
            continue
        try:
            im = Image.open(path)
            w, h = im.size
            if w > maxw:
                ratio = maxw / w
                im = im.resize((maxw, int(h*ratio)), Image.LANCZOS)
            ext = os.path.splitext(path)[1].lower()
            if ext == ".jpg" or ext == ".jpeg":
                im = im.convert("RGB")
                im.save(path, "JPEG", quality=q or 80, optimize=True, progressive=True)
            else:
                im.save(path, "PNG", optimize=True)
            print(f"  {sub}/{os.path.basename(path)}  {im.size[0]}x{im.size[1]}  {os.path.getsize(path)//1024}KB")
        except Exception as e:
            print(f"  FAIL {path}: {e}")

# Total
total = 0
for path in glob.glob(os.path.join(base, "**", "*.*"), recursive=True):
    if any(path.endswith(e) for e in [".jpg", ".jpeg", ".png"]):
        total += os.path.getsize(path)
print(f"\nTotal images: {total/1024/1024:.2f} MB")
