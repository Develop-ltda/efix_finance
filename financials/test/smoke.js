// smoke.js — Validação do motor de conciliação contra CSVs reais (Node).
//
// Uso:
//   node smoke.js [btg.csv] [fireblocks.csv]
//
// Defaults: 50_009049339_12-05-2026.csv + transactions_report_1778618951716.csv
// no Downloads do usuário.

const fs = require('fs');
const path = require('path');

global.window = global;
require('../js/clientes_lookup.js');
require('../js/conciliacao.js');

function parseCSV(content, delim = ',') {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
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
    headers.forEach((h, idx) => row[h] = (fields[idx] || '').trim());
    return row;
  });
}

function parseBRL(s) {
  return parseFloat(String(s || '').replace(/\./g, '').replace(',', '.')) || 0;
}

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

const DOWNLOADS = 'C:/Users/ernes/Downloads';
const btgPath = process.argv[2] || path.join(DOWNLOADS, '50_009049339_12-05-2026.csv');
const fbPath  = process.argv[3] || path.join(DOWNLOADS, 'transactions_report_1778618951716.csv');

console.log('=== Conciliação JS — Smoke ===\n');
console.log('BTG:', btgPath);
console.log('FB :', fbPath, '\n');

if (!fs.existsSync(btgPath)) { console.error('BTG não encontrado'); process.exit(1); }
if (!fs.existsSync(fbPath))  { console.error('FB não encontrado');  process.exit(1); }

const btgRaw = parseCSV(fs.readFileSync(btgPath, 'utf-8'));
const fbRaw  = parseCSV(fs.readFileSync(fbPath,  'utf-8'));

const btgRows = btgRaw.map(adaptBTGRow);
const fbRows  = fbRaw.map(adaptFBRow);

const btg = window.Conciliacao.adaptBTG(btgRows);
const fb  = window.Conciliacao.adaptFB(fbRows);

const tipos = btg.reduce((acc, b) => { acc[b.tipoOperacao] = (acc[b.tipoOperacao] || 0) + 1; return acc; }, {});
console.log(`BTG normalizados: ${btg.length}  (${JSON.stringify(tipos)})`);
const fbCands = fb.filter(t => t.status === 'COMPLETED' && ['USDC','USDT'].includes(t.asset) && t.srcType === 'Vault');
console.log(`FB candidatos (Vault→ COMPLETED USDC/USDT): ${fbCands.length}\n`);

const { matches, naoCasados, stats } = window.Conciliacao.reconciliar(btg, fb);

console.log('=== Resultado ===');
console.log(`Matches:      ${stats.qtdMatches}`);
console.log(`Não casados:  ${stats.qtdNaoCasados}`);
console.log(`Vol identif:  R$ ${stats.volumeIdentificado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`Vol não-id:   R$ ${stats.volumeNaoIdentificado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`Vol intermed: R$ ${stats.volumeIntermediario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`Clientes:     ${stats.clientesUnicos}`);
console.log(`Taxa match:   ${stats.taxaMatch}%`);
console.log(`Confidence:   high=${stats.confidence.high} medium=${stats.confidence.medium} low=${stats.confidence.low}\n`);

console.log('=== Top 10 matches ===');
console.log('Data       Cliente                          BRL          Cot.   Dst                Δd  Conf  Lookup');
matches.slice(0, 10).forEach(m => {
  console.log(
    `${window.Conciliacao.formatDate(m.btgData)} ` +
    `${(m.cliente).substring(0, 32).padEnd(32)} ` +
    `${m.brlBruto.toFixed(2).padStart(11)} ` +
    `${m.cotacaoImplicita.toFixed(3)} ` +
    `${(m.fbDstName || '').substring(0, 18).padEnd(18)} ` +
    `${String(m.diasOffset).padStart(3)} ` +
    `${m.confidence.padEnd(6)} ` +
    `${m.cnpj ? '[' + m.cnpj + ']' : '[sem CNPJ]'}`
  );
});

console.log('\nClientes identificados:');
const byCliente = {};
for (const m of matches) {
  if (!byCliente[m.cliente]) byCliente[m.cliente] = { count: 0, total: 0, cnpj: m.cnpj };
  byCliente[m.cliente].count++;
  byCliente[m.cliente].total += m.brlBruto;
}
Object.entries(byCliente).sort((a, b) => b[1].total - a[1].total).forEach(([nome, info]) => {
  console.log(`  ${info.count}× ${nome.substring(0, 40).padEnd(40)} R$ ${info.total.toFixed(2).padStart(12)} ${info.cnpj ? '[' + info.cnpj + ']' : '[sem CNPJ]'}`);
});

process.exit(stats.qtdMatches > 0 ? 0 : 1);
