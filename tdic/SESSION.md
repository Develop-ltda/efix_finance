# SESSION LOG — TDIC v2 (2026-05-08)

Esta sessão construiu do zero a rota `efix.finance/tdic` v2 (white-label), o
painel cedente, o admin de compliance, a página de subscrição e a integração
de e-mail real com o backend efixdi.

---

## 1. Decisões de arquitetura

| Tópico | Decisão | Motivo |
|---|---|---|
| Padrão do token | **ERC-1155** (1 contrato, N tokenIds) | Sem multiplicar deploys |
| Compliance on-chain | Whitelist + Pausable + AccessControl (futuro) | CVM 88 emissão privada · ERC-3643 é overkill |
| Carteira | Alchemy Account Kit (Light Account) + Email OTP | Padrão do efixDI wallet e BRLE app |
| Rede | **Base mainnet** | Composabilidade com Morpho/efixDI + gas barato |
| White-label | `?c=<slug>` lê `cedentes.json` → CSS vars | Zero forks |
| Solidity | 0.8.27 viaIR cancun OZ 5.4.0 | Mesmo BTR/Lobie (a fazer — Sprint B) |
| Gerar PDF | `window.print()` nativo em popup | Sem CDN · texto vetorial · paginação correta |
| Provider de e-mail | nodemailer + SMTP genérico (Gmail) | Mesmo `mailTransporter` que envia OTP do efixDI |
| Provider de assinatura | Abstração com mock-redirect (Clicksign/D4Sign/DocuSign) | Pronto pra plugar real; mock por ora |
| Backend persistência | localStorage mock + endpoint real só pra e-mail | Backend Postgres é Sprint C |

---

## 2. Estrutura criada

```
efix_finance/tdic/
├── index.html                 # Landing institucional (Syne + Space Mono, white-label)
├── cedentes.json              # Config branding (hoje só "default" / EFIX)
├── tdic-mock.js               # Backend mockado em localStorage
├── app/
│   ├── index.html             # Painel cedente — login OTP → KYB → mint
│   ├── app.js                 # Lógica do cedente (~1500 linhas)
│   └── sign-providers.js      # Abstração Clicksign/D4Sign/DocuSign + mock
├── admin/
│   └── index.html             # Painel compliance EFIX (KYBs, CRs, mint, e-mail)
├── pay/
│   └── index.html             # Página de subscrição (PIX/TED mock)
├── admin-fidc/                # v1 antigo preservado (painel React UMD)
│   └── index.html
└── assets/
    ├── theme.js               # Carrega cedentes.json e seta CSS vars
    └── tdic-mark.svg          # Logo TDIC
```

---

## 3. Commits desta sessão

| Hash | O que entregou |
|---|---|
| `cb31e930` | TDIC v2 inicial: landing white-label + app cedente + admin compliance |
| `61de29c8` | Ativa bundle Alchemy real para entrega de OTP por e-mail |
| `926cfe6d` | Corrige TDZ em `_initDone` + log do signer + reset de sessão |
| `eaa492f3` | Importador de recebíveis via planilha (xlsx/xls/csv) ou PDF |
| `cc23bd29` | Corrige hang em "Enviando..." — `sendOTP` é promise pendente do Turnkey |
| `738588e1` | Humaniza erros Alchemy/Turnkey em PT-BR (MAX_OTP_INITIATED, etc) |
| `d02d1476` | Avanço imediato pro form de OTP + cache-bust |
| `c59c59ee` | Assinatura eletrônica do Instrumento de Cessão no KYB |
| `2aeecd5f` | Assinatura qualificada — Clicksign/D4Sign/DocuSign + hash SHA-256 + versão |
| `b5b6d8db` | Dados bancários BACEN no KYB + deságio inputável + borderôs |
| `1590d9ce` | Arbitragem de parâmetros do CR antes da aprovação (admin) |
| `19e971b2` | Borderô consolidado de todas as cessões + filtro de período |
| `ab793668` | Remove views de CET e info de regime fiscal do modal de arbitragem |
| `4466f525` | Oculta regime tributário, remove infos fiscais, renomeia Royalty→Taxa de serviço, gera PDF |
| `ddbba17f` | PDF via `window.print()` nativo em vez de html2pdf |
| `cf178099` | Fork de emissão pública vs privada + página de subscrição |
| `4156ff39` | Aprovação com 3 modalidades + ações manuais (e-mail/mint/liquidar) na aba Aprovados |
| `8d145fc6` | Dispara e-mail real via efixdi-backend (nodemailer/SMTP) |
| `24efd19e` | Dados de demo + reset + estados vazios informativos + indicador MOCK MODE |
| `efada8a1` | Atalho `?demo=1` + log/erro melhorados no seedDemoBtn |
| `a1134f1a` | **Contrato Instrumento de Cessão v3** (texto oficial EFIX_v3.docx) |

**Backend (`efixdi-backend`):**

| Hash | O que entregou |
|---|---|
| `469cf34` | `POST /api/tdic/email/send-cr-notification` (reusa `mailTransporter` SMTP) |

---

## 4. Configuração ativa (Railway · efixdi-backend)

