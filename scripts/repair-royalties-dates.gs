/**
 * efix.finance/financials — Apps Script tooling
 *
 * History
 *   The Apps Script that powers efix.finance/financials reads three sheets:
 *     - Royalties: 1LumglqnyOjBP_pZvBgR2KCuq5Wp1C5CiDgbbatvYUvo  (tab "Base Extrato Royalties")
 *     - Bancário: 11Rjpm1xWMBN8VXHVLp2BucQPYUMSj03VmjcqyfwsJY8  (tab "Extrato")
 *     - Remessas: 1Fuu-bJMGVDYibwwDxJUkM-pCxWmbmkz-rNZQKt83g_A  (not touched here)
 *
 *   In May 2026, both Royalties and Bancário had column B ("Mês") populated with Date
 *   objects whose YEAR component drifted to 2004-2007 while the MONTH/DAY were correct.
 *   The Apps Script filtered those rows out as out-of-range, returning months: [].
 *   The fix: rewrite column B with year sourced from column A ("Ano").
 *
 * Functions
 *   inspectSheet              — log tabs + headers + sample of Royalties col B
 *   inspectBancario           — log tabs + headers + sample of Bancário col B
 *   fixMesColumnDryRun        — preview Royalties fix (no writes)
 *   fixMesColumnApply         — apply Royalties fix
 *   fixBancoMesDryRun         — preview Bancário fix (no writes)
 *   fixBancoMesApply          — apply Bancário fix
 *   installDateValidation     — install rule on B-cols that rejects dates whose year ≠ A
 */

const SHEET_ID       = '1LumglqnyOjBP_pZvBgR2KCuq5Wp1C5CiDgbbatvYUvo';
const TAB_NAME       = 'Base Extrato Royalties';
const FIRST_DATA_ROW = 4;

const BANCO_SHEET_ID = '11Rjpm1xWMBN8VXHVLp2BucQPYUMSj03VmjcqyfwsJY8';
const BANCO_TAB      = 'Extrato';
const BANCO_FIRST_ROW = 6;

// ───────────────────────── inspection ─────────────────────────

function inspectSheet() { _inspect(SHEET_ID, TAB_NAME, FIRST_DATA_ROW); }
function inspectBancario() { _inspect(BANCO_SHEET_ID, BANCO_TAB, BANCO_FIRST_ROW); }

function _inspect(sheetId, tabName, firstRow) {
  const ss = SpreadsheetApp.openById(sheetId);
  Logger.log('=== TABS ===');
  ss.getSheets().forEach(function(s){
    Logger.log('  "' + s.getName() + '"  (' + s.getLastRow() + ' rows, ' + s.getLastColumn() + ' cols)');
  });

  const sh = ss.getSheetByName(tabName);
  if (!sh) { Logger.log('Tab "' + tabName + '" not found.'); return; }

  Logger.log('=== HEADERS (rows 1-' + (firstRow - 1) + ') of "' + tabName + '" ===');
  const hdr = sh.getRange(1, 1, firstRow - 1, Math.min(20, sh.getLastColumn())).getValues();
  hdr.forEach(function(row, i){ Logger.log('row ' + (i+1) + ': ' + JSON.stringify(row)); });

  Logger.log('=== COL B — first 10 data rows ===');
  const first = sh.getRange(firstRow, 1, 10, 8).getValues();
  first.forEach(function(row, i){
    Logger.log('row ' + (firstRow + i) + ': A=' + JSON.stringify(row[0]) +
               ' | B=' + _fmtCell(row[1]) +
               ' | C=' + JSON.stringify(row[2]));
  });

  Logger.log('=== COL B — last 10 data rows ===');
  const lastRow = sh.getLastRow();
  const last = sh.getRange(Math.max(firstRow, lastRow - 9), 1, Math.min(10, lastRow - firstRow + 1), 8).getValues();
  last.forEach(function(row, i){
    Logger.log('row ' + (Math.max(firstRow, lastRow - 9) + i) + ': A=' + JSON.stringify(row[0]) +
               ' | B=' + _fmtCell(row[1]));
  });

  Logger.log('=== YEAR HISTOGRAM of col B (sample 200 rows) ===');
  const sample = sh.getRange(firstRow, 2, Math.min(200, lastRow - firstRow + 1), 1).getValues();
  const hist = {};
  sample.forEach(function(r){
    const v = r[0];
    const k = (v instanceof Date) ? v.getFullYear() : ('(' + typeof v + ')');
    hist[k] = (hist[k] || 0) + 1;
  });
  Object.keys(hist).sort().forEach(function(k){ Logger.log('  ' + k + ': ' + hist[k]); });
}

