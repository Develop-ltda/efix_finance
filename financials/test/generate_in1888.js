// generate_in1888.js — Gera o CSV de enriquecimento IN 1888 com dados reais.
//
// Pipeline:
//   1. Parse BTG CSV (extrato) + FB CSV (transactions_report)
//   2. Parse Sumsub stats CSV (applicants-stats.csv do dashboard)
//   3. Fetch live Bridge customers via efix-bridge-proxy
//   4. reconciliar() + enrichMatches() do Conciliacao module
//   5. Escreve CSV enriquecido em Downloads/reconciliacao_enriquecida_{date}.csv
//
// Uso: node generate_in1888.js [btg.csv] [fb.csv] [sumsub.csv] [output.csv]

const fs = require('fs');
const path = require('path');

global.window = global;
require('../js/clientes_lookup.js');
require('../js/sources.js');
require('../js/conciliacao.js');

const PROXY = 'https://efix-bridge-proxy-production.up.railway.app';
const DL = 'C:/Users/ernes/Downloads';
const today = new Date().toISOString().slice(0, 10);

const btgPath    = process.argv[2] || path.join(DL, '50_009049339_12-05-2026.csv');
const fbPath     = process.argv[3] || path.join(DL, 'transactions_report_1778618951716.csv');
// 4º argv: caminho do applicants-stats.csv. Se omitido, faz fetch live de /sumsub/list.
const sumsubPath = process.argv[4] || null;
const outPath    = process.argv[5] || path.join(DL, `reconciliacao_enriquecida_${today}.csv`);

function parseCSV(text, delim = null) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  if (!delim) delim = lines[0].indexOf(';') >= 0 ? ';' : ',';
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
    return row;
  });
}

function parseBRL(s) { return parseFloat(String(s || '').replace(/\./g, '').replace(',', '.')) || 0; }

function adaptBTGRow(r) {
  const dp = (r.Data || '').split('/');
  return {
    ...r,
    _iso: dp.length === 3 ? `${dp[2]}-${dp[1]}-${dp[0]}` : '',
    _val: parseBRL(r.Valor || '0'),
    _saldo: parseBRL(r.Saldo || '0'),
  };
}

function parseFBDate(s) {
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                   Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const p = (s || '').split(' ');
  return { iso: p[2] && p[0] ? `${p[2]}-${months[p[1]] || '01'}-${p[0]}` : '' };
}

function adaptFBRow(r) {
  return {
    ...r,
    _date: parseFBDate(r['Date']),
    _usd: parseFloat(r['USD Amount']) || 0,
    _amt: parseFloat(r['Amount']) || 0,
  };
}

async function fetchAllBridgeCustomers() {
  const all = [];
  let url = `${PROXY}/bridge/customers?limit=100`;
  let guard = 0;
  while (url && guard++ < 50) {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`Bridge ${url} → ${r.status}`);
    const j = await r.json();
    if (Array.isArray(j.data)) all.push(...j.data);
    url = j.next_url || null;
  }
  return all;
}

