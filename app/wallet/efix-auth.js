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
  async function login(email, address) {
    const res = await fetch(`${BACKEND}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), address }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error || "Login failed");
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
      if (!savedToken || isExpired(savedToken)) {
        clear();
        return null;
      }

      _token = savedToken;
      _user = JSON.parse(localStorage.getItem(USER_KEY) || "null");

      // Validate with backend + refresh user data
      const res = await fetch(`${BACKEND}/users/me`, {
        headers: { Authorization: `Bearer ${_token}` },
      });

      if (!res.ok) {
        clear();
        return null;
      }

      _user = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify(_user));

      return { token: _token, user: _user };
    } catch {
      clear();
      return null;
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

  return {
    login,
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
