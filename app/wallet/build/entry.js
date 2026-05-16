// efix-wallet-sdk.js
// Entry point for esbuild bundle - exposes Alchemy Account Kit to window.EfixWallet

import { AlchemyWebSigner } from "@account-kit/signer";
import { createLightAccountClient } from "@account-kit/smart-contracts";
import { alchemy, base } from "@account-kit/infra";

// We use createLightAccountClient (not the higher-level createSmartWalletClient
// from @account-kit/wallet-client) because the wallet-client v4 API replaced
// sendUserOperation with sendCalls + waitForCallsStatus, and its internal
// requestAccount → whoami path requires a fully hydrated signer.inner._user.
// The Alchemy iframe storage post-OTP in 4.86.x leaves _user undefined on
// session restore (observed 2026-05-15: "No orgId provided", "Signer not
// authenticated"). createLightAccountClient uses the underlying @aa-sdk/core
// SmartAccountClient with sendUserOperation + waitForUserOperationTransaction
// — the same deterministic LightAccount v2 account address derivation that
// existing migrated holders were created with, and no whoami precheck.

// ═══════════════════════════════════════════════════════════
// EFIX WALLET SDK - Bundled for vanilla HTML
// ═══════════════════════════════════════════════════════════

const EFIX_CONFIG = {
  apiKey: "5QrXWREEtmi4gITNoJsJf",
  gasPolicyId: "7b22b464-38cd-4e6f-bccb-00f1280ac14c",
  chain: base,
  contracts: {
    efixDI: "0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608",
    morphoVault: "0xf4A3FaDcEf350B2F168F97Cdbaa2221FF29ACBd5",
  }
};

// ERC-20 ABI fragment for balanceOf
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

let _signer = null;
let _client = null;
let _signerAddress = null;

/**
 * Initialize the Alchemy signer (call once on page load)
 */
function init() {
  _signer = new AlchemyWebSigner({
    client: {
      connection: { apiKey: EFIX_CONFIG.apiKey },
      iframeConfig: {
        iframeContainerId: "alchemy-signer-iframe-container",
      },
    },
  });
  
  console.log("[EfixWallet] Signer initialized");
  return _signer;
}

/**
 * Authenticate user via email OTP
 * @param {string} email - User's email address
 * @returns {Promise<object>} Authentication result
 */
async function loginWithEmail(email) {
  if (!_signer) init();

  const result = await _signer.authenticate({
    type: "email",
    email: email,
  });

  _signerAddress = await _signer.getAddress();
  console.log("[EfixWallet] Authenticated. Address:", _signerAddress);
  return _signerAddress;
}

/**
 * Step 1 of email OTP flow — sends a 6-digit code to the user's inbox.
 *
 * IMPORTANT: this FIRES authenticate() without awaiting it. The promise from
 * `authenticate({type:'email'})` resolves only after the whole flow (OTP
 * verify or magic-link bundle) completes — so await-ing here would block
 * forever. We sleep 1.5s to give the Alchemy backend time to enqueue the
 * email, then return.
 *
 * The background promise stores the final address in _signerAddress via the
 * .then() handler; verifyOTP() uses that as a fallback if its own
 * authenticate({type:'otp'}) fails (happens when magic link was used).
 *
 * De-minified from the last-known-good bundle (commit d014531) — do NOT
 * simplify to a direct await.
 */
async function sendOTP(email) {
  if (!_signer) init();
  _signer.authenticate({ type: "email", email })
    .then(async () => {
      try {
        _signerAddress = await _signer.getAddress();
        console.log("[EfixWallet] Auth auto-completed. Address:", _signerAddress);
        if (window._efixAuthCallback) window._efixAuthCallback(_signerAddress);
      } catch (e) {
        console.error("[EfixWallet] Post-auth error:", e);
      }
    })
    .catch((e) => {
      console.error("[EfixWallet] Auth promise rejected:", e);
      if (window._efixAuthError) window._efixAuthError(e);
    });
  await new Promise((r) => setTimeout(r, 1500));
  console.log("[EfixWallet] OTP email initiated for:", email);
  return true;
}

