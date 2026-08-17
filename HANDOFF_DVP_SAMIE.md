# DVP-1 · Samie — Primeiro teste DvP real via EFIX Wallet (handoff executável)

> **Para a sessão enterprise.** Gerado em 2026-08-17 pela sessão "Email cliente sobre remessa bancária" (`efix_finance` @ `claude/email-cliente-remessa-nekfmz`).
> **Missão:** enviar ao cliente **Samie** um email com o link de auto-cadastro na EFIX Wallet + instruções completas, e conduzi-lo como **primeiro teste DvP real** (EUR → USDC → PIX pela trilha `Remessas` da wallet). O cliente deve conseguir fazer **tudo sozinho**; a mesa acompanha por trás.
> Todo o fluxo abaixo foi mapeado e **verificado contra o código** deste repo (refs `arquivo:linha` em cada passo). O que depende do backend (`efixdi-backend`, `efix-dvp`) está marcado como pré-voo.

## Status em uma linha

Fluxo do cliente mapeado e verificado ✅ · **email Passo 1 JÁ ENVIADO à cliente em 17/08** ✅ (Gmail id `1a01020c29e1d1ec`, de ernesto.otero@hausbank.com.br — cadastro + pedido dos dados do beneficiário; NÃO reenviar) · auto-cadastro confirmado aberto no código do backend ✅ (§2-A) · gates de remessa no Railway/DVP ❌ pendentes (§2-A2, **bloqueante**) · favorecido na allowlist do DVP ❌ pendente (§2-B, **bloqueante**, aguarda resposta da cliente com os dados).

---

## 0. Contexto — o que já aconteceu (não repetir)

- **17/08: o email do Passo 1 JÁ FOI ENVIADO à cliente** (`Soniaaj31@gmail.com`, Gmail id `1a01020c29e1d1ec`, remetente ernesto.otero@hausbank.com.br). Conteúdo: instruções de cadastro na V2 (email + código de 6 dígitos) e pedido de resposta com **nome/CPF-CNPJ/chave PIX do beneficiário + finalidade**. O Passo 3 foi anunciado como "avisaremos quando estiver liberada" — ou seja, a enterprise deve armar os gates (§2-A2/B) e então responder na MESMA thread confirmando a liberação. Não reenviar o convite.
- **Rui Rodrigues (`rui.mfr@gmail.com`) NÃO é o cliente deste teste.** O caso dele já foi tratado: emails enviados por `ernesto.otero@hausbank.com.br` em **13/08** (link de verificação Bridge + justificação bancária) e **17/08** (convite à wallet), thread Gmail "EFIX — Verificação para ativar SEPA + justificação da remessa junto do seu banco", com Ulysses e Marser em cópia. Não enviar nada novo ao Rui por este handoff.
- **Referência de compliance:** o pagamento de €46.000 do Rui (abr/2026) disparou RFI "risky payment" da Bridge — perguntas padrão: finalidade, source of funds, source of wealth, com documentos. Foi aprovado em 16/04 após envio de contrato do imóvel + comprovativos de rendimento (thread no Slack `#c-bridge-hausbank`, ts `1776088303.898389`). **Esperar o mesmo para o Samie em valores altos** — preparar o pacote de documentos ANTES (§2-F).
- **Bridge / lado EUR (fatos de ago/2026):**
  - Desde 01/07/2026 o beneficiário das IBANs EUR/GBP da Bridge é **Bridge Building S.A.** (migrado de Bridge Building Sp. z o.o.).
  - A Bridge recebeu **"Green Light Letter" da CSSF (Luxemburgo)** — aprovação preliminar EMI + CASP sob **MiCA**. Ambos os fatos entram na justificação bancária do template (§4/§5).
  - Desde 15/07 os **RFIs não chegam mais com detalhes no Slack** — ficam na aba Support do Bridge Dashboard. Quem for acompanhar precisa de acesso ao Dashboard.
  - Clientes EEA sem o **KYC uplift** ficam com endorsement `incomplete` e **não transacionam** — o link de KYC personalizado fica na página do customer no Dashboard (ou no relatório "Customers require uplift").
