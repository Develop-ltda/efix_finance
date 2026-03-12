// app/wallet/admin-logic.js — Pure business logic for Admin panel
// No DOM references. Uses rpc/rpcBigInt/ethBal/balOf from shared/js/rpc.js as globals.

const AdminLogic = {
  _morphoCache: null,
  _morphoCacheTime: 0,

  async _getMorpho(backend, key, maxAgeMs) {
    var now = Date.now();
    if (this._morphoCache && (now - this._morphoCacheTime) < (maxAgeMs || 5000)) {
      return this._morphoCache;
    }
    var r = await fetch(backend + '/api/admin/morpho', { headers: { 'X-Admin-Key': key } });
    this._morphoCache = await r.json();
    this._morphoCacheTime = now;
    return this._morphoCache;
  },

  hdr(key) {
    return { 'X-Admin-Key': key, 'Content-Type': 'application/json' };
  },

  async validateKey(backend, key) {
    const r = await fetch(backend + '/api/deposits', { headers: { 'X-Admin-Key': key } });
    if (!r.ok) throw new Error('Invalid key');
    return true;
  },

  async fetchStats(backend, key, rpcPoly, rpcBase, contracts) {
    const [ps, bs, mb] = await Promise.all([
      rpcBigInt(rpcPoly, contracts.efixPolygon, '0x18160ddd'),
      rpcBigInt(rpcBase, contracts.efixBase, '0x18160ddd'),
      ethBal(rpcPoly, contracts.operator)
    ]);
    const polySupply = Number(ps) / 1e18;
    const baseSupply = Number(bs) / 1e18;

    const h = await (await fetch(backend + '/health')).json();

    const c = await (await fetch(backend + '/api/wallet/collateral', { headers: { 'X-Admin-Key': key } })).json();
    let locked = 0;
    const addrs = new Set();
    (c.collateral || []).forEach(x => {
      if (x.status === 'locked') locked += parseFloat(x.amount_efix);
      addrs.add(x.address);
    });

    let userCount = addrs.size;
    try {
      const dp = await (await fetch(backend + '/api/wallet/pending', { headers: { 'X-Admin-Key': key } })).json();
      (dp.deposits || []).forEach(d => { if (d.address) addrs.add(d.address); });
      userCount = addrs.size;
    } catch (e) { /* keep current count */ }

    return {
      polySupply, baseSupply, matic: mb,
      block: h.block, uptime: Math.round(h.uptime / 60),
      locked, userCount
    };
  },

  async fetchDeposits(backend, key, sa, fd) {
    const [dRes, wRes] = await Promise.all([
      fetch(backend + '/api/deposits', { headers: { 'X-Admin-Key': key } }),
      fetch(backend + '/api/wallet/pending', { headers: { 'X-Admin-Key': key } })
    ]);
    const dData = await dRes.json();
    const wData = await wRes.json();
    let all = [];

    if (dData.processed) {
      Object.entries(dData.processed).forEach(([id, d]) => {
        all.push({
          id: id.slice(0, 20),
          addr: sa(d.user || ''),
          amt: d.amount || '?',
          st: d.status || '?',
          dt: d.ts ? new Date(d.ts).toISOString() : null,
          tx: d.txHash
        });
      });
    }

    (wData.deposits || []).forEach(d => {
      all.push({
        id: d.reference || '',
        addr: sa(d.address || ''),
        amt: d.amount || '?',
        st: d.status || '?',
        dt: d.createdAt ? new Date(d.createdAt).toISOString() : null
      });
    });

    all.sort((a, b) => (b.dt || '') > (a.dt || '') ? 1 : -1);
    return all;
  },

  async fetchWithdrawals(backend, key) {
    const r = await fetch(backend + '/api/wallet/withdrawals', { headers: { 'X-Admin-Key': key } });
    const d = await r.json();
    return d.withdrawals || [];
  },

  async processWithdrawal(backend, key, id) {
    const r = await fetch(backend + '/api/wallet/withdrawals/process', {
      method: 'POST',
      headers: this.hdr(key),
      body: JSON.stringify({ id })
    });
    return await r.json();
  },

  async fetchCollateral(backend, key) {
    const r = await fetch(backend + '/api/wallet/collateral', { headers: { 'X-Admin-Key': key } });
    const d = await r.json();
    const items = d.collateral || [];

    let totalEfix = 0, totalUsdc = 0, locked = 0, pending = 0;
    items.forEach(c => {
      totalEfix += parseFloat(c.amount_efix);
      totalUsdc += parseFloat(c.usdc_credit);
      if (c.status === 'locked') locked += parseFloat(c.amount_efix);
      else pending += parseFloat(c.amount_efix);
    });

    return { items, totalEfix, totalUsdc, locked, pending };
  },

  async fetchProtocol(backend, key, operatorAddr) {
    const s = await (await fetch(backend + '/api/status?key=' + key)).json();
    return { protocol: s.protocol || null, operator: s.operator || null, services: s.services || null };
  },

  async fetchMorpho(backend, key) {
    return await this._getMorpho(backend, key);
  },

  async fetchBridgeBalances(rpcPoly, rpcBase, contracts, key, backend) {
    const [polyEfix, polyMatic] = await Promise.all([
      rpcBigInt(rpcPoly, contracts.efixPolygon, balOf(contracts.operator)),
      ethBal(rpcPoly, contracts.operator)
    ]);
    const result = {
      polygon: { efixDI: (Number(polyEfix) / 1e18).toFixed(2), matic: polyMatic.toFixed(4) },
      base: null
    };

    try {
      const d = await this._getMorpho(backend, key);
      if (d.base) {
        result.base = { efixDI: d.base.efixDI, usdc: d.base.usdc };
      }
    } catch (e) {
      try {
        const baseEfix = await rpcBigInt(rpcBase, contracts.efixBase, balOf(contracts.operator));
        const usdcBase = await rpcBigInt(rpcBase, contracts.usdcBase, balOf(contracts.operator));
        result.base = {
          efixDI: (Number(baseEfix) / 1e18).toFixed(2),
          usdc: (Number(usdcBase) / 1e6).toFixed(2)
        };
      } catch (e2) {
        result.baseError = true;
      }
    }

    return result;
  },

  async fetchBridgeHistory(srcAddress) {
    const r = await fetch('https://scan.layerzero-api.com/v1/messages/oft?srcAddress=' + srcAddress + '&limit=10');
    if (!r.ok) throw new Error('LZ Scan API error');
    const d = await r.json();
    return d.data || d.messages || [];
  },

  async doMint(backend, key, params) {
    const r = await fetch(backend + '/api/admin/deposit', {
      method: 'POST',
      headers: this.hdr(key),
      body: JSON.stringify({
        userAddress: params.address,
        amount: params.amount,
        pixKey: 'admin',
        endToEndId: params.ref || 'ADMIN-' + Date.now()
      })
    });
    return await r.json();
  },

  async doBridge(backend, key, amount) {
    const r = await fetch(backend + '/api/admin/bridge', {
      method: 'POST',
      headers: this.hdr(key),
      body: JSON.stringify({ amount })
    });
    return await r.json();
  },

  async fetchBaseOperator(backend, key) {
    const d = await this._getMorpho(backend, key);
    return d.base || null;
  }
};
