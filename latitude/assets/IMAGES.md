# latitude/assets/

Placeholder note: this folder is reserved for Latitude visual assets when the
building launches in August 2026. Until then, the page uses **inline SVG
geometric placeholders** drawn directly in `latitude/index.html`:

- Hood hero (Theatro Municipal silhouette + Centro skyline) — `.hood-hero` block
- Building schematic (8 floors × 6 studios per floor, with floor 4 highlighted as
  the LATITUDE-tokenized floor) — `.bldg-img`
- Brand logo monogram — CSS gradient block in `.hc-logo`
- Architect avatar — CSS gradient circle in `.bldg-arch-img`

When Fator Realty supplies real Latitude assets (likely Aug/2026 at building
launch), drop them here as PNGs and replace the inline SVGs with
`background-image:url('/latitude/assets/...')` references, mirroring how
`salrio/assets/` is consumed by `salrio/index.html`.

Recommended filenames (matching SALRIO conventions):
- `building-render.png` — official Latitude render
- `hood-centro.png` — Centro Rio skyline (Theatro Municipal, Cinelândia)
- `arch-avatar.png` — architect signature avatar
- `latitude-logo.png` — Latitude brand mark
- `partners/` — institutional partner SVGs (already shared from /salrio/assets/partners/ if desired)
