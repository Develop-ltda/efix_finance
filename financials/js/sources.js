/**
 * sources.js — Cliente Bridge + Sumsub para a aba Conciliação
 *
 * Faz fetch via `efix-bridge-proxy` (Railway) com cache localStorage 24h.
 *
 * Pré-requisitos no proxy:
 *   - BRIDGE_API_KEY já configurado (existente)
 *   - SUMSUB_APP_TOKEN + SUMSUB_SECRET_KEY (NOVO — setar em Railway env vars)
 *   - ALLOWED_ORIGINS deve incluir o origem que está consumindo
 *     (efix.finance por default; pra dev local adicionar http://localhost:8000)
 *
 * API pública:
 *   ConciliacaoSources.getBridgeCustomers({force})
 *   ConciliacaoSources.getBridgeTransfers({force})
 *   ConciliacaoSources.getSumsubApplicants({force})
 *   ConciliacaoSources.clearCache()
 *   ConciliacaoSources.normalizeName(s)
 *   ConciliacaoSources.lookupByName(nome, bridgeCustomers, sumsubApplicants)
 */

(function (global) {
  'use strict';

  const PROXY_BASE = (global.EFIX_CONFIG && global.EFIX_CONFIG.bridgeProxy)
    || 'https://efix-bridge-proxy-production.up.railway.app';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h
  const CACHE_PREFIX = 'efix_conciliacao_';

  // ════════════════════════════════════════════════════════════════
  // Cache helpers
  // ════════════════════════════════════════════════════════════════
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || (Date.now() - obj.ts) > CACHE_TTL_MS) return null;
      return obj.data;
    } catch { return null; }
  }
  function cacheSet(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
      console.warn('[sources] cache set failed:', e.message);
    }
  }
  function clearCache() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }

  // ════════════════════════════════════════════════════════════════
  // Bridge — paginated fetch via proxy
  // Bridge response: { data: [...], count: N, next_url: "https://api.bridge.xyz/v0/...?..." }
  // ════════════════════════════════════════════════════════════════
  async function fetchAllBridge(endpoint) {
    const all = [];
    let path = `/bridge${endpoint}`;
    let guard = 0;
    while (path && guard++ < 50) {
      const r = await fetch(`${PROXY_BASE}${path}`, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`Bridge proxy ${path} → ${r.status}: ${body.slice(0, 200)}`);
      }
      const j = await r.json();
      if (Array.isArray(j.data)) all.push(...j.data);
      // Bridge returns absolute next_url; rewrite to our proxy path
      if (j.next_url) {
        try {
          const u = new URL(j.next_url);
          path = '/bridge' + u.pathname.replace(/^\/v\d+/, '') + u.search;
        } catch { path = null; }
      } else {
        path = null;
      }
    }
    return all;
  }

  async function getBridgeCustomers(opts = {}) {
    const KEY = 'bridge_customers';
    if (!opts.force) {
      const cached = cacheGet(KEY);
      if (cached) return cached;
    }
    const data = await fetchAllBridge('/customers?limit=100');
    cacheSet(KEY, data);
    return data;
  }

  async function getBridgeTransfers(opts = {}) {
    const KEY = 'bridge_transfers';
    if (!opts.force) {
      const cached = cacheGet(KEY);
      if (cached) return cached;
    }
    const data = await fetchAllBridge('/transfers?limit=100');
    cacheSet(KEY, data);
    return data;
  }

  // ════════════════════════════════════════════════════════════════
  // Sumsub — Sumsub API não expõe um endpoint público "list all applicants".
  // O único caminho que funciona é GET /resources/applicants/-;externalUserId={X}/one
  // (individual). Pra fuzzy-match por nome a gente precisa de uma LISTA,
  // então usamos o CSV "applicants-stats" exportado do dashboard Sumsub.
  //
  // setSumsubApplicants(arrayOuCsvText) — armazena na cache 24h
  // getSumsubApplicants() — lê da cache (sem network)
  // refreshSumsubApplicant(externalUserId) — fetch live de um único applicant
  // ════════════════════════════════════════════════════════════════
  function parseSumsubStatsCSV(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const delim = lines[0].indexOf(';') >= 0 ? ';' : ',';
    const headers = lines[0].split(delim).map(h => h.replace(/^"|"$/g, '').trim());
    return lines.slice(1).map(line => {
      const fields = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === delim && !inQ) { fields.push(cur); cur = ''; continue; }
        cur += c;
      }
      fields.push(cur);
      const row = {};
      headers.forEach((h, idx) => row[h] = (fields[idx] || '').replace(/^"|"$/g, '').trim());
      // Espelha o shape da API Sumsub o suficiente pra enrichMatches funcionar
      return {
        id: row.applicantId || '',
        applicantId: row.applicantId || '',
        externalUserId: row.externalId || '',
        applicantName: row.applicantName || '',
        email: row.applicantEmail || '',
        info: {
          firstName: row.applicantName || '',
          country: row.applicantCountry || '',
        },
        review: { reviewResult: { reviewAnswer: row.result || '' } },
        result: row.result || '',
        rejectLabels: row.rejectLabels || '',
        status: row.status || '',
        applicantLevel: row.applicantLevel || '',
        _raw: row,
      };
    });
  }

  function setSumsubApplicants(input) {
    let arr;
    if (typeof input === 'string') arr = parseSumsubStatsCSV(input);
    else if (Array.isArray(input)) arr = input;
    else return null;
    cacheSet('sumsub_applicants', arr);
    return arr;
  }

  // Normaliza linhas do /sumsub/list (snake_case do Postgres) para o shape
  // que enrichMatches/lookupByName esperam (applicantName, info.country, etc).
  function normalizeFromList(row) {
    return {
      id: row.applicant_id,
      applicantId: row.applicant_id,
      externalUserId: row.external_user_id || '',
      applicantName: row.applicant_name || '',
      email: row.applicant_email || '',
      info: {
        firstName: row.applicant_name || '',
        country: row.applicant_country || '',
        phone: row.applicant_phone || '',
      },
      review: { reviewResult: { reviewAnswer: row.review_answer || '' } },
      result: row.review_answer || '',
      status: row.review_status || '',
      applicantLevel: row.level_name || '',
      rejectLabels: row.reject_labels || '',
    };
  }

  async function getSumsubApplicants(opts = {}) {
    if (!opts.force) {
      const cached = cacheGet('sumsub_applicants');
      if (cached) return cached;
    }
    try {
      const r = await fetch(`${PROXY_BASE}/sumsub/list?limit=2000`, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error(`/sumsub/list → ${r.status}`);
      const j = await r.json();
      const arr = (j.data || []).map(normalizeFromList);
      cacheSet('sumsub_applicants', arr);
      return arr;
    } catch (e) {
      console.warn('[sumsub] /list fetch failed, falling back to cache/CSV:', e.message);
      return cacheGet('sumsub_applicants') || [];
    }
  }

  // Per-applicant live fetch (funciona via API)
  async function refreshSumsubApplicant(externalUserId) {
    const r = await fetch(`${PROXY_BASE}/sumsub/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) throw new Error(`Sumsub /one → ${r.status}`);
    return r.json();
  }

  // ════════════════════════════════════════════════════════════════
  // Name matching: normalize + fuzzy
  // ════════════════════════════════════════════════════════════════
  function normalizeName(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
      .toUpperCase()
      .replace(/\bLTDA\.?\b/g, '')
      .replace(/\bS\.?A\.?\b/g, '')
      .replace(/\bSERVICOS?\b/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nameTokens(s) {
    return new Set(normalizeName(s).split(' ').filter(t => t.length > 2));
  }

  function tokenOverlap(a, b) {
    const A = nameTokens(a), B = nameTokens(b);
    if (A.size === 0 || B.size === 0) return 0;
    let common = 0;
    for (const t of A) if (B.has(t)) common++;
    return common / Math.min(A.size, B.size);
  }

  /**
   * Tenta achar o melhor match para um nome BTG nas listas Bridge/Sumsub.
   * Retorna { bridge, sumsub, confidence } onde cada match pode ser null.
   */
  function lookupByName(nomeBTG, bridgeCustomers, sumsubApplicants) {
    const target = normalizeName(nomeBTG);
    if (!target) return { bridge: null, sumsub: null };

    let bridge = null, bridgeScore = 0;
    for (const c of (bridgeCustomers || [])) {
      const fullName = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
      const norm = normalizeName(fullName);
      if (norm === target) { bridge = c; bridgeScore = 1; break; }
      const overlap = tokenOverlap(norm, target);
      if (overlap > bridgeScore && overlap >= 0.6) { bridge = c; bridgeScore = overlap; }
    }

    let sumsub = null, sumsubScore = 0;
    for (const a of (sumsubApplicants || [])) {
      const info = a.info || {};
      const fullName = a.applicantName
        || `${info.firstName || ''} ${info.middleName || ''} ${info.lastName || ''}`.replace(/\s+/g, ' ').trim()
        || a.externalUserId || '';
      const norm = normalizeName(fullName);
      if (norm === target) { sumsub = a; sumsubScore = 1; break; }
      const overlap = tokenOverlap(norm, target);
      if (overlap > sumsubScore && overlap >= 0.6) { sumsub = a; sumsubScore = overlap; }
    }

    return {
      bridge, bridgeScore,
      sumsub, sumsubScore,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Cache introspection (debug/UI)
  // ════════════════════════════════════════════════════════════════
  function cacheInfo() {
    const info = {};
    ['bridge_customers', 'bridge_transfers', 'sumsub_applicants'].forEach(key => {
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) { info[key] = null; return; }
        const obj = JSON.parse(raw);
        info[key] = {
          ts: obj.ts,
          age_ms: Date.now() - obj.ts,
          count: Array.isArray(obj.data) ? obj.data.length : null,
        };
      } catch { info[key] = null; }
    });
    return info;
  }

  global.ConciliacaoSources = {
    getBridgeCustomers,
    getBridgeTransfers,
    getSumsubApplicants,
    setSumsubApplicants,
    parseSumsubStatsCSV,
    refreshSumsubApplicant,
    clearCache,
    normalizeName,
    tokenOverlap,
    lookupByName,
    cacheInfo,
    PROXY_BASE,
    CACHE_TTL_MS,
  };
})(window);
