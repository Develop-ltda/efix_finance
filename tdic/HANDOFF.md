# TDIC — HANDOFF para próxima sessão

Documento de transferência detalhado dos **19 itens pendentes** para construir o
TDIC até produção real. Cada item tem: motivação, escopo, arquivos, comandos,
pegadinhas e definição de pronto.

> **Antes de começar:** leia `SESSION.md` neste mesmo diretório para o contexto
> do que já foi entregue, e confirme que os deploys estão verdes (GH Pages
> serve `efix.finance/tdic/`, Railway serve `efixdi-backend-production.up.railway.app/health`).

---

## Sprint A — Segurança e Identidade Admin

### Item 1 · Rotacionar `ADMIN_API_KEY`

**Por que.** A `ADMIN_API_KEY` atual (`hyeUBN7esKD2rIw7ENVoqPeeSQW3XHPMwiv9SWgt`)
foi exposta em transcript de chat na sessão de 2026-05-08. Qualquer pessoa com
acesso a esse transcript pode chamar endpoints `adminAuth` no efixdi-backend,
incluindo `POST /api/tdic/email/send-cr-notification` e `POST /api/admin/deposit`.

**Como.**

```powershell
# Gerar nova chave (alfanumérica, 40+ chars):
$key = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
Write-Output $key

# Setar no Railway via CLI:
cd C:\Users\ernes\efixdi-backend
railway variables --set ADMIN_API_KEY="$key"

# Reiniciar o serviço (Railway redeploya automaticamente).

# Atualizar no admin TDIC:
# - Abrir /tdic/admin/ no browser
# - DevTools console: localStorage.removeItem("tdic_admin_key")
# - Próxima vez que clicar "📧 Enviar e-mail" o prompt pede a nova key.
```

**Arquivos.** Nenhum em código — apenas env var no Railway.

**Pegadinhas.**
- A chave antiga continua válida até o redeploy completar (~30-60s).
- Se houver scripts internos usando `X-Admin-Key`, eles param até serem atualizados.
- Confirme que **nada** mais usa a chave antiga: `grep -r "hyeUBN" .` em todos os repos.

**Done quando.** Chave antiga rejeitada com 401 + chave nova funciona em
`curl -H "X-Admin-Key: $key" https://efixdi-backend-production.up.railway.app/api/admin/test-auth`.

---

### Item 2 · Auth admin TDIC com Google OAuth

**Por que.** Hoje o admin TDIC pede a `ADMIN_API_KEY` bruta via `prompt()` e salva
em `localStorage.tdic_admin_key`. Isso é ruim porque:
- Qualquer extensão de browser ou XSS lê a chave.
- A chave é compartilhada (não dá pra saber quem fez o quê).
- Não tem expiração natural.

O efixdi-backend **já tem fluxo Google OAuth completo** (`POST /api/admin/auth/google`,
linhas ~2180-2240 de `efixdi-backend-v3.js`). Basta plugar o admin TDIC nele.

**Como.**

1. Estudar como `/op/admin/` (efix_finance/op/) faz login Google — provavelmente
   carrega Google Identity Services, recebe `credential` (id_token), faz
   `POST /api/admin/auth/google { credential }` e armazena o JWT retornado.

2. Em `tdic/admin/index.html`:
   ```html
   <script src="https://accounts.google.com/gsi/client" async defer></script>
   <div id="g_id_onload"
        data-client_id="<GOOGLE_CLIENT_ID_aqui>"
        data-callback="onGoogleLogin"></div>
   <div class="g_id_signin" data-type="standard"></div>
   ```

3. Trocar `getAdminKey()` por `getAdminJwt()`:
   ```js
   function getAdminJwt() {
     const t = localStorage.getItem("tdic_admin_jwt");
     if (!t || isJwtExpired(t)) return null;
     return t;
   }
   window.onGoogleLogin = async (res) => {
     const r = await fetch(TDIC_BACKEND + "/api/admin/auth/google", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ credential: res.credential })
     });
     const data = await r.json();
     if (data.token) {
       localStorage.setItem("tdic_admin_jwt", data.token);
       // redirect pra remover ?credential e mostrar admin
       location.href = location.pathname;
     }
   };
   ```

4. No `enviarEmailTomador`, trocar `headers["X-Admin-Key"] = adminKey;` por:
   ```js
   const jwt = getAdminJwt();
   if (!jwt) { showLoginGate(); return; }
   headers["Authorization"] = "Bearer " + jwt;
   ```

5. Gate de UI: se não tem JWT válido, esconde o painel inteiro e mostra apenas
   o botão "Login com Google". Reuse `ADMIN_EMAILS` do Railway (já tem o e-mail
   do Ernesto cadastrado).

**Arquivos.**
- `tdic/admin/index.html` — adicionar Google sign-in + gate
- `tdic/admin/login.html` (NOVO opcional) — landing de login se preferir separar

**Pegadinhas.**
- O `ADMIN_EMAILS` no Railway precisa ter o e-mail de quem vai logar.
- Tokens duram 7 dias (linha 1953 de `efixdi-backend-v3.js`).
- CORS: `Authorization` header já está liberado (linha 1881).

**Done quando.** Usuário não-admin é rejeitado com banner "Acesso restrito —
faça login com sua conta @efix.finance". Admin logado vê painel cheio. Token
expirado dispara re-login automático.

---

## Sprint B — Smart Contract TDICRegistry

### Item 3 · Estrutura inicial do contrato

**Por que.** Toda a sessão atual roda em mock localStorage. Pra ter mint real
de TDIC, whitelist real, e CR como representação on-chain, precisamos do
contrato. **Esta é a Fase 1 do brief original** que nunca foi feita.

**Como.**

```powershell
mkdir C:\Users\ernes\tdic-protocol
cd C:\Users\ernes\tdic-protocol
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install @openzeppelin/contracts@5.4.0
npx hardhat init   # selecione "Create a JavaScript project"
```

`hardhat.config.js`:
```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf",
      accounts: [process.env.DEPLOYER_PK],
      chainId: 84532,
    },
    base: {
      url: "https://base-mainnet.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf",
      accounts: [process.env.DEPLOYER_PK],
      chainId: 8453,
    },
  },
  etherscan: { apiKey: "GJ81QTB1DN4IZTQDQ2BDD326MUMAWEMVYY" },
};
```

