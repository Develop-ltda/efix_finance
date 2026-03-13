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
| `components.css` | tab-panel, spinner, @keyframes | protocol, card/app, app/wallet, listings, team |
| `lang-selector.css` | Language selector (.lang-sel/btn/menu/opt) with CSS var theming | index, app, app/wallet |
| `footer.css` | Inter footer | listings, team |

### JS Reference — Shared Utilities (`shared/js/`)

**`ga4.js`** — Google Analytics 4 bootstrap. Loaded by all pages.

**`config.js`** — Global `EFIX_CONFIG` object with backend URLs, Alchemy RPC endpoints, and contract addresses.

**`formatters.js`** — Locale-aware formatting (pt-BR):
- `shortAddr(addr)` → `"0x04082b...6441"` (first 6 + last 4 chars)
- `fmtDate(d)` → `"dd/mm, HH:mm"` (short, no year)
- `fmtDateTime(d)` → `"dd/mm/yyyy HH:mm"` (full date + time)
- `fmtNum(n)` → `"1.234"` (integer, pt-BR thousands separator)

**`rpc.js`** — Low-level EVM JSON-RPC helpers:
- `padAddr(addr)` → zero-pads address to 64 hex chars (for ABI encoding)
- `balOf(addr)` → returns `0x70a08231` + padded address (ERC-20 `balanceOf` calldata)
- `rpc(url, to, data)` → `eth_call`, returns raw hex result
- `rpcBigInt(url, to, data)` → wraps `rpc()`, returns `BigInt`
- `hexToNum(hex, decimals?)` → converts hex string to number with decimal scaling (default 18)
- `ethBal(url, addr)` → `eth_getBalance`, returns native balance as `Number` (in ETH/POL units)

**`ui.js`** — Shared DOM utilities (no business logic):
- `toast(msg, ms?)` → shows `#toast` element for `ms` ms (default 3000). Supports both `display` and `classList.show` CSS patterns
- `showScreen(id)` → hides all `.screen` elements, activates one by id
- `showError(id, msg, ms?)` → shows error element by id, auto-hides after `ms` ms (default 5000)
- `setLoading(btnId, loading)` → replaces button text with spinner + "Aguarde...", disables it. Pass `false` to restore
- `copyText(text, opts?)` → copies to clipboard. `opts.toastMsg`: show toast. `opts.feedbackEl`: element id to flash "Copiado!"
- `switchTab(name, clickedBtn, opts?)` → generic tab switcher. Defaults: tabs=`.tab`, panels=`.tab-panel`, prefix=`panel-`. Overridable via `opts.tabSelector`, `opts.panelSelector`, `opts.panelPrefix`, `opts.onSwitch`

### JS Reference — Business Logic Modules

Pure JS modules with no DOM references. Each exposes a namespace object. Functions receive dependencies as parameters and return data/Promises. HTML files keep only thin glue (event listeners + DOM updates).

**`protocol/protocol.js`** — `ProtocolLogic` (consumed by `protocol/index.html`)
- Constants: `SELIC`, `MBR`, `PF`, `LLTV`, `scenarios[]`, `stressTests[]`, `polyContracts[]`, `baseContracts[]`, `services[]`
- `calcAPY(ltv, cdi?)` → net APY % after performance fee, with leverage from LTV
- `calcHF(ltv, shock?)` → health factor given LTV and BRL shock %
- `riskInfo(hf)` → `{t, c}` — risk label ("SAFE"/"WARNING"/"LIQUIDATION") + badge CSS class
- `fetchLive(backendUrl, adminKey)` → GET `/health` + `/api/status`, returns `{tvlBrl, tvlUsd, supply, rate, uptimeH, uptimeM, block}`
- `buildAPYData()` → array of scenario objects with computed APY, HF, leverage, annual return
- `buildStressRow(stressTest)` → array of 6 LTV columns with APY, HF, risk, action per stress scenario
- `buildMatrixData()` → 5×7 matrix of HF values (LTV × BRL shock) for heatmap
- `runTerminalCmd(cmd, backendUrl, adminKey)` → simulates terminal output for `health`/`status`/`morpho` commands

