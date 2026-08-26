// entry-privy.js — bundle v4 da wallet EFIX (POC, branch poc-privy-signer)
//
// Arquitetura (25/08/2026, sessão 18c7bb8f):
//   auth+chaves : Privy @privy-io/js-sdk-core (email OTP whitelabel; embedded
//                 wallet em iframe; chave no enclave da Privy — Shamir 2-shares)
//   conta+envio : @alchemy/wallet-apis createSmartWalletClient (sucessor
//                 oficial do Account Kit) — MESMO bundler, MESMO Gas Manager
//                 policyId de hoje.
//   tipo de conta: ERC-4337 LightAccount v2 ("la-v2") para usuário novo.
//                 EIP-7702 fica de fora POR ORA: o js-sdk-core não expõe
//                 signAuthorization (verificado no d.ts 0.72.0) e o opt-out
//                 4337 é o caminho documentado pela Alchemy p/ signer sem
//                 authorization. Efeito colateral desejado: frota uniforme
//                 com os holders legados (LightAccount v2 + MAv2), e o
//                 accountKind() por slot ERC-1967 continua a valer.
//
// Contrato: window.EfixWallet mantém a superfície do bundle v3 (12 métodos) —
// index.html/classic.html/lobie não precisam mudar. Novidades: version,
// signerBackend, getSmartAccountAddress(). getClient() devolve um SHIM com a
// superfície antiga (sendUserOperation/waitForUserOperationTransaction)
// mapeada para sendCalls/waitForCallsStatus.

import Privy, {
  LocalStorage,
  getUserEmbeddedEthereumWallet,
  getEntropyDetailsFromUser,
} from "@privy-io/js-sdk-core";
import { createSmartWalletClient, alchemyWalletTransport } from "@alchemy/wallet-apis";
import { createWalletClient, custom } from "viem";
import { base } from "viem/chains";

const EFIX_CONFIG = {
  // Mesmos app/policy da Alchemy de hoje — a policy do Gas Manager está
  // linkada a este app, exigência única do wallet-apis p/ patrocínio.
  apiKey: "5QrXWREEtmi4gITNoJsJf",
  gasPolicyId: "7b22b464-38cd-4e6f-bccb-00f1280ac14c",
  privyAppId: "cmt9d5gte00mf0bl8qlpm0dkm",
  chain: base,
  contracts: {
    efixDI: "0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608",
    morphoVault: "0xf4A3FaDcEf350B2F168F97Cdbaa2221FF29ACBd5",
  },
};

// ── estado do módulo ────────────────────────────────────────
let _privy = null;          // Privy client (js-sdk-core)
let _initPromise = null;    // initialize() é async e única
let _iframe = null;         // iframe do embedded wallet
let _onMessage = null;      // listener p/ teardown
let _user = null;           // AuthenticatedUser corrente
let _provider = null;       // EIP-1193 da embedded wallet
let _eoa = null;            // endereço do signer (owner)
let _swc = null;            // SmartWalletClient (wallet-apis)
let _sca = null;            // smart account (LightAccount v2) do usuário
let _pendingEmail = null;   // email entre sendOTP e verifyOTP
const _pendingCalls = new Map(); // shim: id de sendCalls → true

const PENDING_EMAIL_KEY = "efix_privy_pending_email";

// ── init: Privy client + iframe do enclave ─────────────────
function init() {
  if (_privy) return _privy;
  _privy = new Privy({
    appId: EFIX_CONFIG.privyAppId,
    storage: new LocalStorage(),
  });

  // O embedded wallet vive num iframe de origem isolada da Privy; todo request
  // de assinatura viaja por postMessage. Montagem manual é o preço do vanilla.
  _iframe = document.createElement("iframe");
  _iframe.src = _privy.embeddedWallet.getURL();
  _iframe.style.display = "none";
  _iframe.id = "privy-embedded-wallet-iframe";
  document.body.appendChild(_iframe);
  _privy.setMessagePoster(_iframe.contentWindow);
  _onMessage = (e) => {
    if (e.source !== _iframe.contentWindow) return;
    try {
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      _privy.embeddedWallet.onMessage(data);
    } catch {}
  };
  window.addEventListener("message", _onMessage);

  _initPromise = _privy.initialize();
  console.log("[EfixWallet v4] Privy client inicializado");
  return _privy;
}