`contracts/TDICRegistry.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

contract TDICRegistry is ERC1155, AccessControl, Pausable {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant CR_ISSUER_ROLE  = keccak256("CR_ISSUER_ROLE");

    enum CRStatus { None, Draft, Approved, Active, Liquidated }

    struct CRInfo {
        address cedente;
        uint256 faceValue;
        uint256 discountBps;        // 10000 = 100%
        uint256 royaltyBps;
        uint256 abatimento;
        uint64  maturityDate;       // unix timestamp
        bytes32 devedorCNPJ;        // keccak256(cnpj)
        bytes32 documentHash;       // SHA-256 do CR PDF
        CRStatus status;
        string  metadataURI;
        bool    isPrivate;          // true = oferta privada (cedente=tomador)
    }

    mapping(uint256 tokenId => CRInfo) public crs;
    mapping(address => bool) public isWhitelisted;

    // Custom errors (gas eficiente vs require strings)
    error NotWhitelisted(address account);
    error CRNotApproved(uint256 tokenId);
    error CRAlreadyRegistered(uint256 tokenId);
    error InvalidStatus(uint256 tokenId, CRStatus expected, CRStatus actual);
    error FaceValueZero();

    // Eventos indexados
    event CRRegistered(uint256 indexed tokenId, address indexed cedente, uint256 faceValue, bytes32 indexed devedorCNPJ);
    event CRApproved(uint256 indexed tokenId, address indexed by);
    event CRMinted(uint256 indexed tokenId, address indexed to, uint256 amount);
    event CRLiquidated(uint256 indexed tokenId);
    event Whitelisted(address indexed account, bool status);

    constructor(string memory uri_, address admin) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(CR_ISSUER_ROLE, admin);
    }

    function _generateTokenId(address cedente, bytes32 devedorCNPJ, uint64 maturityDate) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(cedente, devedorCNPJ, maturityDate)));
    }

    function registerCR(
        address cedente,
        uint256 faceValue,
        uint256 discountBps,
        uint256 royaltyBps,
        uint256 abatimento,
        uint64  maturityDate,
        bytes32 devedorCNPJ,
        bytes32 documentHash,
        string calldata metadataURI,
        bool    isPrivate
    ) external onlyRole(CR_ISSUER_ROLE) whenNotPaused returns (uint256 tokenId) {
        if (faceValue == 0) revert FaceValueZero();
        tokenId = _generateTokenId(cedente, devedorCNPJ, maturityDate);
        if (crs[tokenId].status != CRStatus.None) revert CRAlreadyRegistered(tokenId);
        crs[tokenId] = CRInfo({
            cedente: cedente,
            faceValue: faceValue,
            discountBps: discountBps,
            royaltyBps: royaltyBps,
            abatimento: abatimento,
            maturityDate: maturityDate,
            devedorCNPJ: devedorCNPJ,
            documentHash: documentHash,
            status: CRStatus.Draft,
            metadataURI: metadataURI,
            isPrivate: isPrivate
        });
        emit CRRegistered(tokenId, cedente, faceValue, devedorCNPJ);
    }

    function approveCR(uint256 tokenId) external onlyRole(COMPLIANCE_ROLE) whenNotPaused {
        CRInfo storage cr = crs[tokenId];
        if (cr.status != CRStatus.Draft) revert InvalidStatus(tokenId, CRStatus.Draft, cr.status);
        cr.status = CRStatus.Approved;
        emit CRApproved(tokenId, msg.sender);
    }

    function mintCR(uint256 tokenId, address to, uint256 amount) external onlyRole(CR_ISSUER_ROLE) whenNotPaused {
        CRInfo storage cr = crs[tokenId];
        if (cr.status != CRStatus.Approved) revert CRNotApproved(tokenId);
        if (!isWhitelisted[to]) revert NotWhitelisted(to);
        cr.status = CRStatus.Active;
        _mint(to, tokenId, amount, "");
        emit CRMinted(tokenId, to, amount);
    }

    function liquidateCR(uint256 tokenId) external onlyRole(COMPLIANCE_ROLE) {
        CRInfo storage cr = crs[tokenId];
        if (cr.status != CRStatus.Active) revert InvalidStatus(tokenId, CRStatus.Active, cr.status);
        cr.status = CRStatus.Liquidated;
        // Burn de todo o supply do tokenId
        // (mais simples: queimar do holder original; pra produção, queremos
        //  iterar holders via Subgraph + script keeper, ou aceitar burn manual)
        emit CRLiquidated(tokenId);
    }

    function setWhitelist(address account, bool status) external onlyRole(COMPLIANCE_ROLE) {
        isWhitelisted[account] = status;
        emit Whitelisted(account, status);
    }

    function setWhitelistBatch(address[] calldata accounts, bool status) external onlyRole(COMPLIANCE_ROLE) {
        for (uint256 i; i < accounts.length; ++i) {
            isWhitelisted[accounts[i]] = status;
            emit Whitelisted(accounts[i], status);
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // Hook OZ v5: validar whitelist em transferências (mint, burn, transfer)
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155) whenNotPaused
    {
        // Mint (from == 0) e burn (to == 0) são permitidos pra os roles.
        // Transfer comum entre wallets exige ambos na whitelist.
        if (from != address(0) && to != address(0)) {
            if (!isWhitelisted[from]) revert NotWhitelisted(from);
            if (!isWhitelisted[to])   revert NotWhitelisted(to);
        }
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

**Pegadinhas.**
- OZ v5 mudou `_beforeTokenTransfer` para `_update`. O hook é singular para
  mint/burn/transfer.
- `keccak256` é diferente de SHA-256 (que o frontend usa via Web Crypto API).
  Padronizar: documentHash on-chain pode ser `keccak256(sha256(documentText))`
  ou só `sha256` — escolher e bater com o frontend.
- `_generateTokenId` precisa ser determinístico — se a cedente quiser cadastrar
  duas duplicatas do mesmo devedor com mesmo vencimento, vai colidir. Considere
  adicionar nonce/dupl no hash.
- `liquidateCR` está simplificado — em produção precisa queimar do holder
  efetivo (subgraph + keeper, ou aceitar burn permissionado vindo do CR_ISSUER).

**Done quando.** `npx hardhat compile` passa.

---

### Item 4 · Testes (mínimo 25 casos)

**Por que.** Brief original exige ≥ 90% de cobertura. Quebrar o contrato sai
caro em prod.

**Como.**

`test/TDICRegistry.test.js`:

```js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { keccak256, toUtf8Bytes } = ethers;

