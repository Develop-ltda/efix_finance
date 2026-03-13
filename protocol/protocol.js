// protocol/protocol.js — Pure business logic for Protocol Dashboard
// No DOM references. All functions return data.

const ProtocolLogic = {
  SELIC: 14.90,
  MBR: 0.67,
  PF: 0.20,
  LLTV: 0.77,

  scenarios: [
    { n: 'Hold (no leverage)', ltv: 0, e: '🏦' },
    { n: 'Conservative', ltv: .30, e: '🟢' },
    { n: 'Moderate', ltv: .50, e: '🟡' },
    { n: '★ Target Range', ltv: .60, e: '⭐', hl: 1 },
    { n: 'Aggressive', ltv: .70, e: '🟠' },
    { n: 'Max Leverage', ltv: .75, e: '🔴' },
  ],

  stressTests: [
    { n: 'Normal', s: 0, cdi: 14.90, e: '✅' },
    { n: 'BRL −10%', s: -10, cdi: 15.50, e: '⚠️' },
    { n: 'BRL −20%', s: -20, cdi: 16.50, e: '🔶' },
    { n: 'BRL −30%', s: -30, cdi: 18.00, e: '🔴' },
    { n: 'BRL −40% Black Swan', s: -40, cdi: 20.00, e: '💀' },
    { n: 'BRL +15% Rally', s: 15, cdi: 13.50, e: '🚀' },
  ],

  polyContracts: [
    ['EfixDIToken', '0x0408...6441', 'ERC20 + mint/burn'],
    ['EfixVaultV2', '0x2eA5...307C', 'Core vault logic'],
    ['PIXBridge', '0x1d97...78f4', 'Fiat on/off-ramp'],
    ['OFT Adapter V2', '0x6032...258Fc', 'LayerZero bridge'],
    ['Chainlink BRL/USD', '0xB90D...AB7c', 'Price feed'],
    ['BRTHSwap', '0xfBfC...8800', 'BRTH conversion'],
  ],

  baseContracts: [
    ['EfixDITokenBase', '0xF5cA...5608', 'Bridged token'],
    ['MinterBurner', '0x400a...B9a3', 'LZ mint/burn'],
    ['EfixBRLOracleV2', '0xFC6a...Ea86', 'Price feed (4h)'],
    ['Morpho Vault V2', '0xf4A3...CBd5', 'USDC lending'],
    ['Morpho Blue', '0xBBBB...FFCb', 'efixDI/USDC market'],
  ],

  services: [
    ['✅ Auto-Mint Poller', '30s interval via HausBank'],
    ['✅ Withdrawal Listener', 'Event-driven PIX cashout'],
    ['✅ Keeper Bot', 'Health factor monitoring'],
    ['✅ Circuit Breaker', 'Per-service failure isolation'],
    ['✅ HausBank OAuth2', 'Auto-refresh (3600s TTL)'],
    ['✅ Oracle Keeper', 'V2 update every 4 hours'],
  ],

  calcAPY(ltv, cdi) {
    cdi = cdi || this.SELIC;
    if (!ltv) return cdi * (1 - this.PF);
    const l_10000 = Math.round((1 / (1 - ltv)) * 10000);
    const cdi_10000 = Math.round(cdi * 10000);
    const mbr_10000 = Math.round(this.MBR * 10000);
    const pf_10000 = Math.round(this.PF * 10000);
    
    const gross_apy_10000 = Math.round((cdi_10000 * l_10000) / 10000) - Math.round((mbr_10000 * (l_10000 - 10000)) / 10000);
    return (gross_apy_10000 * (10000 - pf_10000)) / 100000000;
  },

  calcHF(ltv, shock) {
    shock = shock || 0;
    if (!ltv) return Infinity;
    const lltv_10000 = Math.round(this.LLTV * 10000);
    const shock_factor_10000 = 10000 + Math.round(shock * 100);
    const ltv_10000 = Math.round(ltv * 10000);
    return (lltv_10000 * shock_factor_10000) / (ltv_10000 * 10000);
  },

  riskInfo(hf) {
    if (hf === Infinity || hf >= 1.5) return { t: 'SAFE', c: 'badge-green' };
    if (hf >= 1.15) return { t: 'WARNING', c: 'badge-yellow' };
    if (hf >= 1.0) return { t: 'AUTO-DELEV', c: 'badge-yellow' };
    return { t: 'LIQUIDATION', c: 'badge-red' };
  },

  async fetchLive(backendUrl, adminKey) {
    const [h, s] = await Promise.all([
      fetch(backendUrl + '/health').then(r => r.json()),
      fetch(backendUrl + '/api/status?key=' + adminKey).then(r => r.json())
    ]);
    const p = s.protocol;
    return {
      tvlBrl: parseFloat(p.tvl_brl).toFixed(2),
      tvlUsd: parseFloat(p.tvl_usd).toFixed(2),
      supply: parseFloat(p.efix_total_supply).toFixed(2),
      rate: parseFloat(p.brl_usd_rate).toFixed(6),
      uptimeH: Math.floor(h.uptime / 3600),
      uptimeM: Math.floor((h.uptime % 3600) / 60),
      block: h.block
    };
  },

  buildAPYData() {
    const maxAPY = this.calcAPY(0.75);
    return this.scenarios.map(s => {
      const apy = this.calcAPY(s.ltv);
      const hf = this.calcHF(s.ltv);
      const ri = this.riskInfo(hf);
      const annual = 100000 * apy / 100;
      const lev = s.ltv ? (1 / (1 - s.ltv)).toFixed(1) + 'x' : '—';
      const pct = (apy / maxAPY * 100).toFixed(1);
      return { ...s, apy, hf, ri, annual, lev, pct };
    });
  },

  buildStressRow(st) {
    return [0, .30, .50, .60, .70, .75].map(ltv => {
      const lev = ltv ? 1 / (1 - ltv) : 1;
      const apy = (st.cdi * lev - this.MBR * (lev - 1)) * (1 - this.PF);
      const hf = this.calcHF(ltv, st.s);
      const ri = this.riskInfo(hf);
      const action = hf === Infinity || hf >= 1.5 ? 'None'
        : hf >= 1.15 ? 'Monitor'
        : hf >= 1.0 ? 'AUTO-DELEVERAGE' : 'EMERGENCY UNWIND';
      return { ltv, apy, hf, ri, annual: 100000 * apy / 100, action };
    });
  },

  buildMatrixData() {
    const ltvs = [.30, .50, .60, .70, .75];
    const shocks = [-40, -30, -20, -10, 0, 10, 15];
    return ltvs.map(ltv => ({
      ltv,
      cells: shocks.map(s => {
        const hf = this.calcHF(ltv, s);
        const ri = this.riskInfo(hf);
        return { hf, ri };
      })
    }));
  },

  async runTerminalCmd(cmd, backendUrl, adminKey) {
    const lines = [];
    if (cmd === 'health') {
      const r = await fetch(backendUrl + '/health').then(r => r.json());
      lines.push({ cls: 't-green', txt: 'HTTP 200 — ' + r.ts });
      lines.push({ cls: 't-white', txt: '  status: ' + r.status + ' | block: ' + r.block + ' | uptime: ' + Math.floor(r.uptime / 3600) + 'h' });
      Object.entries(r.services).forEach(([k, v]) => {
        const ok = v.match(/connected|authenticated|polling|active|listening|idle/);
        lines.push({ cls: ok ? 't-green' : 't-yellow', txt: '  ' + k + ': ' + v });
      });
    } else if (cmd === 'status') {
      const r = await fetch(backendUrl + '/api/status?key=' + adminKey).then(r => r.json());
      lines.push({ cls: 't-green', txt: 'HTTP 200' });
      lines.push({ cls: 't-green', txt: '  tvl: R$ ' + parseFloat(r.protocol.tvl_brl).toFixed(2) + ' ($' + parseFloat(r.protocol.tvl_usd).toFixed(2) + ')' });
      lines.push({ cls: 't-white', txt: '  supply: ' + parseFloat(r.protocol.efix_total_supply).toFixed(2) + ' efixDI' });
      lines.push({ cls: 't-white', txt: '  brl/usd: ' + r.protocol.brl_usd_rate });
      lines.push({ cls: 't-green', txt: '  vault: ' + (r.protocol.vault_paused === false ? 'active' : 'PAUSED') + ' | bridge: ' + (r.protocol.bridge_paused === false ? 'active' : 'PAUSED') });
      lines.push({ cls: 't-white', txt: '  operator: ' + parseFloat(r.operator.balances.matic).toFixed(2) + ' MATIC' });
      lines.push({ cls: 't-green', txt: '  hausbank: ' + (r.services.hausbank.authenticated ? 'authenticated' : 'disconnected') + ' (circuit: ' + r.services.hausbank.circuit.state + ')' });
      lines.push({ cls: 't-green', txt: '  risky_positions: ' + r.services.keeper.risky_positions });
    } else if (cmd === 'morpho') {
      lines.push({ cls: 't-dim', txt: 'Morpho Blue Position (Base Mainnet)' });
      lines.push({ cls: 't-white', txt: '  market: efixDI/USDC | id: 0x31d65c...345a' });
      lines.push({ cls: 't-green', txt: '  collateral: 25 efixDI (~$4.79)' });
      lines.push({ cls: 't-white', txt: '  borrowed: 2.5 USDC' });
      lines.push({ cls: 't-white', txt: '  ltv: 52.2% / 77% LLTV' });
      lines.push({ cls: 't-green', txt: '  health_factor: 1.475' });
      lines.push({ cls: 't-white', txt: '  borrow_rate: 0.67% APR' });
      lines.push({ cls: 't-green', txt: '  net_yield: ~25.4% APY (at target LTV)' });
      lines.push({ cls: 't-dim', txt: '  vault_v2: 0xf4A3...CBd5 (listing PR #936 pending)' });
    }
    return lines;
  }
};
