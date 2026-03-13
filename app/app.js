// app/app.js — Pure business logic for Main App
// No DOM references. Uses ethers.js as global (CDN-loaded).

const AppLogic = {
  CONTRACTS: {
    vault: '0x2eA512b4C5e53A8c1302AC8ba2d43c5DA90b307C',
    efixDIToken: null, // set from EFIX_CONFIG
    pixBridge: '0x1d97f1adbf545F3C99d33A6a2166Ee423A78f4C3',
    lendingPool: '0x13AB76468eFE0d35f2700DEcBd52Ce28f8827A0C',
    oracle: '0xD9d24596DDAbB1CcE603D4d8AD04A97c1836Ae94'
  },

  POLYGON_CHAIN_ID: '0x89',

  VAULT_ABI: [
    'function positions(address) view returns (uint256 principal, uint256 efixDIBalance, uint256 borrowedUSDC, uint256 leverageLoops, uint256 lastUpdateTimestamp, bool hedgeActive)',
    'function getHealthFactor(address) view returns (uint256)',
    'function applyLeverage(uint8 loops) external',
    'function deleverage(uint8 loops) external',
    'function withdraw(uint256 amount, string pixKey) external'
  ],

  TOKEN_ABI: [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ],

  init(efixPolygonAddr) {
    this.CONTRACTS.efixDIToken = efixPolygonAddr;
  },

  async connectWallet(ethereum) {
    await ethereum.request({ method: 'eth_requestAccounts' });
    let chainId = await ethereum.request({ method: 'eth_chainId' });
    if (chainId !== this.POLYGON_CHAIN_ID) {
      chainId = await this.switchToPolygon(ethereum);
    }
    if (chainId !== this.POLYGON_CHAIN_ID) {
      throw new Error('Mude para Polygon Mainnet para continuar');
    }
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const contracts = {
      vault: new ethers.Contract(this.CONTRACTS.vault, this.VAULT_ABI, signer),
      token: new ethers.Contract(this.CONTRACTS.efixDIToken, this.TOKEN_ABI, signer)
    };
    return { provider, signer, address, contracts };
  },

  async switchToPolygon(ethereum) {
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: this.POLYGON_CHAIN_ID }]
      });
    } catch (switchError) {
      if (switchError.code !== 4902) {
        throw switchError;
      }
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: this.POLYGON_CHAIN_ID,
          chainName: 'Polygon Mainnet',
          nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
          rpcUrls: ['https://polygon-rpc.com'],
          blockExplorerUrls: ['https://polygonscan.com']
        }]
      });
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: this.POLYGON_CHAIN_ID }]
      });
    }
    return await ethereum.request({ method: 'eth_chainId' });
  },

  async fetchPosition(vaultContract, address) {
    const position = await vaultContract.positions(address);
    const hf = await vaultContract.getHealthFactor(address);

    const result = {
      principal: position[0],
      efixDIBalance: position[1],
      borrowedUSDC: position[2],
      leverageLoops: Number(position[3]),
      principalFormatted: parseFloat(ethers.formatEther(position[0])).toFixed(2),
      efixDIFormatted: parseFloat(ethers.formatEther(position[1])).toFixed(2),
      debtFormatted: parseFloat(ethers.formatUnits(position[2], 6)).toFixed(2),
      loopsStr: position[3].toString()
    };

    if (hf.toString() === ethers.MaxUint256.toString()) {
      result.hfValue = '∞';
      result.hfPercent = 100;
      result.hfClass = 'safe';
    } else {
      const hfNum = Number(hf) / 1e16;
      result.hfValue = hfNum.toFixed(2);
      result.hfPercent = Math.min(100, (hfNum / 3) * 100);
      result.hfClass = hfNum < 1.1 ? 'danger' : hfNum < 1.3 ? 'warning' : 'safe';
    }

    const apys = [15, 22, 27, 32];
    result.apy = apys[Math.min(result.leverageLoops, 3)];

    return result;
  },

  async createPixQR(backend, amount, address) {
    let response, retries = 3;
    while (retries > 0) {
      try {
        response = await fetch(backend + '/api/pix/qrcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amount.toFixed(2), walletAddress: address })
        });
        if (response.ok) break;
      } catch (fetchErr) {
        console.warn('QR fetch retry', fetchErr);
      }
      retries--;
      if (retries > 0) await new Promise(r => setTimeout(r, 1500));
    }
    if (!response || !response.ok) throw new Error('Servidor indisponível após 3 tentativas');
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erro ao gerar QR Code');
    return {
      emv: data.qrcode.emv,
      imageUrl: data.qrcode.imageUrl,
      amount: parseFloat(data.qrcode.amount).toFixed(2)
    };
  },

  async checkDepositStatus(backend, address) {
    const res = await fetch(backend + '/api/deposit/status/' + address);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  },

  async checkPreviousDeposit(backend, address) {
    try {
      const data = await this.checkDepositStatus(backend, address);
      return data.found ? data.e2eId : null;
    } catch (e) {
      return null;
    }
  },

  async applyLeverage(contracts, address, loopsToApply) {
    const allowance = await contracts.token.allowance(address, this.CONTRACTS.vault);
    let approveTx = null;
    if (allowance < ethers.MaxUint256 / 2n) {
      approveTx = await contracts.token.approve(this.CONTRACTS.vault, ethers.MaxUint256);
      await approveTx.wait();
    }
    const tx = await contracts.vault.applyLeverage(loopsToApply);
    await tx.wait();
    return tx;
  },

  async removeLeverage(contracts) {
    const tx = await contracts.vault.deleverage(1);
    await tx.wait();
    return tx;
  },

  async withdrawFunds(contracts, amount, pixKey) {
    const amountWei = ethers.parseEther(amount.toString());
    const tx = await contracts.vault.withdraw(amountWei, pixKey);
    return tx;
  }
};