describe("TDICRegistry", function () {
  let registry, admin, compliance, issuer, cedente, investidor, outsider;
  const URI_BASE = "https://efix.finance/tdic/metadata/{id}.json";

  beforeEach(async () => {
    [admin, compliance, issuer, cedente, investidor, outsider] = await ethers.getSigners();
    const F = await ethers.getContractFactory("TDICRegistry");
    registry = await F.deploy(URI_BASE, admin.address);
    await registry.grantRole(await registry.COMPLIANCE_ROLE(), compliance.address);
    await registry.grantRole(await registry.CR_ISSUER_ROLE(), issuer.address);
  });

  describe("registerCR", () => {
    it("registra CR em status Draft e emite evento", async () => {
      await expect(registry.connect(issuer).registerCR(
        cedente.address, 100_000n * 10n**18n, 1500, 100, 0,
        Math.floor(Date.now()/1000) + 86400 * 30,
        keccak256(toUtf8Bytes("12345678000100")),
        keccak256(toUtf8Bytes("doc-hash")),
        URI_BASE, true
      )).to.emit(registry, "CRRegistered");
    });
    it("rejeita CR com faceValue zero", async () => {
      await expect(registry.connect(issuer).registerCR(
        cedente.address, 0, 1500, 100, 0,
        Math.floor(Date.now()/1000) + 86400,
        keccak256(toUtf8Bytes("12345678000100")),
        keccak256(toUtf8Bytes("h")), URI_BASE, true
      )).to.be.revertedWithCustomError(registry, "FaceValueZero");
    });
    it("rejeita registro duplicado (mesmo cedente+devedor+vencto)", async () => {
      // ... registra duas vezes com mesmos params, segunda revert
    });
    it("rejeita registro sem CR_ISSUER_ROLE", async () => { /* ... */ });
    it("respeita pause", async () => { /* ... */ });
  });

  describe("approveCR", () => {
    it("muda status Draft → Approved e emite evento", async () => { /* ... */ });
    it("rejeita aprovar CR em status diferente de Draft", async () => { /* ... */ });
    it("rejeita aprovação sem COMPLIANCE_ROLE", async () => { /* ... */ });
  });

  describe("mintCR", () => {
    it("minta CR Approved para wallet whitelistada", async () => { /* ... */ });
    it("rejeita mint para wallet fora da whitelist", async () => { /* ... */ });
    it("rejeita mint de CR não aprovado", async () => { /* ... */ });
    it("muda status Approved → Active", async () => { /* ... */ });
    it("rejeita mint sem CR_ISSUER_ROLE", async () => { /* ... */ });
  });

  describe("transfer (whitelist gate)", () => {
    it("permite transfer entre duas wallets whitelistadas", async () => { /* ... */ });
    it("bloqueia transfer se sender fora da whitelist", async () => { /* ... */ });
    it("bloqueia transfer se receiver fora da whitelist", async () => { /* ... */ });
    it("respeita pause", async () => { /* ... */ });
  });

  describe("setWhitelist", () => {
    it("adiciona e remove endereço da whitelist", async () => { /* ... */ });
    it("setWhitelistBatch funciona em N endereços", async () => { /* ... */ });
    it("rejeita sem COMPLIANCE_ROLE", async () => { /* ... */ });
  });

  describe("liquidateCR", () => {
    it("muda status Active → Liquidated", async () => { /* ... */ });
    it("rejeita liquidação de CR não Active", async () => { /* ... */ });
    it("rejeita sem COMPLIANCE_ROLE", async () => { /* ... */ });
  });

  describe("pause", () => {
    it("admin pode pausar e despausar", async () => { /* ... */ });
    it("operações principais respeitam pause", async () => { /* ... */ });
  });

  describe("roles", () => {
    it("DEFAULT_ADMIN_ROLE pode conceder/revogar outros roles", async () => { /* ... */ });
  });
});
```

**Pegadinhas.**
- `revertedWithCustomError(contract, "ErrorName")` para custom errors.
- BigInt syntax: `100_000n * 10n**18n`.
- Use `time.increase(N)` do hardhat-network-helpers para testes que dependem de tempo.

**Done quando.** `npx hardhat test` passa com 25+ casos e `npx hardhat coverage`
mostra ≥ 90%.

---

### Item 5 · Deploy Base Sepolia

**Por que.** Antes de mainnet, validar em testnet com tx real (não local).

**Como.**

`scripts/deploy.js`:
```js
const { ethers, run } = require("hardhat");

async function main() {
  const URI = "https://efix.finance/tdic/metadata/{id}.json";
  const ADMIN = "0x0AFE6E08d8e7Ebac1e6663174a2F2c663f07f589"; // signer do Lobie-Haus-Btr Safe
  const F = await ethers.getContractFactory("TDICRegistry");
  const c = await F.deploy(URI, ADMIN);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("TDICRegistry @", addr);

  // Verificar no Basescan (espera 5 blocos)
  await new Promise(r => setTimeout(r, 30000));
  await run("verify:verify", {
    address: addr,
    constructorArguments: [URI, ADMIN],
  });
}
main().catch(console.error);
```

```powershell
# Setar PK no .env (NÃO commitar):
"DEPLOYER_PK=0x..." | Out-File -FilePath .env -Encoding utf8 -Append

# Pegar ETH testnet:
# https://www.alchemy.com/faucets/base-sepolia
# https://docs.base.org/docs/tools/network-faucets/

npx hardhat run scripts/deploy.js --network baseSepolia
```

**Pegadinhas.**
- ETH na Base Sepolia é pouco — pedir em múltiplos faucets se precisar.
- Verificação no Basescan precisa ETHERSCAN_API_KEY que aceita os contratos
  com viaIR (Solidity 0.8.27 — verificar se já está suportado).

**Done quando.** Endereço deploy aparece na Basescan testnet com source code
verificado + roles concedidas (`getRoleAdmin`, `hasRole` retornam true via
read-only call).

---

### Item 6 · Configurar gas policy Base + atualizar bundle Alchemy

**Por que.** O paymaster Polygon (`7b22b464-…`) só funciona na Polygon. Mint na
Base precisa de paymaster específico, senão usuários pagam gas.

**Como.**

1. Acessar `https://dashboard.alchemy.com/gas-manager` → criar policy:
   - App: cte3livah2bhnfwx (já existe)
   - Chain: Base mainnet (e Base Sepolia para testes)
   - Allowlist de contratos: TDICRegistry endereço
   - Spending limit: começa baixo (R$ 500/mês equivalente em ETH)

2. Copiar o **policyId** retornado.

3. Atualizar `efix_finance/app/wallet/efix-wallet-sdk.js`:
   ```js
   const EFIX_CONFIG = {
     apiKey: "5QrXWREEtmi4gITNoJsJf",
     gasPolicyId: "7b22b464-…",          // Polygon (efixDI)
     gasPolicyIdBase: "BASE_POLICY_ID",  // Base TDIC ← preencher
     chain: polygon,
     ...
   };
   ```

