# FIRST · Public Offering — Continuation Doc

> **Read this first** to pick up the FIRST public offering work.
> Page: `efix.finance/firstrio/` · Repo dir: `efix_finance/firstrio/` · Branch: `main`
> Last touched: commit `5c624a96` (2026-04-29) "btr: add /firstrio/ — editorial redesign of FIRST pool with real Fator assets"

---

## 0. Status em uma linha

**Página marketing ✅ live (`https://efix.finance/firstrio/`, 847 linhas, editorial completo). Smart contracts da pool ❌ NÃO deployados. Backend offerings ❌ NÃO conhece FIRST. Onramp form ⚠️ captura email mas sem persistência. Próximo bloco crítico:** deploy `HausBTRShare(FIRST)` na Base + registro em `BTROfferingRegistry` + wire no `efix-offerings-backend` `/v1/offerings`.

---

## 1. Estado por camada

### 1.1. Página marketing (`/firstrio/index.html`)
```
URL live:   https://efix.finance/firstrio/  → HTTP 200 (GitHub Pages)
Stack:      vanilla HTML/CSS/JS · Inter + Syne + Space Mono · dark theme
Tamanho:    847 linhas · 60kb HTML
Assets:     brand/, masterplan/, plants/, renders/ (extraídos do Book Fator)
```

Seções implementadas (13):
1. Hero · "Studio no Humaitá, operado pela Lobie."
2. Specs · Pool specifications
3. Opportunity · "Humaitá, o bairro residencial mais querido do Rio"
4. Building · "19 andares de Humaitá vivendo"
5. Amenities · "Três andares só para viver"
6. Unit-types · "Studio de 36,58 m², pavimento alto"
7. Hood · "Humaitá — entre a Lagoa e Botafogo"
8. Partners · "Tradição + tokenização, lado a lado"
9. Returns · "Como você ganha, fase a fase"
10. Onramp · "Reservar FIRST — três rails de pagamento" (form com email)
11. Contracts · endereços on-chain (FIRST com `0x0000…0000 · TBD`)
12. Risk · "Leia antes de alocar"
13. FAQ + CTA · "Reserve sua fatia do Humaitá"

### 1.2. Pool economics (target, do site)
| Métrica | Valor |
|---|---|
| Ativo subjacente | 1 studio do First Life Friendly · Humaitá · RJ |
| Operador | Lobie |
| Equity total | R$ 680.000 fracionária |
| Preço da cota | R$ 1,00 |
| Cotas totais | 680.000 |
| Asset de dividendos | BRLE |
| TIR-alvo | ~22% a.a. em 10 anos (inclui ganho de capital) |
| Div yield-alvo | ~13% a.a. (faixa 12-14% sensibilidade) |
| Ocupação modelada | 60-75% |
| Diária modelada | R$ 250-380 |
| Fontes | Lobie Botafogo Privilege · estudo Fator Realty (abr/2026) |
| Mercado secundário | global (negociável on-chain) |

### 1.3. Smart contracts on-chain (Base mainnet)

**Infra compartilhada (deployed):**
| Contrato | Endereço | Status |
|---|---|---|
| Lobie-Haus-Btr Safe (2-of-3) | `0xa09d5E0001d1FdD2b59072E96c91aa79ed3e40D6` | ✅ deployed |
| Lobie Unit Registry | `0xd8C32a417B5317D34f783CE4e959850465AD4638` | ✅ deployed + verified |
| BTROfferingRegistry | `0x1287AcaCC52153DE507C46867e66Fdbf02b101Fe` | ✅ deployed + verified |
| BRLE (dividend asset) | `0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6` | ✅ deployed (separate protocol) |

**FIRST-specific (pending):**
| Contrato | Status | Próximo passo |
|---|---|---|
| `HausBTRShare(FIRST)` | ❌ **NOT DEPLOYED** | Deploy via script `deploy-haus-btr-share.js` parametrizado com FIRST metadata |
| `SalRioOracleV1` equivalente (PriceOracle) | ❌ NOT DEPLOYED | Reusar pattern do SALRIO ou deployar `FIRSTRioOracleV1` separado |
| Registry entry em `BTROfferingRegistry` | ❌ não chamado | `registerOffering(FIRST, building=?, units=[NFT ids], spe="First Life Friendly SPE Pool 2")` |
| Operator role grants no Share | ❌ pendente | `grantRole(DISTRIBUTOR_ROLE, Lobie operator)` |

### 1.4. Backend offerings (`efix-offerings-backend`)
```
Path:       C:\Users\ernes\efix-offerings-backend\
URL:        https://efix-offerings-backend-production.up.railway.app
Stack:      Node 22 + TS + Fastify 5 + Drizzle + ethers v6 + Postgres
Status:     🟢 MVP scaffold live, 3 endpoints provando contra SALRIO (Pool #1)
```

