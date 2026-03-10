// efix-wallet-sdk.js
// Entry point for esbuild bundle - exposes Alchemy Account Kit to window.EfixWallet

import { AlchemyWebSigner } from "@account-kit/signer";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { alchemy, polygon } from "@account-kit/infra";

// ═══════════════════════════════════════════════════════════
// EFIX WALLET SDK - Bundled for vanilla HTML
// ═══════════════════════════════════════════════════════════

const EFIX_CONFIG = {
  apiKey: "5QrXWREEtmi4gITNoJsJf",
  gasPolicyId: "7b22b464-38cd-4e6f-bccb-00f1280ac14c",
  chain: polygon,
  contracts: {
    efixDI: "0x04082b283818D9d0dd9Ee8742892eEe5CC396441",
    vault: "0x2eA512b4C5e53A8c1302AC8ba2d43c5DA90b307C",
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
  
  console.log("[EfixWallet] Auth initiated for:", email);
  return result;
}

/**
 * Complete email auth after user enters OTP bundle
 * @param {string} bundle - The OTP bundle from email
 */
async function completeAuth(bundle) {
  if (!_signer) throw new Error("Signer not initialized");
  
  await _signer.authenticate({
    type: "email",
    bundle: bundle,
  });
  
  _signerAddress = await _signer.getAddress();
  console.log("[EfixWallet] Authenticated. Address:", _signerAddress);
  
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
 * Get the smart wallet client for sending UserOps
 * @returns {Promise<object>} Smart Wallet Client
 */
async function getClient() {
  if (!_signer) throw new Error("Signer not initialized");
  
  if (!_client) {
    const transport = alchemy({ apiKey: EFIX_CONFIG.apiKey });
    
    _client = createSmartWalletClient({
      transport,
      chain: EFIX_CONFIG.chain,
      signer: _signer,
    });
  }
  
  return _client;
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
  const rpcUrl = `https://polygon-mainnet.g.alchemy.com/v2/${EFIX_CONFIG.apiKey}`;
  
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
  const balance = Number(rawBalance) / 1e18; // 18 decimals
  
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

// ═══════════════════════════════════════════════════════════
// Expose to window for vanilla HTML usage
// ═══════════════════════════════════════════════════════════

window.EfixWallet = {
  init,
  loginWithEmail,
  completeAuth,
  checkSession,
  getClient,
  getAddress,
  getBalance,
  disconnect,
  config: EFIX_CONFIG,
};

console.log("[EfixWallet] SDK loaded. Use window.EfixWallet to interact.");
