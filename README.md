# EFIX Finance Protocol

**Protocolo DeFi regulado para tokenização de ativos de renda fixa brasileiros (RWA)**

EFIX é uma securitizadora registrada na CVM que conecta fundos DI brasileiros ao ecossistema DeFi através do token **efixDI+**, permitindo alavancagem on-chain via Morpho Blue e gastos via cartão Visa — tudo com custódia não-custodial e autenticação por email.

> **CNPJ**: 60.756.859/0001-57 — Efix Securitizadora S.A.
> **Regulação**: CVM Ato 23.635/2025 | Resolução CVM 88/2022

---

## Sumário

- [Arquitetura Geral](#arquitetura-geral)
- [Stack Tecnológico](#stack-tecnológico)
- [Smart Contracts](#smart-contracts)
- [Autenticação e Smart Wallets](#autenticação-e-smart-wallets)
- [Fluxo de Depósito (PIX → efixDI)](#fluxo-de-depósito-pix--efixdi)
- [Fluxo de Saque (efixDI → PIX)](#fluxo-de-saque-efixdi--pix)
- [Colateral e Lending (Morpho Blue)](#colateral-e-lending-morpho-blue)
- [Bridge Cross-Chain (LayerZero V2)](#bridge-cross-chain-layerzero-v2)
- [Range Monitor (Uniswap V3 + GBM)](#range-monitor-uniswap-v3--gbm)
- [Cartão EFIX (Visa)](#cartão-efix-visa)
- [Protocol Dashboard](#protocol-dashboard)
- [Financeiro (DRE)](#financeiro-dre)
- [Pipeline CVM (Ofertas Públicas)](#pipeline-cvm-ofertas-públicas)
- [API Backend](#api-backend)
- [Painel Administrativo](#painel-administrativo)
- [Infraestrutura e Deploy](#infraestrutura-e-deploy)
- [Segurança](#segurança)

---

## Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        EFIX Finance                             │
│                    (Static HTML/JS Site)                         │
│                    efix.finance (GitHub Pages)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Landing   │  │ App      │  │ Card     │  │ Protocol     │   │
│  │ Page      │  │ (Wallet) │  │ Product  │  │ Dashboard    │   │
│  └──────────┘  └────┬─────┘  └────┬─────┘  └──────────────┘   │
│                      │             │                            │
│                      ▼             ▼                            │
│              ┌───────────────────────────┐                      │
│              │   Alchemy Account Kit     │                      │
│              │   (Smart Wallets + OTP)   │                      │
│              └───────────┬───────────────┘                      │
│                          │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Railway Backend (Node.js)                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ HausBank │ │ Keeper   │ │ Mint     │ │ Withdrawal │  │  │
│  │  │ OAuth2   │ │ Bot      │ │ Service  │ │ Listener   │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│                          ▼                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ Polygon (137)   │  │ Base (8453)     │  │ LayerZero V2  │  │
│  │ efixDI + Vault  │  │ Morpho Blue    │  │ OFT Bridge    │  │
│  │ Uniswap V3     │  │ Oracle V2      │  │ Polygon ↔ Base│  │
│  │ OFT Adapter    │  │ efixDI bridged │  │               │  │
│  └─────────────────┘  └─────────────────┘  └───────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Cada página é um arquivo HTML self-contained (HTML + CSS + JS inline). Não há build system, bundler ou framework tooling — mudanças são feitas diretamente nos arquivos e deployadas via push para `main`.

### Estrutura de Diretórios

```
efix_finance/
├── index.html                  # Landing page (bilíngue PT/EN)
├── app/
│   ├── index.html              # App principal — depósito, saque, cartão
│   └── wallet/
│       ├── efix-wallet-sdk.js  # Alchemy Account Kit SDK wrapper
│       ├── admin.html          # Painel admin de operações
│       └── *.bundle.js         # Bundles do Alchemy SDK
├── card/
│   ├── index.html              # Landing page do cartão
│   ├── app.html                # Aplicação e funding do cartão
│   └── admin.html              # Admin de operações do cartão
├── protocol/
│   └── index.html              # Dashboard de métricas em tempo real
├── range-monitor.html          # Monitor Uniswap V3 (análise GBM)
├── financials/
│   └── index.html              # DRE + integração Google Sheets
├── op/
│   └── index.html              # Gantt chart React (pipeline CVM)
├── listings/
│   └── index.html              # Status de listagens em DEXs
├── team/
│   └── index.html              # Página do time
├── tdic/
│   └── index.html              # Informações TDIC
├── assets/                     # SVGs e ícones
├── CNAME                       # efix.finance
└── .nojekyll                   # Desabilita Jekyll no GitHub Pages
```

---

## Stack Tecnológico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | HTML5/CSS3/JavaScript (vanilla) | — |
| UI Reativa | React + Babel Standalone (apenas `/op`) | 18.3.1 / 7.26.2 |
| Web3 | ethers.js | 6.9.0 |
| Smart Wallets | Alchemy Account Kit | v3 |
| Charts | Chart.js | 4.4.1 |
| Backend | Node.js (Railway) | — |
| Hosting | GitHub Pages | — |
| Analytics | Google Analytics 4 | G-1Y391HW7NT |

### Dependências CDN

Todas as bibliotecas são carregadas via CDN — não há `node_modules` ou `package.json`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.9.0/ethers.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://unpkg.com/babel-standalone@7.26.2/babel.min.js"></script>
```

### Tipografia

- **Syne** — display / headings
- **Space Mono** — monospace / números
- **Inter** — corpo de texto
- **IBM Plex Mono** — dados técnicos
- **Instrument Serif** — acentos decorativos

---

## Smart Contracts

### Polygon (Chain ID: 137)

| Contrato | Endereço | Função |
|----------|---------|--------|
| **efixDI Token** | `0x04082b283818D9d0dd9Ee8742892eEe5CC396441` | ERC-20, 18 decimais |
| **VaultV2** | `0x2eA512b4C5e53A8c1302AC8ba2d43c5DA90b307C` | Custódia de colateral |
| **OFT Adapter (LZ V2)** | `0x603265754fDdd7FdE459CC6e6722bd526C1258Fc` | Bridge Polygon → Base |
| **Operator Wallet** | `0x9eFc11e4d285b5a749faFBC2613836Dcda899e12` | Wallet operacional |
| **Chainlink BRL/USD** | `0xB90DA3ff54C3ED09115abf6FbA0Ff4645586af2c` | Oracle de preço |

### Base (Chain ID: 8453)

| Contrato | Endereço | Função |
|----------|---------|--------|
| **efixDI (Bridged)** | `0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608` | Token bridged via LZ |
| **MinterBurner** | `0x400a8DE2bF8fc4A63000A7E77103eDAE897CB9a3` | Lógica de bridge |
| **Oracle V2 (4h)** | `0xFC6a6Af4B7F398F70103F2f4b76E81afefc6Ea86` | Preço atualizado a cada 4h |
| **Oracle V1** | `0xF4e20ff5a1a3B6251b2c460c6b221a52bED85aA9` | Oracle legado |
| **Morpho Vault V2** | `0xf4A3FaDcEf350B2F168F97Cdbaa2221FF29ACBd5` | Vault de lending |
| **Morpho Blue Core** | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | Protocolo de lending |
| **USDC** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Stablecoin, 6 decimais |

### Morpho Blue Market

- **Market ID**: `0x31d65cadef8eb085dd3bead61b987b3f86a7ac7d3e1f4763f6d4ec6a477d345a`
- **Loan Token**: USDC (Base)
- **Colateral**: efixDI (Base)
- **LLTV (Liquidation LTV)**: 77%
- **IRM**: `0x46415998764C29aB2a25CbeA6254146D50D22687`

---

## Autenticação e Smart Wallets

O protocolo usa **Alchemy Account Kit** para oferecer uma experiência Web2 — sem seed phrases, sem MetaMask.

### Fluxo de Autenticação

```
┌──────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────┐
│  Usuário │───▶│ Email Input  │───▶│ OTP via Email  │───▶│ Smart Wallet │
│          │    │              │    │ (Alchemy)      │    │ Criada       │
└──────────┘    └──────────────┘    └────────────────┘    └──────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │ Sessão      │
                                    │ Persistida  │
                                    │ (localStorage│
                                    └─────────────┘
```

### SDK Functions (`efix-wallet-sdk.js`)

```javascript
EfixWallet.init()                    // Inicializa Alchemy Signer
EfixWallet.loginWithEmail(email)     // Envia OTP
EfixWallet.completeAuth(bundle)      // Verifica OTP bundle
EfixWallet.checkSession()            // Recupera sessão existente
EfixWallet.getClient()               // Retorna smart wallet client (UserOps)
EfixWallet.getAddress()              // Endereço EOA do signer
EfixWallet.getBalance(address)       // Saldo efixDI via eth_call
EfixWallet.disconnect()              // Logout + limpa sessão
```

### Configuração Alchemy

```javascript
const ALCHEMY_API_KEY = "5QrXWREEtmi4gITNoJsJf";
const GAS_POLICY_ID = "7b22b464-38cd-4e6f-bccb-00f1280ac14c";
// Gas sponsorship via policy — usuário não paga gas
```

---

## Fluxo de Depósito (PIX → efixDI)

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Usuário │    │ PIX      │    │ HausBank │    │ Backend  │    │ Polygon  │
│         │    │ (BRL)    │    │ API      │    │ Railway  │    │ Mint     │
└────┬────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │              │              │              │              │
     │──PIX R$100──▶│              │              │              │
     │              │──Notifica───▶│              │              │
     │              │              │──Poll 30s───▶│              │
     │              │              │              │──Match───────▶│
     │              │              │              │  mint efixDI  │
     │◀─────────────efixDI na wallet──────────────│              │
     │              │              │              │              │
```

- **Mínimo**: R$ 20 BRL
- **Backend**: Auto-polling HausBank API a cada 30 segundos
- **Match**: Cruza valor PIX + endToEndId com depósito pendente
- **Mint**: Chama VaultV2 para mintar efixDI 1:1 com BRL

### Endpoint de Depósito Admin

```
POST /api/admin/deposit
{
  "userAddress": "0x...",
  "amount": "1000",
  "pixKey": "admin",
  "endToEndId": "PIX-REF-001"
}
→ { status: "queued", txHash: "0x..." }
```

---

## Fluxo de Saque (efixDI → PIX)

```
POST /api/wallet/withdrawals/process
{
  "id": withdrawal_id
}
→ Envia PIX para conta registrada, status → "completed"
```

O processo de saque é semi-manual: o usuário solicita, o admin aprova e processa o envio PIX.

---

## Colateral e Lending (Morpho Blue)

### Mecânica de Alavancagem

O efixDI é usado como colateral no Morpho Blue (Base) para tomar empréstimos em USDC. Isso permite alavancagem do rendimento CDI.

### Cálculo de APY

```javascript
function calcAPY(ltv) {
  const cdi   = 14.90;    // Taxa base DI (%)
  const mbr   = 0.67;     // Morpho borrow rate (%)
  const pf    = 0.20;     // Performance fee (20%)
  const leverage = 1 / (1 - ltv);
  return (cdi * leverage - mbr * (leverage - 1)) * (1 - pf);
}
```

### Cenários de APY

| Cenário | LTV | Alavancagem | APY Líquido | Anual R$100K | Health Factor | Risco |
|---------|-----|-------------|-------------|--------------|---------------|-------|
| Hold | 0% | 1x | 11.9% | R$ 11.904 | ∞ | SAFE |
| Conservador | 30% | 1.43x | 14.8% | R$ 14.844 | 2.57 | SAFE |
| Moderado | 50% | 2x | 19.2% | R$ 19.171 | 1.54 | SAFE |
| **Target** | **60%** | **2.5x** | **25.4%** | **R$ 25.401** | **1.28** | **WARNING** |
| Agressivo | 70% | 3.33x | 34.1% | R$ 34.078 | 1.10 | AUTO-DELEV |
| Máximo | 75% | 4x | 42.6% | R$ 42.575 | 1.03 | LIQUIDATION |

### Health Factor

```javascript
Health Factor = (collateral_value × LLTV) / debt_value

// Limites operacionais:
HF ≥ 1.50  →  Safe (verde)
HF ≥ 1.15  →  Warning (amarelo)
HF ≥ 1.00  →  Auto-Deleverage (laranja)
HF < 1.00  →  Liquidação (vermelho)
```

### Stress Test Matrix

| Cenário | Choque BRL | CDI | Impacto |
|---------|-----------|-----|---------|
| Normal | 0% | 14.9% | Operação normal |
| BRL −10% | −10% | 15.5% | Margem reduzida |
| BRL −20% | −20% | 16.5% | Alerta de risco |
| BRL −30% | −30% | 18.0% | Deleverage automático |
| BRL −40% Black Swan | −40% | 20.0% | Proteção D+0 ativa |
| BRL +15% Rally | +15% | 13.5% | Ganho extra |

**Proteção**: Resgate D+0 das cotas DI preserva 100% do capital em BRL independente da taxa de câmbio.

---

## Bridge Cross-Chain (LayerZero V2)

### Padrão OFT (Omnichain Fungible Token)

```
Polygon → Base:  Lock (OFT Adapter) → Relay (LayerZero) → Mint (MinterBurner)
Base → Polygon:  Burn (MinterBurner) → Relay (LayerZero) → Release (OFT Adapter)
```

- **Tempo**: 2-5 minutos para confirmação
- **Fee**: Dinâmica por tamanho de mensagem (~$0.02)
- **Verificação**: Full message verification

### API de Histórico

```
GET https://scan.layerzero-api.com/v1/messages/oft
    ?srcAddress=0x603265754fDdd7FdE459CC6e6722bd526C1258Fc
    &limit=10
→ Array de mensagens com status: DELIVERED | INFLIGHT | FAILED
```

### Comando Admin de Bridge

```
POST /api/admin/bridge
{ "amount": "50.0" }
→ { success: true, txHash: "0x...", fee: "$0.02" }
```

---

## Range Monitor (Uniswap V3 + GBM)

Monitoramento de liquidez da posição efixDI/USDC no Uniswap V3 (Polygon) usando análise de Geometric Brownian Motion.

### Parâmetros da Posição

- **NFT ID**: #2847354
- **Pool**: efixDI/USDC (0.01% fee tier)
- **Preço spot**: ~0.199 USDC/efixDI
- **Volatilidade anualizada**: 10.5%
- **Nível de confiança**: 95% (z-score = 1.96)
- **Horizonte de rebalanceamento**: 30 dias

### Fórmulas GBM

```javascript
// Volatilidade do período
Period_Vol = σ × √(T/365)    // 3.01% para 30 dias

// Range de preço (intervalo de confiança 95%)
P_lower = P × exp(-z × σ × √(T/365))    // ~0.14 USDC
P_upper = P × exp(+z × σ × √(T/365))    // ~0.45 USDC

// Eficiência de capital
Capital_Efficiency = √P / (√P_upper - √P_lower)    // ~2.8x vs full-range

// Tempo esperado até rebalanceamento (First Passage Time)
E[τ] ≈ (barrier_distance / σ_daily)²    // ~15-30 dias
```

### Alertas de Rebalanceamento

| Utilização | Cor | Ação |
|-----------|-----|------|
| < 75% | Verde | Saudável |
| 75-90% | Amarelo | Monitorar |
| > 90% | Laranja | Preparar nova posição |
| Fora do range | Vermelho | Rebalancear imediatamente |

---

## Cartão EFIX (Visa)

### Infraestrutura

- **Provider**: Bridge (parceiro Stripe)
- **Funding**: USDC on Base
- **Tipo**: Virtual Visa (+ plástico disponível)
- **Região**: Brasil

### Pipeline de Emissão

```
Login → Registro → Aceite TOS → KYC (Persona) → Emissão do Cartão
  ↓         ↓           ↓            ↓               ↓
Bridge   Bridge       Bridge      Bridge          Bridge Card
Customer  Created      TOS        KYC             Account
                    Approved    Approved           Issued
```

### Mecânica de Funding

```
1. Deposita efixDI → Colateraliza no Morpho (75% LTV)
2. Toma empréstimo USDC → ~$150 crédito por 1000 efixDI
3. Envia USDC para Base → Endereço de funding do cartão
4. Saldo do cartão → Sync em tempo real do saldo USDC na Base
```

### Carry Trade

- **Custo do empréstimo**: ~5% APY (Morpho borrow rate)
- **Rendimento do colateral**: ~15% APY (CDI)
- **Carry líquido**: **+10% APY** (ganha enquanto gasta)
- Comparação: cartão de crédito brasileiro tradicional cobra ~400% a.a.

### Modo Demo (`?demo=true`)

Ambiente sandbox completo para testes — cartões Bridge funcionais, top-ups e compras simuladas, KYC/TOS auto-aprovados.

---

## Protocol Dashboard

Dashboard em tempo real (`protocol/index.html`) com:

- **KPIs**: TVL, APY atual, utilização do mercado, supply total
- **Chain Breakdown**: Polygon vs Base — saldos, colateral, dívida
- **Stress Tests**: Matriz de cenários BRL/CDI
- **Morpho Position**: Colateral, USDC emprestado, LTV atual, health factor
- **Dashboards Embarcados**: Morpho market, DefiLlama, BaseScan

### Cálculo de Métricas

```javascript
// TVL = tokens em circulação × preço
// APY = calcAPY(currentLTV) com CDI e Morpho rates em tempo real
// Utilização = total_borrowed / total_supplied no Morpho market
```

---

## Financeiro (DRE)

Demonstrativo de Resultado do Exercício (`financials/index.html`) com integração automática ao Google Sheets via Apps Script.

### Estrutura

- **Tabs**: DRE, Produtos, Negociações, Gráficos, Insights, Fireblocks, BTG
- **Produtos**: Pagadoria Royalties, Remessas Internacionais
- **Atualização**: Automática via Google Apps Script webhook
- **Visualização**: Chart.js para gráficos de receita/despesa

---

## Pipeline CVM (Ofertas Públicas)

Interface React (`op/index.html`) para gestão de ofertas públicas sob CVM Resolução 88/2022.

### Funcionalidades

- **Gantt Chart**: Timeline visual por oferta
- **4 Ofertas Ativas**: ~R$ 17.5M em captação
- **Status**: Assinado | Contrato Enviado | Em Análise | Pendente
- **Campos**: Cliente, Tipo (Equity/Dívida), Valor, Datas, Responsável, Slot

---

## API Backend

**Base URL**: `https://efixdi-backend-production.up.railway.app`

### Endpoints Principais

#### Usuários e Autenticação

```
POST   /users/register                    # Criar conta
GET    /users/lookup?email=...            # Buscar usuário
GET    /users/tx?email=...                # Transações do usuário
POST   /users/tx                          # Registrar transação
POST   /users/link-card                   # Associar cartão ao usuário
```

#### Operações de Wallet

```
GET    /api/deposits                      # Depósitos processados
GET    /api/wallet/pending                # Depósitos PIX pendentes
GET    /api/wallet/withdrawals            # Fila de saques
POST   /api/wallet/withdrawals/process    # Processar saque (envia PIX)
GET    /api/wallet/collateral             # Posições de colateral
```

#### Admin

```
POST   /api/admin/deposit                 # Mint manual de efixDI
POST   /api/admin/bridge                  # Bridge Polygon → Base
GET    /api/admin/morpho                  # Posição Morpho (colateral, LTV, HF)
GET    /api/status?key=X                  # Métricas do protocolo (TVL, supply)
GET    /health                            # Health check (uptime, block, serviços)
```

#### Cartão (via Bridge Proxy)

```
POST   /bridge/cards/enable               # Habilitar sandbox
POST   /bridge/customers/{id}/card_accounts              # Emitir cartão
GET    /bridge/customers/{id}             # Dados do cliente
GET    /admin/stats                       # Stats (usuários, cartões, TVL)
GET    /admin/users                       # Todos os usuários
GET    /admin/users?format=csv            # Exportar CSV
```

### Serviços Backend

| Serviço | Função |
|---------|--------|
| **HausBank OAuth2** | Token refresh automático (TTL 3600s) |
| **Auto-Mint Poller** | Poll HausBank a cada 30s para matching de PIX |
| **Keeper Bot** | Monitora health factor, auto-deleverage |
| **Withdrawal Listener** | Processa saques PIX event-driven |
| **Circuit Breaker** | Isolamento de falhas por serviço |

### Tipos de Transação

```javascript
{
  email: string,
  type: "deposit" | "top_up" | "purchase" | "card_funding" | "fund",
  amount: number,
  asset: "efixDI" | "USDC" | "BRL",
  description: string,
  created_at: ISO8601
}
```

---

## Painel Administrativo

### Wallet Admin (`app/wallet/admin.html`)

Autenticação via `X-Admin-Key` header. Tabs:

| Tab | Função |
|-----|--------|
| **Mint** | Mint manual para depósitos não-PIX |
| **Deposits** | Histórico de depósitos processados |
| **Withdrawals** | Fila de saques pendentes |
| **Collateral** | Posições de colateral (locked/free/pending) |
| **Protocol** | Health check, TVL, supply, serviços |
| **Bridge** | Operações LayerZero + histórico |
| **Dashboard** | iframes embarcados (Morpho, DefiLlama) |

### Card Admin (`card/admin.html`)

- **Proxy URL**: `https://efix-bridge-proxy-production.up.railway.app`
- Operações: stats, listagem de usuários, emissão de cartão, tracking KYC

---

## Infraestrutura e Deploy

### Hosting

| Serviço | Plataforma | Função |
|---------|-----------|--------|
| Frontend | GitHub Pages | Site estático (efix.finance) |
| Backend | Railway | API Node.js (24/7) |
| Card Proxy | Railway | Proxy para Bridge API |
| Oracle Keeper | Railway | Atualização de preço a cada 4h |

### Deploy

```bash
# Frontend — push para main deploya automaticamente
git add .
git commit -m "feat: nova funcionalidade"
git push origin main
# GitHub Pages publica automaticamente (sem CI/CD)
```

### Configuração GitHub Pages

- `CNAME` → `efix.finance`
- `.nojekyll` → Desabilita processamento Jekyll
- `.gitattributes` → Compatibilidade GitHub Pages

---

## Segurança

### Gas Abstraction

- UserOps patrocinados via Alchemy Gas Policy — usuário nunca paga gas
- Smart accounts com deploy lazy (criadas no primeiro UserOp)
- Leituras de saldo via `eth_call` (sem custo de gas)
- Operações batched em único UserOp quando possível

### Oracles

- **Oracle V2**: Atualização autônoma a cada 4h via keeper no Railway
- **Chainlink BRL/USD**: Feed on-chain no Polygon
- **Proteção**: D+0 redemption das cotas DI como backstop

### Status de Auditoria

- **OpenZeppelin**: Auditoria de segurança agendada (Mar 2, 2026)
- **Verificação**: Todos os contratos verificados no Polygonscan e BaseScan

### Integrações Pendentes

- **DefiLlama**: TVL Adapter PR #18113 (aguardando merge)
- **Morpho Vault**: Listing PR #958 (aguardando review)