Endpoints existentes:
- `GET /v1/offerings` — lista hydrated
- `GET /v1/offerings/:id` — single + chain state
- `GET /v1/holders/:wallet` — balance + dividends across all offerings

**FIRST não está registrado no backend.** Quando `HausBTRShare(FIRST)` for deployado, precisa:
1. Adicionar entry na tabela `offerings` do Postgres (slug `firstrio` ou `first`)
2. Reconfigurar reader pra incluir o address novo
3. Validar que `/v1/offerings/firstrio` retorna estado correto

### 1.5. Onramp form (linha 686)
```html
<input type="email" id="fld-email" placeholder="voce@exemplo.com" required>
```
- Campo está renderizando
- **Sem POST handler wired** — submit hoje provavelmente falha silenciosamente ou tenta mailto:
- Precisa wire pra um endpoint de waitlist/reservation (criar em `efix-offerings-backend` ou usar Resend direto)

---

## 2. Pre-launch checklist (na ordem)

### Fase A — Contratos on-chain (P0)
- [ ] **A1.** Pegar o template do `HausBTRShare` que foi usado pro SALRIO (provavelmente em `efix-offerings-backend/contracts/` ou `efix_finance/contracts/` ou `efixdi-backend/contracts/base/`)
- [ ] **A2.** Parametrizar FIRST metadata:
  - `name`: "FIRST Pool #2"
  - `symbol`: `FIRST`
  - `totalSupply`: 680_000 × 1e18
  - `dividendAsset`: BRLE `0x7D12…82F6`
  - `operator`: Lobie operator address (mesmo do SALRIO? confirmar)
  - `unitNftRegistry`: `0xd8C3…4638`
  - `buildingId`: novo id no registry (SALRIO foi `21`, FIRST será o próximo)
  - `unitIds[]`: NFT IDs do(s) studio(s) específico(s) — precisa mintar primeiro no Lobie Unit Registry se ainda não existir
- [ ] **A3.** Deploy script em Hardhat: `scripts/deploy-haus-btr-share-first.js`
- [ ] **A4.** Verify no Basescan
- [ ] **A5.** `BTROfferingRegistry.registerOffering(shareAddress, buildingId, unitIds, speName)` com Safe 2-of-3 sign
- [ ] **A6.** Grants de roles no Safe: `DISTRIBUTOR_ROLE` pra Lobie operator
- [ ] **A7.** PriceOracle pra FIRST (reusar SALRIO oracle ou deployar `FIRSTRioOracleV1` se cashflow model difere)

### Fase B — Backend integration (P0, paralelo com A)
- [ ] **B1.** Migrar tabela `offerings` no Postgres pra incluir slug `firstrio`/`first`, address (TBD em A4), metadata fixa
- [ ] **B2.** Smoke `/v1/offerings/firstrio` → deve retornar 200 com state on-chain (após A4)
- [ ] **B3.** Smoke `/v1/holders/<wallet com 0 FIRST>` → deve incluir FIRST com balance 0
- [ ] **B4.** Adicionar FIRST no array de offerings que o wallet `Cotas BTR` tab consome (já existe pra SALRIO/HFBPOC/LATITUDE)

### Fase C — Onramp ativo (P1)
- [ ] **C1.** Criar endpoint `POST /v1/reservations` no `efix-offerings-backend` aceitando `{email, intentAmount?, rail?}` (rails: PIX/USDC/USD)
- [ ] **C2.** Persistir em tabela `reservations` (email, ts, ip, ua, intent)
- [ ] **C3.** Wire o form de `/firstrio/` pra fazer POST + UX de sucesso ("Você está na lista")
- [ ] **C4.** Email confirmação via Resend (template básico) com próximos passos
- [ ] **C5.** Admin panel: ver lista de reservas (já existe? confirmar em offerings backend admin routes)

### Fase D — Compliance/legal (P0 antes de aceitar dinheiro)
- [ ] **D1.** SPE registrada (memorial de incorporação existe — `~/Downloads/FIRST - Memorial de Incorporação 2023-09-27 REV.06 PDFA.pdf`). Confirmar CNPJ ativo
- [ ] **D2.** Disclosure document final (termo de adesão equity tokenizada)
- [ ] **D3.** Risk warnings + investor accreditation flow (se aplicável CVM 88)
- [ ] **D4.** KYB/KYC pipeline confirmar (já temos pra outros pools — reusar)
- [ ] **D5.** Tabela de venda real (Fator Realty) anexada como prova de valor base — `~/Downloads/FIRST - Tabela de venda 2026-04 (20-80) - Aptos - Promocional 70 anos.pdf`