4. Função `getBaseClient()` deve usar `gasPolicyIdBase` ao instanciar o
   `createSmartWalletClient` para Base.

5. Re-bundlar:
   ```powershell
   cd C:\Users\ernes\efix_finance\app\wallet
   npm install
   node build.js   # ou comando do package.json
   ```

6. Verificar `efix-wallet-bundle.js` gerado tem o novo policy id.

**Pegadinhas.**
- Spending limit baixo demais bloqueia produção; alto demais expõe a risk.
- Considere allowlist de funções específicas (só `mintCR`) em vez de qualquer
  função do contrato.

**Done quando.** Mint na Base Sepolia executa via smart wallet sem o user
pagar gas (gas total que aparece é 0 ETH na pré-confirmação).

---

## Sprint C — Backend Real

### Item 7 · Migrações Postgres

**Por que.** Hoje admin TDIC só persiste em localStorage do browser. Pra ter
visão global, KYBs persistentes, auditoria — precisa Postgres.

**Esquema sugerido** (Postgres no Railway, mesmo cluster do efixdi-backend):

```sql
-- Migration 001: cedentes
CREATE TABLE tdic_cedentes (
  id              BIGSERIAL PRIMARY KEY,
  wallet_address  TEXT UNIQUE NOT NULL,
  cnpj            TEXT NOT NULL,
  razao_social    TEXT NOT NULL,
  regime_tributario TEXT DEFAULT 'lucro-real',
  contato         JSONB,            -- { nome, cargo, email, tel, faturamento }
  docs            JSONB,            -- [{ key, name, uploadedAt }]
  bank_account    JSONB,            -- { pix: {...}, bank: {...}, ownership: '...' }
  kyb_status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  approved_by     TEXT,
  CONSTRAINT kyb_status_chk CHECK (kyb_status IN ('pending','approved','rejected'))
);
CREATE INDEX idx_tdic_cedentes_wallet ON tdic_cedentes(wallet_address);
CREATE INDEX idx_tdic_cedentes_kyb_status ON tdic_cedentes(kyb_status);

-- Migration 002: signatures (snapshot imutável)
CREATE TABLE tdic_signatures (
  id              BIGSERIAL PRIMARY KEY,
  cedente_id      BIGINT NOT NULL REFERENCES tdic_cedentes(id),
  contract_version TEXT NOT NULL,           -- e.g. "3.0.0"
  contract_title  TEXT NOT NULL,
  document_text   TEXT NOT NULL,            -- snapshot canônico do texto
  document_hash   TEXT NOT NULL,            -- SHA-256 (hex)
  signatory_name  TEXT NOT NULL,
  signatory_cpf   TEXT NOT NULL,
  signatory_email TEXT,
  provider        TEXT NOT NULL DEFAULT 'none',  -- none | clicksign | d4sign | docusign
  envelope_id     TEXT,                     -- ID retornado pelo provider
  ca_timestamp    TIMESTAMPTZ,              -- RFC 3161 da CA
  user_agent      TEXT,
  ip_address      INET,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tdic_signatures_cedente ON tdic_signatures(cedente_id);
CREATE INDEX idx_tdic_signatures_hash ON tdic_signatures(document_hash);

-- Migration 003: creditos
CREATE TABLE tdic_creditos (
  id              BIGSERIAL PRIMARY KEY,
  cedente_id      BIGINT NOT NULL REFERENCES tdic_cedentes(id),
  devedor_cnpj    TEXT NOT NULL,
  devedor_razao_social TEXT NOT NULL,
  devedor_contato JSONB,
  tipo            TEXT NOT NULL,         -- confissao-divida | duplicata | ...
  dupl            TEXT,                  -- duplicata ou identificador
  chave_nf        TEXT,
  face_value      NUMERIC(18,2) NOT NULL,
  maturity_date   DATE NOT NULL,
  discount_bps    INT NOT NULL DEFAULT 0,
  discount_brl    NUMERIC(18,2),
  discount_inputs JSONB,                 -- { pctMonthly, brlFlat, pctEffective }
  net_value       NUMERIC(18,2),
  prazo_dias      INT,
  abatimento      NUMERIC(18,2) DEFAULT 0,
  origem          TEXT NOT NULL DEFAULT 'manual',  -- manual | import-planilha | import-pdf
  docs            JSONB,
  status          TEXT NOT NULL DEFAULT 'em-analise',
  cr_id           BIGINT REFERENCES tdic_crs(id) DEFERRABLE INITIALLY DEFERRED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tdic_creditos_cedente_status ON tdic_creditos(cedente_id, status);

-- Migration 004: crs
CREATE TABLE tdic_crs (
  id              BIGSERIAL PRIMARY KEY,
  credito_id      BIGINT NOT NULL REFERENCES tdic_creditos(id),
  token_id        TEXT UNIQUE NOT NULL,  -- hex string do uint256 (do contrato)
  cedente_wallet  TEXT NOT NULL,
  face_value      NUMERIC(18,2) NOT NULL,
  discount_bps    INT NOT NULL,
  discount_brl    NUMERIC(18,2),
  royalty_bps     INT DEFAULT 0,
  royalty_brl     NUMERIC(18,2) DEFAULT 0,
  abatimento      NUMERIC(18,2) DEFAULT 0,
  net_value       NUMERIC(18,2),
  maturity_date   DATE NOT NULL,
  issuance_type   TEXT NOT NULL,         -- private | public | venda-direta
  tomador_wallet  TEXT,
  subscription_status TEXT,              -- pending-payment | paid | open | n/a
  subscription_link   TEXT,
  subscription_amount NUMERIC(18,2),
  suggested       JSONB,                 -- params sugeridos pela cedente
  arbitrated      JSONB,                 -- params arbitrados pela EFIX
  status          TEXT NOT NULL DEFAULT 'approved',
  mint_tx_hash    TEXT,
  mint_block      BIGINT,
  minted_at       TIMESTAMPTZ,
  notified_at     TIMESTAMPTZ,
  liquidated_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tdic_email_log já existe (criada em runtime pelo endpoint atual)
```

**Como.**

1. Adicionar Knex ou node-postgres migrations no `efixdi-backend`. Se já tem
   alguma estrutura de migrations (verificar `efixdi-backend/migrations/` ou
   similar), usar. Senão, scripts SQL simples + `psql`.

2. `railway run psql` (ou `railway connect Postgres`) para executar.

**Pegadinhas.**
- `cr_id` em `tdic_creditos` referencia `tdic_crs(id)` mas a tabela é criada
  depois — use FK deferrable ou inverta a ordem.
- JSONB é mais flexível que JSON puro (suporta GIN index).
- Sempre criar `created_at` para auditoria.