async function fetchSumsubListLive() {
  const r = await fetch(`${PROXY}/sumsub/list?limit=2000`, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Sumsub /list → ${r.status}`);
  const j = await r.json();
  return (j.data || []).map(row => ({
    id: row.applicant_id,
    applicantId: row.applicant_id,
    externalUserId: row.external_user_id || '',
    applicantName: row.applicant_name || '',
    email: row.applicant_email || '',
    info: { firstName: row.applicant_name || '', country: row.applicant_country || '' },
    review: { reviewResult: { reviewAnswer: row.review_answer || '' } },
    result: row.review_answer || '',
    status: row.review_status || '',
  }));
}

(async () => {
  console.log('=== Gerador IN 1888 — enriquecimento ===\n');
  console.log(`BTG:    ${btgPath}`);
  console.log(`FB:     ${fbPath}`);
  console.log(`Sumsub: ${sumsubPath || '(live /sumsub/list)'}`);
  console.log(`Output: ${outPath}\n`);

  for (const p of [btgPath, fbPath]) {
    if (!fs.existsSync(p)) { console.error(`Arquivo não encontrado: ${p}`); process.exit(1); }
  }

  const btgRaw = parseCSV(fs.readFileSync(btgPath, 'utf-8'));
  const fbRaw  = parseCSV(fs.readFileSync(fbPath,  'utf-8'));

  console.log(`BTG: ${btgRaw.length} linhas`);
  console.log(`FB:  ${fbRaw.length} linhas`);

  let sumsubApplicants = [];
  if (sumsubPath) {
    sumsubApplicants = window.ConciliacaoSources.parseSumsubStatsCSV(fs.readFileSync(sumsubPath, 'utf-8'));
    console.log(`Sumsub: ${sumsubApplicants.length} applicants do CSV (override manual)\n`);
  } else {
    try {
      console.log('Fetching Sumsub via /sumsub/list…');
      sumsubApplicants = await fetchSumsubListLive();
      console.log(`Sumsub: ${sumsubApplicants.length} applicants (live)\n`);
    } catch (e) {
      console.warn(`Sumsub /list falhou: ${e.message} — seguindo sem enriquecimento Sumsub.\n`);
    }
  }

  let bridgeCustomers = [];
  try {
    console.log('Fetching Bridge customers via proxy…');
    bridgeCustomers = await fetchAllBridgeCustomers();
    console.log(`Bridge: ${bridgeCustomers.length} customers (live)\n`);
  } catch (e) {
    console.warn(`Bridge fetch falhou: ${e.message} — seguindo sem enriquecimento Bridge.\n`);
  }

  const btg = window.Conciliacao.adaptBTG(btgRaw.map(adaptBTGRow));
  const fb  = window.Conciliacao.adaptFB(fbRaw.map(adaptFBRow));
  const { matches, naoCasados, stats } = window.Conciliacao.reconciliar(btg, fb);
  const enriched = window.Conciliacao.enrichMatches(matches, { bridgeCustomers, sumsubApplicants });

  console.log('=== Resultado ===');
  console.log(`Matches: ${stats.qtdMatches} | Não casados: ${stats.qtdNaoCasados} | Taxa: ${stats.taxaMatch}%`);
  console.log(`Vol. identif: R$ ${stats.volumeIdentificado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`Vol. intermed: R$ ${stats.volumeIntermediario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`);

  const withBridge = enriched.filter(m => m.bridge).length;
  const withSumsub = enriched.filter(m => m.sumsub).length;
  const withCNPJ   = enriched.filter(m => m.cnpj).length;
  console.log(`Enriquecimento: Bridge ${withBridge}/${enriched.length} · Sumsub ${withSumsub}/${enriched.length} · CNPJ ${withCNPJ}/${enriched.length}\n`);

  console.log('=== Por cliente ===');
  const byCli = {};
  for (const m of enriched) {
    if (!byCli[m.cliente]) byCli[m.cliente] = { count: 0, total: 0, cnpj: m.cnpj, source: m.sourceClient || 'none', bridge: !!m.bridge, sumsub: !!m.sumsub, pais: m.pais };
    byCli[m.cliente].count++;
    byCli[m.cliente].total += m.brlBruto;
  }
  Object.entries(byCli).sort((a, b) => b[1].total - a[1].total).forEach(([nome, info]) => {
    const flags = [info.source, info.bridge ? 'B' : '', info.sumsub ? 'S' : ''].filter(Boolean).join('+');
    console.log(`  ${String(info.count).padStart(2)}× ${nome.substring(0, 38).padEnd(38)} R$ ${info.total.toFixed(2).padStart(12)} ${info.cnpj || '[sem CNPJ]'.padEnd(16)} ${info.pais} [${flags}]`);
  });

  const csv = window.Conciliacao.exportEnriquecimentoCSV(enriched);
  // Escreve com BOM UTF-8 pra Excel abrir corretamente
  fs.writeFileSync(outPath, '﻿' + csv, 'utf-8');
  console.log(`\nCSV gravado em: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