- **Pegadinha aprendida (caso Rodrigo Velasco, abr/2026):** transferência para virtual account foi **devolvida por "receiver name mismatch"** — em conta virtual, o titular da conta de origem tem de ser o próprio customer Bridge. Instruir o cliente: **a transferência SEPA deve sair de conta em nome dele mesmo** (nada de conta de terceiros/empresa) e o beneficiário deve ser copiado exatamente como instruído.

---

## 1. Dados a preencher (a sessão enterprise tem o chat do cliente)

| Campo | Valor |
|---|---|
| Nome completo do cliente | ⚠️ PREENCHER — "Samie" (confirmar nome completo no chat e no cadastro Bridge) |
| Email do cliente | ✅ `Soniaaj31@gmail.com` (informado por Ernesto em 17/08) |
| Idioma do email (PT / EN) | ⚠️ PREENCHER |
| Finalidade da remessa (ex.: aquisição de imóvel, investimento) | ⚠️ PREENCHER |
| Valor estimado (EUR) e nº de tranches | ⚠️ PREENCHER |
| Beneficiário do BRL (nome/razão social, CPF/CNPJ, chave PIX) | ⚠️ PREENCHER |
| Customer Bridge (ID + status endorsements) | ✅ **JÁ EXISTE** — o email consta no export `customers-2026-05-13.csv` (94 rows, Gmail de Ernesto). Buscar `Soniaaj31@gmail.com` no Dashboard `dashboard.bridge.xyz` → Customers para pegar o ID e o status dos endorsements/tasks |
| Link KYC personalizado da Bridge | ⚠️ PREENCHER — página do customer no Dashboard, botão "Copy link" da task pendente (formato `https://api.bridge.xyz/hosted/link/…`) |

**Regra fail-closed:** o email dos §4/§5 **não sai** enquanto houver ⚠️ nesta tabela ou ❌ no §2.

---

## 2. Pré-voo (fazer ANTES de enviar o email)

- [x] **A. Auto-cadastro — RESOLVIDO por leitura do código do backend (17/08).** `POST /auth/send-otp` envia código a **qualquer email válido** (só blocklist + rate limits: 5/email/10min, 8/IP/min) e `POST /auth/verify-otp` faz **upsert** do usuário (`INSERT ... ON CONFLICT (email) DO UPDATE`) e emite JWT — email novo é registrado na hora, `wallet_address` nasce NULL e é vinculado depois ("link-on-first-use") (`efixdi-backend/efixdi-backend-v3.js:6331-6482`). O "safe-mode existing-users-only" vale só para `/users/login` (fluxo Alchemy da wallet clássica), que devolve 410 para usuário novo — **não afeta a V2**. A cliente consegue se cadastrar sozinha.
- [ ] **A2. Gates de remessa no Railway/DVP (BLOQUEANTE — verificado no código, `efixdi-backend-v3.js:7078-7135`).** Sem isso a aba Remessas responde 503/403 para ela:
  - `REMITTANCE_ENABLED=true` na env do Railway (ou ligar em runtime via `POST /api/admin/remessas/toggle` com token admin) — senão 503 "Remessas desabilitadas";
  - `DVP_WALLET_TOKEN` presente na env — senão 503 "Remessas não configuradas";
  - **`REMESSAS_USER_ALLOWLIST`**: se a env estiver preenchida (beta fechado), **incluir `soniaaj31@gmail.com`** — senão 403 "Remessas em beta fechado";
  - conta da cliente sem lock (`lockGate` em quote/deals/fund).