**Done quando.** `\dt tdic_*` no psql lista 5 tabelas (cedentes, signatures,
creditos, crs, email_log).

---

### Item 8 · Endpoints REST `tdic-*` no efixdi-backend

**Por que.** Substituir cada chamada `TdicMock.*` no frontend por chamada HTTP.

**Como.** Adicionar em `efixdi-backend-v3.js` (depois do bloco de TDIC email
notification que já existe). Padrão:

```js
// ── CEDENTE / KYB ────────────────────────────────────────────────
app.post("/api/tdic/cedente/kyb", userAuth, async (req, res) => {
  const { cnpj, razaoSocial, contato, docs, bankAccount, signedContract } = req.body;
  // userAuth atribui req.user.address (smart wallet do cedente)
  const r = await pgPool.query(
    `INSERT INTO tdic_cedentes (wallet_address, cnpj, razao_social, contato, docs, bank_account, kyb_status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     ON CONFLICT (wallet_address) DO UPDATE SET
       cnpj=$2, razao_social=$3, contato=$4, docs=$5, bank_account=$6,
       kyb_status='pending', submitted_at=NOW()
     RETURNING *`,
    [req.user.address, cnpj, razaoSocial, contato, docs, bankAccount]
  );
  if (signedContract) {
    await pgPool.query(
      `INSERT INTO tdic_signatures (cedente_id, contract_version, contract_title, document_text, document_hash,
                                    signatory_name, signatory_cpf, signatory_email, provider, envelope_id,
                                    user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [r.rows[0].id, signedContract.version, signedContract.title, signedContract.documentText,
       signedContract.documentHash, signedContract.signatory.name, signedContract.signatory.cpf,
       signedContract.signatory.email, signedContract.provider, signedContract.envelopeId,
       req.headers["user-agent"], req.ip]
    );
  }
  res.json({ ok: true, cedente: r.rows[0] });
});

app.get("/api/tdic/cedente/me", userAuth, async (req, res) => {
  const r = await pgPool.query(
    `SELECT * FROM tdic_cedentes WHERE wallet_address = $1`,
    [req.user.address]
  );
  res.json(r.rows[0] || null);
});

app.post("/api/tdic/admin/cedente/:id/approve-kyb", adminAuth, async (req, res) => {
  const r = await pgPool.query(
    `UPDATE tdic_cedentes
     SET kyb_status = 'approved', approved_at = NOW(), approved_by = $2
     WHERE id = $1 RETURNING *`,
    [req.params.id, req.adminEmail]
  );
  // Sprint D: também chamar TDICRegistry.setWhitelist(wallet, true) on-chain
  res.json(r.rows[0]);
});

app.get("/api/tdic/admin/cedentes", adminAuth, async (req, res) => {
  const status = req.query.status || null;
  const sql = status
    ? `SELECT * FROM tdic_cedentes WHERE kyb_status = $1 ORDER BY submitted_at DESC`
    : `SELECT * FROM tdic_cedentes ORDER BY submitted_at DESC`;
  const r = await pgPool.query(sql, status ? [status] : []);
  res.json(r.rows);
});

// ── CRÉDITOS ────────────────────────────────────────────────
app.post("/api/tdic/credito", userAuth, async (req, res) => { /* ... */ });
app.post("/api/tdic/credito/batch", userAuth, async (req, res) => { /* import planilha */ });
app.get("/api/tdic/credito/me", userAuth, async (req, res) => { /* lista do cedente */ });

// ── CR (admin) ────────────────────────────────────────────────
app.post("/api/tdic/cr/aprovar", adminAuth, async (req, res) => {
  // Aceita { creditoId, overrides: { discountMonthlyPct, royaltyPct, abatimento, issuanceType, ... } }
  // Insere em tdic_crs com status='approved'
  // Sprint D: também chamar TDICRegistry.registerCR + approveCR on-chain
});

app.post("/api/tdic/cr/mint", adminAuth, async (req, res) => {
  // Sprint D: chamar TDICRegistry.mintCR(tokenId, cedenteWallet, faceValue)
  // Atualizar tdic_crs.mint_tx_hash, mint_block, minted_at, status='active'
});