**`range-monitor.js`** — `RangeLogic` (consumed by `range-monitor.html`)
- `s2p(sqrtPX96)` → converts Uniswap V3 sqrtPriceX96 to human price (adjusted for 12-decimal diff)
- `t2p(tick)` → converts tick to price
- `gbm(price, vol, days, zScore)` → GBM confidence bounds `{lo, hi, pv, eff}`
- `fpt(vol, boundRatio)` → First Passage Time in days (expected time to hit bound)
- `isFullRange(tickL, tickU)` → true if position covers ±800k ticks
- `getProvider(rpcs[])` → tries RPCs in order, returns first working `ethers.JsonRpcProvider`
- `fetchPositionData(provider, config)` → reads Uniswap NFT position + pool slot0, returns `{cp, tL, tU, tick, ir, bn, full}`
- `scanChainHolders(provider, contract, label)` → scans Transfer events to compute holder set with positive balances
- `calcMetrics(posData, vol, days, zScore)` → full analysis: optimal range, utilization, efficiency, DTE, rebalance estimates

**`app/wallet/admin/index.html`** — self-contained admin panel (no external logic module)
- Redesigned with Outfit/JetBrains Mono fonts, dark institutional theme
- Auth: Google Sign-In (`/api/admin/auth/google`) + legacy X-Admin-Key
- Uses shared: `EFIX_CONFIG`, `shortAddr`, `fmtDate`, `rpcBigInt`, `balOf`, `padAddr`, `ethBal`, `toast`, `switchTab`
- Inline: `hdr()` (dual Bearer/X-Admin-Key), `loadStats/Deposits/Withdrawals/Collateral/Protocol/Morpho/BridgeBalances/BridgeHistory`
- LZ monitoring: Postgres-backed tx hash storage, batch LZ API polling, browser notifications, chain scan fallback

**`app/app.js`** — `AppLogic` (consumed by `app/index.html`)
- Constants: `CONTRACTS` (vault, token, pixBridge, lendingPool, oracle), `POLYGON_CHAIN_ID`, `VAULT_ABI`, `TOKEN_ABI`
- `init(efixPolygonAddr)` → sets token contract address
- `connectWallet(ethereum)` → MetaMask connect, switch to Polygon, returns `{provider, signer, address, contracts}`
- `switchToPolygon(ethereum)` → `wallet_switchEthereumChain` / `wallet_addEthereumChain`
- `fetchPosition(vaultContract, address)` → reads vault position + health factor, returns formatted object with HF class/percent, APY tier
- `createPixQR(backend, amount, address)` → POST `/api/pix/qrcode` with 3 retries, returns `{emv, imageUrl, amount}`
- `checkDepositStatus(backend, address)` → GET `/api/deposit/status/{address}`
- `checkPreviousDeposit(backend, address)` → returns existing e2eId or null
- `applyLeverage(contracts, address, loops)` → approve token if needed + `vault.applyLeverage(loops)`
- `removeLeverage(contracts)` → `vault.deleverage(1)`
- `withdrawFunds(contracts, amount, pixKey)` → `vault.withdraw(amountWei, pixKey)`

