// app/wallet/wallet.js — Pure business logic for Smart Wallet
// No DOM references. Uses EfixWallet as global (loaded via efix-wallet-bundle.js).

const WalletLogic = {
  calcSpendingPower(collateralAmount, ltvRatio, fxRate) {
    const amount_100 = Math.round((collateralAmount || 0) * 100);
    const ltv_100 = Math.round((ltvRatio || 0.50) * 100);
    const fx_100 = Math.round((fxRate || 0.17) * 100);
    return (amount_100 * ltv_100 * fx_100) / 1000000;
  },

  async createDeposit(backend, amount, address) {
    const res = await fetch(backend + '/deposit/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, address })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  },

  async confirmPayment(backend, reference) {
    const res = await fetch(backend + '/deposit/confirm-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  },

  async checkDepositStatus(backend, reference) {
    const res = await fetch(backend + '/deposit/status/' + reference);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  },

  _pollTimer: null,
  async pollBalanceChange(walletLib, address, currentBalText, maxAttempts) {
    maxAttempts = maxAttempts || 20;
    if (this._pollTimer) { clearInterval(this._pollTimer); }
    return new Promise((resolve) => {
      let attempts = 0;
      this._pollTimer = setInterval(async () => {
        attempts++;
        try {
          const bal = await walletLib.getBalance(address);
          const newBalText = bal.formatted + ' efixDI';
          if (newBalText !== currentBalText) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
            resolve({ changed: true, bal });
            return;
          }
        } catch (e) { /* keep polling */ }

        if (attempts >= maxAttempts) {
          clearInterval(this._pollTimer);
          this._pollTimer = null;
          resolve({ changed: false, bal: null });
        }
      }, 3000);
    });
  },

  async requestWithdraw(backend, address, amount, pixKey) {
    const res = await fetch(backend + '/withdraw/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount, pixKey })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  },

  async lockCollateral(backend, address, amount) {
    const res = await fetch(backend + '/deposit/collateralize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  },

  async fetchHistory(backend, address) {
    const res = await fetch(backend + '/wallet/history/' + address);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data.history || [];
  },

  async fetchLockedBalance(backend, address) {
    const res = await fetch(backend + '/wallet/balance/' + address);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data.locked ? parseFloat(data.locked) : 0;
  },

  async getBalance(walletLib, address) {
    return await walletLib.getBalance(address);
  },

  // ── Bridge.xyz (Send Money: ACH, Wire, SEPA → USDC) ──

  async startBridgeKyc(backend) {
    const res = await fetch(backend + '/bridge/kyc', {
      method: 'POST', headers: EfixAuth.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'KYC error');
    return data;
  },

  async checkBridgeKycStatus(backend) {
    const res = await fetch(backend + '/bridge/kyc-status', {
      headers: EfixAuth.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'KYC status error');
    return data;
  },

  async createBridgeTransfer(backend, { amount, rail, currency }) {
    const res = await fetch(backend + '/bridge/transfer', {
      method: 'POST', headers: EfixAuth.headers(),
      body: JSON.stringify({ amount, rail, currency }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transfer error');
    return data;
  },

  async getBridgeTransfer(backend, transferId) {
    const res = await fetch(backend + '/bridge/transfer/' + transferId, {
      headers: EfixAuth.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transfer status error');
    return data;
  },

  async listBridgeTransfers(backend) {
    const res = await fetch(backend + '/bridge/transfers', {
      headers: EfixAuth.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'List error');
    return data.transfers || [];
  }
};