async function ensureInit() {
  if (!_privy) init();
  await _initPromise;
  return _privy;
}

// ── OTP: whitelabel, 2 passos, SEM os hacks do v3 ───────────
// v3 precisava disparar authenticate() sem await + sleep de 1.5s porque a
// promise só resolvia no fim do fluxo. No js-sdk-core sendCode/loginWithCode
// são chamadas independentes — o fluxo vira o óbvio.
async function sendOTP(email) {
  await ensureInit();
  const addr = String(email || "").trim().toLowerCase();
  if (!addr) throw new Error("email vazio");
  await _privy.auth.email.sendCode(addr);
  _pendingEmail = addr;
  try { localStorage.setItem(PENDING_EMAIL_KEY, addr); } catch {}
  console.log("[EfixWallet v4] OTP enviado para", addr);
  return true;
}

async function verifyOTP(otpCode) {
  await ensureInit();
  const email = _pendingEmail || (() => {
    try { return localStorage.getItem(PENDING_EMAIL_KEY); } catch { return null; }
  })();
  if (!email) throw new Error("sendOTP primeiro (email pendente não encontrado)");

  // default 'login-or-sign-up': usuário novo nasce aqui — é o onboarding que
  // o 403 da Alchemy matou.
  await _privy.auth.email.loginWithCode(email, String(otpCode).trim());
  try { localStorage.removeItem(PENDING_EMAIL_KEY); } catch {}
  _pendingEmail = null;

  await _resolveWalletFromSession();
  console.log("[EfixWallet v4] OTP verificado. EOA:", _eoa);
  return _eoa; // contrato v3: retorna o endereço do signer
}

// Magic link era um fluxo do AlchemyWebSigner; o rail Privy é OTP puro.
async function completeAuth(_bundle) {
  throw new Error("magic link não existe no signer Privy — use o fluxo de OTP");
}

// ── sessão ──────────────────────────────────────────────────
async function checkSession() {
  await ensureInit();
  try {
    const res = await _privy.user.get();
    const user = res && res.user;
    if (!user) return null;
    _user = user;
    await _resolveWalletFromSession();
    console.log("[EfixWallet v4] Sessão restaurada:", _eoa);
    return _eoa;
  } catch (e) {
    console.log("[EfixWallet v4] Sem sessão ativa:", e.message);
    return null;
  }
}

// pós-auth: garante embedded wallet, provider e endereços resolvidos
async function _resolveWalletFromSession() {
  const res = await _privy.user.get();
  _user = res && res.user;
  if (!_user) throw new Error("sessão Privy ausente após login");

  let wallet = getUserEmbeddedEthereumWallet(_user);
  if (!wallet) {
    // create() é explícito no js-sdk-core (não há create-on-login) — usuário
    // novo ganha a embedded wallet aqui, no primeiro login.
    console.log("[EfixWallet v4] criando embedded wallet…");
    await _privy.embeddedWallet.create({});
    const res2 = await _privy.user.get();
    _user = res2 && res2.user;
    wallet = getUserEmbeddedEthereumWallet(_user);
  }
  if (!wallet) throw new Error("embedded wallet não disponível pós-create");

  const { entropyId, entropyIdVerifier } = getEntropyDetailsFromUser(_user);
  _provider = await _privy.embeddedWallet.getEthereumProvider({
    wallet, entropyId, entropyIdVerifier,
  });
  _eoa = wallet.address;
  _swc = null; _sca = null; // clients derivam do provider novo
  return _eoa;
}