app.post("/api/tdic/cr/liquidar-venda-direta", adminAuth, async (req, res) => { /* ... */ });
```

**Frontend (app.js):** criar `tdicApi.cedente.kyb(...)` etc, e o `TdicMock`
vira `if (USE_REAL_BACKEND) tdicApi.* else mockApi.*`. Flag por ENV ou
querystring (`?backend=real`).

**Pegadinhas.**
- `userAuth` middleware precisa validar JWT do user (já existe em `signUserJWT`).
- CORS já está permissivo para efix.finance.
- Não use `INSERT INTO ... RETURNING *` em queries muito grandes; pode estourar.

**Done quando.** Curls com Bearer JWT criam cedente, lê de volta, aprova, e
o estado bate com o que aparece no admin TDIC.

---

### Item 9 · Frontend `tdic-api.js` (substitui mock)

**Como.** Criar `tdic/tdic-api.js` análogo ao `tdic-mock.js`, mas usando
`fetch()` com `Authorization: Bearer <JWT>`. Manter a **mesma interface**
(`getCedente`, `submitKyb`, etc) — basta trocar a fonte no `index.html`:

```html
<!-- Trocar -->
<script src="/tdic/tdic-mock.js"></script>
<!-- Por -->
<script src="/tdic/tdic-api.js"></script>
```

Adicionar feature flag pra alternar pelo querystring `?backend=mock` em dev.

**Done quando.** Tab "Meus créditos" do cedente lista direto do Postgres,
admin vê os mesmos dados sem precisar de localStorage.

---

## Sprint D — Mint Real On-Chain

### Item 10 · Bridge admin → TDICRegistry

**Por que.** Hoje "Mintar token" no admin gera tx hash mock. Precisa chamar
o contrato real.

**Como.**

1. Backend tem a chave de operador (`OPERATOR_PK` no Railway). Reusar.

2. Em `efixdi-backend-v3.js`, adicionar:
   ```js
   const { ethers } = require("ethers");
   const TDIC_REGISTRY_ADDR = "0x..."; // do deploy Sprint B
   const TDIC_ABI = [
     "function registerCR(address,uint256,uint256,uint256,uint256,uint64,bytes32,bytes32,string,bool) returns (uint256)",
     "function approveCR(uint256)",
     "function mintCR(uint256,address,uint256)",
     "function setWhitelist(address,bool)",
     "event CRMinted(uint256 indexed,address indexed,uint256)"
   ];
   const baseProvider = new ethers.JsonRpcProvider(process.env.ALCHEMY_BASE_RPC);
   const operatorWallet = new ethers.Wallet(process.env.OPERATOR_PK, baseProvider);
   const tdicRegistry = new ethers.Contract(TDIC_REGISTRY_ADDR, TDIC_ABI, operatorWallet);
   ```

3. No `POST /api/tdic/cr/mint`:
   ```js
   const tx = await tdicRegistry.mintCR(tokenId, cedenteWallet, faceValueWei);
   const receipt = await tx.wait();
   await pgPool.query(
     `UPDATE tdic_crs SET mint_tx_hash=$1, mint_block=$2, minted_at=NOW(), status='active' WHERE id=$3`,
     [receipt.hash, receipt.blockNumber, crId]
   );
   res.json({ txHash: receipt.hash, block: receipt.blockNumber });
   ```

4. No KYB approve, chamar `setWhitelist(wallet, true)`.

**Pegadinhas.**
- Operador precisa ter `CR_ISSUER_ROLE` no contrato (granted no deploy).
- Confirmar saldo de ETH no operator na Base (ou via paymaster).
- Nonce manager: se duas chamadas concorrentes, usar `nonceManager` do ethers.

**Done quando.** `mintCR` no admin gera tx real, aparece na Basescan, e o
balance do tokenId na wallet do cedente atualiza pelo subgraph (ou consulta
direta `balanceOf(wallet, tokenId)`).

---

### Item 11 · Whitelist on-chain no KYB approve

**Por que.** Sem isso, transfer dos tokens vai reverter (cláusula `whenNotPaused
&& isWhitelisted`). E a cedente precisa estar listada para receber o mint.

**Como.** Já descrito acima (item 8 + item 10). Padronizar:

```js
// No /api/tdic/admin/cedente/:id/approve-kyb
await pgPool.query(`UPDATE tdic_cedentes SET kyb_status='approved' ...`);
try {
  const tx = await tdicRegistry.setWhitelist(walletAddress, true);
  await tx.wait();
  await pgPool.query(
    `UPDATE tdic_cedentes SET whitelist_tx_hash=$1, whitelisted_at=NOW() WHERE id=$2`,
    [tx.hash, cedenteId]
  );
} catch (e) {
  // Whitelist on-chain falhou — KYB já aprovado off-chain.
  // Log e permitir retry via UI admin.
  log.error("whitelist on-chain failed", { cedenteId, error: e.message });
}
```

**Done quando.** Admin aprova KYB → `isWhitelisted(walletAddress)` retorna
`true` no Basescan.

---

## Sprint E — Pagamento Real (PIX dinâmico)

### Item 12 · PIX dinâmico via HausBank

**Por que.** `/tdic/pay/?cr=X` hoje só mostra QR code mock estilizado. Em
produção, cada CR privado tem um PIX único com identificador que liquida
imediatamente.

**Como.**

1. HausBank API: já está integrada no `efixdi-backend` (procurar `hausbank.*`
   em `efixdi-backend-v3.js`). Reusar o cliente.

2. Novo endpoint:
   ```js
   app.post("/api/tdic/pay/create-pix", userAuth, async (req, res) => {
     const { crId } = req.body;
     const cr = await pgPool.query(`SELECT * FROM tdic_crs WHERE id=$1`, [crId]).then(r => r.rows[0]);
     if (!cr) return res.status(404).json({ error: "CR not found" });
     const txid = `TDIC-${cr.id}-${Date.now().toString(36)}`;
     const pix = await hausbank.criarPIXCobrancaDinamica({
       valor: cr.subscription_amount,
       txid,
       descricao: `Subscrição CR ${cr.token_id.slice(0,10)}`,
       expiracao: 3600,
     });
     // pix = { emv, qrcode_base64, txid, expires_at, location_url }
     await pgPool.query(
       `UPDATE tdic_crs SET pix_txid=$1, pix_emv=$2, pix_expires_at=$3 WHERE id=$4`,
       [txid, pix.emv, pix.expires_at, crId]
     );
     res.json(pix);
   });
   ```

3. Frontend `/tdic/pay/index.html`: em `load()` chamar esse endpoint e
   substituir o SVG mock pelo `qrcode_base64` retornado.

4. Webhook (item 13).

**Pegadinhas.**
- HausBank tem limite por valor de transação e por dia. Confirmar para
  CRs > R$ 100k.
- Beneficiário: precisa ser EFIX Securitizadora S.A. — confirmar conta cadastrada
  no HausBank.

**Done quando.** Abrir `/tdic/pay/?cr=ID` mostra QR PIX real escaneável que
liquida na conta da EFIX em produção.

---

### Item 13 · Webhook de conciliação → auto-mint

**Por que.** Quando o PIX cai, queremos mintar o TDIC automaticamente sem
intervenção manual.

**Como.** HausBank manda webhook `POST /webhook/hausbank/pix-recebido`
(verificar endpoint exato no integration pattern já existente no efixdi-backend).

```js
app.post("/webhook/hausbank/pix-recebido", async (req, res) => {
  // Assinatura HMAC do webhook (HausBank manda)
  if (!verifyHausbankSignature(req)) return res.status(401).end();

  const { txid, valor, e2eId, paidAt } = req.body;
  const cr = await pgPool.query(`SELECT * FROM tdic_crs WHERE pix_txid=$1`, [txid]).then(r => r.rows[0]);
  if (!cr) return res.status(404).end();

  // 1. Marca subscrição paga
  await pgPool.query(
    `UPDATE tdic_crs SET subscription_status='paid', paid_at=$1, e2e_id=$2 WHERE id=$3`,
    [paidAt, e2eId, cr.id]
  );

  // 2. Dispara mint on-chain
  try {
    const tx = await tdicRegistry.mintCR(cr.token_id, cr.cedente_wallet, cr.face_value);
    const receipt = await tx.wait();
    await pgPool.query(
      `UPDATE tdic_crs SET mint_tx_hash=$1, mint_block=$2, minted_at=NOW(), status='active' WHERE id=$3`,
      [receipt.hash, receipt.blockNumber, cr.id]
    );
  } catch (e) {
    // Mint falhou (gas? whitelist? role?). Webhook responde 200 (pra HausBank
    // não retry) e admin recebe alerta pra mintar manual.
    notifyAdmin("Mint pós-PIX falhou", { crId: cr.id, error: e.message });
  }

  res.json({ ok: true });
});
```

**Pegadinhas.**
- HausBank pode retentar webhook. Idempotência: cheque `cr.subscription_status`
  antes de processar.
- Em testnet, simular webhook com curl manual.

**Done quando.** PIX caindo dispara mint sem intervenção manual e o token TDIC
aparece na wallet do cedente em ~30s.

---

## Sprint F — Assinatura Qualificada Real

### Item 14 · Integração Clicksign

**Por que.** Hoje a assinatura é "aceitação eletrônica" simples (checkbox +
nome + CPF + hash SHA-256). Para operações grandes (>R$ 5M, lucro real),
recomenda-se assinatura **qualificada** (ICP-Brasil) via Clicksign ou similar.

A abstração já existe (`sign-providers.js` com `none`, `clicksign`, `d4sign`,
`docusign`) mas todos os providers reais estão em modo mock-redirect.

**Como.**

1. Criar conta Clicksign Developer: https://www.clicksign.com/developers
2. Pegar API key sandbox.
3. Documentação: https://developers.clicksign.com/reference/

4. Endpoints backend novos:
   ```js
   // POST /api/tdic/sign/clicksign/envelopes
   //   body: { cedenteId, contractHtml }
   //   chama Clicksign POST /api/v1/documents para criar documento
   //   cria signatário POST /api/v1/signers
   //   liga: POST /api/v1/lists (signer + document)
   //   pega signing_url
   //   salva em tdic_signatures.envelope_id (status='sent')

   // POST /webhook/clicksign
   //   recebe event "auto_close" (todos assinaram)
   //   pega bundle final (PDF + CMS PKCS#7)
   //   salva em S3 / file storage
   //   atualiza tdic_signatures.signed_at, ca_timestamp, document_hash final
   ```

5. Frontend (`sign-providers.js` já tem o esqueleto):
   - Substituir `openMockRedirect()` por redirect real para `clicksign.com/sign/<envelope_id>`
   - Após assinatura, Clicksign redireciona de volta com query param
   - App valida via webhook backend (não pode confiar só no redirect)

**Pegadinhas.**
- Clicksign sandbox usa e-mails de teste — não envia real.
- ICP-Brasil exige certificado e-CPF do signatário. Sem certificado, vira
  "assinatura eletrônica avançada" (também válida juridicamente, só sem
  presunção de validade do art. 219 CC).
- Webhook precisa de IP fixo ou autenticação HMAC.

**Done quando.** Cedente clica "Assinar" no KYB → redirect Clicksign → assina
→ webhook recebe → backend marca signedContract com envelope real + hash da
CA → admin vê "assinado via Clicksign" no painel.

---

### Item 15 · Notarização on-chain do hash do contrato

**Por que.** Prova de existência permanente e auditável. Mesmo se Clicksign
sumir ou a EFIX for adquirida, o hash on-chain prova a versão do contrato
que aquele cedente aceitou.

**Como.**

1. Contrato simples `TDICContractRegistry.sol`:
   ```solidity
   contract TDICContractRegistry {
       event ContractSigned(address indexed cedente, bytes32 indexed documentHash, string version, uint256 timestamp);
       mapping(address => bytes32[]) public signatures;
       function notarize(address cedente, bytes32 documentHash, string calldata version) external onlyRole(NOTARY) {
           signatures[cedente].push(documentHash);
           emit ContractSigned(cedente, documentHash, version, block.timestamp);
       }
   }
   ```

2. Após signedContract salvar em Postgres, backend chama
   `tdicContractRegistry.notarize(cedenteWallet, documentHash, version)`.

3. Custo Base: ~$0.005/tx. Cabível.

**Done quando.** Hash aparece on-chain em evento `ContractSigned`, e admin
pode verificar via Basescan a qualquer momento.

---

## Sprint G — Features Restantes

### Item 16 · Aba "E-mails enviados" no admin

**Por que.** Auditoria. Hoje os e-mails ficam em `tdic_email_log` mas não há
UI pra ver. Útil pra "será que o cedente recebeu?" e "qual versão do CR foi enviada?".

**Como.**

```js
// GET /api/tdic/admin/emails
app.get("/api/tdic/admin/emails", adminAuth, async (req, res) => {
  const r = await pgPool.query(
    `SELECT * FROM tdic_email_log ORDER BY sent_at DESC LIMIT 200`
  );
  res.json(r.rows);
});
```

UI: nova tab "E-mails" no `/tdic/admin/` com tabela: data, para, assunto,
modalidade, link de subscrição, message_id, admin_email que disparou. Filtros
por status (enviado / falhou) e período.

**Done quando.** Tab "E-mails" lista todos os disparos, com search/filtro.

---

### Item 17 · Página `/tdic/offer/` (CRs públicos)

**Por que.** No fluxo de oferta pública (CVM 88 crowdfunding), investidores
externos precisam ver os CRs disponíveis e subscrever.

**Como.**

1. Endpoint público (sem auth):
   ```js
   GET /api/tdic/offers/public
     → lista CRs com issuance_type='public' AND status='approved' AND subscription_status='open'
   ```

2. Página `/tdic/offer/index.html`: lista CRs com card por oferta
   (cedente, devedor, face value, deságio, yield equivalente, vencimento, "Subscrever").

3. Botão "Subscrever" → KYB de investidor (separado do KYB de cedente) → pagamento.

4. Limites CVM 88 (R$ 15MM por oferta · R$ 35MM por emissora/ano · investidor
   varejo até R$ 20k/ano fora alvo restrito).

**Done quando.** `/tdic/offer/` mostra CRs públicos com botão "Subscrever"
funcional.

---

### Item 18 · i18n PT-BR + EN no app/admin

**Por que.** Landing já tem (com seletor de idioma). App cedente e admin
não têm — string hardcoded em PT. Para investidores estrangeiros (oferta
pública, item 17) e clientes multinacional, EN é necessário.

**Como.**

1. Extrair todas as strings hardcoded para `tdic/app/i18n/pt-br.json` e `en.json`.
2. Marcar elementos HTML com `data-i18n="key.path"`.
3. JS:
   ```js
   async function loadI18n(lang) {
     const r = await fetch(`/tdic/app/i18n/${lang}.json`);
     const t = await r.json();
     document.querySelectorAll("[data-i18n]").forEach(el => {
       el.textContent = getPath(t, el.dataset.i18n);
     });
   }
   ```
4. Seletor de idioma no header (reusar `/shared/css/lang-selector.css`).

**Pegadinhas.**
- Datas e moedas: `Intl.DateTimeFormat` e `Intl.NumberFormat` com locale dinâmico.
- Não traduzir termos jurídicos brasileiros (CVM, CNPJ, IRPJ) — manter em PT
  mesmo na versão EN, com explicação curta.

**Done quando.** Seletor de idioma no `/tdic/app/` e `/tdic/admin/` troca
todas as strings + datas + moedas.

---

### Item 19 · Mais slugs em `cedentes.json` (white-label real)

**Por que.** Hoje `cedentes.json` só tem `default` (tema EFIX neutro). O
diferencial white-label é vender pra cedentes terem seu portal customizado.

**Como.**

```json
{
  "default": { ... },
  "siderquimica": {
    "displayName": "Siderquímica TDIC",
    "shortName": "Siderquímica",
    "tagline": "Tokenização de créditos a receber",
    "logo": "/tdic/assets/logo-siderquimica.svg",
    "logoMark": "SQ",
    "primary": "#0066B3",
    "primaryDark": "#004A82",
    "secondary": "#0a0a0a",
    "accent": "#00A6D6",
    "supportEmail": "tdic@siderquimica.com.br",
    "siteName": "Siderquímica",
    "siteUrl": "https://siderquimica.com.br",
    "issuer": { ... mesmo da default ... }
  },
  "c2log": { /* C2LOG Transportes — outro tema */ }
}
```

Subir os logos correspondentes em `tdic/assets/logo-<slug>.svg`.

**Pegadinhas.**
- O issuer (EFIX) é sempre o mesmo — só o branding muda. Não confundir
  cedente (cliente) com issuer (EFIX).
- White-label não é multi-tenant — o backend e o contrato são compartilhados.
  É só visual.
- Considere subdomínio: `siderquimica.efix.finance/tdic/` em vez de
  `efix.finance/tdic/?c=siderquimica` (precisaria de CDN com wildcard).

**Done quando.** `efix.finance/tdic/?c=siderquimica` mostra logo, cores e
nome da Siderquímica em landing + app + admin.

---

## Não-funcionais / Polimento

### Item 18.5 (extra) · Smoke test E2E

Criar `tdic/test/e2e.spec.js` (Playwright ou Cypress) que executa:

1. Visita `/tdic/?c=default` — landing carrega
2. Visita `/tdic/app/` — form de login
3. Login com OTP (mock provider em test mode)
4. Submete KYB completo (CNPJ, contato, banco, contrato)
5. Cadastra crédito manual
6. Importa planilha mock
7. Admin: aprova KYB, arbitra CR, aprova, envia e-mail, minta token
8. Cedente vê pílula + token mintado

CI: rodar em PR via GitHub Actions.

### Item 19.5 (extra) · Cache-busting automatizado

Hoje incrementamos `?v=20260508l` manualmente. Solução: usar hash do commit:

```html
<script src="./app.js?v=__COMMIT_HASH__"></script>
```

Build step (mesmo que seja um pre-commit hook):
```bash
COMMIT=$(git rev-parse --short HEAD)
sed -i "s/__COMMIT_HASH__/$COMMIT/g" tdic/app/index.html tdic/admin/index.html ...
```

Ou usar Service Worker com `cache: 'no-cache'` para scripts críticos.

---

## Apêndice A · Credenciais e endpoints conhecidos

### Railway (efixdi-backend)
- URL: https://efixdi-backend-production.up.railway.app
- Project: `abundant-love` · Environment: `production`
- CLI logado como: `ernesto.otero@ggpurbanismo.com.br`
- Comando: `cd C:\Users\ernes\efixdi-backend && railway variables --kv`

### Alchemy
- App ID: `cte3livah2bhnfwx`
- API key: `5QrXWREEtmi4gITNoJsJf`
- RPC Polygon: `https://polygon-mainnet.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf`
- RPC Base: `https://base-mainnet.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf`
- RPC Base Sepolia: `https://base-sepolia.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf`
- Gas policy Polygon: `7b22b464-38cd-4e6f-bccb-00f1280ac14c`
- Gas policy Base: **a criar (item 6)**

