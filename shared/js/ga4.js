/* GA4 (G-1Y391HW7NT) + Consent Mode v2 + captura first-party de click-id/UTM + efixTrack.
   09/10: reescrito (era 1 linha: dataLayer + js + config). Sem banner/CMP por enquanto (decisao de
   produto): so o default 'denied' para EEA/UK/CH e o gancho window.efixConsent para um CMP futuro.
   ES5 puro (o site e servido como esta, sem build). Idempotente: 2a inclusao nao faz nada. */
(function () {
  if (window.__efixGa4) return;
  window.__efixGa4 = true;

  window.dataLayer = window.dataLayer || [];
  var gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag = gtag;

  /* --- 1. Consent Mode v2: default 'denied' so na UE (27) + IS LI NO + GB + CH; resto do mundo (BR) nao muda --- */
  var REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO', 'GB', 'CH'
  ];
  var SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'];

  function consentState(value) {
    var s = {};
    for (var i = 0; i < SIGNALS.length; i++) s[SIGNALS[i]] = value;
    return s;
  }

  var consentDefault = consentState('denied');
  consentDefault.region = REGIONS.slice();
  consentDefault.wait_for_update = 500;

  // ordem importa: js, consent default, config (o consent default tem que vir antes do config)
  gtag('js', new Date());
  gtag('consent', 'default', consentDefault);
  gtag('config', 'G-1Y391HW7NT');

  // Gancho p/ um CMP futuro (nada chama ainda). So granted === true concede; qualquer outra coisa nega.
  // 09/10: o mesmo sinal liga/desliga o registro first-party da secao 2 (true grava o click-id da URL atual; o resto apaga).
  window.efixConsent = {
    update: function (granted) {
      try { gtag('consent', 'update', consentState(granted === true ? 'granted' : 'denied')); } catch (e) {}
      try {
        if (granted === true) captureAttribution();
        else dropAttribution();
      } catch (e) {}
    }
  };

  /* --- 2. Click-id/UTM first-party (p/ conversao offline/server-side). NAO vai p/ o GA como evento. --- */
  var ATTR_KEY = 'efix_attribution';
  var TTL = 90 * 24 * 60 * 60 * 1000;
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid'];
  var FIELDS = CLICK_IDS.concat(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);
  // 09/10: dois formatos. Click-id (gclid/gbraid/wbraid) real e base64url (A-Z a-z 0-9 _ -), com '=' de padding
  // opcional: charset ESTRITO (sem '%', ':', '+', '.', '~'). So utm_* usa o SAFE_VALUE mais largo. Valor fora do
  // formato e descartado (nunca "consertado"); se ja ha click-id valido guardado, ele e mantido.
  // Os valores guardados sao OPACOS: nunca decodificar, concatenar em HTML/URL/SQL nem renderizar; quem consumir
  // (conversao offline/server-side) tem que parametrizar e escapar no destino.
  var CLICK_ID_VALUE = /^[A-Za-z0-9_-]{1,200}={0,2}$/;
  var SAFE_VALUE = /^[A-Za-z0-9._~%:+-]{1,200}$/; // utm_*

  function now() { return new Date().getTime(); }

  function isClickId(field) { return CLICK_IDS.indexOf(field) > -1; }

  function validValue(field, v) {
    return typeof v === 'string' && (isClickId(field) ? CLICK_ID_VALUE : SAFE_VALUE).test(v);
  }

  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }

  // Registro guardado ainda valido, so com as chaves permitidas; senao {}.
  // 09/10: dois relogios. ts (ultima captura) governa os utm_* (<= 90 dias); cts (quando o click-id foi gravado, so
  // muda com click-id NOVO) governa gclid/gbraid/wbraid: cts ausente, no futuro ou > 90 dias => click-id ignorado
  // (registro da versao anterior nao tem cts, entao seus click-ids sao ignorados). cts so sai junto com um click-id.
  function readAttribution() {
    var out = {};
    try {
      var ls = storage();
      var raw = ls && ls.getItem(ATTR_KEY);
      var rec = raw && JSON.parse(raw);
      if (!rec || typeof rec !== 'object') return out;
      var t = now();
      var age = t - rec.ts;
      if (typeof rec.ts !== 'number' || !(age >= 0 && age <= TTL)) {
        ls.removeItem(ATTR_KEY);
        return out;
      }
      var cage = t - rec.cts;
      var clickOk = typeof rec.cts === 'number' && cage >= 0 && cage <= TTL;
      var hasClick = false;
      for (var i = 0; i < FIELDS.length; i++) {
        var f = FIELDS[i];
        if (isClickId(f) && !clickOk) continue;
        if (validValue(f, rec[f])) {
          out[f] = rec[f];
          if (isClickId(f)) hasClick = true;
        }
      }
      if (hasClick) out.cts = rec.cts;
      out.ts = rec.ts;
    } catch (e) { return {}; }
    return out;
  }

  // Le da URL SO as chaves permitidas (o resto da query pode ter e-mail/token e nunca e lido).
  function readUrl() {
    var found = {};
    var qs = '';
    try { qs = String(window.location.search || ''); } catch (e) {}
    var parts = qs.replace(/^\?/, '').split('&');
    for (var i = 0; i < parts.length; i++) {
      var j = parts[i].indexOf('=');
      if (j < 1) continue;
      var k = parts[i].slice(0, j);
      var v = parts[i].slice(j + 1);
      if (FIELDS.indexOf(k) > -1 && found[k] === undefined && validValue(k, v)) found[k] = v;
    }
    return found;
  }

  function captureAttribution() {
    var cur = readUrl();
    var has = false;
    for (var k in cur) { has = true; break; }
    if (!has) return; // sem chave rastreavel na URL: nao mexe no que esta guardado (nem renova o prazo)
    var t = now();
    var old = readAttribution(); // ja sem os click-ids vencidos/sem cts
    var rec = {};
    var i, f;
    // 09/10: click-id na URL atual => so ele(s) fica(m): os guardados dos OUTROS tipos saem (a conversao offline
    // aceita 1 click-id, o mais recente). cts so avanca quando o click-id MUDA (valor igual ao guardado = mesmo
    // clique, nao renova); visita so com UTM nao toca o cts (nem os click-ids, que seguem presos ao cts antigo).
    var curClick = false, fresh = false;
    for (i = 0; i < CLICK_IDS.length; i++) {
      f = CLICK_IDS[i];
      if (cur[f] !== undefined) {
        curClick = true;
        if (old[f] !== cur[f]) fresh = true;
      }
    }
    for (i = 0; i < FIELDS.length; i++) {
      f = FIELDS[i];
      if (cur[f] !== undefined) rec[f] = cur[f];
      else if (!curClick && isClickId(f) && old[f] !== undefined) rec[f] = old[f]; // sem click-id novo, o guardado segue
    }
    if (curClick) rec.cts = fresh ? t : old.cts;
    else if (old.cts !== undefined) rec.cts = old.cts;
    rec.ts = t;
    storage().setItem(ATTR_KEY, JSON.stringify(rec));
  }

  // 09/10: click-id no aparelho = armazenamento nao essencial (ePrivacy art. 5(3), PECR) e identificador online
  // (GDPR/LGPD). Sem CMP, so grava no load FORA da UE/EEE/UK/CH, deduzido pelo fuso do navegador: heuristica
  // conservadora, Europe/* inteiro (RU/TR/UA caem por excesso) + territorios UE fora do continente; fuso ilegivel =
  // nao grava. Na UE/EEE/UK/CH so grava apos efixConsent.update(true); update(!== true) apaga o registro.
  var EU_TZ = /^(Europe\/|Arctic\/Longyearbyen$|Africa\/Ceuta$|Asia\/(Nicosia|Famagusta)$|Atlantic\/(Azores|Madeira|Canary|Reykjavik|Faroe)$|America\/(Martinique|Guadeloupe|Cayenne)$|Indian\/(Reunion|Mayotte)$)/;

  function inEuTz() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return typeof tz !== 'string' || EU_TZ.test(tz);
    } catch (e) { return true; }
  }

  function dropAttribution() {
    var ls = storage();
    if (ls) ls.removeItem(ATTR_KEY);
  }

  // storage bloqueado/modo privado: segue sem guardar
  try { if (!inEuTz()) captureAttribution(); } catch (e) {}

  // efixAttribution() -> { gclid?, gbraid?, wbraid?, cts?, utm_*?, ts } ou {}. ts = ms epoch da ultima captura;
  // cts = ms epoch em que o click-id foi gravado (so presente com click-id). Valores opacos: nao decodificar/renderizar.
  window.efixAttribution = function () {
    try { return readAttribution(); } catch (e) { return {}; }
  };

  /* --- 3. efixTrack(name, params, done): wrapper seguro de gtag('event'). Uso nas paginas:
         window.efixTrack && window.efixTrack('generate_lead', { offering: 'first' })
         09/10: 'done' (3o argumento, opcional, funcao) roda UMA vez, sem argumentos, quando o GA despachou o hit
         (event_callback do gtag) ou, no maximo, 800 ms depois (event_timeout); se o efixTrack nem chega a chamar o
         gtag (nome invalido, excecao) ele chama o 'done' sozinho, entao quem espera nunca fica pendurado. Motivo
         (achado em teste no navegador real): navegar logo depois do efixTrack MATA o hit ainda na fila (page_view e
         form_start chegavam ao GA4, generate_lead nao); a pagina so deve navegar no 'done'. Todo evento sai com
         transport_type 'beacon' (sendBeacon, que sobrevive a navegacao). --- */
  var EVENT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
  // 09/10: PII_KEY = chaves de dado pessoal + chaves reservadas/sensiveis do GA4 (URL/referrer/path inteiros, destino e
  // medicao: send_to/transport_url/ip_override/debug_mode, identidade: user_id/user_properties). Casa por SUBSTRING e
  // sem diferenciar caixa, de proposito (conservador): 'rg' e 'cep' tambem derrubam chaves como 'target' e 'accept'.
  // 09/10: + chaves de CONTROLE que so o efixTrack define (event_callback, event_timeout, transport_type): o chamador
  // nao injeta nem sobrescreve (alem de elas serem gravadas depois do filtro).
  var PII_KEY = /mail|phone|tel|cpf|cnpj|nome|name|doc|token|senha|pass|wallet|address|addr|page_location|page_referrer|page_path|send_to|transport_url|user_id|user_properties|ip_override|debug_mode|contact|fone|celular|cep|rg|birth|nasc|street|endereco|event_callback|event_timeout|transport_type/i;

  window.efixTrack = function (name, params, done) {
    // cb: 'done' embrulhado, uma vez so e nunca lanca; o gtag chama (event_callback) e o catch/nome invalido tambem.
    var called = false, cb = null;
    if (typeof done === 'function') {
      cb = function () {
        if (called) return;
        called = true;
        try { done(); } catch (e) {}
      };
    }
    try {
      if (typeof name !== 'string' || !EVENT_NAME.test(name)) { if (cb) cb(); return; }
      var out = {};
      if (params && typeof params === 'object') {
        for (var k in params) {
          if (!Object.prototype.hasOwnProperty.call(params, k) || PII_KEY.test(k)) continue;
          var v = params[k];
          if (typeof v === 'string') {
            // '@' ou 9+ digitos no TOTAL (mesmo com ponto/traco/espaco/parenteses: pega CPF e telefone formatados);
            // checa a string inteira, depois trunca
            if (v.indexOf('@') > -1 || v.replace(/\D/g, '').length >= 9) continue;
            out[k] = v.slice(0, 100);
          } else if (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) {
            out[k] = v;
          } // null/undefined/objeto/array/funcao: descartados
        }
      }
      // 09/10: so aqui, depois do filtro (nao vem de params): beacon sobrevive a navegacao; callback + timeout so com 'done'.
      out.transport_type = 'beacon';
      if (cb) { out.event_callback = cb; out.event_timeout = 800; }
      gtag('event', name, out);
    } catch (e) { if (cb) cb(); }
  };
})();
