# LATITUDE Pool #3 — Term Sheet

> **Version 1.0 · 2026-05-06 · Draft for review**
> Not a public offering document. Use this internally for partner conversations
> and as the source-of-truth feeding the `/latitude/` landing page + the
> efix-offerings-backend.

---

## 1. Issuer & Structure

| | |
|---|---|
| **Issuer** | EFIX Plataforma de Tokenização e Crowdfunding Ltda (Token Haus) · CNPJ 60.756.859/0001-57 |
| **Pool name** | Latitude Pool #3 |
| **Symbol** | LATITUDE |
| **Framework** | Hybrid · Reg S Category 3 |
| **Variant** | hybrid (CDI-proxy during construction → operational rent post-habite-se) |
| **Jurisdiction** | Brazil (issuer) + Reg S Category 3 (offshore offering) |
| **Network** | Base mainnet · chainId 8453 |
| **Dividend asset** | BRLE (`0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6`) |

## 2. The Asset

| | |
|---|---|
| **Building** | Praça Pio X, 89 · Centro · Rio de Janeiro |
| **Developer** | Fator Realty (founded 1956) |
| **Operator** | Lobie · 88 anos · +750 unidades STR · 85% ocupação média |
| **Construction state** | Habite-se forecast Aug 2026 (in progress) |
| **Total building footprint** | 12 pavimentos · 61 unidades · 2.893,74 m² útil · 3.419,68 m² privativa |
| **Mix** | 43 residenciais + 16 salas comerciais + 2 lojas térreas |
| **Pool backing** | 6 studios — entire 3º pavimento (Apartamentos 301-306) |
| **Backing details** | 228,17 m² útil · 257,48 m² privativa total · ~38 m² útil / ~43 m² privativa per unit |
| **Building share** | 9,8% (6 of 61 total units) · 12,5% of residential floor count |
| **Audit trail** | Memorial Descritivo Fator Realty + RRT/CAU certified + NBR 12.721/2006 |

## 3. Token economics

| | |
|---|---|
| **Total supply** | 4,050,000 LATITUDE (immutable on mint) |
| **Par price** | R$ 1.00 per cota |
| **NAV at launch** | R$ 4,050,000 |
| **Implied price per studio** | ~R$ 675,000 (6 × R$ 675k = R$ 4.05M) |
| **Implied price per m²** | ~R$ 15,690 (R$ 4.05M / 257.48 m² privativa) — at low end for Centro RJ premium STR |
| **Standard** | ERC-20 with Batog 2018 Scalable Reward Distribution (same as SALRIO) |

## 4. Cashflow projection (per studio · monthly · Lumière baseline scaled to 38m²)

Lumière marketing study (Studio 23 m² · Praça Pio X 89 reference) shows
**1,33% / month dividend yield** (~17%/year) on R$ 286,000 unit value.
Scaled to LATITUDE's 38 m² studios at R$ 675k:

| Line | Per studio (38 m²) | Per pool (6 studios) | Annual (pool) |
|---|---:|---:|---:|
| Diária média | R$ 380 | — | — |
| Tx ocupação | 85% | — | — |
| Receita bruta | R$ 9,690 | R$ 58,140 | R$ 697,680 |
| OTA fees (16,5%) | R$ 1,599 | R$ 9,593 | R$ 115,117 |
| Receita líquida | R$ 8,091 | R$ 48,547 | R$ 582,563 |
| Despesas (condomínio + energia + IPTU) | R$ 1,220 | R$ 7,320 | R$ 87,840 |
| Receita após despesas | R$ 6,871 | R$ 41,227 | R$ 494,723 |
| Taxa Lobie (12%) | R$ 824 | R$ 4,947 | R$ 59,367 |
| **Resultado líquido** | **R$ 6,047** | **R$ 36,280** | **R$ 435,356** |

**Operational yield on R$ 4.05M pool: ~10,75% a.a.** (post-habite-se, fully ramped).
Capital appreciation target: +25-37% over the planta-to-habite-se period
(historical avg for Fator Centro RJ developments).
**Combined TIR target: ~22% a.a. over 10 years.**

## 5. Lifecycle

