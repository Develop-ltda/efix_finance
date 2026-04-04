const EFIX_CONFIG = {
  backend: 'https://efixdi-backend-production.up.railway.app',
  bridgeProxy: 'https://efix-bridge-proxy-production.up.railway.app',
  securitizadora: 'https://efix-securitizadora-production.up.railway.app',
  alchemy: '5QrXWREEtmi4gITNoJsJf',
  rpc: {
    polygon: 'https://polygon-mainnet.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf',
    base: 'https://base-mainnet.g.alchemy.com/v2/5QrXWREEtmi4gITNoJsJf',
  },
  contracts: {
    efixPolygon: '0x04082b283818D9d0dd9Ee8742892eEe5CC396441',
    efixBase: '0xF5cA55f3ea5Bcd180aEa6dF9E05a0E63A66f5608',
    usdcBase: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    morphoMarketId: '0x31d65cadef8eb085dd3bead61b987b3f86a7ac7d3e1f4763f6d4ec6a477d345a',
    operator: '0x9eFc11e4d285b5a749faFBC2613836Dcda899e12',
  },
  brle: {
    token: '0x7D12a82E335EB2Be0789A33CE2EBF7Eb2bA782F6',
    psm: '0xB89A62c2B1d006A2fB472B6445a52ABA2F70E6Ab',
    sbrle: '0xC65069694e32ef72CD94649BC5174DF9D18475D0',
    swap: '0xDac75EC3f9d0294d4a48BcE5d0d7A2b0693D7AD1',
    backend: 'https://brle-protocol-production.up.railway.app',
  },
};
