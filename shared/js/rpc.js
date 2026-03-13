async function rpc(url, to, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  });
  return (await r.json()).result;
}

function padAddr(addr) {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

function balOf(addr) {
  return '0x70a08231' + padAddr(addr);
}

async function rpcBigInt(url, to, data) {
  return BigInt(await rpc(url, to, data) || '0x0');
}

function hexToNum(hex, decimals) {
  return Number(BigInt(hex || '0x0')) / Math.pow(10, decimals || 18);
}

async function ethBal(url, addr) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] })
  });
  const j = await r.json();
  return Number(BigInt(j.result || '0x0')) / 1e18;
}
