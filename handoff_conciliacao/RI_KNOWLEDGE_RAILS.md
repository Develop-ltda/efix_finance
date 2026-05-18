# EFIX Remessas — Rails do Processo

> **Para a equipe de RI da Lobie.** Documento de referência para conversas com investidores, auditores, RFB, BCB e CVM. Foco em **como o dinheiro flui** entre rails (não em código). Atualizado 2026-05-13.

---

## 0. Para quem este documento serve

A equipe de RI precisa explicar, com confiança e sem precisar consultar dev:
- Como uma remessa internacional via EFIX **realmente acontece** ponta-a-ponta
- Quem custodia o quê (BRL, cripto, identidade)
- Como rastreamos cada operação até o cliente real (compliance IN 1888)
- Quais são os limites e riscos conhecidos

Quem **opera** o processo é o Geferson (EFIX). Quem **explica** o processo pro mercado é a Lobie RI. Este doc cobre o lado "explicar".

---

## 1. Resumo em 30 segundos

A EFIX é uma plataforma regulada CVM que faz **remessa internacional via stablecoins**. Cliente brasileiro (ou estrangeiro) paga em moeda fiat, recebe USDC/USDT na carteira on-chain (ou o inverso). A trilha tem 4 rails de pagamento + 3 rails de identidade.

**Números atuais (jan–mai 2026):**
- R$ 685.000 já reconciliados ponta-a-ponta (PIX → on-chain)
- R$ 6,2 milhões via intermediários (Transfero/Haus/etc.)
- R$ 1,2 milhão equivalente em EUR/USD inbound (Bridge.xyz)
- 47 deals tracked manualmente + 15 matches automáticos
- 73 clientes KYC'd via Sumsub
- 94 clientes Bridge

**Obrigação regulatória principal:** IN 1888 da Receita Federal — declaração mensal de toda operação cripto envolvendo CNPJ/CPF brasileiro.

---

## 2. Os 4 Rails de Pagamento

### Rail 1 — BRL doméstico (PIX → BTG)

```
Cliente PJ/PF BR → PIX → Conta BTG Pactual EFIX → reconhecemos pelo nome do remetente
```

- **Custódia:** BTG Pactual (CNPJ 30.306.294/0001-45), conta da EFIX
- **Volume reconciliado:** R$ 685k em 5 meses (3 clientes corporativos identificados)
- **Identificação:** o campo "Pix recebido de [NOME]" do extrato BTG **É** o cliente final na maioria dos casos
- **Exceção crítica:** quando vem de um PSP (Transfero, Haus, etc.), o nome no extrato é o PSP — o cliente real está **escondido atrás dele** e tem que ser identificado por correspondência de valores e horários

### Rail 2 — Câmbio interno (BRL → USD via PSP)

```
BTG → PSP (Transfero / HausBank / Acesso) → câmbio fechado → USD on-chain
```

- **PSPs autorizados BCB usados pela EFIX:**
  - **Transfero Brasil Pagamentos S.A.** (CNPJ 31.502.183/0001-71) — principal
  - **HausBank / Acesso Soluções de Pagamento** — secundário
  - **Conta Pronta I Pagamentos, Wise, Pagadoria Digital, Webro** — eventuais
- **Custo regulatório:** IOF câmbio 0,38% (incide sobre o valor líquido pós-taxa EFIX)
- **Custo EFIX:** 3% sobre o valor bruto (a "Taxa 3%" que aparece no relatório)
- **Cotação:** spread em torno do PTAX do BCB; cada operação tem uma **cotação implícita** = BRL líquido / USD entregue

### Rail 3 — Cripto on-chain (USD em custódia + entrega)

```
PSP → Fireblocks Vault → off-ramp USDC (Polygon) ou USDT (Tron) → carteira do cliente
```