Todas as envs já estão setadas (verificado nesta sessão via `railway variables`):

```
SMTP_HOST       = smtp.gmail.com
SMTP_PORT       = 587
SMTP_USER       = ernesto.otero@hausbank.com.br
SMTP_PASS       = (Gmail App Password 16 chars)
SMTP_FROM       = ernesto.otero@hausbank.com.br
ADMIN_API_KEY   = hyeUBN7esKD2rIw7ENVoqPeeSQW3XHPMwiv9SWgt   # ⚠ VAZADA — ROTACIONAR (Sprint A)
ADMIN_EMAILS    = ernesto.otero@efix.finance,ernesto.o…
ADMIN_JWT_SECRET= efixdi-jwt-2026-change-to-random-…
ADMIN_TOKEN     = (definida)
```

Alchemy (frontend bundle real ativo):

```
apiKey          = 5QrXWREEtmi4gITNoJsJf
gasPolicyId     = 7b22b464-38cd-4e6f-bccb-00f1280ac14c   # Polygon — NÃO existe ainda Base
```

---

## 5. Caminhos de execução em produção

| URL | O que faz |
|---|---|
| `https://efix.finance/tdic/` | Landing institucional |
| `https://efix.finance/tdic/app/` | Cedente: login OTP → KYB → cadastro → mint |
| `https://efix.finance/tdic/admin/` | Compliance: KYBs, CRs, mint, e-mail |
| `https://efix.finance/tdic/admin/?demo=1` | Admin com 7 créditos pré-carregados |
| `https://efix.finance/tdic/pay/?cr=ID` | Subscrição (PIX/TED mock) |
| `https://efix.finance/tdic/admin-fidc/` | v1 antigo preservado |
| `https://efixdi-backend-production.up.railway.app/api/tdic/email/send-cr-notification` | Endpoint de e-mail (adminAuth) |

---

## 6. Fluxo end-to-end implementado (mock)

```
Cedente
  → login email OTP (Alchemy real, OTP chega em 5-30s)
  → KYB (CNPJ + razão social + faturamento + dados bancários BACEN
          + contrato v3 + assinatura eletrônica com hash SHA-256)
  → status "Em análise"
  → admin aprova KYB (modo demo no front; on-chain em Sprint D)
  → cedente cadastra crédito (manual ou importa planilha xlsx/csv)
       campos: devedor, dupl, valor face, vencto, deságio inputável, abat
  → admin abre modal de arbitragem
       escolhe modalidade: CR Privada / CR Pública / Venda direta
       arbitra taxa desconto, taxa de serviço, abatimento
       aprova → status "approved"
  → aba "Aprovados · ações":
       📧 Enviar e-mail (real via Railway+SMTP)
       💎 Mintar token (mock — vira mintarCR real no Sprint D)
       Marcar liquidado (só venda direta)
  → cedente vê pill + botão "Ver oferta" (privada/pública)
  → cedente acessa /tdic/pay/?cr=ID
  → "Simular pagamento" → mock dispara mintCR
```

---

## 7. Arquivos críticos pra próxima sessão

- `tdic/app/app.js` (~1500 LOC) — lógica do cedente, parser xlsx, gerador PDF, assinatura
- `tdic/app/index.html` — formulário KYB com seções, modal contrato, modal mint
- `tdic/admin/index.html` (~1100 LOC) — admin, modal arbitragem, gerador CR PDF, envio e-mail real
- `tdic/tdic-mock.js` — backend mock (substituir por chamadas REST no Sprint C)
- `tdic/app/sign-providers.js` — abstração assinatura (plugar real no Sprint F)
- `tdic/pay/index.html` — página subscrição (PIX dinâmico no Sprint E)
- `efixdi-backend/efixdi-backend-v3.js` — backend real (já tem endpoint de e-mail; expandir no Sprint C)

---

## 8. Convenções herdadas

- **Cache-bust**: `?v=20260508l` query-string em scripts e stylesheets do TDIC. Incrementar a letra (`a`→`b`→…) a cada deploy de JS/CSS.
- **i18n**: `data-i18n="key"` (landing tem; app/admin ainda não tem).
- **Branding white-label**: `data-brand="displayName"`, `data-brand-attr="src:logo"`, `data-brand-issuer="cnpj"`. Lê de `cedentes.json` via `assets/theme.js`.
- **Console logs**: prefixo `[TDIC]` ou `[admin]` para fácil filtragem.
- **Commit message**: estilo do projeto — minúsculo, sem prefixo `feat:`, dois-pontos pra escopo.
- **Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>** no fim de cada commit.

---

## 9. Estado do branch

- Branch ativa: `main`
- Último commit: `a1134f1a` — contrato v3
- Pendências fora do tdic (não tocadas nesta sessão):
  - `CLAUDE.md` modificado em outra sessão
  - `first/index.html` modificado em outra sessão
  - `contracts/`, `scripts/deploy-collateral-vault.js`, `patch-financials.js` untracked

Decisão da sessão: **não tocar nessas pendências sem instrução explícita.**

---

> Próximo passo: ver `HANDOFF.md` neste mesmo diretório para a roadmap detalhada
> dos 19 itens pendentes (Sprints A–F).