// ── smart account (wallet-apis) ─────────────────────────────
function _buildSmartWalletClient() {
  if (!_provider || !_eoa) throw new Error("não autenticado (sem provider Privy)");
  const walletClient = createWalletClient({
    account: _eoa,
    chain: EFIX_CONFIG.chain,
    transport: custom(_provider),
  });
  return createSmartWalletClient({
    transport: alchemyWalletTransport({ apiKey: EFIX_CONFIG.apiKey }),
    chain: EFIX_CONFIG.chain,
    signer: walletClient,
    paymaster: { policyId: EFIX_CONFIG.gasPolicyId },
  });
}

async function _ensureAccount(explicitSCA = null) {
  if (!_swc) _swc = _buildSmartWalletClient();
  if (explicitSCA) {
    // conta EXISTENTE (holder legado pós-migração de chave, ou multi-conta):
    // o servidor resolve a conta já criada pelo endereço.
    const acct = await _swc.requestAccount({ accountAddress: explicitSCA });
    return acct.address || acct.accountAddress || explicitSCA;
  }
  if (_sca) return _sca;
  // conta NOVA: opt-out do default EIP-7702 (signer EIP-1193 não assina
  // authorization) → ERC-4337 LightAccount v2, uniforme com a frota atual.
  const acct = await _swc.requestAccount({ creationHint: { accountType: "la-v2" } });
  _sca = acct.address || acct.accountAddress;
  console.log("[EfixWallet v4] smart account (la-v2):", _sca);
  return _sca;
}

async function getSmartAccountAddress() {
  return _ensureAccount();
}

// ── envio: sendCalls + waitForCallsStatus ───────────────────
async function _sendCalls(target, data, value, explicitAccount) {
  const from = await _ensureAccount(explicitAccount);
  const valueBn = (typeof value === "string" && value.startsWith("0x"))
    ? BigInt(value)
    : (typeof value === "bigint" ? value : BigInt(value || 0));
  // param é `account` (d.ts sendCalls): sem ele o client cai no default
  // EIP-7702 com o signer — que explode em signAuthorization (conta json-rpc).
  const { id } = await _swc.sendCalls({
    account: from,
    calls: [{ to: target, data: data || "0x", value: valueBn }],
  });
  return id;
}

async function _waitCalls(id) {
  const status = await _swc.waitForCallsStatus({ id });
  const st = String(status.status ?? "");
  // shape EIP-5792: "success" | "failure" (algumas versões usam códigos 2xx)
  if (st !== "success" && st !== "CONFIRMED" && st !== "200") {
    throw new Error("calls status: " + st);
  }
  const tx = status.receipts && status.receipts[0] && status.receipts[0].transactionHash;
  if (!tx) throw new Error("sem receipt/transactionHash no status");
  return tx;
}

// Contrato v3: sendUserOp resolve só quando a tx está incluída e retorna o hash.
async function sendUserOp(target, data, value = "0x0", explicitAccount = null) {
  const id = await _sendCalls(target, data, value, explicitAccount);
  const txHash = await _waitCalls(id);
  console.log("[EfixWallet v4] UserOp tx:", txHash);
  return txHash;
}

// ── shim de compatibilidade p/ callers antigos de getClient() ──
// Superfície antiga: client.sendUserOperation({uo}) → {hash} e
// client.waitForUserOperationTransaction({hash}) → txHash.
// Mapeada 1:1 em cima de sendCalls/waitForCallsStatus.
async function getClient(explicitSCA = null) {
  const from = await _ensureAccount(explicitSCA);
  return {
    account: { address: from },
    getAddress: async () => from,
    sendUserOperation: async ({ uo }) => {
      const list = Array.isArray(uo) ? uo : [uo];
      const first = list[0];
      const id = await _sendCalls(first.target, first.data, first.value ?? 0n, from);
      _pendingCalls.set(id, true);
      return { hash: id };
    },
    waitForUserOperationTransaction: async ({ hash }) => {
      _pendingCalls.delete(hash);
      return _waitCalls(hash);
    },
  };
}

async function getBaseClient(explicitSCA = null) { return getClient(explicitSCA); }

