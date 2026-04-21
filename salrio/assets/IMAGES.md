# SALRIO image assets

Drop the following images into this folder (`efix_finance/salrio/assets/`) with these exact filenames. The page already references them — once they're in place, the sections come to life. Until then, each section gracefully falls back to a colored gradient so nothing looks broken.

## Required

| Filename | What it shows | Used in | Suggested size |
|---|---|---|---|
| `sal-logo.png` | White SAL logo on cyan background | Hero card (next to "SALRIO" title) | 200×200 px, PNG w/ transparency optional |
| `pedra-do-sal.jpg` | Pedra do Sal street scene (the one with graffiti stairs + carioca woman) | Poetry splash background | 1600×900 px, landscape |
| `hood-porto.jpg` | Wide Porto Maravilha aerial (Museu do Amanhã, RioStar roda gigante, waterfront) | Neighborhood hero banner | 1600×600 px, landscape |
| `building-render.jpg` | Sal Rio Residences building render (the one with blue SAL logo next to it) | The Building section (left column) | 800×1000 px, portrait |
| `cite-arch.jpg` | CITÉ architects portrait (Catie Regis + Fernando Cirelli) | The Building → architect credit | 200×200 px, square |

## Optional / nice-to-have

| Filename | What it shows | Used in | Suggested size |
|---|---|---|---|
| `lobie-decor-1.jpg` | Lobie-decorated studio interior | Expected returns section accent | 1200×800 px |
| `museu-amanha.jpg` | Museu do Amanhã close-up | Neighborhood accent | 1200×800 px |
| `rio-star.jpg` | RioStar roda gigante | Neighborhood accent | 1200×800 px |

## Institutional partner logos

Drop these into `efix_finance/salrio/assets/partners/` — referenced in the "Backed by institutional-grade infrastructure" strip. Each one has a text fallback so the section looks clean even without the logos.

| Filename | Download from |
|---|---|
| `openzeppelin.svg` | https://www.openzeppelin.com/brand-assets (use the "mark" or horizontal logo) |
| `fireblocks.svg` | https://www.fireblocks.com/brand-guidelines/ |
| `bridge.svg` | Bridge.xyz press kit — export their wordmark as SVG |
| `coingecko.svg` | https://www.coingecko.com/en/branding |
| `coinmarketcap.svg` | https://coinmarketcap.com/brand-assets/ |
| `defillama.svg` | https://defillama.com — their llama mark (or export from their GitHub assets) |

**Format**: prefer monochrome SVG wordmarks. The CSS applies grayscale + 0.75 opacity at rest, then removes the filter on hover (so black or darker logos look best). If SVG isn't available, use PNG at 2× density (360 px wide).

**Sizing**: CSS caps logos at 36 px tall, max 140 px wide. Make sure the source has a bit of padding so nothing gets cropped.

## Source material

All images should be pulled from the Lobie-provided Sal Rio material in your Downloads folder:
- `[Notion Publish] Apresentação Completa - Rentabilidade Sal.pdf`
- `book_sal_21x28_compressed.pdf` (the 10-page book — rich renders + Porto Maravilha photography)

## Naming rules

- All lowercase, hyphen-separated.
- JPG for photos, PNG for logos with transparency.
- Max 500 KB each — compress with TinyPNG or similar before committing.