**`card/card-app.js`** — `CardAppLogic` (consumed by `card/app.html`)
- `apiCall(proxyUrl, path, opts, isDemo)` → fetch wrapper with demo mode header (`X-Bridge-Mode: sandbox`)
- `loginUser(proxyUrl, email, isDemo)` → GET `/users/lookup`
- `registerUser(proxyUrl, data, isDemo)` → POST `/users/register`
- `fetchOnboardingStatus(proxyUrl, customerId, isDemo)` → GET Bridge customer, returns `{tosOk, kycOk, kycPending, tosLink, kycLink}`
- `requestTosLink(proxyUrl, customerId, isDemo)` → returns TOS acceptance URL
- `requestKycLink(proxyUrl, customerId, isDemo)` → returns KYC verification URL
- `issueCard(proxyUrl, customerId, isDemo)` → POST `/bridge/customers/{id}/card_accounts`
- `linkCard(proxyUrl, email, cardData, isDemo)` → POST `/users/link-card`
- `refreshUser(proxyUrl, email, isDemo)` → re-fetches user data
- `fetchCardBalance(fundingAddress)` → RPC `balanceOf` for USDC on Base via shared `rpc()` + `EFIX_CONFIG`
- `fetchDemoBalance(proxyUrl, customerId, cardAccountId, isDemo)` → card account balance from Bridge API
- `fetchTransactions(proxyUrl, email, isDemo)` → GET `/users/tx`
- `depositIntent(proxyUrl, email, amount, isDemo)` → POST deposit transaction log
- `simulateTopUp(proxyUrl, customerId, cardAccountId, email, isDemo)` → sandbox balance top-up
- `simulatePurchase(proxyUrl, customerId, cardAccountId, email, isDemo)` → sandbox purchase authorization
- `enableSandboxCards(proxyUrl, isDemo)` → POST `/bridge/cards/enable`
- `fetchCardDetails(proxyUrl, customerId, cardAccountId, isDemo)` → GET card account details
- `calcCredit(efixdiAmount)` → pure: `(amount × 0.199 × 0.75).toFixed(2)` — USDC credit from efixDI collateral

**`app/wallet/wallet.js`** — `WalletLogic` (consumed by `app/wallet/index.html`)
- `calcSpendingPower(collateral, ltv?, fxRate?)` → pure: collateral × LTV(0.50) × fxRate(0.17)
- `createDeposit(backend, amount, address)` → POST `/deposit/qr`, returns PIX QR data
- `confirmPayment(backend, reference)` → POST `/deposit/confirm-paid`
- `checkDepositStatus(backend, reference)` → GET `/deposit/status/{ref}`
- `pollBalanceChange(walletLib, address, currentBalText, maxAttempts?)` → polls `getBalance` every 3s until balance changes or max attempts (20)
- `requestWithdraw(backend, address, amount, pixKey)` → POST `/withdraw/request`
- `lockCollateral(backend, address, amount)` → POST `/deposit/collateralize`
- `fetchHistory(backend, address)` → GET `/wallet/history/{address}`
- `fetchLockedBalance(backend, address)` → GET `/wallet/balance/{address}`, returns locked amount as float
- `getBalance(walletLib, address)` → delegates to `walletLib.getBalance(address)`

### Pages

| Path | Purpose | Font family |
|------|---------|-------------|
| `index.html` | Landing page (bilingual PT/EN) | Syne |
| `app/index.html` | Main user app — deposit, withdraw, card ops via PIX + Alchemy smart wallets | Syne |
| `app/wallet/index.html` | Smart wallet deposit/withdraw/card interface | Syne (dark theme) |
| `app/wallet/admin/index.html` | Protocol operations dashboard (mint, collateral, bridge, LZ monitoring) | Outfit (dark theme) |
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
shared JS (config → formatters → rpc → ui) → page business logic module (.js) → page inline <script> (glue)
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
- Admin pages use Google Sign-In or X-Admin-Key header for access
- `rpc()` returns raw hex string; `rpcBigInt()` wraps it for BigInt consumers
- `toast()` in shared/js/ui.js supports both `display` and `classList.show` CSS patterns
- Live data polling uses `setInterval` (typically 3-second intervals for balances)
- Networks: Polygon (primary), Base (secondary)
- Backend: 3 Railway services via `EFIX_CONFIG` — efixdi-backend, efix-bridge-proxy, efix-securitizadora
