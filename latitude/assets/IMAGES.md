# latitude/assets/

Visual assets for the LATITUDE Pool #3 offering page (Praça Pio X 89).

## Required renders

Drop the following files in `latitude/assets/renders/` for the page to swap
inline stylized fallbacks for the real images:

| Filename | Used by | What it shows |
|---|---|---|
| `renders/facade.jpg` | hero, og:image | Building façade (Praça Pio X 89 frontal view) |
| `renders/amenity-gym.jpg` | `#amenities` card 1 | Academia with cardio + musculação + city view (1980×1080 recommended) |
| `renders/amenity-gourmet.jpg` | `#amenities` card 2 | Espaço gourmet / bistrô / grill area |
| `renders/amenity-lobby.jpg` | `#amenities` card 3 | Lobby concierge with reception desk |
| `renders/hood-praca.jpg` | `#neighborhood` (optional override) | Praça Pio X with Igreja da Candelária |
| `renders/floor-plan-301-306.jpg` | optional `#areas` overlay | Floor plan of 3º pavimento with units 301-306 marked |

The interior renders (gym, gourmet, lobby) provided by Fator Realty's marketing
team — same set used in the official launch material. Photo / digital render
quality is acceptable.

## Until renders are dropped

The page renders with inline SVG geometric placeholders and CSS gradients —
nothing breaks. The `#amenities` section uses `background-image` URLs that
404 gracefully (the gradient fallback shows through).

## Building / project documents (reference, not embedded in page)

These PDFs from the Fator Realty incorporation memorial live in
`C:\Users\ernes\Downloads\`:

- `Quadro_de_Areas_PioX89.pdf` — area schedule for all 61 units across 12 floors (the source for the `#areas` section table)
- `PIO X-89_PROJETO_01_R01.pdf` — site plan
- `PIO X-89_PROJETO_03_R01.pdf` — typical floor plan
- `PIO X-89_PROJETO_04_R01.pdf` — elevations / sections

When ready to publicize the underwriting docs, upload them to
`latitude/docs/` and link from the page footer.