- **Custódia:** Fireblocks (MPC wallet — Multi-Party Computation, sem chave única)
- **Vault da EFIX:** o ponto onde o USD entra como cripto antes de ir ao cliente
- **Assets:** USDC na Polygon (mais comum) ou USDT na Tron (para alguns clientes asiáticos)
- **Auditoria pública:** cada transferência tem um **hash on-chain** verificável em [polygonscan.com](https://polygonscan.com) ou [tronscan.org](https://tronscan.org) — qualquer pessoa pode validar
- **Janela de liquidação:** -2 a +5 dias entre o PIX BTG e a transferência on-chain (usualmente D+0 ou D+1)

### Rail 4 — Inbound estrangeiro (EUR/USD → cripto, via Bridge.xyz)

```
Cliente estrangeiro → SEPA (EUR) / Wire (USD) / ACH (USD) → Bridge.xyz → USDC → Vault EFIX
```

- **Bridge.xyz:** parceiro de on/off-ramp licenciado nos EUA — emite virtual accounts em EUR/USD para cada cliente
- **Volume tracked:** 47 deals manuais na planilha Negociações; 94 customers em base
- **Clientes típicos:** investidores PF estrangeiros comprando imóveis no Brasil
  - Pedro Miguel Cardoso da Palma (PT)
  - Clemens Zuch (DE)
  - Nima Razaghi Kashani (CA)
  - Rodrigo Velasco (MX)
  - Francisco Hernandez Rebollo (ES)
  - Andrzej Witkowski (ES)
  - Carlos Rodrigues (PT)
  - Edmond van Wijngaarden (BR/NL)
  - +35 outros tracked
- **NÃO se confunde com Rail 1:** estes clientes pagam em EUR/USD do exterior; **não** passam pelo BTG

---

## 3. Os 3 Rails de Identidade

A EFIX precisa, por força da IN 1888 e do KYC bancário, vincular cada operação a uma **pessoa real** com CPF ou CNPJ.

### Identidade 1 — Lookup manual (clientes corporativos PJ)

Tabela curada à mão dos clientes recorrentes. Atualmente 7 entries:

| Nome BTG | Razão Social | CNPJ | Tipo |
|---|---|---|---|
| 3RZ Servicos Digitais LTDA | 3RZ SERVICOS DIGITAIS LTDA | 32.611.536/0001-30 | PSP Bybit (corretora cripto) |
| PL CONSULTORIA IMOBILIARIA LTDA | PL CONSULTORIA IMOBILIARIA LTDA | 30.678.850/0001-04 | Corretagem imobiliária |
| JBECKER PROMOCAO DE VENDAS LTDA | J BECKER PROMOCAO DE VENDAS LTDA | 46.860.369/0001-75 | Promoção de vendas |
| FABRICIO SILVA SANTOS | FABRICIO SILVA SANTOS | (CPF a obter via base HausBank) | PF |
| HERVE YVES DANIEL LAURIOUX | HERVE YVES DANIEL LAURIOUX | (CPF a obter) | PF |
| BENEFICIO NACIONAL TRIBUTARIO LTDA | BENEFICIO NACIONAL TRIBUTARIO LTDA | (CNPJ a obter via RFB) | A buscar |

**Atualização:** quando aparece um cliente novo recorrente, dev adiciona uma linha no arquivo `clientes_lookup.js` e faz deploy (5 min). Fora dos eventos extraordinários, esta tabela cresce ~3 entries por trimestre.

### Identidade 2 — Sumsub (KYC formal para PF cripto)

Sumsub é o provedor de KYC contratado pela EFIX para verificação de identidade de pessoas físicas no fluxo cripto. App: **Reconcile-eFix**.

- **73 applicants já cadastrados** (em base local Postgres no nosso proxy)
- **Status possíveis:** `GREEN` (aprovado), `RED` (rejeitado), `init` (pendente)
- **Dados capturados:** nome completo, e-mail, telefone, país, número de documento, foto do documento, selfie liveness
- **Atualização:** **automática via webhook** — cada vez que um applicant é criado, atualizado ou revisado no Sumsub, ele posta uma mensagem assinada (HMAC SHA-256) para o nosso proxy. O Postgres é atualizado em ~1 segundo
- **Eventos escutados:** `applicantCreated`, `applicantPending`, `applicantReviewed`, `applicantOnHold`, `applicantPersonalInfoChanged`

### Identidade 3 — Bridge.xyz customers (PF/PJ estrangeiros)

Cada cliente que abre virtual account no Bridge.xyz fica registrado lá. Nós consumimos a lista via API do Bridge.

- **94 customers** carregados live (auto-refresh cada 24h)
- **Dados:** nome, e-mail, endereço, país de incorporação/residência, status KYC do próprio Bridge, tipo (Individual / Business)
- **Sobreposição com Identidade 2:** zero — Sumsub é nosso KYC PF para o fluxo cripto doméstico; Bridge é KYC do provedor para o fluxo EUR/USD inbound

---

## 4. O Método de Conciliação BTG↔FB

### 4.1 Como cruzamos um PIX com uma transferência on-chain

Pra cada PIX recebido no BTG:

1. **Extrai o nome do remetente** do campo "Pix recebido de [NOME]" do extrato
2. **Filtra fora** PSPs intermediários (Transfero, Haus, etc.) e pagamentos de despesa (condomínio, IPTU, etc.)
3. **Calcula a faixa de USD esperada:**
   - `BRL líquido = BRL bruto × (1 - 3%) × (1 - 0,38%)` (descontando taxa EFIX + IOF)
   - `USD min/max = BRL líquido / [6,50 ; 4,50]` (faixa de cotação razoável)
   - margem de tolerância ±5%
4. **Busca uma transferência Fireblocks** que:
   - Saiu do Vault EFIX (`Source Type = Vault`)
   - Está completa (`Status = COMPLETED`)
   - É USDC ou USDT
   - Aconteceu em uma janela de **-2 a +5 dias** do PIX
   - O valor USD cai na faixa calculada
5. **Ranking dos candidatos:**
   - Primeiro critério: menor diferença de dias (`|Δd|` ascendente)
   - Segundo critério: cotação mais próxima do PTAX mensal
6. **Melhor candidato vira o match.** Cada FB tx só pode ser usada uma vez.

### 4.2 Resultado típico em 1 mês

```
Total PIX inflows BTG:        158 linhas
Filtrados (intermediário):    74 (R$ 6,2M via Transfero/Haus)
Filtrados (despesa):          12 (condomínio, tributos)
Elegíveis pra match:          21
  └─ Matched:                 15 (R$ 685k, 3 clientes únicos)
  └─ Não casados:              6 (R$ 211k — investigação manual)
Taxa de match automático:     71,4%
```

### 4.3 Confidence levels

Cada match recebe um nível de confiança:

| Nível | Critério | O que significa pra RI |
|---|---|---|
| `high` | Δd = 0, candidato único, cotação dentro da banda PTAX ±5% | Praticamente certeza. Pode ir pra IN 1888 sem revisão. |
| `medium` | Δd ≤ 2, até 3 candidatos | Revisar antes do envio. |
| `low` | Δd > 2, ou múltiplos candidatos, ou cotação fora de banda | **Revisão manual obrigatória.** Pode ser falso positivo. |

### 4.4 Status operacional (workflow do Geferson)

A cada operação revisada, o Geferson aplica um status:

| Status | Significado |
|---|---|
| `pending` | Algoritmo casou. Aguardando revisão humana. |
| `approved` | Geferson confirmou. Vai pra IN 1888. |
| `needs_review` | Algo estranho (cotação fora, Δd alto). Pendente investigação. |
| `manual` | Cliente foi identificado manualmente (override do algoritmo, ou para uma operação que o algoritmo não casou). |
| `rejected` | Match foi recusado. Pode ser refund, valor de teste, etc. **Não** vai pra IN 1888. |

Cada mudança gera **log de auditoria** com quem revisou, quando, e nota explicativa.

### 4.5 Não-casados (R$ 211k em ~6 PIX)

Os PIX que o algoritmo não consegue casar normalmente caem em uma das categorias:

1. **Sem off-ramp on-chain** (refund, customer no-show, valor de teste) → Geferson marca como `rejected`
2. **Cliente novo não cadastrado** → Geferson identifica manualmente (preenchendo cliente + CNPJ) e marca como `manual`
3. **Casos suspeitos** (valor redondo, sem precedente, etc.) → Geferson marca `needs_review` e investiga

---

## 5. IN 1888 — A Obrigação Que Justifica Tudo

### 5.1 O que é

**Instrução Normativa 1888/2019** da Receita Federal do Brasil — obriga toda pessoa jurídica que atue como **exchange ou intermediária de cripto** a declarar mensalmente todas as operações envolvendo CNPJ/CPF brasileiro.

A EFIX se enquadra como **plataforma de tokenização** sujeita à IN 1888.

### 5.2 O que tem que ir no arquivo

Cada operação declarada inclui:
- Tipo (compra / venda / transferência)
- Data
- Valor em BRL
- Valor em cripto (asset + quantidade)
- **CNPJ ou CPF do cliente final** ← este é o ponto crítico
- Endereço da carteira (origem ou destino)
- Hash on-chain
- Cotação implícita

### 5.3 Quando entrega

- **Até o último dia útil do mês seguinte**
- Janeiro → entrega até último útil de fevereiro
- Multa por atraso ou omissão:
  - R$ 100 a R$ 500 por mês de atraso (PJ)
  - **1,5% sobre o valor da operação não declarada** (multa material)

### 5.4 Formato e canal

- Arquivo TXT (em XML estruturado)
- Submissão via portal e-CAC da Receita Federal
- Geferson é o operador habilitado para isso

### 5.5 Como nosso sistema entrega

A aba 🔁 Conciliação no `efix.finance/financials/` exporta um CSV chamado **"reconciliacao_enriquecida_YYYY-MM-DD.csv"** com todas as colunas que o conversor Python (`in1888_converter.py`) precisa para gerar o TXT.

Esse CSV tem **38 campos por operação** — desde nome BTG até hash on-chain, passando por CNPJ, KYC Sumsub, status de revisão e timestamps de auditoria.

---

## 6. Cadência Operacional Mensal

### Dia 1 do mês seguinte — Geferson

1. **Exporta extrato BTG** do mês fechado (CSV via portal BTG Digital)
2. **Exporta transactions report Fireblocks** do mesmo período (CSV via Fireblocks Console)
3. Vai pra `https://efix.finance/financials/`
4. **Dropa o CSV Fireblocks** na aba 🔥 Fireblocks
5. **Dropa o CSV BTG** na aba 🏦 BTG
6. **Vai pra aba 🔁 Conciliação** — sistema carrega automaticamente Bridge + Sumsub (cache 24h)
7. **Revisa os matches automáticos** (15 linhas em mês típico)
   - Click no badge Status pra ciclar: `pending → approved` se OK
   - Shift+Click pra adicionar nota
8. **Trabalha a lista de não-casados** (6 linhas em mês típico)
   - Para cada um, decide: `[Sem FB]` / `[Manual]` / `[Revisar]`
9. **Exporta IN 1888 CSV** (botão no toolbar)
10. **Roda localmente:** `python in1888_converter.py reconciliacao_enriquecida_YYYY-MM-DD.csv`
11. **Submete o TXT gerado** no e-CAC da Receita Federal
12. **Confere recibo** e arquiva

### Tempo total: 30–45 minutos por mês

Comparado com o processo anterior (planilha manual, sem cruzamento on-chain): **~6 horas por mês**.

---

## 7. Atores e Pontos de Falha

| Ator | Função | Risco se falhar |
|---|---|---|
| **BTG Pactual** | Custódia BRL + KYC PF/PJ Brasil | Conta congelada por suspeita; impacto: bloqueio operacional |
| **Transfero Brasil Pagamentos** | PSP autorizado BCB, câmbio interno | Spread fora da banda; D+1 atraso; impacto: cotação ruim |
| **Bridge.xyz** | On/off-ramp USD/EUR + virtual accounts | Limite de volume, KYC próprio rejeita cliente; impacto: cliente foreign não consegue pagar |
| **Fireblocks** | Custódia cripto (Vault MPC) | Single point of failure para cripto; impacto crítico |
| **Sumsub (Reconcile-eFix)** | KYC PF cripto | Falso `GREEN` expõe a sanção; impacto: multa CVM + RFB |
| **Polygon / Tron** | Settlement layer cripto | Chain halt, fork; impacto: liquidação travada |
| **EFIX Plataforma de Tokenização Ltda** | Sujeito obrigado IN 1888, responsável CVM | Multa, processo administrativo, responsabilidade penal do operador |

---

## 8. Trilha de Auditoria — 7 IDs por Operação

Para qualquer operação, podemos rastrear até 7 identificadores únicos (auditor pode pedir qualquer um deles em uma fiscalização):

| # | ID | Onde mora | Quem custodia |
|---|---|---|---|
| 1 | **PIX endToEndId** (32 chars) | Extrato BTG, campo Descrição | BCB |
| 2 | **BTG linha de extrato** | CSV BTG mensal | BTG Pactual |
| 3 | **Transfero internal txid** | Sistema Transfero (consultável) | Transfero |
| 4 | **Fireblocks TxId** (UUID) | Fireblocks Console | Fireblocks |
| 5 | **Blockchain tx hash** (0x... ou TR...) | Polygonscan / Tronscan | Pública |
| 6 | **Bridge transfer ID** (se foreign) | Bridge Dashboard / API | Bridge.xyz |
| 7 | **Sumsub applicantId** (se KYC PF) | Sumsub Dashboard | Sumsub |

Cada match no nosso sistema vincula pelo menos 3 destes IDs simultaneamente. O CSV de IN 1888 carrega todos eles.

---

## 9. Reconciliação contábil — Como bate com o DRE

A aba **DRE** do mesmo `/financials/` cruza:

- **Receita Royalties** (Pagadoria EFIX) = Σ Taxa 3% × Σ operações reconciliadas
- **Banco entradas** (extrato BTG positivas, excluindo aportes)
- **Diferença** ("Diff" na tabela XREF) deve ficar abaixo de R$ 200/mês de timing → caso contrário, há operação não identificada

Hoje (mai/2026):
- Vol identif Conciliação: R$ 684.919
- Receita Royalties Mar/26 declarada: R$ 134.725
- Discrepância média: < 1% (dentro do esperado por timing)

---

## 10. Limitações Conhecidas (transparência para auditoria)

1. **PTAX hardcoded por mês** — usamos uma média mensal estática (5,10 em mai/2026). Trocar por fetch da API do BCB é melhoria v3
2. **Fuzzy match por nome falha em 1 caso recorrente:** quando o BTG mostra a **razão social** ("PL CONSULTORIA IMOBILIARIA LTDA") mas o Sumsub tem o **sócio admin** ("JEAN PIERRE LIMONGI DE FREITAS"). Solução manual: adicionar entry no lookup ligando os dois nomes
3. **Bridge enrichment dá 0/15 hoje** no slice BTG↔FB — porque os 15 clientes identificados são CNPJ doméstico e Bridge é foreign individual. Esperado, não é bug
4. **Rail 4 (foreign inbound)** ainda **não tem reconciliação automática.** As 47 deals da aba Negociações são tracked manualmente. v2 vai cruzar Bridge transfers ↔ Fireblocks inflows automaticamente
5. **Sumsub webhook pode atrasar 1-3 segundos** — a UI sempre mostra o estado do Postgres no momento, que pode estar microssegundos atrás do Sumsub real
6. **6 PIX não casados em R$ 210k** ainda dependem de inspeção manual em todo fechamento mensal — 30% do volume identificável

---

## 11. Glossário (para conversas com não-técnicos)

| Termo | Significado |
|---|---|
| **On-ramp** | Fiat (BRL/EUR/USD) → cripto |
| **Off-ramp** | Cripto → fiat |
| **PSP** | Payment Service Provider — instituição de pagamento autorizada pelo BCB |
| **PTAX** | Câmbio fechamento divulgado diariamente pelo Banco Central |
| **IOF câmbio** | Imposto sobre Operações Financeiras de câmbio (0,38% para a maioria dos casos) |
| **IN 1888** | Instrução Normativa 1888/2019 da Receita Federal — obrigação mensal cripto |
| **KYC** | Know Your Customer — verificação formal de identidade |
| **MPC** | Multi-Party Computation — tecnologia de custódia cripto sem chave única |
| **Vault** | Carteira cripto custodiada (Fireblocks) |
| **HMAC** | Hash-based Message Authentication Code — método de assinatura criptográfica para autenticar webhooks |
| **Webhook** | Mensagem HTTP automática que um sistema envia para outro quando algo acontece |
| **Tx hash** | Identificador único e público de uma transferência on-chain |
| **Polygonscan / Tronscan** | Exploradores públicos das blockchains Polygon e Tron — qualquer pessoa pode validar uma transação |
| **Stablecoin** | Cripto com valor pareado a uma moeda fiat (USDC, USDT = US$ 1,00) |
| **Confidence (high/medium/low)** | Nível de confiança que o algoritmo dá pra um match — high = aprovação direta, low = revisão obrigatória |
| **Audit log** | Registro imutável e cronológico de quem revisou o quê e quando |

---

## 12. Referências

- **Sistema operacional:** https://efix.finance/financials/
- **Repositório frontend:** github.com/Develop-ltda/efix_finance
- **Repositório proxy (intermediário Bridge + Sumsub):** github.com/Develop-ltda/efix-bridge-proxy
- **Documento de implementação técnica:** [`handoff_conciliacao/SESSION_2026-05-12.md`](./SESSION_2026-05-12.md)
- **Operador responsável:** Geferson Ecaf (EFIX Plataforma de Tokenização e Crowdfunding Ltda — CNPJ 60.756.859/0001-57)
- **Regulamentação aplicável:**
  - Instrução Normativa RFB 1.888/2019 (IN 1888)
  - CVM Resolução 88/2022 (Crowdfunding)
  - CVM Resolução 23.635/2025 (Tokenização)
  - Lei Geral de Proteção de Dados (LGPD) — em relação ao tratamento de dados Sumsub/Bridge
- **PSPs envolvidos:**
  - Transfero Brasil Pagamentos S.A. — CNPJ 31.502.183/0001-71
  - Bridge Ventures Inc. (Bridge.xyz) — US

---

*Documento de referência para a equipe de RI da Lobie. Última atualização: 13 de maio de 2026.*
*Para questões operacionais, falar com Geferson (EFIX). Para questões de produto/regulatórias, escalar para Ernesto Otero (CEO EFIX).*