- [ ] **B. Favorecido na allowlist do DVP (BLOQUEANTE).** O select "Favorecido (allowlist)" vem de `GET /remessas/allowlist` → repassado ao serviço **efix-dvp** (`GET /wallet/allowlist`, identidade via header `x-wallet-user`; `efixdi-backend-v3.js:1255-1290, 7135`) e **não existe UI para adicionar** — o cadastro do favorecido (e todo payout/approve/paid) é exclusivo do **token ops do DVP**, que o backend não possui. Registrar o beneficiário com os dados que a cliente responder ao email do Passo 2 e confirmar que aparece no select.
- [ ] **C. Rota de cotação viva.** No mesmo login de teste: aba Remessas → digitar o valor alvo em R$ → "Cotar". Se aparecer "Nenhuma rota disponível agora." (`usdc_needed` nulo — `index.html:1008-1015`), a rota do DVP está parada; acionar a mesa antes de qualquer email.
- [ ] **D. Bridge do Samie pronto.** Customer criado (Individual), **endorsement SEPA ativo** (sem tasks pendentes; se houver "Add additional customer details", enviar o link personalizado — é o mesmo modelo usado com o Rui). Sem SEPA ativo o cliente não tem IBAN/virtual account EUR para financiar a remessa.
- [ ] **E. Decidir a ponta EUR → USDC (decisão de ops, documentar a escolha):**
  - **(i) Bridge converte:** SEPA EUR → virtual account do cliente na Bridge → USDC na rede **Base** com destino no **endereço de depósito do deal**. *Pegadinha:* o endereço de depósito é **por remessa** (`POST /remessas/deals/{id}/fund` → `deposit_instructions.to_address` — `index.html:1031-1043`), então o destino da VA precisa ser configurado/ajustado **por deal**, ou
  - **(ii) Cliente envia USDC de carteira própria** direto ao endereço do deal (se ele já tiver USDC). O fluxo da wallet **não** assina envio nenhum — o funding é sempre out-of-band (verificado: login V2 por OTP de backend não estabelece sessão de assinatura Alchemy).
- [ ] **F. Pacote de compliance pronto** (finalidade, source of funds, source of wealth + documentos), espelhando o que foi aprovado para o Rui. RFI em valor alto é provável; resposta agora é pela aba Support do Bridge Dashboard.
- [ ] **G. (Recomendado) Dry-run interno completo:** uma remessa de valor pequeno de ponta a ponta com a equipe antes do cliente, validando também o gate da mesa (payout).

---

## 3. O fluxo do cliente (o que o email instrui — verificado no código)

1. **Cadastro/login** — `https://efix.finance/app/wallet`: um campo de email + "Continuar"; código de 6 dígitos por email + "Entrar". Sem instalação, sem senha, sem MetaMask (`index.html:344-362, 720-743`). Novo usuário cai direto no painel ("Nenhum ativo ainda…").
2. **Verificação Bridge (KYC/SEPA)** — abrir o link personalizado (§1) e preencher; ativa as transações EUR e a virtual account.
3. **Criar a remessa** — aba **Remessas**: escolher o favorecido (já pré-registrado por nós), digitar o **valor a quitar em R$**, "**Cotar**" (mostra "Você envia: X USDC" e o câmbio efetivo com taxas inclusas), depois "**Criar remessa & gerar depósito**" → o sistema mostra rede (**Base**), moeda (**USDC**), **valor exato** e **endereço de depósito** com botão "Copiar endereço" (`index.html:1002-1043`).
4. **Financiar** — conforme a decisão do §2-E: transferir os EUR por SEPA da **conta em nome próprio** para a virtual account Bridge (conversão automática para USDC no endereço do deal), ou enviar o **valor exato** em USDC na rede Base.
5. **Acompanhar** — "Minhas remessas": estados **aberta → financiada → liquidada → encerrada** (`open/funded/settled/closed` — `index.html:1048-1074`). O pagamento em R$ ao favorecido é **liberado pela mesa após a liquidação** (gate DvP — `index.html:463`); o detalhe do deal mostra depósitos, off-ramps e payouts com `receipt_ref`.

**Nota interna (não vai no email):** o favorecido escolhido viaja apenas como **texto livre** no campo `notes` do `POST /remessas/deals` (`index.html:1027-1030`) — **não há campo estruturado de beneficiário**. O vínculo deal → favorecido e o payout são responsabilidade da mesa. Conferir SEMPRE o nome no `notes` antes de liberar o payout.

