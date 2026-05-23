# EFIX Token Listings — Execution RUNBOOK

**Generated:** 2026-05-23 (UTC)
**Branch:** `feat/token-list-canonical` (pushed to `origin`, **PR not opened**)
**Scope:** Logo & metadata visibility across wallets, explorers, and aggregators for the three EFIX production tokens on Base mainnet.

---

## 0. Pre-flight — on-chain verification

All three contracts were probed via `cast` against Alchemy Base mainnet RPC.

| Token   | Address                                      | `name()`         | `symbol()`  | `decimals()` | `totalSupply()`    |
|---------|----------------------------------------------|------------------|-------------|--------------|--------------------|
| BRLE    | `0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6` | "BRLE"           | **"BRLE"**    | 18           | 246.66 BRLE        |
| sBRLE   | `0xC65069694e32ef72CD94649BC5174DF9D18475D0` | "Staked BRLE"    | **"sBRLE"**   | 18           | 0 (no deposits)    |
| efixDI+ | `0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608` | "efixDI+ Base"   | **"efixDI"** | 18           | 1523.02            |

**Important divergence on efixDI+:**
- Branding / marketing: **`efixDI+`**
- On-chain `symbol()`: **`efixDI`** (no `+`)
- Treatment in this RUNBOOK:
  - `tokenlist.json` (our canonical source): `"symbol": "efixDI+"` (canonical brand)
  - TrustWallet `info.json`: `"symbol": "efixDI"` (matches on-chain, per rule)
  - `wallet_watchAsset` call in listings page: passes `"efixDI"` (matches on-chain — wallets will refuse otherwise)

Re-run the pre-flight any time:

```powershell
$RPC = "https://base-mainnet.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf"
$cast = "$env:USERPROFILE\.foundry\bin\cast.exe"
foreach ($addr in @(
  "0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6",
  "0xC65069694e32ef72CD94649BC5174DF9D18475D0",
  "0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608"
)) {
  Write-Host "`n=== $addr ==="
  & $cast call $addr "name()(string)"        --rpc-url $RPC
  & $cast call $addr "symbol()(string)"      --rpc-url $RPC
  & $cast call $addr "decimals()(uint8)"     --rpc-url $RPC
  & $cast call $addr "totalSupply()(uint256)" --rpc-url $RPC
}
```

---

## 1. Status atual

### ✅ Task 1 — Self-hosted token list

**Committed on branch `feat/token-list-canonical`.**

- `tokenlist.json` at repo root → will serve from `https://efix.finance/tokenlist.json`
- 3 tokens (BRLE / sBRLE / efixDI+), chainId 8453, decimals 18
- Schema validates against `@uniswap/token-lists` Ajv schema
- Validator at `scripts/validate-tokenlist.mjs` (run anytime: `cd scripts && node validate-tokenlist.mjs`)
- Logo assets in `tokens/`:
  - `brle.png` (256×256), `brle-512.png` (512×512)
  - `sbrle.png`, `sbrle-512.png`
  - `efixdi-plus.png`, `efixdi-plus-512.png`
- Commit: `578bb62a feat: canonical EFIX token list (Uniswap schema) + logo assets`
- Tag changes from prompt template: `tags.rwa.description` adjusted ("Tokens backed by regulated assets held in custody") — the original had a hyphen in "off-chain" which Uniswap schema's regex `^[ \w\.,:]+$` rejects.

### ✅ Task 2 — `/listings/` page expanded

**Committed on same branch.**

- New "Token Registry" section above existing platform listings
- 3-row table with logos, EIP-55 addresses, BaseScan deep-links, decimals
- "Add to Wallet" buttons → `window.ethereum.request({ method: 'wallet_watchAsset', ... })` (EIP-747)
- "Bulk import" notice with copy-to-clipboard for `https://efix.finance/tokenlist.json`
- Verified rendered output locally (Python static server on `:8000`)
- Commit: `45bbba4f feat(listings): Token Registry section with wallet_watchAsset + tokenlist URL`

