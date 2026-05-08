/**
 * TDIC Mock Backend (localStorage)
 * ─────────────────────────────────
 * Substitui o tdic-backend (Railway) até ele existir.
 * Persiste em localStorage para sobreviver F5.
 *
 * Quando o backend real existir, basta apontar API_BASE
 * para EFIX_CONFIG.tdicBackend e remover este arquivo.
 */

(function (global) {
  "use strict";

  const KEY = "tdic_mock_db_v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      return JSON.parse(raw);
    } catch (_) {
      return seed();
    }
  }

  function save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (_) {}
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function seed() {
    const db = {
      cedentes: {},
      creditos: [],
      crs: [],
      txs: [],
      whitelist: {},
    };
    save(db);
    return db;
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms || 350));
  }

  // ── Cedente / KYB ─────────────────────────────────────────
  async function getCedente(walletAddress) {
    await delay();
    const db = load();
    return db.cedentes[walletAddress.toLowerCase()] || null;
  }

  async function submitKyb(walletAddress, payload) {
    await delay();
    const db = load();
    const addr = walletAddress.toLowerCase();
    const existing = db.cedentes[addr] || {};
    const history = Array.isArray(existing.signatureHistory) ? existing.signatureHistory.slice() : [];
    if (payload.signedContract) {
      history.push({ ...payload.signedContract, recordedAt: new Date().toISOString() });
    }
    const isReSign = !!existing.kybStatus;
    db.cedentes[addr] = {
      walletAddress: addr,
      cnpj: payload.cnpj,
      razaoSocial: payload.razaoSocial,
      regimeTributario: payload.regimeTributario || "lucro-real",
      contato: payload.contato || {},
      docs: payload.docs || existing.docs || [],
      // Conta para liquidação (PIX + tradicional, BACEN compliant)
      bankAccount: payload.bankAccount || existing.bankAccount || null,
      // Aceitação eletrônica do Instrumento de Cessão (sempre o mais recente).
      signedContract: payload.signedContract || existing.signedContract || null,
      // Histórico completo de assinaturas — append-only.
      signatureHistory: history,
      // Re-assinatura preserva o status anterior (já aprovado segue aprovado).
      kybStatus: isReSign ? existing.kybStatus : "pending",
      submittedAt: existing.submittedAt || new Date().toISOString(),
      reSignedAt: isReSign ? new Date().toISOString() : null,
      approvedAt: existing.approvedAt || null,
    };
    save(db);
    return db.cedentes[addr];
  }

  async function getSignatureHistory(walletAddress) {
    await delay();
    const db = load();
    const c = db.cedentes[walletAddress.toLowerCase()];
    return c?.signatureHistory || [];
  }

  async function approveKyb(walletAddress) {
    await delay();
    const db = load();
    const addr = walletAddress.toLowerCase();
    if (!db.cedentes[addr]) throw new Error("Cedente não encontrado");
    db.cedentes[addr].kybStatus = "approved";
    db.cedentes[addr].approvedAt = new Date().toISOString();
    db.whitelist[addr] = true;
    save(db);
    return db.cedentes[addr];
  }

  async function listCedentes() {
    await delay();
    const db = load();
    return Object.values(db.cedentes);
  }

  // ── Créditos ─────────────────────────────────────────────
  async function cadastrarCredito(walletAddress, payload) {
    await delay();
    const db = load();
    const addr = walletAddress.toLowerCase();
    const credito = {
      id: uid("CRED"),
      cedenteWallet: addr,
      devedorCnpj: payload.devedorCnpj,
      devedorRazaoSocial: payload.devedorRazaoSocial,
      tipo: payload.tipo || "confissao-divida",
      faceValue: Number(payload.faceValue) || 0,
      maturityDate: payload.maturityDate,
      // Deságio: armazena tanto bps quanto valor absoluto + modo + inputs originais
      discountBps: Number(payload.discountBps) || 1500,
      discountBrl: Number(payload.discountBrl) || 0,
      discountMode: payload.discountMode || "pct",
      discountInputs: payload.discountInputs || null,
      netValue:
        Number(payload.netValue) ||
        (Number(payload.faceValue) || 0) - (Number(payload.discountBrl) || 0),
      prazoDias: Number(payload.prazoDias) || null,
      // Campos de import em lote (planilha modelo)
      dupl: payload.dupl || null,
      chaveNF: payload.chaveNF || null,
      abatimento: Number(payload.abatimento) || 0,
      devedorContato: payload.devedorContato || null,
      origem: payload.origem || "manual",
      docs: payload.docs || [],
      status: "em-analise",
      createdAt: new Date().toISOString(),
    };
    db.creditos.push(credito);
    save(db);
    return credito;
  }

  async function cadastrarCreditosLote(walletAddress, items) {
    const out = [];
    for (const it of items) {
      out.push(await cadastrarCredito(walletAddress, it));
    }
    return out;
  }

  async function listCreditos(walletAddress) {
    await delay();
    const db = load();
    const addr = walletAddress.toLowerCase();
    return db.creditos.filter((c) => c.cedenteWallet === addr);
  }

  async function listAllCreditos() {
    await delay();
    const db = load();
    return db.creditos;
  }

  // ── CRs (Certificados de Recebíveis) ────────────────────
  async function aprovarCR(creditoId) {
    await delay();
    const db = load();
    const credito = db.creditos.find((c) => c.id === creditoId);
    if (!credito) throw new Error("Crédito não encontrado");
    if (credito.status !== "em-analise") throw new Error("Crédito não está em análise");

    const tokenId = "0x" + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    const cr = {
      id: uid("CR"),
      creditoId,
      tokenId,
      cedenteWallet: credito.cedenteWallet,
      faceValue: credito.faceValue,
      discountBps: credito.discountBps,
      maturityDate: credito.maturityDate,
      status: "approved",
      mintTxHash: null,
      mintedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.crs.push(cr);
    credito.status = "aprovado";
    credito.crId = cr.id;
    credito.tokenId = tokenId;
    save(db);
    return cr;
  }

  async function mintarCR(creditoId) {
    await delay(1200);
    const db = load();
    const cr = db.crs.find((c) => c.creditoId === creditoId);
    if (!cr) throw new Error("CR não encontrado");
    if (cr.status !== "approved") throw new Error("CR não está aprovado para mint");

    const txHash = "0x" + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    cr.status = "active";
    cr.mintTxHash = txHash;
    cr.mintedAt = new Date().toISOString();

    const credito = db.creditos.find((c) => c.id === creditoId);
    if (credito) credito.status = "mintado";

    db.txs.push({
      hash: txHash,
      type: "mint",
      tokenId: cr.tokenId,
      to: cr.cedenteWallet,
      faceValue: cr.faceValue,
      timestamp: new Date().toISOString(),
    });

    save(db);
    return { txHash, cr };
  }

  async function listCRs(walletAddress) {
    await delay();
    const db = load();
    const addr = walletAddress.toLowerCase();
    return db.crs.filter((c) => c.cedenteWallet === addr);
  }

  async function listAllCRs() {
    await delay();
    const db = load();
    return db.crs;
  }

  // ── Histórico ─────────────────────────────────────────────
  async function listTxs(walletAddress) {
    await delay();
    const db = load();
    const addr = walletAddress.toLowerCase();
    return db.txs.filter((t) => t.to === addr);
  }

  // ── Reset (debug only) ────────────────────────────────────
  function reset() {
    localStorage.removeItem(KEY);
    return seed();
  }

  global.TdicMock = {
    getCedente,
    submitKyb,
    getSignatureHistory,
    approveKyb,
    listCedentes,
    cadastrarCredito,
    cadastrarCreditosLote,
    listCreditos,
    listAllCreditos,
    aprovarCR,
    mintarCR,
    listCRs,
    listAllCRs,
    listTxs,
    reset,
  };
})(typeof window !== "undefined" ? window : globalThis);