---

## 4. Email pronto — versão PT

> **De:** ernesto.otero@hausbank.com.br (ou remetente que a sessão enterprise usar)
> **Para:** ⚠️ email do Samie
> **Assunto:** EFIX — Sua conta digital para a remessa: cadastro, verificação e passo a passo

Olá {NOME},

Espero que esteja tudo bem. Aqui estão os passos para realizar a sua remessa através da EFIX Wallet, o nosso canal digital — você consegue fazer tudo pelo navegador, sem instalar nada, e a nossa equipe acompanha cada etapa.

A liquidação segue o modelo DvP ("entrega contra pagamento"): o pagamento em reais ao beneficiário só é liberado depois de os seus fundos estarem integralmente liquidados — máxima segurança e rastreabilidade para ambas as partes.

**PASSO 1 — Crie a sua conta (2 minutos)**
Acesse https://efix.finance/app/wallet , digite o seu email e clique em "Continuar". Você recebe um código de 6 dígitos por email — digite-o e clique em "Entrar". Pronto: a sua conta digital está criada, sem senha e sem instalação.

**PASSO 2 — Verificação (ativa as transferências em euros)**
Complete a verificação segura do nosso parceiro de pagamentos Bridge (grupo Stripe) neste link: {LINK_KYC_BRIDGE}
Os dados vão diretamente para a Bridge e o processamento normalmente leva poucos minutos.

**PASSO 3 — Crie a remessa**
Na aba "Remessas" da wallet: escolha o beneficiário (já deixamos registrado), digite o valor a pagar em reais e clique em "Cotar" — você verá exatamente quanto enviar e o câmbio efetivo, com taxas incluídas. Clique em "Criar remessa & gerar depósito".

**PASSO 4 — Envie os fundos**
{INSTRUCAO_FUNDING — conforme decisão §2-E; ex.: "Transfira os euros por SEPA da sua conta bancária para a sua conta virtual Bridge (dados exibidos após a verificação). Importante: a transferência deve sair de uma conta em seu próprio nome, e o beneficiário deve ser copiado exatamente como indicado."}

**PASSO 5 — Acompanhe**
Em "Minhas remessas" você acompanha cada etapa (aberta → financiada → liquidada). Após a liquidação, o pagamento em reais é liberado ao beneficiário e o comprovante fica disponível.

**Se o seu banco pedir justificativa da transferência**, pode encaminhar-lhes o texto abaixo:

> A transferência destina-se a uma conta virtual emitida em meu próprio nome pela Bridge (Bridge Building S.A.), infraestrutura de pagamentos do grupo Stripe com aprovação preliminar da CSSF (Luxemburgo) no âmbito do regulamento europeu MiCA, que processa transferências SEPA na União Europeia.
> A finalidade da operação é {FINALIDADE}, realizada através da EFIX Plataforma de Tokenização e Crowdfunding Ltda (CNPJ 60.756.859/0001-57), plataforma regulada pela Comissão de Valores Mobiliários do Brasil (CVM), nos termos da Resolução CVM 88/2022 e do Ato CVM 23.635/2025.
> Todas as operações são integralmente rastreáveis, com referências únicas e comprovativos disponíveis, e estão sujeitas a verificação de identidade (KYC) tanto pela Bridge como pela EFIX, em conformidade com as normas de prevenção ao branqueamento de capitais aplicáveis.

Se o banco pedir documentação adicional (declaração formal da EFIX, comprovativo da operação, contrato), emitimos de imediato — basta responder a este email.

Qualquer dúvida, estou à disposição.

Cumprimentos,

**Ernesto Otero**
CEO — EFIX Plataforma de Tokenização e Crowdfunding Ltda
CNPJ 60.756.859/0001-57 | https://efix.finance

---

## 5. Email pronto — versão EN