// ── leitura on-chain: copiado do v3 (sem mudança de comportamento) ──
const MAV2_IMPL_SUFFIX = "c5a9089039570dd36455b5c07383";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const _kindCache = new Map();

async function accountKind(sca) {
  const key = String(sca || "").toLowerCase();
  if (!key.startsWith("0x")) return "light";
  if (_kindCache.has(key)) return _kindCache.get(key);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://base-mainnet.g.alchemy.com/v2/${EFIX_CONFIG.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getStorageAt", params: [key, ERC1967_IMPL_SLOT, "latest"] }),
      signal: ctrl.signal,
    }).then((x) => x.json()).finally(() => clearTimeout(timer));
    if (!r || r.error || typeof r.result !== "string" || !r.result.startsWith("0x")) {
      return "light"; // inconclusivo: fail-closed, sem cachear
    }
    const kind = r.result.toLowerCase().endsWith(MAV2_IMPL_SUFFIX) ? "mav2" : "light";
    _kindCache.set(key, kind);
    return kind;
  } catch {
    return "light";
  }
}

async function getAddress() {
  if (_eoa) return _eoa;
  throw new Error("Not authenticated");
}

async function getBalance(address) {
  const rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${EFIX_CONFIG.apiKey}`;
  const paddedAddress = address.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = "0x70a08231" + paddedAddress;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: EFIX_CONFIG.contracts.efixDI, data }, "latest"], id: 1 }),
  });
  const result = await response.json();
  const rawBalance = BigInt(result.result || "0x0");
  const divisor = 10n ** 18n;
  const balance = Number(rawBalance / divisor) + Number(rawBalance % divisor) / Number(divisor);
  return { raw: rawBalance.toString(), formatted: balance.toFixed(2), symbol: "efixDI" };
}

async function transferEfixDI(toAddress, amount) {
  const amountWei = BigInt(Math.round(amount * 1e18));
  const paddedTo = toAddress.toLowerCase().replace("0x", "").padStart(64, "0");
  const paddedAmount = amountWei.toString(16).padStart(64, "0");
  const data = "0xa9059cbb" + paddedTo + paddedAmount;
  const txHash = await sendUserOp(EFIX_CONFIG.contracts.efixDI, data);
  return { hash: txHash };
}

async function collateralize() {
  throw new Error("collateralize is disabled — card collateral is handled by the protocol (admin only)");
}

// ── logout ──────────────────────────────────────────────────
async function disconnect() {
  try {
    if (_privy && _user) await _privy.auth.logout({ userId: _user.id });
  } catch (e) {}
  if (_onMessage) { window.removeEventListener("message", _onMessage); _onMessage = null; }
  if (_iframe) { try { _iframe.remove(); } catch {} _iframe = null; }
  _privy = null; _initPromise = null; _user = null; _provider = null;
  _eoa = null; _swc = null; _sca = null; _pendingEmail = null;
  try { localStorage.removeItem(PENDING_EMAIL_KEY); } catch {}
  console.log("[EfixWallet v4] Disconnected");
}

function getSigner() {
  // "avançado": expõe as alavancas reais da stack nova
  return { privy: _privy, provider: _provider, eoa: _eoa, smartWalletClient: _swc };
}

// ── contrato público (superfície v3 + extensões v4) ─────────
window.EfixWallet = {
  init,
  loginWithEmail: async (email) => { await sendOTP(email); return null; }, // v3 legado; fluxo real é sendOTP+verifyOTP
  sendOTP,
  verifyOTP,
  completeAuth,
  checkSession,
  getClient,
  getSmartClient: getClient,
  getBaseClient,
  getAddress,
  getBalance,
  disconnect,
  getSigner,
  transferEfixDI,
  collateralize,
  sendUserOp,
  accountKind,
  // v4:
  getSmartAccountAddress,
  version: "4.0.0-poc",
  signerBackend: "privy(js-sdk-core)+alchemy-wallet-apis",
  config: EFIX_CONFIG,
};

console.log("[EfixWallet] SDK v4 (POC Privy) carregado.");