### ⚠️ Task 3 — TrustWallet/assets fork: staged, **not forked**

`gh` CLI is not authenticated on this machine (`gh auth status` reported "not logged in"). Without `gh auth`, the fork step couldn't run. All files are prepared in a staging directory ready to drop into a fork.

**Staging location:** `C:\Users\ernes\efix_token_listings_staging\trustwallet-assets\`

**Structure:**

```
trustwallet-assets/
├── PR_BODY_trustwallet.md
└── blockchains/base/assets/
    ├── 0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6/
    │   ├── info.json
    │   └── logo.png  (placeholder 256×256)
    ├── 0xC65069694e32ef72CD94649BC5174DF9D18475D0/
    │   ├── info.json
    │   └── logo.png  (placeholder 256×256)
    └── 0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608/
        ├── info.json
        └── logo.png  (placeholder 256×256)
```

**Tag deviation from prompt template:** TrustWallet's allowed tag set is `[stablecoin, wrapped, synthetics, nft, governance, defi, staking, staking-native, privacy, nsfw, binance-peg, deflationary, memes, gamefi]`. `"rwa"` is not on that list. The staged `info.json` files use:

- BRLE: `["stablecoin"]`
- sBRLE: `["defi", "staking"]`
- efixDI+: `["defi"]`

### ⚠️ Task 4 — MetaMask/contract-metadata: **skipped (deprecated)**

The repo is officially "effectively frozen". The maintainers explicitly recommend **EIP-747 (`wallet_watchAsset`)** as the replacement — which we already implemented in the Task 2 listings page. The current schema also only covers Ethereum mainnet (chainId 1) tokens; our tokens live on Base (8453). No staging done.

If you still want to submit despite the freeze: open https://github.com/MetaMask/contract-metadata and follow their `contract-map.json` legacy format, but note the repo no longer surfaces tokens in current MetaMask versions for non-mainnet chains.

### ✅ Task 5 — This RUNBOOK

You're reading it.

---

## 2. Logos pendentes (HUMAN ACTION)

**All three logos are currently placeholders** (colored circles with the symbol text). They were generated via PowerShell `System.Drawing` because the only existing token logo in the repo was `assets/efixDI-token-32x32.svg` — a 32×32 base64-embedded PNG, too small for any production listing.

| Token   | Path in `efix_finance` repo                              | Required size  | Current state |
|---------|----------------------------------------------------------|----------------|---------------|
| BRLE    | `tokens/brle.png`                                        | 256×256        | placeholder (green circle) |
| BRLE    | `tokens/brle-512.png`                                    | 512×512        | placeholder |
| sBRLE   | `tokens/sbrle.png`                                       | 256×256        | placeholder (blue circle) |
| sBRLE   | `tokens/sbrle-512.png`                                   | 512×512        | placeholder |
| efixDI+ | `tokens/efixdi-plus.png`                                 | 256×256        | placeholder (purple circle) |
| efixDI+ | `tokens/efixdi-plus-512.png`                             | 512×512        | placeholder |

Also need final art at:

- `efix_token_listings_staging/trustwallet-assets/blockchains/base/assets/<CHECKSUMMED_ADDR>/logo.png` (256×256, ≤100KB, PNG with lowercase `.png` extension — uppercase is rejected by TrustWallet validators)

**Replacement workflow:**

```powershell
# Drop final 256×256 art over each placeholder, then re-stage:
$src = "C:\path\to\final\art"
Copy-Item $src\brle-256.png        C:\Users\ernes\efix_finance\tokens\brle.png        -Force
Copy-Item $src\brle-512.png        C:\Users\ernes\efix_finance\tokens\brle-512.png    -Force
Copy-Item $src\sbrle-256.png       C:\Users\ernes\efix_finance\tokens\sbrle.png       -Force
Copy-Item $src\sbrle-512.png       C:\Users\ernes\efix_finance\tokens\sbrle-512.png   -Force
Copy-Item $src\efixdi-256.png      C:\Users\ernes\efix_finance\tokens\efixdi-plus.png        -Force
Copy-Item $src\efixdi-512.png      C:\Users\ernes\efix_finance\tokens\efixdi-plus-512.png    -Force

