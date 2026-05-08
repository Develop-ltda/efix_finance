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
      // Log de e-mails enviados (mock — em prod vai para Sendgrid/Resend
      // via backend e fica gravado em outbox table com status delivery).
      emails: [],
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

  // Log de e-mail de aprovação de CR (privada). Em produção, esse endpoint
  // dispara o envio real via Sendgrid/Resend e armazena status de delivery.
  async function logCREmail(payload) {
    await delay();
    const db = load();
    const entry = {
      id: uid("EMAIL"),
      ...payload,
      type: "cr-approved-private",
      status: "sent",
      createdAt: new Date().toISOString(),
    };
    db.emails.push(entry);
    // Atualiza o CR com o link de subscrição
    const cr = db.crs.find((c) => c.id === payload.crId);
    if (cr) {
      cr.subscriptionLink = payload.subscriptionLink;
      cr.subscriptionAmount = payload.subscriptionAmount;
      cr.notifiedAt = entry.createdAt;
    }
    save(db);
    return entry;
  }

  async function listCREmails(creditoId) {
    await delay();
    const db = load();
    return db.emails.filter((e) => !creditoId || e.creditoId === creditoId);
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
  async function aprovarCR(creditoId, overrides) {
    await delay();
    const db = load();
    const credito = db.creditos.find((c) => c.id === creditoId);
    if (!credito) throw new Error("Crédito não encontrado");
    if (credito.status !== "em-analise") throw new Error("Crédito não está em análise");

    const tokenId = "0x" + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    // Parâmetros sugeridos pela cedente (preservados como histórico).
    const suggested = {
      discountBps: credito.discountBps,
      discountBrl: credito.discountBrl,
      discountMode: credito.discountMode,
      discountInputs: credito.discountInputs,
      netValue: credito.netValue,
      abatimento: credito.abatimento || 0,
    };

    // Parâmetros arbitrados pela EFIX (admin), se enviados.
    const arb = overrides || null;
    const finalDiscountBps = arb?.discountBps ?? credito.discountBps;
    const finalDiscountBrl = arb?.discountBrl ?? credito.discountBrl;
    const finalRoyaltyBps = arb?.royaltyBps ?? 0;
    const finalRoyaltyBrl = arb?.royaltyBrl ?? 0;
    const finalAbatimento = arb?.abatimento ?? credito.abatimento ?? 0;
    const finalNetValue =
      arb?.netValue ??
      Math.max(0, credito.faceValue - finalDiscountBrl - finalRoyaltyBrl - finalAbatimento);

    // Modalidade da operação:
    //   "private"      = securitização privada com TDIC (auto-securitização)
    //   "public"       = securitização pública (CVM 88 crowdfunding)
    //   "venda-direta" = cessão direta sem CR e sem TDIC (factoring)
    const allowed = ["private", "public", "venda-direta"];
    const issuanceType = allowed.includes(arb?.issuanceType) ? arb.issuanceType : "private";

    const cr = {
      id: uid("CR"),
      creditoId,
      tokenId,
      cedenteWallet: credito.cedenteWallet,
      faceValue: credito.faceValue,
      // Parâmetros finais (arbitrados ou sugeridos)
      discountBps: finalDiscountBps,
      discountBrl: finalDiscountBrl,
      royaltyBps: finalRoyaltyBps,
      royaltyBrl: finalRoyaltyBrl,
      abatimento: finalAbatimento,
      netValue: finalNetValue,
      // Estrutura da emissão
      issuanceType,
      tomadorWallet: issuanceType === "private" ? credito.cedenteWallet : null,
      subscriptionStatus: issuanceType === "private" ? "pending-payment" : "open",
      subscriptionLink: null, // setado pelo admin após aprovar (via logCREmail)
      maturityDate: credito.maturityDate,
      // Trilha de auditoria: o que a cedente sugeriu vs. o que a EFIX arbitrou
      suggested,
      arbitrated: arb,
      status: "approved",
      mintTxHash: null,
      mintedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.crs.push(cr);
    credito.status = "aprovado";
    credito.crId = cr.id;
    credito.tokenId = tokenId;
    // Sobrescreve o crédito com os parâmetros finais (mantém suggested separado)
    credito.discountBps = finalDiscountBps;
    credito.discountBrl = finalDiscountBrl;
    credito.netValue = finalNetValue;
    credito.royaltyBps = finalRoyaltyBps;
    credito.royaltyBrl = finalRoyaltyBrl;
    credito.abatimento = finalAbatimento;
    credito.suggested = suggested;
    credito.arbitrated = arb;
    save(db);
    return cr;
  }

  // Liquidação de venda direta (sem CR / sem TDIC).
  // Marca a operação como liquidada apenas no banco, sem tx on-chain.
  async function liquidarVendaDireta(creditoId) {
    await delay();
    const db = load();
    const cr = db.crs.find((c) => c.creditoId === creditoId);
    if (!cr) throw new Error("Operação não encontrada");
    if (cr.issuanceType !== "venda-direta") {
      throw new Error("Esta operação requer mint de TDIC (não é venda direta).");
    }
    cr.status = "liquidated-direct";
    cr.liquidatedAt = new Date().toISOString();
    const credito = db.creditos.find((c) => c.id === creditoId);
    if (credito) credito.status = "liquidado";
    save(db);
    return cr;
  }

  async function mintarCR(creditoId) {
    await delay(1200);
    const db = load();
    const cr = db.crs.find((c) => c.creditoId === creditoId);
    if (!cr) throw new Error("CR não encontrado");
    if (cr.status !== "approved") throw new Error("CR não está aprovado para mint");
    if (cr.issuanceType === "venda-direta") {
      throw new Error("Venda direta não emite TDIC — use 'Marcar liquidado'.");
    }

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

  // ── Seed de demonstração ──────────────────────────────────
  // Cria 1 cedente fictício (Siderquímica como caso real do brief) com KYB
  // pendente + 7 créditos a analisar. Útil pra testar o admin sem precisar
  // ir até o app cedente cadastrar KYB e importar planilha.
  async function seedDemo() {
    await delay();
    const db = load();
    const demoAddr = "0xdem0c3d3nt3517ab12345678901234567890abcd";
    db.cedentes[demoAddr] = {
      walletAddress: demoAddr,
      cnpj: "04.876.970/0001-06",
      razaoSocial: "C2LOG TRANSPORTES LTDA (DEMO)",
      regimeTributario: "lucro-real",
      contato: {
        nome: "Ernesto Otero",
        cargo: "CFO",
        email: "ernesto.otero@hausbank.com.br",
        tel: "(41) 2105-3838",
        faturamento: "10m-50m",
      },
      docs: [
        { key: "contrato-social", name: "contrato-social.pdf", uploadedAt: new Date().toISOString() },
        { key: "receita-cnpj", name: "cartao-cnpj.pdf", uploadedAt: new Date().toISOString() },
      ],
      bankAccount: {
        pix: { type: "cnpj", key: "04.876.970/0001-06" },
        bank: { compe: "237", name: "Bradesco", type: "cc", agencia: "0597", conta: "12345-6", contaVar: null },
        ownership: "self",
      },
      signedContract: {
        version: "1.0.0",
        title: "Instrumento Particular de Cessão de Direitos Creditórios",
        signatory: { name: "Ernesto Otero", cpf: "000.000.000-00", email: "ernesto.otero@hausbank.com.br" },
        cedente: { cnpj: "04.876.970/0001-06", razaoSocial: "C2LOG TRANSPORTES LTDA (DEMO)" },
        wallet: demoAddr,
        acceptedAt: new Date().toISOString(),
        acceptedAtLocal: new Date().toString(),
        userAgent: "demo-seed",
        documentTextHash: "demo-hash-" + Date.now().toString(36),
        provider: "none",
        envelopeId: "EFIX-DEMO-" + Date.now().toString(36),
      },
      signatureHistory: [],
      kybStatus: "pending",
      submittedAt: new Date().toISOString(),
      approvedAt: null,
      reSignedAt: null,
    };

    const sample = [
      { dupl: "15457-1", valor: 94634.91, vencto: "2026-06-10" },
      { dupl: "15458-0", valor: 41196.88, vencto: "2026-06-10" },
      { dupl: "15459-8", valor: 579.88, vencto: "2026-06-10" },
      { dupl: "15460-1", valor: 3947.17, vencto: "2026-06-10" },
      { dupl: "15461-0", valor: 2209.55, vencto: "2026-06-10" },
      { dupl: "15462-8", valor: 166.49, vencto: "2026-06-10" },
      { dupl: "15463-6", valor: 62.08, vencto: "2026-06-10" },
    ];
    sample.forEach((s, i) => {
      db.creditos.push({
        id: uid("CRED"),
        cedenteWallet: demoAddr,
        devedorCnpj: "73.586.976/0001-61",
        devedorRazaoSocial: "SIDERQUIMICA INDUSTRIA E COMERCIO DE PRODUTOS QUIMICOS S/A",
        tipo: "duplicata",
        faceValue: s.valor,
        maturityDate: s.vencto,
        discountBps: 250 * (i % 3 === 0 ? 4 : 3), // varia 7,5%-10%
        discountBrl: 0,
        discountMode: "pct",
        discountInputs: { pctMonthly: 2.5, brlFlat: 0, pctEffective: 7.5 },
        netValue: s.valor,
        prazoDias: 30,
        dupl: s.dupl,
        chaveNF: null,
        abatimento: 0,
        devedorContato: {
          email: "DIOCLEA.BILL@SBCHEMICALS.COM.BR",
          telefone: "4121053838",
          endereco: "RODOVIA BR-376, 376",
          bairro: "SAO MARCOS",
          cidade: "SAO JOSE DOS PINHAIS",
          uf: "PR",
          cep: "83090-360",
        },
        origem: "demo-seed",
        docs: [],
        status: "em-analise",
        createdAt: new Date().toISOString(),
      });
    });
    save(db);
    return { cedente: db.cedentes[demoAddr], creditos: db.creditos.length };
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
    logCREmail,
    listCREmails,
    liquidarVendaDireta,
    mintarCR,
    listCRs,
    listAllCRs,
    listTxs,
    reset,
    seedDemo,
  };
})(typeof window !== "undefined" ? window : globalThis);