> **Subject:** EFIX — Your digital account for the remittance: sign-up, verification and step-by-step

Hello {NAME},

Here is everything you need to complete your remittance through the EFIX Wallet, our digital channel — the whole flow runs in your browser, nothing to install, and our team monitors every step.

Settlement follows the DvP model ("delivery versus payment"): the BRL payment to the beneficiary is only released after your funds have fully settled — maximum safety and traceability for both sides.

**STEP 1 — Create your account (2 minutes)**
Go to https://efix.finance/app/wallet , enter your email and click "Continuar". You'll receive a 6-digit code by email — type it and click "Entrar". Done: your digital account is ready, no password, no installs.

**STEP 2 — Verification (enables EUR transfers)**
Complete the secure verification with our payment partner Bridge (a Stripe company) at this link: {BRIDGE_KYC_LINK}
Your data goes directly to Bridge and processing normally takes a few minutes.

**STEP 3 — Create the remittance**
In the wallet's "Remessas" tab: pick the beneficiary (we have pre-registered it), enter the amount to settle in BRL and click "Cotar" — you'll see exactly how much to send and the effective FX rate, all fees included. Then click "Criar remessa & gerar depósito".

**STEP 4 — Fund it**
{FUNDING_INSTRUCTION — per §2-E; e.g. "Send the EUR by SEPA from your own bank account to your Bridge virtual account (details shown after verification). Important: the transfer must come from an account in your own name, and the beneficiary must be copied exactly as instructed."}

**STEP 5 — Track it**
"Minhas remessas" shows every stage (open → funded → settled). Once settled, the BRL payment is released to the beneficiary and the receipt becomes available.

**If your bank asks you to justify the transfer**, you can forward them this:

> The transfer goes to a virtual account issued in my own name by Bridge (Bridge Building S.A.), a payments infrastructure company of the Stripe group holding preliminary CSSF (Luxembourg) approval under the EU MiCA regulation, which processes SEPA transfers in the European Union.
> The purpose of the operation is {PURPOSE}, carried out through EFIX Plataforma de Tokenização e Crowdfunding Ltda (Brazilian tax ID 60.756.859/0001-57), a platform regulated by the Brazilian Securities Commission (CVM) under CVM Resolution 88/2022 and CVM Act 23.635/2025.
> All operations are fully traceable, with unique references and receipts available, and subject to identity verification (KYC) by both Bridge and EFIX, in compliance with applicable anti-money-laundering rules.

If the bank requests additional documentation (formal EFIX statement, transaction receipt, platform agreement), we will issue it immediately — just reply to this email.

Best regards,

**Ernesto Otero**
CEO — EFIX Plataforma de Tokenização e Crowdfunding Ltda
Brazilian tax ID (CNPJ) 60.756.859/0001-57 | https://efix.finance

---

## 6. Depois do envio — acompanhamento do teste

1. **Cadastro:** confirmar que o Samie logou (backend `GET /users/me` / base de usuários) e que o KYC Bridge aprovou (Dashboard; tasks levam até ~10 min para atualizar).
2. **Deal criado:** conferir em `GET /remessas/deals` — e **validar o favorecido no campo `notes`** (ver nota interna do §3) antes de qualquer payout.
3. **Funding:** SEPA in → conversão → USDC no endereço do deal (status `financiada`). Se a Bridge segurar o pagamento (RFI), responder pela aba Support do Dashboard com o pacote do §2-F.
4. **Gate DvP:** após `liquidada`, a mesa cria/libera o payout PIX ao favorecido; o cliente vê o payout e o `receipt_ref` no detalhe do deal.
5. **Tracking manual:** o Rail 4 (inbound estrangeiro) **não tem reconciliação automática** (`handoff_conciliacao/RI_KNOWLEDGE_RAILS.md` §10.4) — registrar a operação na planilha de Negociações e guardar os IDs (Bridge transfer ID, tx hash Base, deal ID, PIX endToEndId) para IN 1888.
6. **Registrar o teste:** anotar fricções do cliente (onde travou, quanto tempo levou cada etapa) — é o insumo do produto para o segundo cliente.