/**
 * Step 2 of email OTP flow — submits the 6-digit code.
 * Falls back to the background promise from sendOTP if verify itself fails.
 */
async function verifyOTP(otpCode) {
  if (!_signer) throw new Error("Signer not initialized");
  try {
    await _signer.authenticate({ type: "otp", otpCode });
    _signerAddress = await _signer.getAddress();
    console.log("[EfixWallet] OTP verified. Address:", _signerAddress);
    return _signerAddress;
  } catch (e) {
    console.log("[EfixWallet] verifyOTP fallback - waiting for background auth...", e.message);
    await new Promise((r) => setTimeout(r, 3000));
    if (_signerAddress) return _signerAddress;
    throw e;
  }
}

/**
 * Complete email auth with magic link bundle (from URL param)
 * @param {string} bundle - The bundle from magic link redirect
 */
async function completeAuth(bundle) {
  if (!_signer) throw new Error("Signer not initialized");

  await _signer.authenticate({
    type: "email",
    bundle: bundle,
  });

  _signerAddress = await _signer.getAddress();
  console.log("[EfixWallet] Authenticated via bundle. Address:", _signerAddress);

  return _signerAddress;
}

/**
 * Check if user is already authenticated (session recovery)
 * @returns {Promise<string|null>} Signer address or null
 */
async function checkSession() {
  if (!_signer) init();
  
  try {
    const user = await _signer.getAuthDetails();
    if (user) {
      _signerAddress = await _signer.getAddress();
      console.log("[EfixWallet] Session recovered:", _signerAddress);
      return _signerAddress;
    }
  } catch (e) {
    console.log("[EfixWallet] No active session");
  }
  return null;
}

/**
 * Get the smart wallet client for sending UserOps.
 * @param {string|null} explicitSCA — Smart Contract Account address (e.g. the
 *   user's LightAccount address). When provided, bypasses the SDK's internal
 *   signer.getAddress()→whoami() call which throws "No orgId provided" once
 *   the AlchemyWebSigner's iframe-side session has degraded post-OTP.
 *   Caller MUST pass this when the signer state may be stale (i.e., any
 *   action after the initial login moment).
 * @returns {Promise<object>} LightAccount client bound to explicit SCA if given
 */
async function getClient(explicitSCA = null) {
  if (!_signer) throw new Error("Signer not initialized");

  // With explicit SCA we always build fresh — different callers may use
  // different accounts, and we don't want a cached client tied to a previous
  // address. The cache is only used for the no-explicit fast path.
  if (explicitSCA) {
    const transport = alchemy({ apiKey: EFIX_CONFIG.apiKey });
    return await createLightAccountClient({
      transport,
      chain: EFIX_CONFIG.chain,
      signer: _signer,
      accountAddress: explicitSCA,
      gasManagerConfig: { policyId: EFIX_CONFIG.gasPolicyId },
    });
  }

  if (!_client) {
    const transport = alchemy({ apiKey: EFIX_CONFIG.apiKey });
    _client = await createLightAccountClient({
      transport,
      chain: EFIX_CONFIG.chain,
      signer: _signer,
      gasManagerConfig: { policyId: EFIX_CONFIG.gasPolicyId },
    });
  }

  return _client;
}

// Base-chain client alias. Pre-Base-cutover this was a separate Polygon vs Base
// client; post-cutover both default and Base are the same chain (Base 8453).
// Kept as a function alias so existing index.html callers (admin tab, BRLE,
// SALRIO) keep working without edits.
async function getBaseClient(explicitSCA = null) {
  return getClient(explicitSCA);
}

/**
 * Get user's signer address (EOA that controls the smart account)
 * @returns {Promise<string>} Address
 */
async function getAddress() {
  if (_signerAddress) return _signerAddress;
  if (!_signer) throw new Error("Not authenticated");
  
  _signerAddress = await _signer.getAddress();
  return _signerAddress;
}

/**
 * Get efixDI token balance for an address
 * Uses direct RPC call (no gas needed, read-only)
 * @param {string} address - Address to check
 * @returns {Promise<string>} Balance in human-readable format
 */
