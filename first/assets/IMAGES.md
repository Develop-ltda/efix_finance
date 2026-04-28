# first/assets/

Placeholder note: this folder is reserved for First Life Friendly visual assets
(building render, hood photo, Fator Realty logo, etc.).

Currently the page uses **inline SVG geometric placeholders** drawn directly in
`first/index.html`:

- Hood hero (Cristo + Sugarloaf + buildings silhouette) — `.hood-hero` block
- Building render (19-floor tower with highlighted FIRST studio) — `.bldg-img`
- Brand logo monogram — CSS gradient block in `.hc-logo`
- Architect avatar — CSS gradient circle in `.bldg-arch-img`

When Fator Realty supplies real assets, drop them here as PNGs and replace the
inline SVGs with `background-image:url('/first/assets/...')` references, mirroring
how `salrio/assets/` is consumed by `salrio/index.html`.

Recommended filenames (matching SALRIO conventions):
- `building-render.png` — official First Life Friendly render
- `hood-humaita.png` — Humaitá / Cristo / Lagoa skyline shot
- `feu-arch.png` — FEU Arquitetura signature avatar
- `first-logo.png` — First Life Friendly brand mark
- `partners/` — institutional partner SVGs (already shared from /salrio/assets/partners/ if desired)
