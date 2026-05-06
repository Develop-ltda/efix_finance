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
    return (window.EFIX_CONFIG && window.EFIX_CONFIG.backend) || "";
  }

  async function getJson(path) {
    const url = backendUrl() + path;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return res.json();
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

  // ── Public entry: called once after the user authenticates ───────────────
  // index.html's `showApp(address)` calls `window.loadOwnership(address)`
  // explicitly, so the address is passed in. We also fall back to the global
  // `userAddress` in case some other call path triggers init first.
  async function loadOwnership(address) {
    const addr = address || (typeof window.userAddress === "string" ? window.userAddress : null);
    if (!addr) return;

    let portfolio;
    try {
      portfolio = await getJson(`/wallet/portfolio/${addr}`);
    } catch (e) {
      console.warn("[owner-tabs] /wallet/portfolio failed — tabs stay hidden", e);
      return;
    }

    const hasLobie = (portfolio.lobieUnits || []).length > 0;
    const hasBTR   = (portfolio.btrPositions || [])
      .some(b => parseFloat(b.balance) > 0);

    const tabImoveis = document.getElementById("tabImoveis");
    const tabCotas   = document.getElementById("tabCotas");
    if (tabImoveis) tabImoveis.style.display = hasLobie ? "" : "none";
    if (tabCotas)   tabCotas.style.display   = hasBTR   ? "" : "none";

    // Pill renders only when there's something on the lens (Lobie OR BTR).
    if (hasLobie || hasBTR) {
      const pill  = document.getElementById("ownershipPill");
      const value = document.getElementById("ownershipPillValue");
      const hint  = document.getElementById("ownershipPillHint");
      if (pill && value) {
        // Lens net worth includes wallet balances — for the pill we want the
        // RWA portion (Lobie + BTR + pending), since the existing balance card
        // already shows efixDI. Compute manually.
        let rwaTotal = 0;
        for (const u of portfolio.lobieUnits || []) rwaTotal += parseFloat(u.npvBRL) || 0;
        for (const b of portfolio.btrPositions || []) {
          rwaTotal += parseFloat(b.balance) || 0;
          rwaTotal += parseFloat(b.pendingBRLE) || 0;
        }
        value.textContent = fmtBRL(rwaTotal);
        const parts = [];
        if (hasLobie) parts.push(`${portfolio.lobieUnits.length} unidade${portfolio.lobieUnits.length > 1 ? "s" : ""}`);
        if (hasBTR)   parts.push(`${portfolio.btrPositions.filter(b => parseFloat(b.balance) > 0).length} série${portfolio.btrPositions.length > 1 ? "s" : ""} BTR`);
        if (hint) hint.textContent = parts.join(" · ");
        pill.style.display = "flex";
      }
    }

    // Save for downstream readers.
    window.__ownershipAddress = addr;
    window.__ownershipPortfolio = portfolio;
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
      const data = await getJson(`/wallet/properties/${addr}`);
      const props = data.properties || [];
      if (props.length === 0) {
        grid.innerHTML = '<div class="ownership-loading">Nenhuma unidade encontrada.</div>';
        return;
      }
      grid.innerHTML = props.map(propertyCard).join("");
    } catch (e) {
      grid.innerHTML = `<div class="ownership-loading">Falha ao carregar imóveis: ${escHtml(e.message)}</div>`;
    }
  }

  function propertyCard(p) {
    const obs = (p.observations || []).slice().reverse(); // chrono ASC
    const sparklineValues = obs.map(o => Math.max(0, Number(o.payout) || 0));
    const lastObs = (p.observations && p.observations[0]) || null;
    const attestedClass = lastObs && lastObs.attested ? "attested" : "";
    const attestedLabel = lastObs && lastObs.attested
      ? `Atestado · ${fmtYearMonth(lastObs.yearMonth)}`
      : "Atestação pendente";

    const buildingLine = p.buildingName
      ? `${escHtml(p.buildingName)}${p.neighborhood ? " · " + escHtml(p.neighborhood) : ""}`
      : `Unidade ${escHtml(p.tokenId)}`;

    return `
      <div class="property-card">
        <div class="property-card-header">
          <div>
            <strong>${buildingLine}</strong>
            <small>Token #${escHtml(p.tokenId)}</small>
          </div>
          <span class="property-token-badge">NFT</span>
        </div>
        <div class="property-attestation ${attestedClass}">
          <span class="dot"></span><span>${attestedLabel}</span>
        </div>
        <div class="property-metrics">
          <div class="property-metric">
            <div class="property-metric-label">NPV (Gordon 6%/3%)</div>
            <div class="property-metric-value">${fmtBRL(p.npvBRL)}</div>
          </div>
          <div class="property-metric">
            <div class="property-metric-label">NOI 12m</div>
            <div class="property-metric-value muted">${fmtBRL(p.trailing12NOI)}</div>
          </div>
        </div>
        ${sparklineValues.length > 0 ? sparklineHTML(sparklineValues) : ""}
        <div class="property-card-actions">
          <button onclick="useAsCollateral('${escHtml(p.tokenId)}')" disabled title="Em breve — Phase 5">
            Colateralizar
          </button>
          ${p.opensea  ? `<a href="${p.opensea}"  target="_blank" rel="noopener">OpenSea</a>` : ""}
          ${p.basescan ? `<a href="${p.basescan}" target="_blank" rel="noopener">Basescan</a>` : ""}
        </div>
      </div>
    `;
  }

  // Phase 5 stub — Morpho Lobie/USDC market doesn't exist yet.
  function useAsCollateral(tokenId) {
    alert(`A colateralização de imóveis Lobie via Morpho chega na Phase 5.\nToken #${tokenId} já é elegível em conceito (NPV on-chain via Lens).`);
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
  window.useAsCollateral = useAsCollateral;
  window.claimAllBTRDividends = claimAllBTRDividends;

  // No auto-init: index.html's showApp(address) calls window.loadOwnership(address)
  // once auth resolves. That's the canonical entry point.
})();
