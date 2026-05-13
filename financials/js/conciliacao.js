/**
 * conciliacao.js — Motor de cruzamento BTG ↔ Fireblocks com enriquecimento Bridge/Sumsub.
 *
 * Porte do `reconcile_btg_fireblocks.py`, adaptado pra consumir os globals
 * já carregados pelas abas 🔥 Fireblocks (FB_INFLOWS) e 🏦 BTG (BTG_DATA),
 * mais o estoque de clientes estático (CLIENTES_LOOKUP) e as fontes API
 * Bridge + Sumsub (carregadas via ConciliacaoSources).
 *
 * API pública:
 *   Conciliacao.reconciliar(btg, fb, opts)
 *   Conciliacao.enrichMatches(matches, {bridgeCustomers, sumsubApplicants})
 *   Conciliacao.exportEnriquecimentoCSV(matches)
 *   Conciliacao.exportSimpleCSV(matches)
 *   Conciliacao.downloadCSV(csv, filename)
 *   Conciliacao.parseBTGCounterparty(desc)
 *   Conciliacao.adaptBTG(pageBtgData)
 *   Conciliacao.adaptFB(pageFbInflows)
 *   Conciliacao.constants
 */

(function (global) {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // Constantes do modelo (espelham reconcile_btg_fireblocks.py)
  // ════════════════════════════════════════════════════════════════
  const TAXA_EFIX_PCT  = 0.03;
  const IOF_CAMBIO_PCT = 0.0038;
  const COTACAO_MIN    = 4.50;
  const COTACAO_MAX    = 6.50;
  const TOLERANCIA_USD = 0.05;
  const JANELA_DIAS    = { min: -2, max: 5 };

  const INTERMEDIARIOS = new Set([
    'TRANSFERO PAGAMENTOS S/A',
    'Transfero Brasil Pagamentos Sa',
    'TRANSFERO BRASIL PAGAMENTOS S.A.',
    'HAUS SERVICOS FINANCEIROS LTDA',
    'Haus Servicos Financeiros Ltda',
    'EFIX PLATAFORMA DE TOKENIZACAO E CROWDFUNDING LTDA',
    'ACESSO SOLUCOES DE PAGAMENTO SA INSTITUICAO DE PAG',
    'CONTA PRONTA I PAGAMENTOS S A',
    'Wise Brasil Corretora de Cambio Ltda',
    'Pagadoria Digital Ltda',
    'Webro Tecnologia e Servicos Financeiros Ltda',
    'PAULISTA SERVICOS DE RECEBIMENTOS E PAGAMENTOS LTDA',
    'BCOITAUBBA TGRJ 20 EMP IMOB LT',
  ].map(s => s.toUpperCase()));

  const DESPESAS_PREFIXOS = [
    'CONDOMINIO ARTE CONECTA',
    'Pagamento de Conta / Tributo - PM Rio de Janeiro',
    'Spe Niemeyer', 'MRV', 'RK14', 'Opportunity', 'Gafisa',
    'Teixeira De Melo', 'TGRJ-20', 'N B W 1', 'SPE DAS AMERICAS',
    'BENEFICIO NACIONAL TRIBUTARIO',
  ];

  // PTAX mensal aproximada — substituir por fetch BCB em v2
  global.PTAX_MENSAL = global.PTAX_MENSAL || {
    '2025-11': 5.50, '2025-12': 5.65,
    '2026-01': 5.13, '2026-02': 5.00, '2026-03': 5.00,
    '2026-04': 5.03, '2026-05': 5.10,
  };

  // ════════════════════════════════════════════════════════════════
  // Counterparty extraction (do Descricao BTG)
  // ════════════════════════════════════════════════════════════════
  function parseBTGCounterparty(desc) {
    desc = String(desc).trim();
    let m;
    if ((m = desc.match(/^Pix recebido de (.+?)(\s*[\dQq][\w-]{10,}.*)?$/i)))
      return { tipo: 'PIX_IN', nome: m[1].trim() };
    if ((m = desc.match(/^Pix enviado para (.+?)(\s*-?\s*QRCode.*)?(\s*[\dQq][\w-]{10,}.*)?$/i)))
      return { tipo: 'PIX_OUT', nome: m[1].trim() };
    if ((m = desc.match(/^TED recebida de (.+)/i)))
      return { tipo: 'TED_IN', nome: m[1].trim() };
    if ((m = desc.match(/^TED enviada para (.+)/i)))
      return { tipo: 'TED_OUT', nome: m[1].trim() };
    if ((m = desc.match(/^Boleto pago por (.+)/i)))
      return { tipo: 'BOLETO_IN', nome: m[1].trim() };
    if ((m = desc.match(/^Pagamento de boleto enviado para (.+)/i)))
      return { tipo: 'BOLETO_OUT', nome: m[1].trim() };
    if ((m = desc.match(/^Devolução do pix recebido de (.+)/i)))
      return { tipo: 'DEV_PIX', nome: m[1].trim() };
    return { tipo: 'OUTRO', nome: desc.substring(0, 80) };
  }

  // ════════════════════════════════════════════════════════════════
  // Adapters: pegam as estruturas já parseadas pelas abas FB/BTG da
  // página e re-shape no formato interno do algoritmo.
  // ════════════════════════════════════════════════════════════════
  function adaptBTG(pageBtgData) {
    return (pageBtgData || []).map(r => {
      const cp = parseBTGCounterparty(r.Descricao || '');
      return {
        data: r._iso ? new Date(r._iso + 'T00:00:00Z') : null,
        descricao: r.Descricao || '',
        valor: r._val || 0,
        saldo: r._saldo || 0,
        tipoOperacao: cp.tipo,
        contraparte: cp.nome,
      };
    }).filter(e => e.data && !isNaN(e.data));
  }

  function adaptFB(pageFbInflows) {
    return (pageFbInflows || []).map(r => ({
      txid: r['Fireblocks TxId'] || r['TxHash'] || '',
      date: r._date && r._date.iso ? new Date(r._date.iso + 'T00:00:00Z') : null,
      status: r['Status'] || '',
      asset: r['Asset Symbol'] || r.asset || '',
      amount: parseFloat(r['Net Amount'] || r['Amount'] || r._amt || 0),
      usd: parseFloat(r['USD Amount'] || r._usd || 0),
      srcType: r['Source Type'] || '',
      srcName: r['Source'] || '',
      srcAddr: r['Source Address'] || '',
      dstType: r['Destination Type'] || '',
      dstName: r['Destination'] || '',
      dstAddr: r['Destination Address'] || '',
      note: r['Note'] || '',
    })).filter(t => t.date && !isNaN(t.date));
  }

  // ════════════════════════════════════════════════════════════════
  // Classificadores
  // ════════════════════════════════════════════════════════════════
  function isIntermediario(nome) {
    if (!nome) return false;
    return INTERMEDIARIOS.has(String(nome).toUpperCase());
  }

  function isDespesaOp(nome) {
    if (!nome) return false;
    const lower = String(nome).toLowerCase();
    return DESPESAS_PREFIXOS.some(p => lower.includes(p.toLowerCase()));
  }

  function diffDays(d1, d2) {
    // Compara apenas a parte de data (sem horas), igual ao Python (.date()).
    const a = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
    const b = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
    return Math.round((a - b) / (24 * 3600 * 1000));
  }

  function getPtaxForMonth(date) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return global.PTAX_MENSAL[key] || 5.50;
  }

  function round(v, decimais) {
    const f = Math.pow(10, decimais);
    return Math.round(v * f) / f;
  }

  function computeConfidence(best, qtdCandidatos, ptaxMensal) {
    const bandaMin = ptaxMensal * 0.95;
    const bandaMax = ptaxMensal * 1.05;
    const cotacaoOK = best.cotacaoImpl >= bandaMin && best.cotacaoImpl <= bandaMax;
    if (Math.abs(best.dias) === 0 && qtdCandidatos === 1 && cotacaoOK) return 'high';
    if (Math.abs(best.dias) <= 2 && qtdCandidatos <= 3) return 'medium';
    return 'low';
  }

  // ════════════════════════════════════════════════════════════════
  // Algoritmo principal
  // ════════════════════════════════════════════════════════════════
  function reconciliar(btgEntries, fbTransactions) {
    const fbCandidatos = fbTransactions.filter(t =>
      t.status === 'COMPLETED' &&
      ['USDC', 'USDT'].includes(t.asset) &&
      t.srcType === 'Vault'
    );

    const matches = [];
    const naoCasados = [];
    const txidsCasados = new Set();

    for (const b of btgEntries) {
      if (!['PIX_IN', 'TED_IN', 'BOLETO_IN'].includes(b.tipoOperacao)) continue;
      if (b.valor <= 0) continue;
      if (isIntermediario(b.contraparte)) continue;
      if (isDespesaOp(b.contraparte)) continue;

      const brlLiquido = b.valor * (1 - TAXA_EFIX_PCT) * (1 - IOF_CAMBIO_PCT);
      let usdMin = brlLiquido / COTACAO_MAX;
      let usdMax = brlLiquido / COTACAO_MIN;
      usdMin *= (1 - TOLERANCIA_USD);
      usdMax *= (1 + TOLERANCIA_USD);

      const candidatos = fbCandidatos
        .filter(f => !txidsCasados.has(f.txid))
        .filter(f => {
          const dias = diffDays(f.date, b.data);
          return dias >= JANELA_DIAS.min && dias <= JANELA_DIAS.max;
        })
        .filter(f => f.amount >= usdMin && f.amount <= usdMax)
        .map(f => ({
          ...f,
          cotacaoImpl: brlLiquido / f.amount,
          dias: diffDays(f.date, b.data),
        }));

      if (candidatos.length === 0) {
        naoCasados.push({
          data: b.data,
          cliente: b.contraparte,
          brl: b.valor,
          usdMin: round(usdMin, 2),
          usdMax: round(usdMax, 2),
          descricao: b.descricao,
        });
        continue;
      }

      const ptaxMensal = getPtaxForMonth(b.data);
      candidatos.sort((a, c) =>
        (Math.abs(a.dias) - Math.abs(c.dias)) ||
        (Math.abs(a.cotacaoImpl - ptaxMensal) - Math.abs(c.cotacaoImpl - ptaxMensal))
      );
      const best = candidatos[0];
      txidsCasados.add(best.txid);

      const lookup = (global.CLIENTES_LOOKUP || {})[b.contraparte] || null;

      matches.push({
        btgData: b.data,
        btgDescricao: b.descricao,
        cliente: b.contraparte,
        razaoSocial: (lookup && lookup.razaoSocial) || b.contraparte,
        cnpj: (lookup && lookup.cnpj) || '',
        tipoNI: (lookup && lookup.tipoNI) || '7',
        pais: (lookup && lookup.pais) || 'BR',
        nota: (lookup && lookup.nota) || '',
        sourceClient: (lookup && lookup.source) || (lookup ? 'lookup' : null),
        brlBruto: b.valor,
        brlLiquido: round(brlLiquido, 2),
        cotacaoImplicita: round(best.cotacaoImpl, 4),
        fbDate: best.date,
        fbTxid: best.txid,
        fbAsset: best.asset,
        fbUsd: best.amount,
        fbDstName: best.dstName,
        fbDstAddr: best.dstAddr,
        diasOffset: best.dias,
        qtdCandidatos: candidatos.length,
        confidence: computeConfidence(best, candidatos.length, ptaxMensal),
        bridge: null,
        sumsub: null,
      });
    }

    return { matches, naoCasados, stats: computeStats(matches, naoCasados, btgEntries) };
  }

  function computeStats(matches, naoCasados, allBtg) {
    const volumeIdentificado = matches.reduce((s, m) => s + m.brlBruto, 0);
    const volumeNaoIdentificado = naoCasados.reduce((s, n) => s + n.brl, 0);
    const clientesUnicos = new Set(matches.map(m => m.cliente)).size;
    const totalElegiveis = matches.length + naoCasados.length;
    const taxaMatch = totalElegiveis > 0 ? matches.length / totalElegiveis : 0;
    const volumeIntermediario = allBtg
      .filter(b => b.valor > 0 && isIntermediario(b.contraparte))
      .reduce((s, b) => s + b.valor, 0);
    return {
      qtdMatches: matches.length,
      qtdNaoCasados: naoCasados.length,
      volumeIdentificado: round(volumeIdentificado, 2),
      volumeNaoIdentificado: round(volumeNaoIdentificado, 2),
      volumeIntermediario: round(volumeIntermediario, 2),
      clientesUnicos,
      taxaMatch: round(taxaMatch * 100, 1),
      confidence: {
        high: matches.filter(m => m.confidence === 'high').length,
        medium: matches.filter(m => m.confidence === 'medium').length,
        low: matches.filter(m => m.confidence === 'low').length,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Enriquecimento Bridge + Sumsub (não-destrutivo, mantém lookup manual quando presente)
  // ════════════════════════════════════════════════════════════════
  function enrichMatches(matches, sources) {
    if (!global.ConciliacaoSources || !sources) return matches;
    const { bridgeCustomers, sumsubApplicants } = sources;
    return matches.map(m => {
      const found = global.ConciliacaoSources.lookupByName(
        m.cliente, bridgeCustomers, sumsubApplicants
      );
      const enriched = { ...m, bridge: found.bridge, sumsub: found.sumsub };

      // Se ainda não tinha CNPJ/CPF e Sumsub tem doc info, herda
      if (!enriched.cnpj && enriched.sumsub) {
        const info = enriched.sumsub.info || {};
        // Sumsub guarda doc number em info.idDocs[*].number (não exposto no list endpoint padrão);
        // aqui usamos email/applicantId como hint, doc real vem de getApplicantData(id).
        enriched.sumsubEmail = enriched.sumsub.email || (info.email || '');
        enriched.sumsubApplicantId = enriched.sumsub.id || enriched.sumsub.applicantId || '';
        enriched.sumsubReview = (enriched.sumsub.review && enriched.sumsub.review.reviewResult)
          || enriched.sumsub.result || '';
        if ((info.country || '').length === 3) enriched.pais = info.country;
      }

      // Bridge enrichment — email + country + kyc_status
      if (enriched.bridge) {
        enriched.bridgeEmail = enriched.bridge.email || '';
        enriched.bridgeId = enriched.bridge.id || '';
        enriched.bridgeKyc = enriched.bridge.kyc_status || '';
        const addr = enriched.bridge.residential_address || enriched.bridge.address || {};
        if (addr.country && addr.country.length === 3) enriched.pais = addr.country;
      }

      // Source label hierarchy: manual > sumsub > bridge > none
      if (!enriched.sourceClient) {
        if (enriched.sumsub) enriched.sourceClient = 'sumsub';
        else if (enriched.bridge) enriched.sourceClient = 'bridge';
      }
      return enriched;
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Export CSV
  // ════════════════════════════════════════════════════════════════
  function exportEnriquecimentoCSV(matches) {
    const headers = [
      'Tipo', 'BTG_Data', 'Cliente_BTG', 'Cliente_RazaoSocial', 'Cliente_CNPJ_CPF',
      'Cliente_TipoNI', 'Cliente_Pais', 'Source_Cliente',
      'Bridge_CustomerId', 'Bridge_Email', 'Bridge_KYC',
      'Sumsub_ApplicantId', 'Sumsub_Email', 'Sumsub_Review',
      'BRL_Bruto', 'BRL_Liquido', 'Cotacao_Implicita',
      'FB_Data', 'FB_TxId', 'FB_Asset', 'FB_USD_Entregue', 'FB_Destino', 'FB_Endereco',
      'Dias_Offset', 'Qtd_Candidatos', 'Confidence',
      'Status', 'Matched_At', 'Reviewed_At', 'Reviewed_By', 'Status_Note',
      'Observacao', 'Descricao_BTG',
    ];
    const rows = [headers];
    for (const m of matches) {
      const s = m._statusInfo || getStatus(m._key || m.fbTxid);
      rows.push([
        'ON_RAMP',
        formatDate(m.btgData),
        m.cliente,
        m.razaoSocial,
        m.cnpj,
        m.tipoNI,
        m.pais,
        m.sourceClient || '',
        m.bridgeId || '',
        m.bridgeEmail || '',
        m.bridgeKyc || '',
        m.sumsubApplicantId || '',
        m.sumsubEmail || '',
        m.sumsubReview || '',
        m.brlBruto.toFixed(2),
        m.brlLiquido.toFixed(2),
        m.cotacaoImplicita.toFixed(4),
        formatDateTime(m.fbDate),
        m.fbTxid,
        m.fbAsset,
        Number(m.fbUsd).toFixed(8),
        m.fbDstName,
        m.fbDstAddr,
        m.diasOffset,
        m.qtdCandidatos,
        m.confidence,
        s.status || 'pending',
        s.matchedAt ? new Date(s.matchedAt).toISOString() : '',
        s.reviewedAt ? new Date(s.reviewedAt).toISOString() : '',
        s.reviewedBy || '',
        s.note || '',
        m.nota || (m.cnpj ? 'IDENTIFICADO' : 'NECESSITA REVISAO MANUAL'),
        m.btgDescricao,
      ]);
    }
    return rowsToCSV(rows);
  }

  function exportSimpleCSV(matches) {
    const headers = [
      'BTG_Data', 'Cliente', 'BRL', 'Cotacao_Impl',
      'FB_Data', 'FB_TxId', 'Asset', 'USD',
      'Destino', 'Dias', 'Conf', 'Source',
      'Status', 'Reviewed_At', 'Reviewed_By',
    ];
    const rows = [headers];
    for (const m of matches) {
      const s = m._statusInfo || getStatus(m._key || m.fbTxid);
      rows.push([
        formatDate(m.btgData),
        m.cliente,
        m.brlBruto.toFixed(2),
        m.cotacaoImplicita.toFixed(4),
        formatDate(m.fbDate),
        m.fbTxid,
        m.fbAsset,
        Number(m.fbUsd).toFixed(4),
        m.fbDstName,
        m.diasOffset,
        m.confidence,
        m.sourceClient || '',
        s.status || 'pending',
        s.reviewedAt ? new Date(s.reviewedAt).toISOString() : '',
        s.reviewedBy || '',
      ]);
    }
    return rowsToCSV(rows);
  }

  function exportAuditCSV() {
    const log = loadAuditLog();
    const headers = ['Timestamp', 'Key', 'Prev_Status', 'New_Status', 'Reviewer', 'Note'];
    const rows = [headers];
    for (const e of log) {
      rows.push([
        new Date(e.ts).toISOString(),
        e.key,
        e.prevStatus,
        e.newStatus,
        e.reviewer || '',
        e.note || '',
      ]);
    }
    return rowsToCSV(rows);
  }

  function rowsToCSV(rows) {
    return rows
      .map(row => row.map(c => {
        const s = String(c == null ? '' : c);
        return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';'))
      .join('\n');
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatDate(d) {
    if (!d) return '';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDateTime(d) {
    if (!d) return '';
    const date = formatDate(d);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${date} ${hh}:${mi}`;
  }

  // ════════════════════════════════════════════════════════════════
  // Status + audit log persistence (localStorage, scoped by fbTxid).
  // STATUS_CYCLE define a ordem do click-to-cycle no badge da UI.
  // ════════════════════════════════════════════════════════════════
  const STATUS_KEY = 'efix_conciliacao_status_v1';
  const AUDIT_KEY  = 'efix_conciliacao_audit_v1';
  const STATUS_LIST = ['pending', 'approved', 'needs_review', 'manual', 'rejected'];

  function loadStatusMap() {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveStatusMap(m) {
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(m)); } catch {}
  }
  function loadAuditLog() {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
    catch { return []; }
  }
  function saveAuditLog(a) {
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(a.slice(-500))); } catch {}
  }
  function appendAudit(entry) {
    const log = loadAuditLog();
    log.push({ ts: Date.now(), ...entry });
    saveAuditLog(log);
    return log;
  }
  function getStatus(key) {
    const m = loadStatusMap();
    return m[key] || { status: 'pending', matchedAt: null, reviewedAt: null, reviewedBy: '', note: '' };
  }
  function setStatus(key, patch, reviewer) {
    const m = loadStatusMap();
    const prev = m[key] || {};
    const next = { ...prev, ...patch };
    if (patch.status && patch.status !== prev.status) {
      next.reviewedAt = Date.now();
      next.reviewedBy = reviewer || next.reviewedBy || '';
      appendAudit({
        key, prevStatus: prev.status || 'pending', newStatus: patch.status,
        reviewer: reviewer || '', note: patch.note || '',
      });
    }
    m[key] = next;
    saveStatusMap(m);
    return next;
  }
  function nextStatus(current) {
    const i = STATUS_LIST.indexOf(current || 'pending');
    return STATUS_LIST[(i + 1) % STATUS_LIST.length];
  }
  // Quando um novo run de reconciliar() roda, hidrata cada match com seu status persistido
  // ou cria um novo entry pending com matchedAt = now.
  function hydrateStatus(matches, reviewer) {
    const m = loadStatusMap();
    let dirty = false;
    const now = Date.now();
    for (const match of matches) {
      const key = match.fbTxid || `nofb:${match.btgDescricao}:${match.brlBruto}`;
      const cur = m[key];
      if (!cur) {
        m[key] = { status: 'pending', matchedAt: now, reviewedAt: null, reviewedBy: '', note: '' };
        dirty = true;
      } else if (!cur.matchedAt) {
        cur.matchedAt = now;
        dirty = true;
      }
      match._key = key;
      match._statusInfo = m[key];
    }
    if (dirty) saveStatusMap(m);
    return matches;
  }
  // Mesmo pros não-casados (pra rastrear quando foram marcados como "sem match FB" etc)
  function hydrateNaoCasadosStatus(naoCasados) {
    const m = loadStatusMap();
    let dirty = false;
    const now = Date.now();
    for (const n of naoCasados) {
      const key = `nofb:${n.descricao}:${n.brl}`;
      const cur = m[key];
      if (!cur) {
        m[key] = { status: 'pending', matchedAt: now, reviewedAt: null, reviewedBy: '', note: '' };
        dirty = true;
      }
      n._key = key;
      n._statusInfo = m[key];
    }
    if (dirty) saveStatusMap(m);
    return naoCasados;
  }
  function clearAllStatus() {
    localStorage.removeItem(STATUS_KEY);
    localStorage.removeItem(AUDIT_KEY);
  }
  function formatRelative(ts) {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s atrás`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d}d atrás` : new Date(ts).toISOString().slice(0, 10);
  }

  global.Conciliacao = {
    parseBTGCounterparty,
    adaptBTG,
    adaptFB,
    reconciliar,
    enrichMatches,
    exportEnriquecimentoCSV,
    exportSimpleCSV,
    exportAuditCSV,
    downloadCSV,
    formatDate,
    formatDateTime,
    formatRelative,
    isIntermediario,
    isDespesaOp,
    // Status + audit
    STATUS_LIST,
    getStatus,
    setStatus,
    nextStatus,
    hydrateStatus,
    hydrateNaoCasadosStatus,
    loadAuditLog,
    appendAudit,
    clearAllStatus,
    constants: { TAXA_EFIX_PCT, IOF_CAMBIO_PCT, COTACAO_MIN, COTACAO_MAX, TOLERANCIA_USD, JANELA_DIAS },
  };
})(window);