### Basescan
- API key: `GJ81QTB1DN4IZTQDQ2BDD326MUMAWEMVYY`

### Deployer wallet
- Endereço: `0x0AFE6E08d8e7Ebac1e6663174a2F2c663f07f589`
- (signer do Lobie-Haus-Btr Safe — pedir PK ao Ernesto antes do deploy)

### Contratos do efixDI (referência arquitetural)
- **EfixDIToken (Polygon)**: `0x04082b283818D9d0dd9Ee8742892eEe5CC396441` — IMMUTABLE, no proxy
- **EfixDITokenBase (Base)**: `0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608`
- **Morpho Blue (Base)**: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`

---

## Apêndice B · Convenções de código (não mudar)

- **Solidity:** 0.8.27, OZ 5.4.0, `viaIR: true`, `evmVersion: cancun`,
  optimizer 200 runs, **pragma fixo**, **custom errors**, **eventos indexados**,
  named imports (`import { ERC1155 } from "@openzeppelin/..."`).
- **Frontend:** Vanilla JS (sem React UMD), Syne + Space Mono, `#22c55e` verde,
  `#0a0a0a` preto. Scripts com cache-bust `?v=<date>`.
- **Backend:** Node.js, ethers v6, express. Logs prefixados (`[admin]`, `[tdic]`).
  Sem `--no-verify` em git push.