```
Phase 0  Pre-habite-se (today → Aug 2026)
         · construction yield: CDI-proxy ~14,4% a.a. on subscribed capital
         · distribution phase tag: ConstructionProxy

Phase 1  Habite-se (Aug 2026)
         · 6 Lobie Unit NFTs minted, one per studio (token IDs derived
           via LobieUnitRegistry.deriveTokenId(emp_id, codigo_unidade))
         · transferred to the LATITUDE SPE wallet
         · distribution phase tag: RampUp (mixed CDI proxy + actual rent)

Phase 2  Operational (Sep 2026 → ongoing)
         · Lobie operates the 6 studios as a single building/floor pool
         · monthly depositDividend with phase=Operational
         · target ~10,75% a.a. operational yield + capital appreciation

Phase 3  Secondary liquidity (Q4 2026)
         · Uniswap V3 LATITUDE/BRLE 0.3% pool seeded
         · Morpho Blue Latitude/USDC market created (50% LLTV)
```

## 6. On-chain contracts (TBD on deploy)

To be deployed using the same audited framework as SALRIO Pool #1:

| Contract | Source | Address | Notes |
|---|---|---|---|
| `LatitudeShare` (HausBTRShare instance) | `haus-btr-protocol/contracts/HausBTRShare.sol` | TBD | ERC-20, 4.05M supply, Batog SRD, Reg S legend in name |
| `LatitudeOracleV1` | `haus-btr-protocol/contracts/SalRioOracleV1.sol` (parameterized) | TBD | Par × Chainlink BRL/USD, 1e24 scale (Morpho compatible) |
| `BTROfferingRegistry` (shared) | already deployed | `0x1287AcaCC52153DE507C46867e66Fdbf02b101Fe` | New entry per `addOffering(symbol, contract, oracle, terms)` |
| `LATITUDE/USDC` Morpho market | Morpho Blue factory | TBD | LLTV 62.5% (matching SALRIO) |
| `LATITUDE/BRLE` Uniswap V3 pool | UniV3 factory | TBD | 0.3% fee tier |

## 7. Distribution rails (post-launch)

Three deposit rails to the SPE wallet:

| Rail | Operator | Settlement | Limit |
|---|---|---|---|
| PIX (BRL) | HausBank · iHold | D+0 → BRLE mint via PSM | Unlimited |
| BRLE direct (Base) | EFIX PSM | Instant | Per allocation cap |
| USD/EUR (international) | Bridge.xyz | D+1-3 → USDC → BRLE swap | KYC tier dependent |

## 8. Compliance

- Reg S Category 3 — **no US persons in primary issuance** (off-chain restriction; on-chain transfers permissionless)
- CVM Act 23.635/2025 — issuer is licensed crowdfunding platform
- LGPD — backend never selects PII columns from Lobie MySQL operational data; only operational/financial fields aggregated through DEFINER-secured views

## 9. Risks (non-exhaustive)

- **Construction delay**: Fator Realty's track record on Centro RJ projects has been strong (FIRST + Botafogo Privilege both delivered on time), but the Aug 2026 habite-se is contingent on standard regulatory + construction milestones.
- **Operational risk**: Lobie's STR economics depend on Centro tourism flows, which are recovering but below Zona Sul benchmarks.
- **Smart contract risk**: same audited framework as SALRIO (one year live, no incidents), but LATITUDE will be a fresh deployment.
- **Regulatory risk**: CVM 88 / Reg S framework is stable; future rules could affect secondary trading.
- **Concentration risk**: a single floor = 6 cashflows partially correlated through shared building amenities and operational footprint. Mitigated by 6 independent studios but not eliminated.

## 10. Open items (Phase 5 dependencies — see PROTOCOLO_BTR_E_PHASE5.md)

- [ ] Deploy `LatitudeShare` + `LatitudeOracleV1` on Base mainnet
- [ ] Register on PortfolioLens + DividendRouter via Safe Tx Builder
- [ ] Update efix-portfolio-lens admin
- [ ] Seed Uniswap V3 LP at par
- [ ] Create Morpho Blue market + initial supply
- [ ] Backend `OFFERINGS_STATIC` flipped active on first non-zero contract address
- [ ] Frontend `latitude/` landing live (this commit) + connect "Reserve allocation" to backend
- [ ] CVM 88 disclosure pack uploaded to GCS + linked from footer
