async function rpc(url, to, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  });
  if (!r.ok) throw new Error('RPC HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error('RPC error: ' + (j.error.message || j.error));
  return j.result;
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
  const d = BigInt(decimals || 18);
  const bi = BigInt(hex || '0x0');
  const divisor = 10n ** d;
  const intPart = bi / divisor;
  const fracPart = bi % divisor;
  return Number(intPart) + Number(fracPart) / Number(divisor);
}

async function ethBal(url, addr) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] })
  });
  if (!r.ok) throw new Error('RPC HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error('RPC error: ' + (j.error.message || j.error));
  const bi = BigInt(j.result || '0x0');
  const divisor = 10n ** 18n;
  const intPart = bi / divisor;
  const fracPart = bi % divisor;
  return Number(intPart) + Number(fracPart) / Number(divisor);
}