# Mirror into TrustWallet staging
$tw = "C:\Users\ernes\efix_token_listings_staging\trustwallet-assets\blockchains\base\assets"
Copy-Item C:\Users\ernes\efix_finance\tokens\brle.png        "$tw\0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6\logo.png" -Force
Copy-Item C:\Users\ernes\efix_finance\tokens\sbrle.png       "$tw\0xC65069694e32ef72CD94649BC5174DF9D18475D0\logo.png" -Force
Copy-Item C:\Users\ernes\efix_finance\tokens\efixdi-plus.png "$tw\0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608\logo.png" -Force

cd C:\Users\ernes\efix_finance
git add tokens/
git commit -m "feat(tokens): replace placeholder logos with final art"
git push
```

---

## 3. PRs prontos pra você submeter

### 3a. efix_finance (`feat/token-list-canonical` → `main`)

GitHub Pages serves from `main`, so the merge IS the deploy. PR not opened automatically per your instructions.

**Open the PR yourself when ready:**

```powershell
gh auth login   # one-time, if not already
cd C:\Users\ernes\efix_finance
gh pr create --base main --head feat/token-list-canonical `
  --title "feat: canonical EFIX token list + listings registry" `
  --body  "Adds /tokenlist.json (Uniswap schema, validated), /tokens/*.png placeholders, and a Token Registry section on /listings/ with EIP-747 wallet_watchAsset buttons. Once merged, https://efix.finance/tokenlist.json goes live."
```

Or merge directly without a PR (you control the repo):

```powershell
cd C:\Users\ernes\efix_finance
git checkout main
git merge feat/token-list-canonical
git push
```

### 3b. TrustWallet/assets (fork + branch + PR)

Auth required: run `gh auth login` first if you haven't.

```powershell
# 1. Fork upstream into your account (clones into C:\Users\ernes\assets or asks where)
cd C:\Users\ernes
gh repo fork trustwallet/assets --clone --remote
cd assets
git checkout -b feat/add-efix-tokens-base

# 2. Mirror the staged files into the fork
$stage = "C:\Users\ernes\efix_token_listings_staging\trustwallet-assets"
robocopy "$stage\blockchains" ".\blockchains" /E
# robocopy returns 1 on success-with-changes; ignore exit code

# 3. Commit + push
git add blockchains/base/assets/
git commit -m "Add EFIX RWA tokens on Base: BRLE, sBRLE, efixDI"
git push -u origin feat/add-efix-tokens-base

# 4. Open the PR (body already drafted)
gh pr create --repo trustwallet/assets `
  --base master --head "$(gh api user --jq .login):feat/add-efix-tokens-base" `
  --title "Add EFIX RWA tokens on Base: BRLE, sBRLE, efixDI" `
  --body-file "$stage\PR_BODY_trustwallet.md"
```

### 3c. MetaMask/contract-metadata

Skipped. See §1 / Task 4 above.

---

## 4. Submissions UI-only (you / human only)

I can't drive web UIs or sign wallet txs. These are on you.

### 4a. BaseScan token info (HIGHEST PRIORITY — visible to Steakhouse / Lucian during DD)

For each token, deployer wallet must be connected, then submit:

- **BRLE:** https://basescan.org/token/0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6#tokenInfo
- **sBRLE:** https://basescan.org/token/0xC65069694e32ef72CD94649BC5174DF9D18475D0#tokenInfo
- **efixDI:** https://basescan.org/token/0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608#tokenInfo

Checklist per token:

- [ ] Logo (256×256 PNG, transparent bg preferred)
- [ ] Website: `https://efix.finance`
- [ ] Description (paste boilerplate below + token-specific sentence)
- [ ] Contact email: `contato@efix.finance` (or your preferred)
- [ ] Twitter/X handle (if you have one — confirm canonical handle first)
- [ ] Discord / Telegram (optional)
- [ ] Whitepaper link: `https://efix.finance/efixDI_Whitepaper_v1.pdf`

Boilerplate:

> EFIX is a Brazilian, CVM-licensed (Resolution 88/2022) protocol tokenizing regulated yield-bearing assets and bringing them on-chain for composability with DeFi liquidity. Built on Base.

### 4b. CoinGecko

- BRLE submission status: confirm CL0504260015 (per memory)
- sBRLE: submit if not already → https://coingecko.com/en/coins/new
- efixDI: submit if not already → same URL

### 4c. CoinMarketCap

- All three tokens: https://coinmarketcap.com/request/

### 4d. Base Token List PR (community list)

- Find / open the active community PR (last known: #1300 — verify status: https://github.com/base/web/pulls?q=is%3Apr+token+list)
- Confirm all three EFIX tokens carry `logoURI` pointing to `https://efix.finance/tokens/*.png`
- Or: submit a fresh entry citing our `https://efix.finance/tokenlist.json` as canonical source

---

## 5. Post-deploy validation (after you merge `feat/token-list-canonical`)

```powershell
# 1. Confirm tokenlist.json is live
curl https://efix.finance/tokenlist.json | ConvertFrom-Json | Select-Object -ExpandProperty tokens | Format-Table chainId, symbol, address, decimals -AutoSize
# Should print 3 rows. If 404, GitHub Pages is still building — wait 1-2 min and retry.

# 2. Confirm logo PNGs are live
foreach ($f in @("brle.png","sbrle.png","efixdi-plus.png")) {
  $u = "https://efix.finance/tokens/$f"
  $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing
  Write-Host "$u -> $($r.StatusCode) $($r.Headers.'Content-Type') $($r.Headers.'Content-Length')B"
}

# 3. Confirm Token Registry renders on the live site
Start-Process "https://efix.finance/listings/#token-registry"
```

Quick wallet test (any browser with MetaMask installed):

1. Open https://efix.finance/listings/
2. Scroll to Token Registry
3. Click "Add BRLE" — MetaMask popup should appear with the symbol, decimals, and the placeholder logo
4. Repeat for sBRLE / efixDI+

---

## 6. Próximo passo recomendado

**1st priority: BaseScan token info** for all three contracts. That's the most visible artifact during the Steakhouse / Lucian DD — they will click the BaseScan link for each Morpho market collateral and any token without a logo/description looks unfinished.

**2nd: open the `feat/token-list-canonical` PR / merge to `main`.** Cheap deploy, unlocks `https://efix.finance/tokenlist.json` as a permanent canonical reference you can hand to anyone asking how to add the tokens. The placeholder logos go live too, which is fine — they're already better than the wallet-default blank circle.

**3rd: replace placeholder PNGs with final art**, push to `main`, no further coordination needed.

**4th: TrustWallet PR** (only after final logos exist — TrustWallet reviewers reject placeholder art).

**Defer:** MetaMask/contract-metadata (frozen, see §1); other aggregators (CoinGecko / CMC) — they don't help with DD visibility this week.

---

## 7. Stop conditions that fired during this run

- ⚠️ **`gh` CLI sem auth** — Stopped at Task 3 fork step. Local prep done in staging; you authenticate + run the commands above.
- ⚠️ **Logos PNG não encontrados** — Generated colored placeholders via PowerShell `System.Drawing`. Replacement workflow in §2.
- ⚠️ **MetaMask contract-metadata deprecated** — Skipped Task 4, documented above. EIP-747 alternative already live in Task 2.

No `❌` hard stops. No writes to `main`. No external PRs opened. No on-chain transactions.