### Fase E — Launch (P2 depois de A→D)
- [ ] **E1.** Trocar `0x0000…0000 · TBD` na seção contracts pelo address real
- [ ] **E2.** Smoke completo: pessoa abre `/firstrio/`, reserva email, recebe confirmação, depois invest flow funciona end-to-end (allocation → KYC → settlement → mint)
- [ ] **E3.** Anúncio público (LinkedIn, X, mailing list)
- [ ] **E4.** Atualizar `efix.finance/` hub (Live Pools section) — incluir FIRST no carrossel ou listagem
- [ ] **E5.** Monitoramento: dashboard `/ops/POSITIONS` deve incluir FIRST holders

---

## 2.5. 📅 Reunião Fator Realty — quinta 2026-06-18 · 17:00-18:00 BRT

- **Participantes:** Ernesto (organizer, EFIX) · Tiago Miranda — tiago.miranda@fatorrealty.com.br
- **Local:** híbrido (presencial Office + Google Meet `meet.google.com/faq-oybo-dvj`)
- **Phone:** (BR) +55 41 4560-9795 · PIN 249 311 773#
- **Status:** confirmada, **NÃO flexível**

**Significado pro projeto:** Fator Realty é a fonte de todo material técnico do FIRST hoje na CONTINUE.md (Book de Plantas, Tabela de Venda, estudo de viabilidade abr/2026). Essa call é a deadline natural para fechar as 5 Open Questions §3 antes que o time deles abra com mais material/decisões.

### Agenda sugerida (levar como pauta)

1. **Unidade específica (Q1).** Qual studio exatamente entra no pool de R$ 680k? Pedir matrícula, número da unidade, andar, área. Sem isso não tem `unitIds[]` pro registro on-chain.
2. **Building registration (Q4).** Quem assina o `registerBuilding(...)` no Lobie Unit Registry pelo lado Fator? Matrícula 5.356 do 3º RGI/RJ está no Memorial. Decidir se é Ernesto via Safe ou se Fator precisa entrar como signer.
3. **Tabela Fator promo 70 anos.** Confirmar que pricing R$ 690k-1,43M na tabela de venda é o pricing FIRME (não promocional temporário). Se for promo, ajustar a ANCHOR no site (linha 649) e revisitar a valuation de R$ 680k da pool.
4. **Memorial 2023 — atualizações?** Já houve alguma revisão pós Memorial REV.06 (set/2023)? Se sim, pegar versão atualizada antes de marketing público.
5. **Operação Lobie como única.** Fator está confortável com Lobie como operador único? Algum fallback contratual previsto?
6. **Timeline launch FIRST.** Alinhar com Fator quando eles esperam abrir as outras 158 unidades retail (para evitar conflito com pool tokenizada).
7. **Compliance.** Confirmar que SPE está com CNPJ ativo + KYB pronto pra receber dividendos via BRLE on-chain (Fator pode precisar wallet própria).

### Pré-reunião (entregar antes ou no início)

- Página live `https://efix.finance/firstrio/` (já está)
- One-pager economics resumido (pool size, TIR, yield, fonte) — extrair da seção §1.2 desta doc
- Diagrama do fluxo on-chain: SPE → Safe 2-of-3 → HausBTRShare(FIRST) → holders. **TODO: gerar** (mermaid simples já basta)

### Pós-reunião (atualizar nesta doc)

- Marcar Open Questions resolvidas
- Atualizar Pre-launch checklist com decisões tomadas
- Se algum item virou bloqueio, criar tabela de "pendências Fator" com prazo

---

## 3. Open questions (precisam resposta antes de deployar)

1. **Quantos studios entram nessa pool?** O site diz "1 studio do First Life Friendly" mas Memorial tem 159 unidades. Confirmar qual unidade específica (provavelmente a do estudo Fator Realty abr/2026). Sem isso, não tem `unitIds[]` pro registro.

2. **Lobie operator address já existe?** O Safe Lobie-Haus-Btr deployed é `0xa09d…40D6`. Mas o operator EOA que vai chamar `depositDividend()` mensalmente — é o mesmo do SALRIO ou novo? Confirmar com o time Lobie.

3. **PriceOracle: reusar ou novo?** SALRIO usa `SalRioOracleV1` com cashflow model próprio. FIRST tem dinâmica similar (renda de aluguel mensal) — provavelmente template idêntico mas com parâmetros próprios. Decidir: deployar `FIRSTOracleV1` ou parametrizar dinamicamente o existente.

4. **Building ID no Lobie Unit Registry.** SALRIO usa building=21. FIRST precisa ser registrado primeiro como prédio (`registerBuilding(...)`) com matricula 5.356 do 3º RGI/RJ. Quem assina essa tx?

5. **Reservation endpoint: novo serviço ou no backend existente?** Mais barato: adicionar `POST /v1/reservations` no `efix-offerings-backend` (já tem Postgres, já tem auth admin). Alternativa: Resend Audiences. Recomendo opção 1.

---

