// range-monitor.js — Pure business logic for Range Monitor
// No DOM references. Uses ethers.js as global (CDN-loaded).

const RangeLogic = {
  s2p(sqrtPX96) {
    const s = Number(sqrtPX96) / (2 ** 96);
    return s * s * 1e12;
  },

  t2p(tick) {
    return Math.exp(tick * Math.log(1.0001)) * 1e12;
  },

  gbm(p, v, d, z) {
    const pv = v * Math.sqrt(d / 365);
    const lo = p * Math.exp(-z * pv);
    const hi = p * Math.exp(z * pv);
    return { lo, hi, pv, eff: Math.sqrt(p) / (Math.sqrt(hi) - Math.sqrt(lo)) };
  },

  fpt(v, b) {
    return Math.pow(Math.max(b, 0.0001) / (v / Math.sqrt(365)), 2);
  },

  isFullRange(tL, tU) {
    return tL < -800000 && tU > 800000;
  },

  async getProvider(rpcs) {
    for (const u of rpcs) {
      try {
        const p = new ethers.JsonRpcProvider(u);
        await p.getBlockNumber();
        return p;
      } catch { continue; }
    }
    throw new Error('RPCs failed');
  },

  async fetchPositionData(provider, config) {
    const NABI = ['function positions(uint256) external view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)'];
    const FABI = ['function getPool(address,address,uint24) external view returns (address)'];
    const PABI = ['function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)'];

    const bn = await provider.getBlockNumber();
    const nft = new ethers.Contract(config.nft, NABI, provider);
    const pos = await nft.positions(config.pid);
    const token0 = pos[2], token1 = pos[3], fee = Number(pos[4]);
    const tL = Number(pos[5]), tU = Number(pos[6]);
    const fac = new ethers.Contract(config.fac, FABI, provider);
    const pa = await fac.getPool(token0, token1, fee);
    const pool = new ethers.Contract(pa, PABI, provider);
    const s0 = await pool.slot0();
    const sqrtPX96 = s0[0], tick = Number(s0[1]);
    const cp = this.s2p(sqrtPX96);
    return { cp, tL, tU, tick, ir: tick >= tL && tick <= tU, bn, full: this.isFullRange(tL, tU) };
  },

  async scanChainHolders(provider, contract, label) {
    const TRANSFER = ethers.id('Transfer(address,address,uint256)');
    const balances = {};
    const holders = new Set();

    try {
      const latest = await provider.getBlockNumber();
      let allLogs = [];
      try {
        allLogs = await provider.getLogs({
          address: contract, topics: [TRANSFER], fromBlock: 0, toBlock: latest
        });
      } catch (e) {
        const chunkSize = 50000;
        const startBlock = Math.max(latest - 2000000, 0);
        for (let from = startBlock; from <= latest; from += chunkSize) {
          const to = Math.min(from + chunkSize - 1, latest);
          try {
            const logs = await provider.getLogs({
              address: contract, topics: [TRANSFER], fromBlock: from, toBlock: to
            });
            allLogs = allLogs.concat(logs);
          } catch (e2) { /* skip chunk */ }
        }
      }

      const zero = '0x0000000000000000000000000000000000000000';
      for (const log of allLogs) {
        if (!log.topics || log.topics.length < 3) continue;
        const from = '0x' + log.topics[1].slice(26).toLowerCase();
        const to = '0x' + log.topics[2].slice(26).toLowerCase();
        const val = Number(BigInt(log.data)) / 1e18;
        if (from !== zero) balances[from] = (balances[from] || 0) - val;
        if (to !== zero) balances[to] = (balances[to] || 0) + val;
      }
    } catch (e) { console.log('[Holders] ' + label + ' error:', e.message); }

    for (const addr in balances) {
      if (balances[addr] > 0.0001) holders.add(addr);
    }
    return holders;
  },

  calcMetrics(d, vol, days, z) {
    const o = this.gbm(d.cp, vol, days, z);
    const optHalf = o.hi / d.cp - 1;
    const optFpt = this.fpt(vol, optHalf);
    const result = { optimal: o, optHalf, optFpt, full: d.full };

    if (d.full) {
      result.util = null;
      result.dte = Infinity;
      result.efficiency = 1.0;
      result.direction = null;
    } else {
      const pL = this.t2p(d.tL), pU = this.t2p(d.tU);
      const logU = Math.abs(Math.log(d.cp / pL) - Math.log(pU / pL) * 0.5) / (Math.log(pU / pL) * 0.5);
      result.util = Math.min(logU, 1);
      result.direction = d.tick > (d.tL + d.tU) / 2 ? '→ Upper' : '← Lower';
      const halfW = Math.abs(Math.log(pU / d.cp));
      result.dte = this.fpt(vol, Math.exp(halfW) - 1);
      result.efficiency = Math.sqrt(d.cp) / (Math.sqrt(pU) - Math.sqrt(pL));
      result.pL = pL;
      result.pU = pU;
      result.logPosition = (Math.log(d.cp) - Math.log(pL)) / (Math.log(pU) - Math.log(pL));
    }

    result.rbMonth = d.full ? 0 : (30 / optFpt < 1 ? '<1' : '~' + (30 / optFpt).toFixed(1));
    result.rbYear = d.full ? 0 : Math.round(365 / optFpt);
    result.twDay = Math.round(this.fpt(vol, optHalf * .75));
    result.tcDay = Math.round(this.fpt(vol, optHalf * .90));
    result.teDay = Math.round(optFpt);

    return result;
  }
};
