// card/card-app.js — Pure business logic for Card App
// No DOM references.

const CardAppLogic = {
  async apiCall(proxyUrl, path, opts, isDemo) {
    const url = path.startsWith('http') ? path : proxyUrl + path;
    const modeHeader = isDemo ? { 'X-Bridge-Mode': 'sandbox' } : {};
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...modeHeader, ...(opts.headers || {}) },
      ...opts,
    });
    return res.json();
  },

  async loginUser(proxyUrl, email, isDemo) {
    return this.apiCall(proxyUrl, '/users/lookup?email=' + encodeURIComponent(email), {}, isDemo);
  },

  async registerUser(proxyUrl, data, isDemo) {
    return this.apiCall(proxyUrl, '/users/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }, isDemo);
  },

  async fetchOnboardingStatus(proxyUrl, customerId, isDemo) {
    const bridge = await this.apiCall(proxyUrl, '/bridge/customers/' + customerId, {}, isDemo);
    return {
      tosOk: bridge.tos_status === 'approved',
      kycOk: bridge.kyc_status === 'approved',
      kycPending: bridge.kyc_status === 'pending' || bridge.kyc_status === 'manual_review',
      tosLink: bridge.tos_link || null,
      kycLink: bridge.kyc_link || null,
      raw: bridge
    };
  },

  async requestTosLink(proxyUrl, customerId, isDemo) {
    const data = await this.apiCall(proxyUrl, '/bridge/customers/' + customerId, {}, isDemo);
    return data.tos_link || null;
  },

  async requestKycLink(proxyUrl, customerId, isDemo) {
    const data = await this.apiCall(proxyUrl, '/bridge/customers/' + customerId, {}, isDemo);
    return data.kyc_link || null;
  },

  async issueCard(proxyUrl, customerId, isDemo) {
    return this.apiCall(proxyUrl, '/bridge/customers/' + customerId + '/card_accounts', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'card-' + customerId + '-' + Date.now() },
      body: JSON.stringify({ currency: 'usdc', chain: 'base' }),
    }, isDemo);
  },

  async linkCard(proxyUrl, email, cardData, isDemo) {
    return this.apiCall(proxyUrl, '/users/link-card', {
      method: 'POST',
      body: JSON.stringify({
        email,
        card_account_id: cardData.id || cardData.card_id,
        card_last4: cardData.last_4 || cardData.last4,
        card_funding_address: cardData.funding_address || (cardData.source_deposit_instructions && cardData.source_deposit_instructions.deposit_address),
        card_status: 'active',
      }),
    }, isDemo);
  },

  async refreshUser(proxyUrl, email, isDemo) {
    return this.apiCall(proxyUrl, '/users/lookup?email=' + encodeURIComponent(email), {}, isDemo);
  },

  async fetchCardBalance(alchemyKey, fundingAddress) {
    const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const res = await fetch('https://base-mainnet.g.alchemy.com/v2/' + alchemyKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{
          to: USDC_BASE,
          data: '0x70a08231' + padAddr(fundingAddress)
        }, 'latest']
      }),
    });
    const data = await res.json();
    return parseInt(data.result, 16) / 1e6;
  },

  async fetchDemoBalance(proxyUrl, customerId, cardAccountId, isDemo) {
    const data = await this.apiCall(proxyUrl, '/bridge/customers/' + customerId + '/card_accounts/' + cardAccountId, {}, isDemo);
    if (data.balances) {
      const raw = data.balances.available || data.balances.available_balance || '0';
      return parseFloat(raw) || 0;
    }
    return null;
  },

  async fetchTransactions(proxyUrl, email, isDemo) {
    const data = await this.apiCall(proxyUrl, '/users/tx?email=' + encodeURIComponent(email), {}, isDemo);
    return data.transactions || [];
  },

  async depositIntent(proxyUrl, email, amount, isDemo) {
    return this.apiCall(proxyUrl, '/users/tx', {
      method: 'POST',
      body: JSON.stringify({
        email,
        type: 'deposit',
        amount: parseFloat(amount),
        asset: 'efixDI',
        description: 'Depósito de ' + amount + ' efixDI para colateralização',
      }),
    }, isDemo);
  },

  async simulateTopUp(proxyUrl, customerId, cardAccountId, email, isDemo) {
    await this.apiCall(proxyUrl, '/bridge/customers/' + customerId + '/card_accounts/' + cardAccountId + '/simulate_balance_top_up', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'sim-topup-' + Date.now() },
      body: JSON.stringify({ amount: '1000.0' }),
    }, isDemo);
    this.apiCall(proxyUrl, '/users/tx', {
      method: 'POST',
      body: JSON.stringify({ email, type: 'top_up', amount: 1000, asset: 'USDC', description: 'Simulated top-up (demo)' }),
    }, isDemo);
  },

  async simulatePurchase(proxyUrl, customerId, cardAccountId, email, isDemo) {
    await this.apiCall(proxyUrl, '/bridge/customers/' + customerId + '/card_accounts/' + cardAccountId + '/simulate_authorization', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'sim-auth-' + Date.now() },
      body: JSON.stringify({ amount: '100.0', merchant_name: 'EFIX Demo Store' }),
    }, isDemo);
    this.apiCall(proxyUrl, '/users/tx', {
      method: 'POST',
      body: JSON.stringify({ email, type: 'purchase', amount: 100, asset: 'USDC', description: 'Simulated purchase (demo)' }),
    }, isDemo);
  },

  async enableSandboxCards(proxyUrl, isDemo) {
    return this.apiCall(proxyUrl, '/bridge/cards/enable', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'enable-' + Date.now() },
      body: JSON.stringify({ funding_strategy: 'top_up' }),
    }, isDemo);
  },

  async fetchCardDetails(proxyUrl, customerId, cardAccountId, isDemo) {
    return this.apiCall(proxyUrl, '/bridge/customers/' + customerId + '/card_accounts/' + cardAccountId, {}, isDemo);
  },

  calcCredit(efixdiAmount) {
    return (efixdiAmount * 0.199 * 0.75).toFixed(2);
  }
};