## 4. Quick start (próxima sessão)

```powershell
# 1. Localizar template do HausBTRShare (SALRIO foi o primeiro)
cd C:\Users\ernes\efix-offerings-backend
git log --oneline --all -- contracts/ | head -10
# OU
cd C:\Users\ernes\efixdi-backend
find . -name "HausBTRShare*.sol" 2>$null

# 2. Confirmar Lobie Unit Registry tem o studio FIRST registrado
$REGISTRY = "0xd8C32a417B5317D34f783CE4e959850465AD4638"
# Hit Basescan ou via ethers script — function getUnits(buildingId)

# 3. Pegar SALRIO deploy script como template
ls C:\Users\ernes\efixdi-backend\scripts\ | grep -i salrio
ls C:\Users\ernes\efixdi-backend\deployment-*.json | grep -i salrio

# 4. Olhar a memória do projeto pro contexto SALRIO
cat ~\.claude\projects\C--Users-ernes--claude\memory\project_haus_btr.md
```

---

## 5. Arquivos importantes

### Repos
- **efix_finance** (frontend GitHub Pages): `C:\Users\ernes\efix_finance\firstrio\` · branch `main` · sobe automático no commit
- **efix-offerings-backend** (Railway): `C:\Users\ernes\efix-offerings-backend\` · Drizzle migrations + Fastify routes
- **efixdi-backend** (Railway): tem `BTROfferingRegistry` + share contracts em `contracts/`
- **haus-btr-protocol** / **haus-btr-equity-protocol**: repos dos templates de contrato

### Docs canônicos
- `~/Downloads/FIRST_PAGE_VISUAL_BRIEF.md` — brief original da página (já implementado em `/firstrio/`)
- `~/Downloads/FIRST - Memorial de Incorporação 2023-09-27 REV.06 PDFA.pdf` — legal (159 unidades, frações ideais, matrícula)
- `~/Downloads/FIRST - Tabela de venda 2026-04 (20-80) - Aptos - Promocional 70 anos.pdf` — preços retail (R$ 690k–1,43M) ancorando o R$ 680k da pool
- `~/Downloads/BTR_Tokenization_Fluxo_Caixa_Pools - versao reduizda - only FIRST.xlsx` — modelo financeiro (TIR/yield/sensibilidade)
- `~/Downloads/Book Vip_First_DIGITAL.pdf` — VIP book com renders

### Memória relevante
- `project_haus_btr.md` — SALRIO Pool #1 live state (template do FIRST)
- `project_haus_btr_equity.md` — pure-equity BTR + governance lock
- `project_haus_btr_fireblocks_poc.md` — HFBPOC Pool #2 paralelo (modelo de 3 papéis)
- `project_efix_offerings_backend.md` — backend que vai servir FIRST

---

## 6. Decisões já tomadas (não revisitar sem motivo forte)

- ✅ Editorial design da página (não mexer no copy/layout)
- ✅ BRLE como dividend asset (não USDC) — alinhamento com SALRIO + on-chain BR
- ✅ Pool size R$ 680.000 (Fator Realty study)
- ✅ Operator Lobie (não TBD)
- ✅ Base mainnet (não Polygon/L1)
- ✅ Tradução não é necessária no MVP (página apenas em PT)
- ✅ Safe 2-of-3 Lobie-Haus-Btr já existe e é o owner do share

---

## 7. Next session entry point

**Comece por A1-A4** (deploy `HausBTRShare(FIRST)`):
1. Copia o deploy script do SALRIO como base
2. Substitui metadata pra FIRST
3. Resolve as Open Questions #1 e #4 (unit IDs + building registration) — provavelmente uma call rápida com time Lobie
4. Hardhat deploy → verify → registra em BTROfferingRegistry via Safe
5. Smoke `/v1/offerings/firstrio` no backend
6. Volta aqui e atualiza esta doc com address + status

Quando A→D completarem, **E1 (trocar address na página)** é literalmente um find-and-replace + commit pro firstrio/index.html.

---

## 8. Risks/gotchas conhecidos

- **Memorial é de 2023.** Confirmar se houve revisão posterior antes de marketing público.
- **Tabela Fator é promo 70 anos.** Pricing pode estar com desconto — usar como prova ANCHOR de valor de mercado, não como base de cálculo pro pool (pool já tem valuation independente).
- **Lobie como operator único.** Single point of failure operacional (não único como contraparte — Safe é 2-of-3). Documentar fallback.
- **GitHub Pages cache.** Mudança na página leva 30-90s pra propagar via CDN. Hard refresh + verificar `Last-Modified` header.
- **CVM 88 limits.** Verificar se valor por investidor + estratégia distribuição se encaixa nas regras vigentes.

---

**Última atualização:** 2026-05-22 · sessão fechada. Atualize esta doc no fim da próxima sessão.
