async function rpc(url, to, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  });
  return (await r.json()).result;
}

function balOf(addr) {
  return '0x70a08231' + addr.slice(2).padStart(64, '0');
}

async function rpcBigInt(url, to, data) {
  return BigInt(await rpc(url, to, data) || '0x0');
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