- **Commits:** Português ou inglês, sem prefixo "feat:", dois-pontos pra escopo
  (`tdic/admin: ...`). Mensagem em corpo HEREDOC. Co-Authored-By Claude.
- **Branch:** apenas `main`. GH Pages auto-deploy. Railway auto-deploy.

---

## Apêndice C · "Watch out for" (armadilhas conhecidas)

- **EfixDIToken é IMUTÁVEL** — sem proxy, sem upgrade. Todas as correções via
  contracts companion. **Aplica o mesmo a TDICRegistry** se você não usar UUPS
  proxy: pense bem antes de deployar.
- **TVL = totalSupply** apenas na chain de emissão. Para TDIC, o supply
  reflete face value cedido — não confunda com NAV de fundo.
- **Oracle scaling** para Morpho usa V1 com `1e24`, NOT `1e36`. Não aplica
  para TDIC ainda (não tem oracle plugado), mas se for tokenizar TDIC em
  pools, prestar atenção.
- **Operator wallet exposed** (`0x9eFc...`) — rotacionar antes de produção
  com TDIC. Atualmente o backend usa essa mesma chave; precisamos de uma key
  dedicada pra mint TDIC com role restrito.
- **`efix.finance` é SPA principal** — não bagunçar a estrutura geral. O
  TDIC vive em sub-pasta `/tdic/` isolada.
- **Cache do GH Pages** demora 30-60s. Sempre validar com hard refresh.
- **localStorage** é por origin (efix.finance), não por path. Limpar tudo
  derruba também as sessões do efixDI, BRLE, etc.

---

> Fim do handoff. Boa sorte! 🚀
