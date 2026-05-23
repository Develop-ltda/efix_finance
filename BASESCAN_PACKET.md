# BaseScan Token Info — Submission Packet

> Open this side-by-side with the BaseScan tab. Three tokens, three forms, copy-paste from the blocks below.

## Prerequisites

- **Deployer wallet must be connected** to BaseScan via "Sign In" → wallet (MetaMask/Rabby). The form will not let you submit otherwise.
- The deployer wallet is the address that called the constructor of the contract — confirm against `0x...` you used at deploy.
- Logo files are already live at `https://efix.finance/tokens/*.png`. Download them locally if BaseScan requires file upload (it does):
  ```powershell
  cd C:\Users\ernes\Downloads
  Invoke-WebRequest https://efix.finance/tokens/brle.png        -OutFile brle.png
  Invoke-WebRequest https://efix.finance/tokens/sbrle.png       -OutFile sbrle.png
  Invoke-WebRequest https://efix.finance/tokens/efixdi-plus.png -OutFile efixdi-plus.png
  ```

## Shared fields (same for all 3)

| Field            | Value                                                |
|------------------|------------------------------------------------------|
| Project Website  | `https://efix.finance`                               |
| Project Email    | `contato@efix.finance`                               |
| Whitepaper       | `https://efix.finance/efixDI_Whitepaper_v1.pdf`     |
| Twitter / X      | `https://x.com/efix_finance`                        |
| Github           | `https://github.com/Develop-ltda`                    |
| Telegram         | *(leave blank — no channel yet)*                     |
| Discord          | *(leave blank — no server yet)*                      |
| Reddit           | *(leave blank)*                                       |

## Common description prefix (paste at the top of every Description field)

```
EFIX is a Brazilian, CVM-licensed (Resolution 88/2022, Ato Declaratório 23.635/2025) protocol tokenizing regulated yield-bearing assets and bringing them on-chain for composability with DeFi liquidity. Smart contracts audited by OpenZeppelin (March 2026, 15/15 findings resolved). Monthly attestation by Harris & Trotter. Built on Base.
```

---

## 1. BRLE — Brazilian Real Electronic

**Form URL:** https://basescan.org/token/0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6#tokenInfo

| Field            | Value                                                |
|------------------|------------------------------------------------------|
| Logo file        | `brle.png` (downloaded above) — 256×256, 6.8 KB     |
| Token Name       | *(read-only, from contract: "BRLE")*                |
| Token Symbol     | *(read-only: "BRLE")*                                |

**Description** (copy block below, paste into Description field):

```
EFIX is a Brazilian, CVM-licensed (Resolution 88/2022, Ato Declaratório 23.635/2025) protocol tokenizing regulated yield-bearing assets and bringing them on-chain for composability with DeFi liquidity. Smart contracts audited by OpenZeppelin (March 2026, 15/15 findings resolved). Monthly attestation by Harris & Trotter. Built on Base.

BRLE is a Brazilian Real (BRL) pegged stablecoin issued by EFIX. Backed 1:1 by Brazilian Reais held in segregated custody at regulated institutions, redeemable on-chain via the EFIX PSM (Peg Stability Module). BRLE serves as the unit of account for EFIX's RWA market — including the efixDI+ Morpho Blue collateral pair — and as on/off-ramp settlement currency between fiat BRL and DeFi liquidity.
```

---

## 2. sBRLE — Staked BRLE

**Form URL:** https://basescan.org/token/0xC65069694e32ef72CD94649BC5174DF9D18475D0#tokenInfo

| Field            | Value                                                |
|------------------|------------------------------------------------------|
| Logo file        | `sbrle.png` — 256×256, 6.5 KB                       |
| Token Name       | *(read-only: "Staked BRLE")*                         |
| Token Symbol     | *(read-only: "sBRLE")*                               |

**Description:**

```
EFIX is a Brazilian, CVM-licensed (Resolution 88/2022, Ato Declaratório 23.635/2025) protocol tokenizing regulated yield-bearing assets and bringing them on-chain for composability with DeFi liquidity. Smart contracts audited by OpenZeppelin (March 2026, 15/15 findings resolved). Monthly attestation by Harris & Trotter. Built on Base.

sBRLE is the ERC-4626 yield vault for BRLE. Depositors stake BRLE and receive sBRLE shares that accrue yield from underlying BRL-denominated investments — primarily Brazilian DI (interbank deposit) money-market exposures held in regulated custody. sBRLE is fully composable on-chain: usable as DeFi collateral, in lending markets, and as the staking primitive for the EFIX protocol.
```

---

## 3. efixDI+ — efixDI Plus (on-chain symbol: efixDI)

**Form URL:** https://basescan.org/token/0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608#tokenInfo

| Field            | Value                                                |
|------------------|------------------------------------------------------|
| Logo file        | `efixdi-plus.png` — 256×256, 6.5 KB                 |
| Token Name       | *(read-only: "efixDI+ Base")*                        |
| Token Symbol     | *(read-only: "efixDI")*                              |

**Note:** the on-chain symbol is `efixDI` (no `+`). The `+` is brand-side only ("efixDI Plus"). Don't try to "correct" the symbol in the form — BaseScan reads it from the contract and any mismatch will trigger validator rejection.

**Description:**

```
EFIX is a Brazilian, CVM-licensed (Resolution 88/2022, Ato Declaratório 23.635/2025) protocol tokenizing regulated yield-bearing assets and bringing them on-chain for composability with DeFi liquidity. Smart contracts audited by OpenZeppelin (March 2026, 15/15 findings resolved). Monthly attestation by Harris & Trotter. Built on Base.

efixDI+ tokenizes shares of regulated Brazilian DI (interbank deposit) money-market funds, exposing the Brazilian CDI yield curve (currently ~14.4% APY) as on-chain collateral. Each token represents a pro-rata claim on fund shares custodied by licensed Brazilian fund administrators, with NAV updated on-chain via an oracle backed by daily fund pricing. Live as Morpho Blue collateral on Base — efixDI+ / USDC market — enabling permissionless borrowing against Brazilian sovereign-grade yield.

Live Morpho market: https://app.morpho.org/base/market/0x31d65cadef8eb085dd3bead61b987b3f86a7ac7d3e1f4763f6d4ec6a477d345a
DefiLlama: https://defillama.com/protocol/efixdi
```

---

## After submitting

Each token's update takes ~24–72h for BaseScan review. Status surfaces on the token's BaseScan page under the "Profile Summary" tab when approved. If they email back asking for proof of contract ownership beyond the wallet signature, reply from `contato@efix.finance` with the deployer address and a link to the constructor tx on basescan.

---

*Generated 2026-05-23 — packet stays in sync with `tokenlist.json`. If you change descriptions here, also update `tokenlist.json` to keep tooling consistent.*
