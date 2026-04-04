// brle-wallet-sdk.js — Alchemy Account Kit for Base chain
// Enables gasless transactions for BRLE users (email login, no MetaMask needed)

import { AlchemyWebSigner } from "@account-kit/signer";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { alchemy, base } from "@account-kit/infra";

const BRLE_CONFIG = {
  apiKey: "5QrXWREEtmi4gITNoJsJf",
  gasPolicyId: "", // TODO: create Base gas policy on Alchemy dashboard
  chain: base,
  contracts: {
    brle: "0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6",
    psm: "0xB89A62c2B1d006A2fB472B6445a52ABA2F70E6Ab",
    sbrle: "0xC65069694e32ef72CD94649BC5174DF9D18475D0",
    swap: "0xDac75EC3f9d0294d4a48BcE5d0d7A2b0693D7AD1",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
};

let _signer = null;
let _client = null;
let _signerAddress = null;

function init() {
  _signer = new AlchemyWebSigner({
    client: {
      connection: { apiKey: BRLE_CONFIG.apiKey },
      iframeConfig: {
        iframeContainerId: "alchemy-signer-iframe-container",
      },
    },
  });
  console.log("[BRLEWallet] Signer initialized (Base)");
  return _signer;
}

async function loginWithEmail(email) {
  if (!_signer) init();
  await _signer.authenticate({ type: "email", email });
  _signerAddress = await _signer.getAddress();
  console.log("[BRLEWallet] Authenticated:", _signerAddress);
  return _signerAddress;
}

async function completeAuth(bundle) {
  if (!_signer) throw new Error("Signer not initialized");
  await _signer.authenticate({ type: "email", bundle });
  _signerAddress = await _signer.getAddress();
  return _signerAddress;
}

async function checkSession() {
  if (!_signer) init();
  try {
    const user = await _signer.getAuthDetails();
    if (user) {
      _signerAddress = await _signer.getAddress();
      console.log("[BRLEWallet] Session recovered:", _signerAddress);
      return _signerAddress;
    }
  } catch {}
  console.log("[BRLEWallet] No active session");
  return null;
}

async function getClient() {
  if (!_signer) throw new Error("Not authenticated");
  if (!_client) {
    _client = createSmartWalletClient({
      transport: alchemy({ apiKey: BRLE_CONFIG.apiKey }),
      chain: BRLE_CONFIG.chain,
      signer: _signer,
    });
  }
  return _client;
}

async function getAddress() {
  if (_signerAddress) return _signerAddress;
  if (!_signer) throw new Error("Not authenticated");
  _signerAddress = await _signer.getAddress();
  return _signerAddress;
}

// ═══ BRLE-specific UserOp helpers ═══

function _encodeApprove(spender, amount) {
  const sel = "0x095ea7b3"; // approve(address,uint256)
  const s = spender.toLowerCase().replace("0x", "").padStart(64, "0");
  const a = BigInt(amount).toString(16).padStart(64, "0");
  return sel + s + a;
}

function _encodeDeposit(assets, receiver) {
  const sel = "0x6e553f65"; // deposit(uint256,address)
  const a = BigInt(assets).toString(16).padStart(64, "0");
  const r = receiver.toLowerCase().replace("0x", "").padStart(64, "0");
  return sel + a + r;
}

function _encodeRedeem(shares, receiver, owner) {
  const sel = "0xba087652"; // redeem(uint256,address,address)
  const s = BigInt(shares).toString(16).padStart(64, "0");
  const r = receiver.toLowerCase().replace("0x", "").padStart(64, "0");
  const o = owner.toLowerCase().replace("0x", "").padStart(64, "0");
  return sel + s + r + o;
}

function _encodeSwap(usdcAmount) {
  const sel = "0x94b918de"; // swap(uint256)
  const a = BigInt(usdcAmount).toString(16).padStart(64, "0");
  return sel + a;
}

function _encodeRequestRedeem(amount, pixKey) {
  // requestRedeem(uint256,string) — need dynamic encoding
  const sel = "0xc1cbbca7"; // Will compute proper selector
  // For simplicity, we'll use ethers.js-style encoding via raw hex
  // This is complex with dynamic string — use a helper
  return null; // Handled separately
}

/**
 * Swap USDC → BRLE (approve + swap in one UserOp batch)
 */
async function swapUsdcToBrle(usdcAmount) {
  const client = await getClient();
  const addr = await getAddress();
  const usdcWei = BigInt(Math.floor(usdcAmount * 1e6));

  // Approve USDC to swap contract
  const approveData = _encodeApprove(BRLE_CONFIG.contracts.swap, usdcWei);

  // Swap
  const swapData = _encodeSwap(usdcWei);

  // Send as batch UserOp
  const hash = await client.sendUserOperation({
    uo: [
      { target: BRLE_CONFIG.contracts.usdc, data: approveData, value: 0n },
      { target: BRLE_CONFIG.contracts.swap, data: swapData, value: 0n },
    ],
  });

  const txHash = await client.waitForUserOperationTransaction(hash);
  console.log("[BRLEWallet] Swap confirmed:", txHash);
  return { hash: txHash };
}

/**
 * Deposit BRLE into sBRLE vault (approve + deposit in one UserOp)
 */
async function stakeBrle(brleAmount) {
  const client = await getClient();
  const addr = await getAddress();
  const amountWei = BigInt(Math.round(brleAmount * 1e18));

  const approveData = _encodeApprove(BRLE_CONFIG.contracts.sbrle, amountWei);
  const depositData = _encodeDeposit(amountWei, addr);

  const hash = await client.sendUserOperation({
    uo: [
      { target: BRLE_CONFIG.contracts.brle, data: approveData, value: 0n },
      { target: BRLE_CONFIG.contracts.sbrle, data: depositData, value: 0n },
    ],
  });

  const txHash = await client.waitForUserOperationTransaction(hash);
  console.log("[BRLEWallet] Stake confirmed:", txHash);
  return { hash: txHash };
}

/**
 * Withdraw from sBRLE vault
 */
async function unstakeBrle(sbrleShares) {
  const client = await getClient();
  const addr = await getAddress();
  const sharesWei = BigInt(Math.round(sbrleShares * 1e18));

  const redeemData = _encodeRedeem(sharesWei, addr, addr);

  const hash = await client.sendUserOperation({
    uo: { target: BRLE_CONFIG.contracts.sbrle, data: redeemData, value: 0n },
  });

  const txHash = await client.waitForUserOperationTransaction(hash);
  console.log("[BRLEWallet] Unstake confirmed:", txHash);
  return { hash: txHash };
}

async function disconnect() {
  if (_signer) try { await _signer.disconnect(); } catch {}
  _signer = null;
  _client = null;
  _signerAddress = null;
  console.log("[BRLEWallet] Disconnected");
}

// Expose to window
window.BRLEWallet = {
  init,
  loginWithEmail,
  completeAuth,
  checkSession,
  getClient,
  getAddress,
  disconnect,
  swapUsdcToBrle,
  stakeBrle,
  unstakeBrle,
  config: BRLE_CONFIG,
};

console.log("[BRLEWallet] SDK loaded (Base chain, gasless)");
