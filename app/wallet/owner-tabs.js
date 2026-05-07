/* =========================================================================
 *  owner-tabs.js — Phase 4 ownership wallet client
 *
 *  Three responsibilities:
 *    1. Hit GET /wallet/portfolio/<addr> and conditionally show the
 *       "Imóveis" / "Cotas BTR" tabs only for users who hold the relevant
 *       primitive (progressive disclosure).
 *    2. Lazy-load the rich tab content when the user clicks each tab —
 *       /wallet/properties for cards, /wallet/btr-positions for rows.
 *    3. Wire the "Reivindicar todas" button to a sponsored UserOp against
 *       DividendRouter.claimAll(user) so every BTR series is settled in
 *       one click, with BRLE landing directly on the user.
 *
 *  No new auth, no new storage, no new build pipeline. Reuses the
 *  EFIX_CONFIG.backend URL, the global EfixWallet bundle, and ethers.
 * ========================================================================= */

(function () {
  "use strict";

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmtBRL = (s) => {
    if (s === null || s === undefined || s === "") return "—";
    const n = typeof s === "number" ? s : parseFloat(s);
    if (!isFinite(n)) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };
  const fmtPct = (n, dec = 2) => {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    return n.toFixed(dec) + "%";
  };
  const escHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtYearMonth = (yyyymm) => {
    if (!yyyymm) return "—";
    const s = String(yyyymm);
    if (s.length !== 6) return s;
    const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    return `${months[parseInt(s.slice(4, 6)) - 1] || "—"}/${s.slice(0, 4)}`;
  };

  function backendUrl() {
    // EFIX_CONFIG is declared with `const` in /shared/js/config.js so it's
    // a global script-scope binding (not a window property). Read it via
    // the indirect `globalThis` lookup so this IIFE works in any context.
    try {
      const cfg = (typeof EFIX_CONFIG !== "undefined") ? EFIX_CONFIG
        : (typeof globalThis !== "undefined" && globalThis.EFIX_CONFIG) ? globalThis.EFIX_CONFIG
        : null;
      return (cfg && cfg.backend) || "";
    } catch (_) {
      return "";
    }
  }

  async function getJson(path) {
    const url = backendUrl() + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return res.json();
  }

  // ── Card visual: banner (image OR stylized gradient) + map pin overlay ──
  function _hashStr(s) {
    let h = 5381;
    for (let i = 0; i < (s || "").length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function bannerHTML(p) {
    if (p.imgBanner && /^https?:\/\//.test(p.imgBanner)) {
      return `<div class="property-banner" style="background-image:url('${escHtml(p.imgBanner)}')"></div>`;
    }
    // Stylized gradient — hash building+neighborhood for stable color seed.
    const seed = _hashStr((p.buildingName || "") + "|" + (p.neighborhood || ""));
    const hue1 = seed % 360;
    const hue2 = (hue1 + 32) % 360;
    const initials = (p.buildingName || "—").split(/\s+/).map(w => w[0] || "").join("").slice(0, 3).toUpperCase();
    return `<div class="property-banner stylized" style="background:linear-gradient(135deg, hsl(${hue1},45%,68%) 0%, hsl(${hue2},55%,42%) 100%)">
      <span class="property-banner-initials">${escHtml(initials)}</span>
    </div>`;
  }
  function mapPinHTML(latLng, neighborhood) {
    if (!latLng || !isFinite(latLng.lat) || !isFinite(latLng.lng)) return "";
    const href = `https://www.google.com/maps?q=${latLng.lat},${latLng.lng}`;
    return `<a class="property-map-pin" target="_blank" rel="noopener" href="${href}" title="Ver no mapa · ${escHtml(neighborhood || "")}">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/>
      </svg>
    </a>`;
  }
  // Always brand the card with "Lobie · {empreendimento}". The empreendimento
  // name is rendered as-is — no information is stripped, even when "Lobie"
  // is already part of it ("Lobie · Botafogo Privilege Lobie" stays as-is).
  function lobieDisplayName(rawName) {
    return rawName || "—";
  }

  // ── Mini sparkline (inline SVG; cheap; no library) ───────────────────────
  function sparklineHTML(values) {
    if (!values || values.length === 0) return "";
    const max = Math.max(...values, 1);
    const bars = values.map((v, i) => {
      const h = Math.max(2, Math.round((v / max) * 100));
      const recent = i >= values.length - 3 ? " recent" : "";
      return `<div class="property-sparkline-bar${recent}" style="height:${h}%"></div>`;
    }).join("");
    return `<div class="property-sparkline" title="Últimos ${values.length} meses">${bars}</div>`;
  }

  // ── URL overrides: ?as=email@x.com and/or ?as_address=0x... let an
  //    operator preview the dashboard as another user (different email,
  //    different on-chain address, or both) without re-authing. The UI is
  //    identical either way — there is no separate "demo" state.
  function getEmailOverride() {
    try {
      const url = new URL(window.location.href);
      const e = url.searchParams.get("as");
      if (e && /.+@.+\..+/.test(e)) return e.toLowerCase();
    } catch (_) {}
    return null;
  }
  function getAddressOverride() {
    try {
      const url = new URL(window.location.href);
      const a = url.searchParams.get("as_address");
      if (a && /^0x[a-fA-F0-9]{40}$/.test(a)) return a;
    } catch (_) {}
    return null;
  }

  // ── Admin session helpers ────────────────────────────────────────────────
  // Returns the raw admin token from sessionStorage, or null. Use only when
  // you don't care whether the current OTP user matches the admin's email
  // (e.g. /admin/* fetches that always re-validate server-side anyway).
  function getRawAdminToken() {
    try { return sessionStorage.getItem("efixAdminToken") || null; } catch { return null; }
  }
  // Decode a JWT payload safely. Returns null on any parse error.
  function _decodeJwt(token) {
    try {
      const parts = (token || "").split(".");
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch { return null; }
  }
  // Returns the admin token only if it's still valid for the current
  // browser context — namely:
  //   • token exists
  //   • token's exp claim hasn't passed
  //   • if an OTP user is logged in (EfixAuth.isLoggedIn), their email
  //     must match the admin token's email — otherwise the admin tray /
  //     inline editor would "bleed through" into a non-admin's session.
  // Use this for any UI gating. The /admin/* endpoints re-validate server-side.
  function getAdminToken() {
    const token = getRawAdminToken();
    if (!token) return null;
    const payload = _decodeJwt(token);
    if (!payload) return null;
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    const adminEmail = (payload.email || "").toLowerCase();
    if (!adminEmail) return null;
    try {
      if (typeof EfixAuth !== "undefined" && EfixAuth.isLoggedIn && EfixAuth.isLoggedIn()) {
        const userEmail = (EfixAuth.getUser?.()?.email || "").toLowerCase();
        if (userEmail && userEmail !== adminEmail) return null;
      }
    } catch { /* don't break the tray on auth lookup errors */ }
    return token;
  }
  async function fetchAdminClients() {
    const token = getAdminToken();
    if (!token) return null;
    const url = backendUrl() + "/admin/lobie-clients?limit=500";
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // Mount the admin tray once on first auth — populates the dropdown if
  // an admin token is present. Otherwise, no-op.
  async function setupAdminTray() {
    const tray   = document.getElementById("adminTray");
    if (!tray) return;
    const token  = getAdminToken();
    if (!token) { tray.style.display = "none"; return; }

    const select = document.getElementById("adminClientSelect");
    const apply  = document.getElementById("adminTrayApply");
    const clear  = document.getElementById("adminTrayClear");
    const hint   = document.getElementById("adminTrayHint");
    tray.style.display = "block";

    try {
      const data = await fetchAdminClients();
      if (!data) return;
      const clients = data.clients || [];
      // Sort already done server-side by units desc.
      const opts = ['<option value="">— escolher cliente —</option>'].concat(
        clients.map(c => {
          const lbl = `${escHtml(c.nome || c.email)} · ${c.unitCount} ${c.unitCount === 1 ? "unidade" : "unidades"}`;
          return `<option value="${escHtml(c.email)}">${lbl}</option>`;
        })
      );
      select.innerHTML = opts.join("");
      select.disabled = false;
      hint.textContent = `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"} disponíveis`;

      // Pre-select the active ?as= email if present
      const current = getEmailOverride();
      if (current) {
        const found = clients.find(c => c.email === current);
        if (found) select.value = current;
      }
    } catch (e) {
      hint.textContent = "Não foi possível carregar a lista de clientes.";
      console.warn("[admin-tray]", e);
    }

    apply.onclick = () => {
      const email = select.value;
      if (!email) return;
      const url = new URL(window.location.href);
      url.searchParams.set("as", email);
      url.searchParams.delete("as_address");
      window.location.href = url.toString();
    };
    clear.onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("as");
      url.searchParams.delete("as_address");
      window.location.href = url.toString();
    };
  }

  // ── Public entry: called once after the user authenticates ───────────────
  // index.html's `showApp(address)` calls `window.loadOwnership(address)`
  // explicitly, so the address is passed in. We also fall back to the global
  // `userAddress` in case some other call path triggers init first.
  async function loadOwnership(address) {
    // URL address override wins; otherwise use the passed-in address (from
    // the auth flow) or the global userAddress.
    const overrideAddr = getAddressOverride();
    const addr = overrideAddr || address
      || (typeof window.userAddress === "string" ? window.userAddress : null);
    if (!addr) return;

    // Resolve email: URL override > authenticated session email
    const overrideEmail = getEmailOverride();
    const sessionEmail = (typeof window.userEmail === "string" && window.userEmail.includes("@"))
      ? window.userEmail.toLowerCase() : null;
    const effectiveEmail = overrideEmail || sessionEmail;
    window.__ownershipEmail = effectiveEmail;

    let portfolio;
    try {
      portfolio = await getJson(`/wallet/portfolio/${addr}`);
    } catch (e) {
      console.warn("[owner-tabs] /wallet/portfolio failed — tabs stay hidden", e);
      return;
    }

    // Probe properties endpoint (with email if available) so we know whether
    // to show the Imóveis tab even when the user holds no NFTs yet but
    // operationally owns Lobie units.
    let propertiesPreview = { counts: { tokenized: 0, virtual: 0 } };
    if (effectiveEmail) {
      try {
        propertiesPreview = await getJson(`/wallet/properties/${addr}?email=${encodeURIComponent(effectiveEmail)}`);
      } catch (e) {
        console.warn("[owner-tabs] properties preview failed", e.message);
      }
    }

    // Probe receivables — Phase 6B v1. Shows the "Antecipação" tab when a
    // Lobie proprietário has reservations with checkout done but repasse
    // pending. Same email scoping as /wallet/properties (Option C).
    let receivablesPreview = { summary: { count: 0 } };
    if (effectiveEmail) {
      try {
        receivablesPreview = await getJson(`/wallet/upcoming-receivables/${addr}?email=${encodeURIComponent(effectiveEmail)}`);
      } catch (e) {
        console.warn("[owner-tabs] receivables preview failed", e.message);
      }
    }
    window.__ownershipReceivablesPreview = receivablesPreview;

    const hasLobie = (portfolio.lobieUnits || []).length > 0
                  || (propertiesPreview.counts?.virtual || 0) > 0;
    const hasBTR   = (portfolio.btrPositions || [])
      .some(b => parseFloat(b.balance) > 0);
    const hasReceivables = (receivablesPreview.summary?.count || 0) > 0;

    const tabImoveis     = document.getElementById("tabImoveis");
    const tabAntecipacao = document.getElementById("tabAntecipacao");
    const tabCotas       = document.getElementById("tabCotas");
    if (tabImoveis)     tabImoveis.style.display     = hasLobie       ? "" : "none";
    if (tabAntecipacao) tabAntecipacao.style.display = hasReceivables ? "" : "none";
    if (tabCotas)       tabCotas.style.display       = hasBTR         ? "" : "none";

    // Pill renders only when there's something to show — on-chain or virtual.
    if (hasLobie || hasBTR || hasReceivables) {
      const pill  = document.getElementById("ownershipPill");
      const value = document.getElementById("ownershipPillValue");
      const hint  = document.getElementById("ownershipPillHint");
      if (pill && value) {
        // RWA portion (BTR + lens-priced Lobie + virtual-mode trailing rent).
        let rwaTotal = 0;
        for (const u of portfolio.lobieUnits || []) rwaTotal += parseFloat(u.npvBRL) || 0;
        for (const b of portfolio.btrPositions || []) {
          rwaTotal += parseFloat(b.balance) || 0;
          rwaTotal += parseFloat(b.pendingBRLE) || 0;
        }
        value.textContent = fmtBRL(rwaTotal);
        const parts = [];
        const tokCount = portfolio.lobieUnits.length;
        const virtCount = propertiesPreview.counts?.virtual || 0;
        const recvCount = receivablesPreview.summary?.count || 0;
        const recvOwnerTotal = Number(receivablesPreview.summary?.ownerTotal || 0);
        if (tokCount > 0)  parts.push(`${tokCount} ${tokCount > 1 ? "unidades tokenizadas" : "unidade tokenizada"}`);
        if (virtCount > 0) parts.push(`${virtCount} ${virtCount > 1 ? "unidades elegíveis" : "unidade elegível"}`);
        if (recvCount > 0) parts.push(`${recvCount} ${recvCount > 1 ? "reservas antecipáveis" : "reserva antecipável"} · ${fmtBRL(recvOwnerTotal)}`);
        if (hasBTR)        parts.push(`${portfolio.btrPositions.filter(b => parseFloat(b.balance) > 0).length} série${portfolio.btrPositions.length > 1 ? "s" : ""} BTR`);
        if (hint) hint.textContent = parts.join(" · ");
        pill.style.display = "flex";
      }
    }

    // Save for downstream readers.
    window.__ownershipAddress = addr;
    window.__ownershipPortfolio = portfolio;
    window.__ownershipPropertiesPreview = propertiesPreview;

    // Mount the admin tray (no-op for non-admins).
    setupAdminTray().catch(() => {});
  }

  // ── Imóveis tab loader ───────────────────────────────────────────────────
  async function loadOwnerProperties() {
    const grid = document.getElementById("propertiesGrid");
    if (!grid) return;
    const addr = window.__ownershipAddress;
    if (!addr) {
      grid.innerHTML = '<div class="ownership-loading">Conecte sua wallet primeiro.</div>';
      return;
    }
    grid.innerHTML = '<div class="ownership-loading">Carregando…</div>';
    try {
      const email = window.__ownershipEmail;
      const url = email
        ? `/wallet/properties/${addr}?email=${encodeURIComponent(email)}`
        : `/wallet/properties/${addr}`;
      const data = await getJson(url);
      const props = data.properties || [];
      if (props.length === 0) {
        grid.innerHTML = '<div class="ownership-loading">Nenhum imóvel encontrado para este perfil.</div>';
        return;
      }
      // Tokenized first, then virtual.
      const sorted = props.slice().sort((a, b) => (a.tokenized === b.tokenized) ? 0 : (a.tokenized ? -1 : 1));
      grid.innerHTML = sorted.map(propertyCard).join("");
    } catch (e) {
      grid.innerHTML = `<div class="ownership-loading">Falha ao carregar imóveis: ${escHtml(e.message)}</div>`;
    }
  }

  function propertyCard(p) {
    const obs = (p.observations || []).slice().reverse(); // chrono ASC
    const sparklineValues = obs.map(o => Math.max(0, Number(o.payout) || 0));
    const lastObs = (p.observations && p.observations[0]) || null;
    const isVirtual = p.tokenized === false;

    // Header — always "Lobie · {empreendimento}" (deduped)
    const lobieName = lobieDisplayName(p.buildingName);
    const headerLine = `Lobie · ${escHtml(lobieName)}`;
    const neighborhoodLine = p.neighborhood ? escHtml(p.neighborhood) : "";

    const subLine = isVirtual
      ? (p.unitCode ? `Unidade ${escHtml(p.unitCode)}${neighborhoodLine ? " · " + neighborhoodLine : ""}` : neighborhoodLine)
      : (p.unitCode
          ? `Unidade ${escHtml(p.unitCode)}${neighborhoodLine ? " · " + neighborhoodLine : ""} · Token ${escHtml(String(p.tokenId).slice(0, 10))}…`
          : `${neighborhoodLine ? neighborhoodLine + " · " : ""}Token ${escHtml(String(p.tokenId).slice(0, 14))}…`);

    // Ownership badge
    const ownershipBadge = isVirtual && p.participacao !== null && p.participacao !== undefined
      ? `<span class="property-token-badge participation">${Number(p.participacao).toFixed(0)}% seu</span>`
      : (!isVirtual ? `<span class="property-token-badge">NFT</span>` : "");

    // Status row
    const statusHtml = isVirtual
      ? `<div class="property-attestation virtual"><span class="dot"></span><span>Imóvel registrado · pronto para tokenizar</span></div>`
      : (lastObs && lastObs.attested
        ? `<div class="property-attestation attested"><span class="dot"></span><span>Atestado · ${fmtYearMonth(lastObs.yearMonth)}</span></div>`
        : `<div class="property-attestation"><span class="dot"></span><span>Atestação pendente</span></div>`);

    // Metric block — NPV first (most relevant value signal), NOI second.
    const npvForCard = isVirtual ? p.estimatedNpvBRL : p.npvBRL;
    const valueLabel = isVirtual ? "NPV estimado" : "NPV (Gordon 6%/3%)";
    const valueValue = npvForCard ? fmtBRL(npvForCard) : "—";
    const noiLabel  = isVirtual ? "Aluguel 12m (sua parte)" : "NOI 12m";
    const noiValue  = isVirtual && p.ownerTrailing12NOI ? fmtBRL(p.ownerTrailing12NOI) : fmtBRL(p.trailing12NOI);

    // Credit availability — NPV × LTV in BRL, converted to USDC via the
    // BRL/USD rate cached on the portfolio (or 5.0 if unavailable).
    const market = (window.__ownershipPortfolio && window.__ownershipPortfolio.market) || {};
    const brlPerUsd = Number(market.brlPerUSD) || 5.0;
    const creditBRL = Number(p.creditCapBRL) || 0;
    const creditUSD = creditBRL > 0 ? creditBRL / brlPerUsd : 0;
    const ltvPct = p.ltvBps ? (Number(p.ltvBps) / 100).toFixed(0) : "—";
    const rateHint = p.rateHint || "a partir de ~6% a.a.";
    const creditHtml = creditBRL > 0 ? `
      <div class="property-credit">
        <div class="property-credit-label">Crédito disponível em USDC</div>
        <div class="property-credit-amount">USDC ${creditUSD.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        <div class="property-credit-hint">${ltvPct}% LTV · ${escHtml(rateHint)}</div>
      </div>
    ` : "";

    // Action row
    const actions = isVirtual
      ? `
        <button class="property-action-primary" onclick="tokenizarUnidade('${escHtml(String(p.empId))}', '${escHtml(p.unitCode || "")}', '${escHtml(p.expectedTokenId || "")}')" title="Mintar o NFT da minha unidade na minha carteira">
          Tokenizar minha unidade
        </button>
        <span class="property-action-hint" id="tokenizeHint-${escHtml(String(p.empId))}-${escHtml(p.unitCode || "")}">Sem custo de gas para você · ~5s</span>
      `
      : `
        <button onclick="useAsCollateral('${escHtml(p.tokenId)}')" disabled title="Em breve">Usar como colateral</button>
        ${p.opensea  ? `<a href="${p.opensea}"  target="_blank" rel="noopener">OpenSea</a>` : ""}
        ${p.basescan ? `<a href="${p.basescan}" target="_blank" rel="noopener">Comprovante</a>` : ""}
      `;

    // Admin-only inline banner edit. Card carries data-emp-id so the inline
    // form can address the building without a global state lookup.
    const isAdmin = !!getAdminToken();
    const empId = p.empId ?? null;
    const bannerSrc = p.imgBannerSource || "none";
    const adminEditHtml = (isAdmin && empId) ? `
      <button class="property-banner-edit-btn"
              type="button"
              title="Editar banner deste prédio (admin)"
              onclick="openCardBannerEditor(${empId})">✎</button>
      <div class="property-banner-edit-form" id="bannerEdit-${empId}">
        <input type="url" placeholder="https://… cole a URL da foto"
               value="${escHtml(p.imgBanner || "")}"
               oninput="cardBannerUrlChanged(${empId})" />
        <div class="property-banner-edit-source ${bannerSrc}">${
          bannerSrc === "override" ? "atual: override admin" :
          bannerSrc === "lobie_pms" ? "atual: foto do PMS Lobie" :
          "atual: gradient (sem foto)"
        }</div>
        <div class="property-banner-edit-actions">
          <button type="button" class="save"
                  onclick="saveCardBanner(${empId})" disabled>Salvar</button>
          <button type="button" class="remove ${bannerSrc === "override" ? "" : "hidden"}"
                  onclick="removeCardBanner(${empId})">Remover override</button>
          <button type="button" class="cancel"
                  onclick="closeCardBannerEditor(${empId})">×</button>
        </div>
        <div class="property-banner-edit-hint" id="bannerEditHint-${empId}"></div>
      </div>
    ` : "";

    return `
      <div class="property-card ${isVirtual ? "virtual" : "tokenized"}" data-emp-id="${empId ?? ""}">
        ${bannerHTML(p)}
        ${mapPinHTML(p.latLng, p.neighborhood)}
        ${adminEditHtml}
        <div class="property-card-header">
          <div>
            <strong>${headerLine}</strong>
            <small>${subLine}</small>
          </div>
          ${ownershipBadge}
        </div>
        ${statusHtml}
        <div class="property-metrics">
          <div class="property-metric">
            <div class="property-metric-label">${valueLabel}</div>
            <div class="property-metric-value">${valueValue}</div>
          </div>
          <div class="property-metric">
            <div class="property-metric-label">${noiLabel}</div>
            <div class="property-metric-value muted">${noiValue}</div>
          </div>
        </div>
        ${creditHtml}
        ${sparklineValues.length > 0 ? sparklineHTML(sparklineValues) : ""}
        <div class="property-card-actions">
          ${actions}
        </div>
      </div>
    `;
  }

  // ── Inline banner editor (admin-only, lives on each card) ────────────────
  function _findCard(empId) {
    return document.querySelector(`.property-card[data-emp-id="${empId}"]`);
  }
  function openCardBannerEditor(empId) {
    const card = _findCard(empId);
    if (!card) return;
    card.classList.add("banner-editing");
    const input = card.querySelector(".property-banner-edit-form input[type='url']");
    if (input) { input.focus(); input.select(); }
    cardBannerUrlChanged(empId);
  }
  function closeCardBannerEditor(empId) {
    const card = _findCard(empId);
    if (!card) return;
    card.classList.remove("banner-editing");
    const hint = document.getElementById(`bannerEditHint-${empId}`);
    if (hint) { hint.textContent = ""; hint.className = "property-banner-edit-hint"; }
  }
  function cardBannerUrlChanged(empId) {
    const card = _findCard(empId);
    if (!card) return;
    const input = card.querySelector(".property-banner-edit-form input[type='url']");
    const save  = card.querySelector(".property-banner-edit-form button.save");
    const url = (input?.value || "").trim();
    if (save) save.disabled = !/^https:\/\/.+/.test(url);
  }
  async function saveCardBanner(empId) {
    const token = getAdminToken();
    if (!token) return;
    const card = _findCard(empId);
    if (!card) return;
    const input = card.querySelector(".property-banner-edit-form input[type='url']");
    const url = (input?.value || "").trim();
    if (!/^https:\/\/.+/.test(url)) return;
    const hint = document.getElementById(`bannerEditHint-${empId}`);
    const setHint = (msg, cls) => {
      if (!hint) return;
      hint.textContent = msg;
      hint.className = "property-banner-edit-hint" + (cls ? " " + cls : "");
    };
    setHint("Salvando…");
    try {
      const r = await fetch(backendUrl() + `/admin/buildings/${empId}/banner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ url }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = ({
          invalid_url:        "URL inválida (precisa começar com https://).",
          not_https:          "URL precisa ser HTTPS.",
          not_image_url:      "Essa URL não retorna uma imagem.",
          building_not_found: "Prédio não encontrado.",
          pg_not_configured:  "Banco de overrides indisponível.",
        })[data.error] || (data.detail || data.error || `HTTP ${r.status}`);
        setHint("Erro: " + msg, "error");
        return;
      }
      setHint("Salvo ✓ recarregando…", "success");
      // Re-render: fresh data picks up the override and exposes imgBannerSource.
      await loadOwnerProperties();
    } catch (e) {
      setHint("Erro: " + (e.message || e), "error");
    }
  }
  async function removeCardBanner(empId) {
    const token = getAdminToken();
    if (!token) return;
    if (!confirm("Remover o override e voltar ao banner do PMS Lobie (ou gradient se vazio)?")) return;
    const hint = document.getElementById(`bannerEditHint-${empId}`);
    const setHint = (msg, cls) => {
      if (!hint) return;
      hint.textContent = msg;
      hint.className = "property-banner-edit-hint" + (cls ? " " + cls : "");
    };
    setHint("Removendo…");
    try {
      const r = await fetch(backendUrl() + `/admin/buildings/${empId}/banner`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setHint("Erro: " + (data.detail || data.error || `HTTP ${r.status}`), "error");
        return;
      }
      setHint("Removido ✓ recarregando…", "success");
      await loadOwnerProperties();
    } catch (e) {
      setHint("Erro: " + (e.message || e), "error");
    }
  }

  // Live: POST /wallet/tokenize-unit signs mintUnit + safeTransferFrom from
  // the efixDI operator EOA (which holds RECORDER_ROLE on LobieUnitRegistry
  // after the Phase 5.2 Safe op). NFT lands directly on the user's smart
  // account, sponsored. Idempotent — safe to retry.
  async function tokenizarUnidade(empId, unitCode, expectedTokenId) {
    if (typeof EfixAuth === "undefined" || !EfixAuth.isLoggedIn || !EfixAuth.isLoggedIn()) {
      alert("Faça login com seu email para tokenizar a unidade.");
      return;
    }
    if (!confirm(`Tokenizar a unidade ${unitCode}?\n\nO NFT será mintado e transferido para a sua carteira em ~5 segundos. Sem custo de gas.`)) {
      return;
    }

    const hintId = `tokenizeHint-${empId}-${unitCode}`;
    const hint = document.getElementById(hintId);
    const setHint = (msg, cls) => {
      if (!hint) return;
      hint.textContent = msg;
      hint.className = "property-action-hint" + (cls ? " " + cls : "");
    };

    const btn = hint?.previousElementSibling || null;
    if (btn && btn.tagName === "BUTTON") btn.disabled = true;

    setHint("Mintando NFT na sua carteira…");
    try {
      const res = await fetch(backendUrl() + "/wallet/tokenize-unit", {
        method: "POST",
        headers: EfixAuth.headers(),
        body: JSON.stringify({ empId: parseInt(empId, 10), unitCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = ({
          not_owner_of_unit:    "Não conseguimos confirmar que você é o proprietário desta unidade no PMS da Lobie.",
          token_owned_by_other: "Esta unidade já foi tokenizada em outra carteira. Fale com o suporte.",
          tokenize_not_configured: "Tokenização ainda não configurada no servidor.",
          mysql_unavailable:    "Banco de dados Lobie indisponível agora. Tente em alguns minutos.",
          auth_missing_email:   "Sessão sem email — faça login novamente.",
          auth_missing_address: "Sessão sem carteira — faça login novamente.",
          tokenize_failed:      data.detail || "Falha ao tokenizar.",
        })[data.error] || (data.error || `HTTP ${res.status}`);
        setHint("Erro: " + msg, "error");
        if (btn && btn.tagName === "BUTTON") btn.disabled = false;
        return;
      }

      if (data.alreadyOwned) {
        setHint("Você já possuía o NFT desta unidade ✓", "success");
      } else if (data.resumed) {
        setHint(`Transferido para a sua carteira ✓ · token #${String(data.tokenId).slice(0, 12)}…`, "success");
      } else {
        setHint(`Tokenizada ✓ · token #${String(data.tokenId).slice(0, 12)}…`, "success");
      }
      // Re-render the grid — the unit will now appear as a tokenized card.
      await loadOwnerProperties();
    } catch (e) {
      setHint("Erro: " + (e.message || e), "error");
      if (btn && btn.tagName === "BUTTON") btn.disabled = false;
    }
  }

  // Stub — Morpho Lobie/USDC collateral market doesn't exist yet.
  function useAsCollateral(tokenId) {
    alert(`A colateralização de imóveis chega em breve.\nA unidade já tem NPV on-chain via PortfolioLens; falta o market Morpho Lobie/USDC ser ativado.`);
  }

  // ── Antecipação tab loader (Phase 6B v1) ─────────────────────────────────
  function fmtDate(d) {
    if (!d) return "—";
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return "—";
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  function fmtFullDate(d) {
    if (!d) return "—";
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return "—";
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  async function loadOwnerReceivables() {
    const list    = document.getElementById("receivablesList");
    const summary = document.getElementById("receivablesSummary");
    if (!list) return;
    const addr  = window.__ownershipAddress;
    const email = window.__ownershipEmail;
    if (!addr) {
      list.innerHTML = '<div class="ownership-loading">Conecte sua wallet primeiro.</div>';
      return;
    }
    if (!email) {
      list.innerHTML = '<div class="ownership-loading">Login com email necessário para ver as reservas.</div>';
      return;
    }
    list.innerHTML = '<div class="ownership-loading">Carregando…</div>';
    if (summary) summary.style.display = "none";
    try {
      const data = await getJson(`/wallet/upcoming-receivables/${addr}?email=${encodeURIComponent(email)}`);
      const items = data.receivables || [];
      if (items.length === 0) {
        list.innerHTML = '<div class="ownership-loading">Nenhuma reserva aguardando repasse no momento.</div>';
        if (summary) summary.style.display = "none";
        return;
      }

      // Summary card on top
      const s = data.summary || {};
      if (summary) {
        const flatPct    = ((data.rate?.flatPct    ?? 0.05) * 100).toFixed(0);
        const monthlyPct = ((data.rate?.monthlyPct ?? 0.08) * 100).toFixed(0);
        summary.innerHTML = `
          <div class="receivables-summary-row">
            <div class="receivables-summary-tile">
              <div class="receivables-summary-label">Reservas elegíveis</div>
              <div class="receivables-summary-value">${s.count || 0}</div>
            </div>
            <div class="receivables-summary-tile">
              <div class="receivables-summary-label">Total a receber</div>
              <div class="receivables-summary-value">${fmtBRL(s.ownerTotal)}</div>
            </div>
            <div class="receivables-summary-tile highlight">
              <div class="receivables-summary-label">Receba hoje</div>
              <div class="receivables-summary-value">${fmtBRL(s.netTotal)}</div>
              <div class="receivables-summary-foot">custo total ${fmtBRL(s.feeTotal)} · ${flatPct}% flat + ${monthlyPct}%/mês</div>
            </div>
          </div>
          <div class="receivables-summary-disclaimer">
            Crédito da HausBank. Antecipação será habilitada após confirmação do funding (em breve).
          </div>
        `;
        summary.style.display = "block";
      }

      // Per-row card
      list.innerHTML = items.map(receivableRow).join("");
    } catch (e) {
      list.innerHTML = `<div class="ownership-loading">Falha ao carregar reservas: ${escHtml(e.message)}</div>`;
    }
  }

  function receivableRow(r) {
    const days = r.daysUntilPayout ?? 0;
    const overdue = days <= 0 ? "atrasado" : "";
    const payoutDay = r.payoutDayOfMonth ? ` (dia ${r.payoutDayOfMonth} do mês)` : "";
    return `
      <div class="receivable-card ${overdue}">
        <div class="receivable-header">
          <div>
            <strong>Lobie · ${escHtml(r.buildingName || "—")}</strong>
            <small>Unidade ${escHtml(r.unitCode || "—")} · ${r.nights} ${r.nights === 1 ? "diária" : "diárias"} · ${escHtml(r.bookingSource || "—")}</small>
          </div>
          <span class="receivable-badge">${r.participacaoPct}% seu</span>
        </div>
        <div class="receivable-dates">
          <span><span class="muted">check-in</span> ${fmtDate(r.checkinDate)}</span>
          <span class="receivable-arrow">→</span>
          <span><span class="muted">check-out</span> ${fmtDate(r.checkoutDate)}</span>
          <span class="receivable-payout">${overdue ? "repasse atrasado" : `repasse em ${days} dia${days === 1 ? "" : "s"} · ${fmtFullDate(r.estimatedPayoutDate)}${payoutDay}`}</span>
        </div>
        <div class="receivable-amounts">
          <div class="receivable-amount">
            <div class="receivable-amount-label">Bruto</div>
            <div class="receivable-amount-value muted">${fmtBRL(r.grossBRL)}</div>
          </div>
          <div class="receivable-amount">
            <div class="receivable-amount-label">Sua parte (estimada)</div>
            <div class="receivable-amount-value">${fmtBRL(r.ownerBRL)}</div>
          </div>
          <div class="receivable-amount">
            <div class="receivable-amount-label">Custo de antecipar</div>
            <div class="receivable-amount-value muted">${fmtBRL(r.antecipation.totalFee)} · ${r.antecipation.effectivePct.toFixed(1)}%</div>
          </div>
          <div class="receivable-amount highlight">
            <div class="receivable-amount-label">Receba hoje</div>
            <div class="receivable-amount-value">${fmtBRL(r.antecipation.netNow)}</div>
          </div>
        </div>
        <div class="receivable-actions">
          <button class="property-action-primary" disabled title="Em breve · funding HausBank">
            Antecipar agora
          </button>
          <span class="property-action-hint">Em breve · sem fricção, recebimento via PIX</span>
        </div>
      </div>
    `;
  }

  // ── Cotas BTR tab loader ─────────────────────────────────────────────────
  async function loadOwnerBTR() {
    const list = document.getElementById("btrPositionsList");
    const claimBtn = document.getElementById("claimAllBtn");
    const claimAmount = document.getElementById("claimAllBtnAmount");
    if (!list) return;
    const addr = window.__ownershipAddress;
    if (!addr) {
      list.innerHTML = '<div class="ownership-loading">Conecte sua wallet primeiro.</div>';
      return;
    }
    list.innerHTML = '<div class="ownership-loading">Carregando…</div>';
    try {
      const data = await getJson(`/wallet/btr-positions/${addr}`);
      const pos = (data.positions || []).filter(p => parseFloat(p.balance) > 0);
      if (pos.length === 0) {
        list.innerHTML = '<div class="ownership-loading">Nenhuma cota encontrada.</div>';
        if (claimBtn) claimBtn.style.display = "none";
        return;
      }
      list.innerHTML = pos.map(btrRow).join("");

      const totalPending = parseFloat(data.pendingTotalBRLE || "0");
      if (claimBtn && claimAmount) {
        if (totalPending > 0) {
          claimAmount.textContent = `(${fmtBRL(totalPending)})`;
          claimBtn.style.display = "";
          claimBtn.disabled = false;
        } else {
          claimAmount.textContent = "";
          claimBtn.style.display = "";
          claimBtn.disabled = true;
        }
      }
      window.__ownershipBTRRouter = data.routerAddress || null;
    } catch (e) {
      list.innerHTML = `<div class="ownership-loading">Falha ao carregar cotas: ${escHtml(e.message)}</div>`;
    }
  }

  function btrRow(b) {
    const pending = parseFloat(b.pendingBRLE || "0");
    const pendingClass = pending > 0 ? "has-pending" : "";
    const balanceFmt = parseFloat(b.balance).toLocaleString("pt-BR", {
      minimumFractionDigits: 0, maximumFractionDigits: 4,
    });
    return `
      <div class="btr-row">
        <div class="btr-info">
          <strong>${escHtml(b.symbol)}</strong>
          <span class="muted">${balanceFmt} cotas · ${fmtPct(b.ownershipPct, 4)} do pool</span>
        </div>
        <div class="btr-pending">
          <div class="btr-pending-label">Pendente</div>
          <div class="btr-pending-value ${pendingClass}">${fmtBRL(b.pendingBRLE)}</div>
        </div>
        <a class="btr-row-link" href="${b.basescan}" target="_blank" rel="noopener" title="Ver na Basescan">›</a>
      </div>
    `;
  }

  // ── Claim all BTR dividends in one sponsored UserOp ──────────────────────
  async function claimAllBTRDividends() {
    const status = document.getElementById("claimAllStatus");
    const btn    = document.getElementById("claimAllBtn");
    const router = window.__ownershipBTRRouter;
    const addr   = window.__ownershipAddress;
    const setStatus = (msg, cls = "") => {
      if (!status) return;
      status.className = "ownership-claim-status " + cls;
      status.textContent = msg;
    };

    if (!router) return setStatus("Roteador de dividendos não configurado.", "error");
    if (!addr)   return setStatus("Conecte sua wallet primeiro.", "error");
    if (!window.EfixWallet?.getBaseClient) return setStatus("Bundle EFIX não carregou.", "error");
    if (!window.ethers) return setStatus("ethers.js não carregou.", "error");

    if (!confirm("Reivindicar todas as distribuições BRLE pendentes?")) return;

    try {
      btn.disabled = true;
      setStatus("Preparando UserOp…");

      const iface = new window.ethers.Interface(["function claimAll(address user)"]);
      const data = iface.encodeFunctionData("claimAll", [addr]);

      const client = await window.EfixWallet.getBaseClient();

      let txHash = null;
      // Account-Kit's smart client exposes either sendUserOperation or sendCalls
      // depending on version. Mirror the pattern used for BRLE swap in this file.
      if (typeof client.sendCalls === "function") {
        const result = await client.sendCalls({ calls: [{ target: router, data, value: 0n }] });
        txHash = result?.transactionHashes?.[0] || result?.id || null;
      } else if (typeof client.sendUserOperation === "function") {
        const op = await client.sendUserOperation({
          uo: { target: router, data, value: 0n },
        });
        const wait = await client.waitForUserOperationTransaction({ hash: op.hash });
        txHash = wait || op.hash;
      } else {
        throw new Error("EfixWallet client doesn't expose sendCalls or sendUserOperation");
      }

      setStatus(`Confirmando${txHash ? " · " + String(txHash).slice(0, 12) + "…" : ""}`);
      // Re-load the BTR positions to show the new pending=0 state.
      await loadOwnerBTR();
      setStatus("Distribuições reivindicadas ✓", "success");
    } catch (e) {
      console.error("[claimAllBTR]", e);
      setStatus(`Erro: ${e.shortMessage || e.message || e}`, "error");
    } finally {
      btn.disabled = false;
    }
  }

  // ── Expose to global scope ───────────────────────────────────────────────
  window.loadOwnership = loadOwnership;
  window.loadOwnerProperties = loadOwnerProperties;
  window.loadOwnerBTR = loadOwnerBTR;
  window.loadOwnerReceivables = loadOwnerReceivables;
  window.useAsCollateral = useAsCollateral;
  window.tokenizarUnidade = tokenizarUnidade;
  window.claimAllBTRDividends = claimAllBTRDividends;
  // Phase 5.6 inline banner editor (admin-only)
  window.openCardBannerEditor  = openCardBannerEditor;
  window.closeCardBannerEditor = closeCardBannerEditor;
  window.cardBannerUrlChanged  = cardBannerUrlChanged;
  window.saveCardBanner        = saveCardBanner;
  window.removeCardBanner      = removeCardBanner;

  // No auto-init: index.html's showApp(address) calls window.loadOwnership(address)
  // once auth resolves. That's the canonical entry point.
})();