async function getBalance(address) {
  const rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${EFIX_CONFIG.apiKey}`;
  
  // balanceOf(address) selector = 0x70a08231
  const paddedAddress = address.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = "0x70a08231" + paddedAddress;
  
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: EFIX_CONFIG.contracts.efixDI, data }, "latest"],
      id: 1,
    }),
  });
  
  const result = await response.json();
  const rawBalance = BigInt(result.result || "0x0");
  const divisor = 10n ** 18n;
  const intPart = rawBalance / divisor;
  const fracPart = rawBalance % divisor;
  const balance = Number(intPart) + Number(fracPart) / Number(divisor); // 18 decimals
  
  return {
    raw: rawBalance.toString(),
    formatted: balance.toFixed(2),
    symbol: "efixDI",
  };
}

/**
 * Disconnect / logout
 */
async function disconnect() {
  if (_signer) {
    try { await _signer.disconnect(); } catch (e) {}
  }
  _signer = null;
  _client = null;
  _signerAddress = null;
  console.log("[EfixWallet] Disconnected");
}

/**
 * Transfer efixDI tokens from smart wallet to a recipient
 * Uses UserOp via the smart wallet client
 */
// Legacy-style UserOp helper using sendUserOperation + waitForUserOperationTransaction
// from @aa-sdk/core via @account-kit/smart-contracts.createLightAccountClient.
//
// `explicitAccount` is the user's SCA address (e.g. window.userAddress in
// index.html). When passed, we forward it to createLightAccountClient as
// `accountAddress`, which bypasses the SDK's internal signer.getAddress() →
// whoami() call. The whoami call throws "No orgId provided" once the
// AlchemyWebSigner's iframe-side session degrades post-OTP (observed
// 2026-05-15 and again 2026-05-16). Even within a single session this can
// happen seconds after login — so passing explicitAccount is the safe path
// for ANY post-login action.
async function sendUserOp(target, data, value = "0x0", explicitAccount = null) {
  const client = await getClient(explicitAccount);
  const valueBn = (typeof value === "string" && value.startsWith("0x"))
    ? BigInt(value)
    : (typeof value === "bigint" ? value : BigInt(value || 0));
  const sent = await client.sendUserOperation({
    uo: { target, data, value: valueBn },
  });
  const txHash = await client.waitForUserOperationTransaction({ hash: sent.hash });
  console.log("[EfixWallet] UserOp tx:", txHash);
  return txHash;
}

async function transferEfixDI(toAddress, amount) {
  const amountWei = BigInt(Math.round(amount * 1e18));
  // ERC-20 transfer(address,uint256) selector = 0xa9059cbb
  const paddedTo = toAddress.toLowerCase().replace("0x", "").padStart(64, "0");
  const paddedAmount = amountWei.toString(16).padStart(64, "0");
  const data = "0xa9059cbb" + paddedTo + paddedAmount;
  // sendUserOp already waits for inclusion via waitForCallsStatus and returns tx hash
  const txHash = await sendUserOp(EFIX_CONFIG.contracts.efixDI, data);
  console.log("[EfixWallet] Transfer confirmed:", txHash);
  return { hash: txHash };
}

/**
 * Collateralize: transfer efixDI to operator wallet
 * @param {number} amount - Amount in efixDI (human readable)
 */
async function collateralize(amount) {
  const OPERATOR = "0x9eFc11e4d285b5a749faFBC2613836Dcda899e12";
  return transferEfixDI(OPERATOR, amount);
}

/**
 * Get the signer instance (for advanced usage)
 */
function getSigner() {
  return _signer;
}

// ═══════════════════════════════════════════════════════════
// Expose to window for vanilla HTML usage
// ═══════════════════════════════════════════════════════════

window.EfixWallet = {
  init,
  loginWithEmail,
  sendOTP,
  verifyOTP,
  completeAuth,
  checkSession,
  getClient,
  getSmartClient: getClient,  // alias used by /app/wallet/admin + /app/offerings
  getBaseClient,
  getAddress,
  getBalance,
  disconnect,
  getSigner,
  transferEfixDI,
  collateralize,
  sendUserOp,  // v4 helper — used by handleWithdraw in index.html
  config: EFIX_CONFIG,
};

console.log("[EfixWallet] SDK v3 loaded. (with collateral transfer)");
