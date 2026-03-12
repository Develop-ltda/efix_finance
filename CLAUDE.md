# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EFIX Finance is a CVM-regulated RWA (Real-World Assets) DeFi protocol that bridges Brazilian DI fixed-income assets into DeFi via the **efixDI+** token. The site is hosted on GitHub Pages at efix.finance.

## Development

**No build system.** This is a static HTML/JavaScript site with no package.json, bundler, or framework tooling. Changes are made directly to HTML files and deployed by pushing to `main` (GitHub Pages auto-deploys from root).

- Dependencies loaded via CDN: ethers.js v6.13.4, Chart.js 4.4.1, React 18.3.1 (in `/op` only)
- `.nojekyll` disables Jekyll processing on GitHub Pages
- Absolute paths (`/shared/...`) used for imports — works because of custom domain

## Architecture

### Shared Resources (`shared/`)

Common code extracted from page-specific inline CSS/JS into reusable files:

**CSS** (`shared/css/`):
| File | Purpose | Consumed by |
|------|---------|-------------|
| `reset.css` | Universal box-sizing reset | All 14 pages |
| `vars-syne.css` | CSS variables for Syne-family pages | index, app, protocol, card/* |
| `vars-inter.css` | CSS variables for Inter-family pages | listings, team |
| `nav-syne.css` | Syne nav bar | index, app, protocol, card/index |
| `nav-inter.css` | Inter nav bar | listings, team |
| `components.css` | tab-panel, spinner, @keyframes | protocol, card/app, listings, team |
| `footer.css` | Inter footer | listings, team |

**JS** (`shared/js/`):
| File | Purpose | Consumed by |
|------|---------|-------------|
| `ga4.js` | Google Analytics 4 init | All 14 pages |
| `config.js` | Backend URLs, RPCs, contract addresses | app/*, card/*, protocol, range-monitor, tdic |
| `formatters.js` | `shortAddr()`, `fmtDate()`, `fmtNum()` | app/wallet/admin, protocol |
| `rpc.js` | `rpc()`, `rpcBigInt()`, `balOf()`, `ethBal()` | app/wallet/admin, card/admin |
| `ui.js` | `toast()` (display-based) | app/wallet/admin |

### Pages

| Path | Purpose | Font family |
|------|---------|-------------|
| `index.html` | Landing page (bilingual PT/EN) | Syne |
| `app/index.html` | Main user app — deposit, withdraw, card ops via PIX + Alchemy smart wallets | Syne |
| `app/wallet/index.html` | Smart wallet deposit/withdraw/card interface | Syne (dark theme) |
| `app/wallet/admin.html` | Protocol operations dashboard (mint, collateral, bridge, monitoring) | Syne (dark theme) |
| `card/index.html` | Visa card product landing | Syne |
| `card/app.html` | Card app — collateralize efixDI, borrow USDC (50% LTV) | Syne |
| `card/admin.html` | Card admin — bridge ops, Morpho position, chain breakdown | Syne |
| `protocol/index.html` | Real-time protocol metrics (TVL, APY, stress tests, chain breakdown) | Syne |
| `range-monitor.html` | Uniswap V3 efixDI/USDC liquidity health monitor (GBM analysis) | Syne (hybrid) |
| `listings/index.html` | DEX listings and chain integration status | Inter |
| `team/index.html` | Team bios, legal entities, partners | Inter |
| `op/index.html` | React-based Gantt chart for CVM public offering pipeline | — (React) |
| `financials/index.html` | DRE income statements, auto-updated from Google Sheets | — (Chart.js) |
| `tdic/index.html` | TDIC certificate generator | — (React createElement) |

### Canonical Import Order

All pages follow this order in `<head>`:
```
GA4 → meta tags → fonts (preconnect + CSS) → shared CSS (reset → vars → nav → components → footer) → page <style> → CDN deps
```
And in `<body>`:
```
shared JS (config → formatters → rpc → ui) → page <script>
```

## Key Integrations

- **Alchemy Account Kit** — smart wallets, gasless UserOps (Polygon)
- **Morpho Blue** — lending protocol for efixDI/USDC market on Base
- **LayerZero V2** — OFT adapter for cross-chain bridging (Polygon ↔ Base)
- **Uniswap V3** — liquidity pools on Polygon
- **Google Sheets + Apps Script** — financials data pipeline

## Smart Contracts

Centralized in `shared/js/config.js` as `EFIX_CONFIG`:
- efixDI (Polygon): `0x04082b283818D9d0dd9Ee8742892eEe5CC396441`
- efixDI (Base): `0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608`
- USDC (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Morpho: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`

## Conventions

- User-facing content is in **Portuguese (PT-BR)**
- Two CSS design families: **Syne** (main pages) and **Inter** (listings, team)
- Syne pages use CSS vars: `--black`, `--white`, `--gray-100`..`--gray-900`, `--green`, `--red`
- Inter pages use CSS vars: `--bg-primary`, `--text-primary`, `--border`, `--accent-blue`, etc.
- Admin pages use password-based access (plaintext comparison)
- `rpc()` returns raw hex string; `rpcBigInt()` wraps it for BigInt consumers
- `toast()` in shared/js/ui.js uses `display:block/none`; card/app.html has its own classList-based toast
- Live data polling uses `setInterval` (typically 3-second intervals for balances)
- Networks: Polygon (primary), Base (secondary)
- Backend: 3 Railway services via `EFIX_CONFIG` — efixdi-backend, efix-bridge-proxy, efix-securitizadora