## 7. Critérios de sucesso do DVP-1

- [ ] Cliente se cadastrou **sozinho** (sem chamada de suporte) e completou o KYC Bridge.
- [ ] Cliente criou a remessa sozinho na wallet (cotação + deal + instruções de depósito).
- [ ] Funding chegou e o deal transitou `aberta → financiada → liquidada` sem intervenção manual além do desenho.
- [ ] Payout PIX liberado pela mesa **somente após** liquidação (gate DvP respeitado), com `receipt_ref` visível ao cliente.
- [ ] Trilha completa de auditoria capturada (7 IDs do `RI_KNOWLEDGE_RAILS.md` §8 aplicáveis).
- [ ] Banco europeu do cliente aceitou a justificação sem bloqueio (ou bloqueio resolvido com o pacote de docs).

---

## Apêndice A — Referências técnicas (verificadas em 2026-08-17)

- **Login V2:** OTP por email do backend — `POST /auth/send-otp`, `POST /auth/verify-otp` (`app/wallet/efix-auth.js:170-201`; gate em `app/wallet/index.html:344-362, 720-743`). JWT em `localStorage` (`efix_user_token`).
- **Remessas (tudo no `efixdi-backend`; o browser nunca fala com o `efix-dvp`):** `GET /remessas/allowlist` · `POST /remessas/quote {amount_brl}` · `POST /remessas/deals {expected_amount, expected_currency:'BRL', notes}` · `POST /remessas/deals/{id}/fund {amount_usdc, quote_set_id}` → `deposit_instructions {to_address, payment_rail:'base', currency:'usdc', amount}` · `GET /remessas/deals[/{id}]` (`app/wallet/index.html:976-1074`).
- **Kill switch:** `GET /remessas/status` esconde a aba **apenas na wallet clássica** (`classic.html:453, 3305-3313`); a V2 não tem esse gate — usar a **V2** nas instruções ao cliente (a clássica ainda rotula valores de deal como "USDC" indevidamente, `classic.html:3284`).
- **KYC:** remessas não têm gate de KYC no cliente (só login); o KYC Bridge gate-ia o fluxo de depósito USD/EUR (`classic.html:3011-3065`); Sumsub gate-ia ofertas (`app/offerings/`), não a wallet.
- **Backend base:** `https://efixdi-backend-production.up.railway.app` · Proxy Bridge/Sumsub: `https://efix-bridge-proxy-production.up.railway.app`.

## Apêndice B — Pegadinhas conhecidas

1. **Cadastro aberto SÓ pelo fluxo OTP da V2** — `/auth/verify-otp` cria usuário novo (upsert), mas `/users/login` (wallet clássica/Alchemy) devolve **410 para usuário novo** ("safe-mode existing-users-only"). Instruir a cliente sempre pela **V2** (`efix.finance/app/wallet`); se ela cair na clássica antes de existir no banco, o login falha.
2. **Favorecido = texto livre em `notes`** — vínculo e payout são manuais na mesa; conferir antes de liberar.
3. **Endereço de depósito é por deal** — se a VA Bridge converter direto para on-chain, o destino precisa acompanhar o deal.
4. **Receiver/sender name mismatch devolve SEPA** (caso Rodrigo Velasco) — só conta em nome do próprio cliente.
5. **RFI em valor alto é o caminho normal, não exceção** — pacote de docs pronto ANTES do funding; resposta via Dashboard (Slack não recebe mais detalhes desde 15/07).
6. **Cotação sem expiry no cliente** — o código não mostra validade da cotação; alinhar com a mesa qual a tolerância entre `Cotar` e o funding.
7. **Rail 4 sem conciliação automática** — tracking manual obrigatório (planilha Negociações + IN 1888).

> Fim do handoff. Ao concluir, registrar o resultado do DVP-1 (sucesso/fricções) neste arquivo ou em SESSION.md. Boa sorte! 🚀
