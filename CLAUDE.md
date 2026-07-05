# efixDI+ Protocol

## Project
Tokenizes Brazilian DI fund shares (CDI ~14.9% APY) as ERC-20 tokens on Polygon, bridges to Base via LayerZero V2, used as collateral on Morpho Blue to borrow USDC at ~5%. D+0 redemption at NAV eliminates liquidation risk — this is the core moat.

CVM-regulated (Act 23.635/2025, Resolution 88/2022). Entity: EFIX Plataforma de Tokenização e Crowdfunding Ltda (CNPJ 60.756.859/0001-57).

## Commands
```bash
npx hardhat compile                        # Compile contracts (dual: 0.8.20 + 0.8.22)
npx hardhat test                           # Run contract tests
node test-api-local.js                     # Test iHold banking API
node test-efixdi-protocol.js --mode=full   # Full protocol test suite
git add . && git commit -m "msg" && git push  # Deploy (Railway auto-deploys backend, GH Pages frontend)
```

## Architecture
```
PIX deposit → iHold/HausBank confirms → Backend mints efixDI to operator pool
  → depositFor() into EfixCollateralVault V2 (Polygon)
  → bridgeCollateral() via LayerZero V2 OFT (Polygon → Base)
  → Supply to Morpho Blue as collateral → Borrow USDC
  → Bridge.xyz → EFIX Card (Visa)
```
Mode A: Admin-managed leverage only. User wallets and vault positions are independent.

## Repos
| Repo | Deploy | URL |
|------|--------|-----|
| `Develop-ltda/efix_finance` | GitHub Pages | `efix.finance` |
| `Develop-ltda/efixdi-backend` | Railway | `efixdi-backend-production.up.railway.app` |
| `Develop-ltda/efix-bridge-proxy` | Railway | `efix-bridge-proxy-production.up.railway.app` |

## Key Contracts

### Polygon (137)
- **EfixDIToken**: `0x04082b283818D9d0dd9Ee8742892eEe5CC396441` — ⚠️ IMMUTABLE, no proxy
- **CollateralVault V2**: `0xdE8286f7E369aA4cbD7F3de324f7D715165ADE6B`
- **OFTAdapter (LZ V2)**: `0x603265754fDdd7FdE459CC6e6722bd526C1258Fc`
- **PIXBridge**: `0x1d97f1adbf545F3C99d33A6a2166Ee423A78f4C3`
- **BRTH**: `0x38fd02Dc840F099772392f2DFe3A3BEE9Aab3AB7`
- Chainlink BRL/USD: `0xB90DA3ff54C3ED09115abf6FbA0Ff4645586af2c`

### Base (8453)
- **EfixDITokenBase**: `0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608`
- **MinterBurner**: `0x400a8DE2bF8fc4A63000A7E77103eDAE897CB9a3`
- **Oracle V1** (Morpho): `0xF4e20dE61370F0061E7CfAdA1e758fB8238C19c5` — use `1e24` scaling
- **Oracle V2** (keeper): `0xFC6a6Af4B7F398F70103F2f4b76E81afefc6Ea86`
- **Morpho Vault V2**: `0xf4A3FaDcEf350B2F168F97Cdbaa2221FF29ACBd5`
- Morpho Blue: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`
- Market ID: `0x31d65cadef8eb085dd3bead61b987b3f86a7ac7d3e1f4763f6d4ec6a477d345a`

## Conventions
- **Language**: Node.js, ethers v6, Solidity 0.8.20/0.8.22
- **Dev env**: Windows 11, PowerShell
- **Compiler**: Dual solc (0.8.20 + 0.8.22), evmVersion: london, viaIR: true, optimizer 200 runs
- **OZ**: 5.4.0 | **Etherscan**: V2 API, single apiKey string
- **Design**: Syne + Space Mono, `#22c55e` green, `#0a0a0a` bg, dark theme, 8-lang i18n
- **Git**: Single `main` branch, auto-deploy on push

## Watch Out For
- **EfixDIToken is immutable** — no proxy, no upgrade. All fixes via companion contracts
- **TVL = Polygon totalSupply** — 1 efixDI = R$1.00. Never use `vault.totalValueLocked()`. Never double-count Base supply
- **Oracle scaling**: Morpho uses V1 with `1e24`, NOT `1e36`
- **Operator key `0x9eFc...` exposure** — vault governance migrated to Gnosis Safe 2/3 `0x9040b4E9...EeD4` on 2026-05-14 (owner+curator+sentinel). The exposed key remains a Safe signer (1 of 3) but cannot act alone. Allocator rotation pending — submitted 2026-05-14 ~21:15Z, executable 2026-05-15 ~21:30Z. Never use `0x9eFc...` for direct curator/owner calls; sign through the Safe
- **efix.finance is a SPA** — all sections in one HTML file

## Reference Files
Detailed docs in `.claude/rules/`:
- `contracts.md` — Full ABIs + code patterns
- `backend-api.md` — API routes + env vars
- `tasks.md` — Sprint board + priorities
- `context.md` — Corporate, team, integrations, institutional relationships
