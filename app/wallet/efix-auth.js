/**
 * ═══════════════════════════════════════════════════════════════
 *  EfixAuth — Shared Authentication Layer
 * ═══════════════════════════════════════════════════════════════
 *
 *  Wraps Alchemy Account Kit OTP with backend user persistence.
 *  JWT stored in localStorage, shared across all efix.finance pages.
 *
 *  Usage:
 *    <script src="efix-wallet-bundle.js"></script>
 *    <script src="efix-auth.js"></script>
 *    
 *    // On page load:
 *    const session = await EfixAuth.restore();
 *    if (session) showApp(session);
 *
 *    // After OTP verify:
 *    const session = await EfixAuth.login(email, address);
 *
 *    // Logout:
 *    await EfixAuth.logout();
 *
 *    // Get current user:
 *    const user = EfixAuth.getUser();
 *
 *    // Auth header for API calls:
 *    const headers = EfixAuth.headers();
 */

const EfixAuth = (() => {
  const BACKEND = "https://efixdi-backend-production.up.railway.app";
  const TOKEN_KEY = "efix_user_token";
  const USER_KEY = "efix_user_data";

  let _token = null;
  let _user = null;

  // ── Internal: parse JWT payload ──
  function parseJWT(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch { return null; }
  }

  // ── Internal: check if token is expired ──
  function isExpired(token) {
    const payload = parseJWT(token);
    if (!payload || !payload.exp) return true;
    return payload.exp < Date.now() / 1000;
  }

  // ── Login: call backend after Alchemy OTP success ──
  // SEC 2026-08-18: manda o Bearer QUANDO existe sessão. O backend exige essa
  // prova de posse do e-mail para VINCULAR endereço a uma conta já existente
  // (link-on-first-use) — sem ela, um POST anônimo {email da vítima, address
  // do atacante} sequestraria os depósitos dela. Signup Alchemy-first (sem
  // sessão ainda) segue funcionando: cai no INSERT de e-mail novo.
  async function login(email, address) {
    const headers = { "Content-Type": "application/json" };
    const tok = _token || (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
    // Só anexa o token se for DESTE e-mail: token de outra conta no mesmo
    // navegador (troca de usuário sem logout) levaria 403 indevido no backend.
    const tokEmail = tok ? String((parseJWT(tok) || {}).email || "").toLowerCase() : "";
    // SEC 2026-08-20: manda o token mesmo EXPIRADO (mesmo e-mail) — o backend
    // aceita como prova de refresh dentro da janela dele e é quem decide. Antes
    // filtrávamos aqui e o expirado nunca chegava, o que forçaria um código
    // novo a cada expiração de sessão.
    if (tok && tokEmail === email.trim().toLowerCase()) {
      headers["Authorization"] = `Bearer ${tok}`;
    }
    const res = await fetch(`${BACKEND}/users/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: email.trim().toLowerCase(), address }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      // otp_required: o backend não tem prova de que este navegador possui o
      // e-mail. Quem chama decide o caminho (o classic manda para o gate do v2).
      const e = new Error(err.message || err.error || "Login failed");
      e.code = err.error || null;
      throw e;
    }

    const data = await res.json();
    if (!data.success || !data.token) throw new Error("No token received");

    _token = data.token;
    _user = data.user || { email, address };

    // Persist
    try {
      localStorage.setItem(TOKEN_KEY, _token);
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
    } catch {}

    return { token: _token, user: _user, isNew: data.isNew };
  }

  // ── Restore session from localStorage ──
  async function restore() {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (!savedToken) { clear(); return null; }
      // SEC 2026-08-20: token EXPIRADO fica no storage (não entra em _token, e
      // isLoggedIn/headers seguem vendo "deslogado"). Ele é a PROVA de refresh
      // que o /users/login passou a exigir — sem guardá-lo, quem tivesse a
      // sessão vencida precisaria de um código novo a cada expiração.
      if (isExpired(savedToken)) {
        // Guardamos APENAS a prova (o token). O USER_KEY não serve de prova e,
        // sobrevivendo, cruzava identidade em navegador compartilhado: o tdic lê
        // esse cache direto e mostraria o e-mail do usuário ANTERIOR ao lado da
        // carteira do novo.
        _token = null; _user = null;
        try { localStorage.removeItem(USER_KEY); } catch {}
        return null;
      }

      _token = savedToken;
      _user = JSON.parse(localStorage.getItem(USER_KEY) || "null");

      // Validate with backend + refresh user data
      const res = await fetch(`${BACKEND}/users/me`, {
        headers: { Authorization: `Bearer ${_token}` },
      });

      // SEC 2026-08-18: só descartar a sessão quando o BACKEND a rejeita
      // (401/403). Antes, qualquer 5xx/cold start do Railway apagava um token
      // válido — e agora que vincular carteira exige esse token, um soluço de
      // rede rebaixava o usuário a "sem prova" e o travava fora do vínculo.
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { clear(); return null; }
        return _user ? { token: _token, user: _user } : null;  // mantém o token
      }

      _user = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify(_user));

      return { token: _token, user: _user };
    } catch {
      // Falha de REDE (offline, DNS, CORS): não é rejeição do backend — manter
      // a sessão em cache pelo mesmo motivo do bloco acima.
      return _token && !isExpired(_token) && _user ? { token: _token, user: _user } : null;
    }
  }

  // ── Sync balance from chain → backend ──
  async function syncBalance() {
    if (!_token) return null;
    try {
      const res = await fetch(`${BACKEND}/users/sync-balance`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${_token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) return null;
      const balance = await res.json();

      // Update cached user
      if (_user) {
        _user.balance = balance;
        localStorage.setItem(USER_KEY, JSON.stringify(_user));
      }
      return balance;
    } catch { return null; }
  }

  // ── Logout ──
  async function logout() {
    _token = null;
    _user = null;
    clear();
    // Also disconnect Alchemy wallet if available
    if (typeof EfixWallet !== "undefined" && EfixWallet.disconnect) {
      try { await EfixWallet.disconnect(); } catch {}
    }
  }

  function clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    _token = null;
    _user = null;
  }

  // ── Getters ──
  function getToken() { return _token; }
  function getUser() { return _user; }
  function isLoggedIn() { return !!_token && !isExpired(_token); }

  // ── Auth headers for API calls ──
  function headers(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (_token) h["Authorization"] = `Bearer ${_token}`;
    return h;
  }

  // ── Send OTP to email ──
  async function sendOTP(email) {
    const res = await fetch(`${BACKEND}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send OTP");
    return data;
  }

  // ── Verify OTP and log in ──
  async function verifyOTP(email, code) {
    const res = await fetch(`${BACKEND}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Verification failed");
    if (!data.success || !data.token) throw new Error("No token received");

    _token = data.token;
    _user = data.user || { email };

    try {
      localStorage.setItem(TOKEN_KEY, _token);
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
    } catch {}

    return { token: _token, user: _user, isNew: data.isNew };
  }

  return {
    login,
    sendOTP,
    verifyOTP,
    restore,
    syncBalance,
    logout,
    getToken,
    getUser,
    isLoggedIn,
    headers,
    BACKEND,
  };
})();
