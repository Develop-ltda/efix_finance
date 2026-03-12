// app/wallet/wallet.js — Pure business logic for Smart Wallet
// No DOM references. Uses EfixWallet as global (loaded via efix-wallet-bundle.js).

const WalletLogic = {
  calcSpendingPower(collateralAmount, ltvRatio, fxRate) {
    return collateralAmount * (ltvRatio || 0.50) * (fxRate || 0.17);
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
    return await res.json();
  },

  async checkDepositStatus(backend, reference) {
    const res = await fetch(backend + '/deposit/status/' + reference);
    return await res.json();
  },

  async pollBalanceChange(walletLib, address, currentBalText, maxAttempts) {
    maxAttempts = maxAttempts || 20;
    return new Promise((resolve) => {
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts++;
        try {
          const bal = await walletLib.getBalance(address);
          const newBalText = bal.formatted + ' efixDI';
          if (newBalText !== currentBalText) {
            clearInterval(timer);
            resolve({ changed: true, bal });
            return;
          }
        } catch (e) { /* keep polling */ }

        if (attempts >= maxAttempts) {
          clearInterval(timer);
          resolve({ changed: false });
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
    return await res.json();
  },

  async lockCollateral(backend, address, amount) {
    const res = await fetch(backend + '/deposit/collateralize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount })
    });
    return await res.json();
  },

  async fetchHistory(backend, address) {
    const res = await fetch(backend + '/wallet/history/' + address);
    const data = await res.json();
    return data.history || [];
  },

  async fetchLockedBalance(backend, address) {
    const res = await fetch(backend + '/wallet/balance/' + address);
    const data = await res.json();
    return data.locked ? parseFloat(data.locked) : 0;
  },

  async getBalance(walletLib, address) {
    return await walletLib.getBalance(address);
  }
};
