"""Extract key pages from Book de Plantas as JPG/PNG for /firstrio/."""
import fitz, os, sys

src = r"C:\Users\ernes\Downloads\Book de Plantas-Colunas-Vendidas (1).pdf"
out = r"C:\Users\ernes\efix_finance\firstrio\assets"

doc = fitz.open(src)
print(f"PDF total pages: {doc.page_count}")

# Map: page_index_0based -> (subdir, filename, dpi, fmt)
pages = [
    (0,  "brand",      "first-logo",         220, "png"),
    (1,  "renders",    "hero-skyline",       300, "jpg"),
    (2,  "masterplan", "full",               220, "png"),
    (4,  "plants",     "section-low-floors", 220, "png"),
    (15, "plants",     "section-high-floors",220, "png"),
    (24, "plants",     "studio-08",          280, "jpg"),
    (25, "plants",     "studio-09",          280, "jpg"),
    (26, "plants",     "studio-10",          280, "jpg"),
    (27, "plants",     "studio-11",          280, "png"),
    (28, "plants",     "studio-12",          220, "png"),
    (30, "renders",    "facade-night",       300, "jpg"),
    (32, "brand",      "identity",           220, "png"),
]

for idx, sub, name, dpi, fmt in pages:
    if idx >= doc.page_count:
        print(f"SKIP page {idx+1} (only {doc.page_count} pages)")
        continue
    page = doc[idx]
    mat = fitz.Matrix(dpi/72, dpi/72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    target = os.path.join(out, sub, f"{name}.{fmt}")
    if fmt == "jpg":
        pix.save(target, jpg_quality=82)
    else:
        pix.save(target)
    print(f"OK p{idx+1} -> {sub}/{name}.{fmt}  ({pix.width}x{pix.height}, {os.path.getsize(target)//1024}KB)")

doc.close()
print("done.")