function _fmtCell(v) {
  if (v instanceof Date) return _iso(v) + ' (Date, year=' + v.getFullYear() + ')';
  return JSON.stringify(v) + ' (' + typeof v + ')';
}

// ───────────────────────── fix col B (year ← A) ─────────────────────────

function fixMesColumnDryRun() { _fixMes(SHEET_ID, TAB_NAME, FIRST_DATA_ROW, true); }
function fixMesColumnApply()  { _fixMes(SHEET_ID, TAB_NAME, FIRST_DATA_ROW, false); }
function fixBancoMesDryRun() { _fixMes(BANCO_SHEET_ID, BANCO_TAB, BANCO_FIRST_ROW, true); }
function fixBancoMesApply()  { _fixMes(BANCO_SHEET_ID, BANCO_TAB, BANCO_FIRST_ROW, false); }

function _fixMes(sheetId, tabName, firstRow, dryRun) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(tabName);
  if (!sh) { Logger.log('Tab "' + tabName + '" not found.'); return; }
  const lastRow = sh.getLastRow();
  if (lastRow < firstRow) { Logger.log('No data rows.'); return; }

  const range = sh.getRange(firstRow, 1, lastRow - firstRow + 1, 2);
  const values = range.getValues();
  const newB = [];
  let changed = 0, ok = 0, skipped = 0;
  const sample = [];

  for (let i = 0; i < values.length; i++) {
    const ano = values[i][0];
    const mes = values[i][1];
    const rowNum = firstRow + i;
    const validAno = (typeof ano === 'number') && ano >= 2020 && ano <= 2030;

    if (validAno && mes instanceof Date) {
      if (mes.getFullYear() === ano) {
        newB.push([mes]); ok++;
      } else {
        const fixed = new Date(ano, mes.getMonth(), mes.getDate());
        newB.push([fixed]); changed++;
        if (sample.length < 8) sample.push('row ' + rowNum + ': A=' + ano + ' B=' + _iso(mes) + ' → ' + _iso(fixed));
      }
    } else {
      newB.push([mes]); skipped++;
    }
  }

  Logger.log('=== Sample fixes (' + tabName + ') ===');
  sample.forEach(function(s){ Logger.log('  ' + s); });
  Logger.log('=== Summary === changed=' + changed + ' ok=' + ok + ' skipped=' + skipped +
             '  (' + (dryRun ? 'DRY RUN' : 'APPLIED') + ')');

  if (!dryRun && changed > 0) {
    sh.getRange(firstRow, 2, newB.length, 1).setValues(newB);
    Logger.log('Wrote ' + changed + ' rows back to ' + tabName + '!B' + firstRow + ':B' + lastRow);
  }
}

// ───────────────────────── prevention: data validation ─────────────────────────

/**
 * Constrains col B to dates between 2020-01-01 and 2030-12-31. Catches the
 * original corruption (years 1925/2004/2007) without a locale-specific custom
 * formula — `requireFormulaSatisfied` with English function names was rejected
 * by Sheets in pt-BR locale, hence requireDateBetween.
 */
function installDateValidation() {
  _installValidation(SHEET_ID, TAB_NAME, FIRST_DATA_ROW);
  _installValidation(BANCO_SHEET_ID, BANCO_TAB, BANCO_FIRST_ROW);
  Logger.log('Validation installed on both sheets.');
}

function _installValidation(sheetId, tabName, firstRow) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(tabName);
  if (!sh) { Logger.log('Tab "' + tabName + '" not found.'); return; }
  const lastRow = sh.getLastRow();
  if (lastRow < firstRow) { Logger.log('No data rows in ' + tabName); return; }

  const range = sh.getRange(firstRow, 2, lastRow - firstRow + 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireDateBetween(new Date(2020, 0, 1), new Date(2030, 11, 31))
    .setAllowInvalid(false)
    .setHelpText('B deve ser uma data entre 01/01/2020 e 31/12/2030.')
    .build();
  range.setDataValidation(rule);
  Logger.log('Set validation on ' + tabName + '!B' + firstRow + ':B' + lastRow);
}

// ───────────────────────── helpers ─────────────────────────

function _iso(d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
