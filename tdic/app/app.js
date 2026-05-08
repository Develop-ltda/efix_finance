/**
 * TDIC App — Cedente flow
 * ─────────────────────────
 * Login OTP (Alchemy) → KYB → Dashboard com Mint TDIC.
 *
 * Backend mockado em localStorage via TdicMock (vide /tdic/tdic-mock.js).
 * Auth via window.EfixAuth (real bundle ou stub local).
 */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmtBRL = (n) =>
    "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtBRL0 = (n) =>
    "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const fmtDate = (s) =>
    s ? new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "—";
  const shortAddr = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const slugQS = () => {
    const slug = new URLSearchParams(location.search).get("c");
    return slug ? "?c=" + encodeURIComponent(slug) : "";
  };

  const STATUS = {
    "em-analise": { label: "Em análise", pill: "amber" },
    aprovado: { label: "Aprovado", pill: "blue" },
    mintado: { label: "Mintado", pill: "brand" },
    liquidado: { label: "Liquidado", pill: "green" },
  };

  const state = {
    user: null,
    cedente: null,
    creditos: [],
    crs: [],
    txs: [],
    tab: "creditos",
    pendingMintCreditoId: null,
    kybDocs: {},
  };

  // ── Init ────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();

  let _initDone = false;
  async function init() {
    if (_initDone) return;
    _initDone = true;

    bindLoginForm();
    bindKybForm();
    bindKybPending();
    bindDashboard();
    bindCreditoModal();
    bindMintModal();

    // Restore Alchemy session (or stub)
    let session = null;
    try {
      if (window.EfixWallet?.init) window.EfixWallet.init();
      session = await window.EfixAuth.restore();
    } catch (e) {
      console.warn("[TDIC] restore failed:", e);
    }

    if (!session) return showLogin();

    state.user = session.user;
    await loadCedenteAndRoute();
  }

  // ── Routing ─────────────────────────────────────────────
  function show(view) {
    ["loginView", "kybView", "kybPendingView", "dashView"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === view ? (id === "loginView" ? "flex" : "block") : "none";
    });
  }

  function showLogin() {
    show("loginView");
    document.getElementById("userPill").style.display = "none";
  }

  async function loadCedenteAndRoute() {
    const addr = state.user.address;
    state.cedente = await window.TdicMock.getCedente(addr);

    document.getElementById("userPill").style.display = "inline-flex";
    document.getElementById("userEmail").textContent = state.user.email;
    document.getElementById("userAvatar").textContent =
      (state.user.email || "?").charAt(0).toUpperCase();

    if (!state.cedente) {
      document.getElementById("kybEmail").value = state.user.email;
      return show("kybView");
    }
    if (state.cedente.kybStatus !== "approved") return show("kybPendingView");

    return loadDashboard();
  }

  // ── Login ───────────────────────────────────────────────
  function bindLoginForm() {
    const emailForm = $("#emailForm");
    const codeForm = $("#codeForm");
    let _email = "";

    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#sendOtpBtn");
      const err = $("#emailErr");
      const email = $("#emailInput").value.trim().toLowerCase();
      err.style.display = "none";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        err.textContent = "E-mail inválido.";
        err.style.display = "block";
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Enviando…';
      try {
        await window.EfixAuth.sendOTP(email);
        _email = email;
        $("#codeEmail").textContent = email;
        emailForm.style.display = "none";
        codeForm.style.display = "flex";
        $("#codeInput").focus();
      } catch (e) {
        err.textContent = e.message || "Falha ao enviar código.";
        err.style.display = "block";
      } finally {
        btn.disabled = false;
        btn.textContent = "Enviar código";
      }
    });

    codeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#verifyOtpBtn");
      const err = $("#codeErr");
      const code = $("#codeInput").value.trim();
      err.style.display = "none";
      if (!/^\d{4,8}$/.test(code)) {
        err.textContent = "Código deve ter 6 dígitos.";
        err.style.display = "block";
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Verificando…';
      try {
        const res = await window.EfixAuth.verifyOTP(_email, code);
        state.user = res.user;
        await loadCedenteAndRoute();
      } catch (e) {
        err.textContent = e.message || "Código inválido.";
        err.style.display = "block";
      } finally {
        btn.disabled = false;
        btn.textContent = "Confirmar";
      }
    });

    $("#resendBtn").addEventListener("click", () => {
      codeForm.style.display = "none";
      emailForm.style.display = "flex";
      $("#emailInput").focus();
    });
  }

  // ── KYB ─────────────────────────────────────────────────
  function bindKybForm() {
    $$(".upload-zone[data-doc]").forEach((zone) => {
      zone.addEventListener("click", () => {
        const docKey = zone.getAttribute("data-doc");
        const fakeFile = {
          key: docKey,
          name: docKey + "-" + Date.now() + ".pdf",
          uploadedAt: new Date().toISOString(),
        };
        state.kybDocs[docKey] = fakeFile;
        renderUploadedList();
      });
    });

    $("#kybForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#kybSubmitBtn");
      const payload = {
        cnpj: $("#kybCnpj").value.trim(),
        razaoSocial: $("#kybRazao").value.trim(),
        regimeTributario: $("#kybRegime").value,
        contato: {
          nome: $("#kybNome").value.trim(),
          cargo: $("#kybCargo").value.trim(),
          email: state.user.email,
          tel: $("#kybTel").value.trim(),
          faturamento: $("#kybFat").value,
        },
        docs: Object.values(state.kybDocs),
      };

      if (!payload.cnpj || !payload.razaoSocial || !payload.contato.nome) {
        alert("Preencha CNPJ, razão social e nome do responsável.");
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Enviando…';
      try {
        state.cedente = await window.TdicMock.submitKyb(state.user.address, payload);
        show("kybPendingView");
      } catch (e) {
        alert(e.message || "Falha ao enviar KYB.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Enviar para análise";
      }
    });
  }

  function renderUploadedList() {
    const list = $("#uploadedList");
    list.innerHTML = "";
    Object.values(state.kybDocs).forEach((f) => {
      const row = document.createElement("div");
      row.className = "uploaded-item";
      row.innerHTML = `<span class="name">${f.name}</span>
        <button type="button" data-rm="${f.key}">Remover</button>`;
      list.appendChild(row);
    });
    $$("button[data-rm]", list).forEach((b) => {
      b.addEventListener("click", () => {
        delete state.kybDocs[b.getAttribute("data-rm")];
        renderUploadedList();
      });
    });
  }

  function bindKybPending() {
    $("#refreshKybBtn").addEventListener("click", async () => {
      const btn = $("#refreshKybBtn");
      btn.disabled = true;
      const old = btn.textContent;
      btn.innerHTML = '<span class="spinner" style="border-color:#0a0a0a;border-top-color:transparent"></span>Atualizando…';
      state.cedente = await window.TdicMock.getCedente(state.user.address);
      btn.disabled = false;
      btn.textContent = old;
      if (state.cedente?.kybStatus === "approved") loadDashboard();
    });
    $("#simulateApproveKybBtn").addEventListener("click", async () => {
      await window.TdicMock.approveKyb(state.user.address);
      state.cedente = await window.TdicMock.getCedente(state.user.address);
      loadDashboard();
    });
  }

  // ── Dashboard ───────────────────────────────────────────
  async function loadDashboard() {
    show("dashView");
    const addr = state.user.address;
    [state.creditos, state.crs, state.txs] = await Promise.all([
      window.TdicMock.listCreditos(addr),
      window.TdicMock.listCRs(addr),
      window.TdicMock.listTxs(addr),
    ]);
    renderHeader();
    renderKpis();
    renderTab(state.tab);
  }

  function renderHeader() {
    const greet =
      "Olá, " + (state.cedente?.contato?.nome?.split(" ")[0] || state.cedente?.razaoSocial || "");
    $("#dashGreeting").textContent = greet;
    $("#kpiWallet").textContent = shortAddr(state.user.address);
  }

  function totalDespesa() {
    const today = Date.now();
    return state.crs
      .filter((c) => c.status === "active")
      .reduce((sum, cr) => {
        const desc = (cr.faceValue * cr.discountBps) / 10000;
        const start = new Date(cr.mintedAt || cr.createdAt).getTime();
        const end = new Date(cr.maturityDate + "T12:00:00").getTime();
        const totalDays = Math.max(1, (end - start) / 86400000);
        const elapsed = Math.max(0, Math.min(totalDays, (today - start) / 86400000));
        return sum + (desc * elapsed) / totalDays;
      }, 0);
  }

  function renderKpis() {
    const ativos = state.creditos.filter((c) => c.status !== "liquidado").length;
    const tokens = state.crs.filter((c) => c.status === "active").length;
    $("#kpiCreditos").textContent = ativos;
    $("#kpiTokens").textContent = tokens;
    $("#kpiDespesa").textContent = fmtBRL0(totalDespesa());
  }

  function bindDashboard() {
    $$(".tab", $("#tabs")).forEach((t) => {
      t.addEventListener("click", () => switchTab(t.getAttribute("data-tab")));
    });
    $("#newCreditoBtn").addEventListener("click", () => openCreditoModal());
    $("#exportCsvBtn").addEventListener("click", exportCsv);
    $("#exportPdfBtn").addEventListener("click", exportHtmlReport);
  }

  function switchTab(tab) {
    state.tab = tab;
    $$(".tab", $("#tabs")).forEach((t) =>
      t.classList.toggle("active", t.getAttribute("data-tab") === tab)
    );
    $$(".tab-panel").forEach((p) =>
      p.classList.toggle("active", p.getAttribute("data-panel") === tab)
    );
    renderTab(tab);
  }

  function renderTab(tab) {
    if (tab === "creditos") return renderCreditos();
    if (tab === "tokens") return renderTokens();
    if (tab === "despesa") return renderDespesa();
    if (tab === "historico") return renderHistorico();
  }

  // ── Tabs ────────────────────────────────────────────────
  function renderCreditos() {
    const body = $("#creditosBody");
    $("#creditosCount").textContent =
      state.creditos.length + " crédito" + (state.creditos.length === 1 ? "" : "s");

    if (!state.creditos.length) {
      body.innerHTML = `<div class="empty">
        <h3>Nenhum crédito cadastrado</h3>
        <p>Cadastre seu primeiro crédito para que o compliance da EFIX possa analisar e emitir o
        Certificado de Recebíveis.</p>
        <button class="btn btn-brand" onclick="window.tdicApp.openCreditoModal()">+ Cadastrar crédito</button>
      </div>`;
      return;
    }

    let html =
      "<table><thead><tr><th>ID</th><th>Devedor</th><th>Tipo</th><th>Valor face</th><th>Vencimento</th><th>Deságio</th><th>Status</th><th></th></tr></thead><tbody>";
    state.creditos.forEach((c) => {
      const st = STATUS[c.status] || { label: c.status, pill: "gray" };
      let action = "";
      if (c.status === "aprovado") {
        action = `<button class="btn btn-brand" data-mint="${c.id}" style="padding:0.4rem 0.85rem;font-size:0.78rem">Mintar TDIC</button>`;
      } else if (c.status === "mintado") {
        const cr = state.crs.find((x) => x.creditoId === c.id);
        action = cr
          ? `<a class="mono" style="font-size:0.74rem;color:#525252" href="https://basescan.org/token/${cr.tokenId}" target="_blank">Ver token</a>`
          : "";
      }
      html += `<tr>
        <td class="mono" style="color:#525252">${c.id}</td>
        <td>${c.devedorRazaoSocial || "—"}<div class="mono" style="font-size:0.7rem;color:#a3a3a3">${c.devedorCnpj || ""}</div></td>
        <td>${tipoLabel(c.tipo)}</td>
        <td class="mono">${fmtBRL(c.faceValue)}</td>
        <td class="mono">${fmtDate(c.maturityDate)}</td>
        <td class="mono">${(c.discountBps / 100).toFixed(0)}%</td>
        <td><span class="pill ${st.pill}"><span class="dot"></span>${st.label}</span></td>
        <td>${action}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    body.innerHTML = html;

    $$("button[data-mint]", body).forEach((b) => {
      b.addEventListener("click", () => openMintModal(b.getAttribute("data-mint")));
    });
  }

  function tipoLabel(t) {
    return (
      {
        "confissao-divida": "Confissão de dívida",
        duplicata: "Duplicata",
        "contrato-fornecimento": "Contrato",
        mutuo: "Mútuo",
      }[t] || t
    );
  }

  function renderTokens() {
    const body = $("#tokensBody");
    const ativos = state.crs.filter((c) => c.status === "active");
    if (!ativos.length) {
      body.innerHTML = `<div class="empty">
        <h3>Nenhum token TDIC ainda</h3>
        <p>Quando o compliance da EFIX aprovar um crédito, você verá o botão "Mintar TDIC" no
        card do crédito. Os tokens aparecem aqui após o mint.</p>
      </div>`;
      return;
    }
    let html =
      "<table><thead><tr><th>Token ID</th><th>Valor face</th><th>Vencimento</th><th>Deságio</th><th>Mintado em</th><th>Tx</th></tr></thead><tbody>";
    ativos.forEach((cr) => {
      html += `<tr>
        <td class="mono" style="font-size:0.72rem;color:#525252" title="${cr.tokenId}">${cr.tokenId.slice(0, 14)}…${cr.tokenId.slice(-6)}</td>
        <td class="mono">${fmtBRL(cr.faceValue)}</td>
        <td class="mono">${fmtDate(cr.maturityDate)}</td>
        <td class="mono">${(cr.discountBps / 100).toFixed(0)}%</td>
        <td class="mono">${fmtDate(cr.mintedAt)}</td>
        <td><a class="mono" style="font-size:0.74rem;color:var(--brand-primary)" href="https://basescan.org/tx/${cr.mintTxHash}" target="_blank">${cr.mintTxHash.slice(0, 10)}…</a></td>
      </tr>`;
    });
    html += "</tbody></table>";
    body.innerHTML = html;
  }

  function renderDespesa() {
    const total = totalDespesa();
    $("#despesaTotal").textContent = fmtBRL0(total);
    $("#despesaSavings").textContent = fmtBRL0(total * 0.34);
    $("#despesaCRs").textContent = state.crs.filter((c) => c.status === "active").length;
  }

  function renderHistorico() {
    const body = $("#historicoBody");
    if (!state.txs.length) {
      body.innerHTML = `<div class="empty">
        <h3>Sem transações</h3>
        <p>O histórico on-chain (mint, transferências, queima) aparecerá aqui após o primeiro mint.</p>
      </div>`;
      return;
    }
    let html =
      "<table><thead><tr><th>Tipo</th><th>Token ID</th><th>Valor</th><th>Data</th><th>Tx</th></tr></thead><tbody>";
    state.txs
      .slice()
      .reverse()
      .forEach((t) => {
        html += `<tr>
        <td><span class="pill brand"><span class="dot"></span>${t.type}</span></td>
        <td class="mono" style="font-size:0.72rem;color:#525252">${t.tokenId.slice(0, 14)}…${t.tokenId.slice(-6)}</td>
        <td class="mono">${fmtBRL(t.faceValue)}</td>
        <td class="mono">${new Date(t.timestamp).toLocaleString("pt-BR")}</td>
        <td><a class="mono" style="font-size:0.74rem;color:var(--brand-primary)" href="https://basescan.org/tx/${t.hash}" target="_blank">${t.hash.slice(0, 10)}…</a></td>
      </tr>`;
      });
    html += "</tbody></table>";
    body.innerHTML = html;
  }

  function exportCsv() {
    const rows = [
      ["ID", "Devedor", "Tipo", "ValorFace", "Vencimento", "DesagioBps", "Status"],
      ...state.creditos.map((c) => [
        c.id,
        c.devedorRazaoSocial,
        c.tipo,
        c.faceValue,
        c.maturityDate,
        c.discountBps,
        c.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    download("﻿" + csv, "tdic-creditos.csv", "text/csv");
  }

  function exportHtmlReport() {
    const total = totalDespesa();
    const rows = state.crs
      .filter((c) => c.status === "active")
      .map((cr) => {
        const desc = (cr.faceValue * cr.discountBps) / 10000;
        return `<tr>
        <td>${cr.tokenId.slice(0, 12)}…</td>
        <td>${fmtBRL(cr.faceValue)}</td>
        <td>${(cr.discountBps / 100).toFixed(0)}%</td>
        <td>${fmtBRL(desc)}</td>
        <td>${fmtDate(cr.maturityDate)}</td>
      </tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TDIC — Despesa Financeira</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:24px;color:#0a0a0a}
h1{font-size:22px;margin-bottom:6px}.sub{color:#525252;font-size:13px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #e5e5e5;padding:10px 12px;text-align:left;font-size:13px}
th{background:#fafafa;text-transform:uppercase;letter-spacing:0.05em;font-size:11px}
.tot{margin-top:24px;padding:16px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px}
.ft{margin-top:32px;font-size:11px;color:#737373;border-top:1px solid #e5e5e5;padding-top:12px}</style></head>
<body><h1>Relatório de despesa financeira — TDIC</h1>
<div class="sub">Cedente: ${state.cedente?.razaoSocial || "—"} · CNPJ ${state.cedente?.cnpj || "—"}</div>
<table><thead><tr><th>Token ID</th><th>Valor face</th><th>Deságio</th><th>Despesa total</th><th>Vencimento</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#737373">Nenhum CR ativo</td></tr>'}</tbody></table>
<div class="tot"><strong>Despesa financeira amortizada até hoje:</strong> ${fmtBRL(total)}<br>
<strong>Redução estimada de IRPJ/CSLL (34%):</strong> ${fmtBRL(total * 0.34)}</div>
<div class="ft">Gerado em ${new Date().toLocaleString("pt-BR")} · EFIX Securitizadora S.A. · CNPJ 60.756.859/0001-57<br>
Não substitui análise contábil formal. Consulte seu contador.</div></body></html>`;
    download(html, "tdic-despesa-financeira.html", "text/html");
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Modal Crédito ───────────────────────────────────────
  function bindCreditoModal() {
    $("#creditoForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#credSubmitBtn");
      const payload = {
        tipo: $("#credTipo").value,
        devedorCnpj: $("#credDevedorCnpj").value.trim(),
        devedorRazaoSocial: $("#credDevedorRazao").value.trim(),
        faceValue: $("#credFace").value,
        maturityDate: $("#credVencto").value,
        discountBps: Math.round((Number($("#credDiscount").value) || 0) * 100),
        docs: [],
      };
      if (!payload.devedorCnpj || !payload.devedorRazaoSocial || !payload.faceValue || !payload.maturityDate) {
        alert("Preencha todos os campos obrigatórios.");
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Enviando…';
      try {
        await window.TdicMock.cadastrarCredito(state.user.address, payload);
        closeCreditoModal();
        await loadDashboard();
        switchTab("creditos");
      } catch (e) {
        alert(e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Cadastrar para análise";
      }
    });
  }

  function openCreditoModal() {
    $("#creditoForm").reset();
    $("#credDiscount").value = 80;
    $("#credTipo").value = "confissao-divida";
    $("#modalCredito").style.display = "flex";
  }
  function closeCreditoModal() {
    $("#modalCredito").style.display = "none";
  }

  // ── Modal Mint ──────────────────────────────────────────
  function bindMintModal() {
    $("#mintConfirmBtn").addEventListener("click", confirmMint);
  }
  function openMintModal(creditoId) {
    const c = state.creditos.find((x) => x.id === creditoId);
    if (!c) return;
    state.pendingMintCreditoId = creditoId;
    const desc = (c.faceValue * c.discountBps) / 10000;
    $("#mintConfirmList").innerHTML = `
      <div class="row"><span class="k">Devedor</span><span class="v">${c.devedorRazaoSocial}</span></div>
      <div class="row"><span class="k">Valor face</span><span class="v">${fmtBRL(c.faceValue)}</span></div>
      <div class="row"><span class="k">Deságio</span><span class="v">${(c.discountBps / 100).toFixed(0)}% · ${fmtBRL(desc)}</span></div>
      <div class="row"><span class="k">Vencimento</span><span class="v">${fmtDate(c.maturityDate)}</span></div>
      <div class="row"><span class="k">Destinatário</span><span class="v">${shortAddr(state.user.address)}</span></div>
      <div class="row"><span class="k">Rede</span><span class="v">Base mainnet</span></div>
    `;
    $("#mintErr").style.display = "none";
    $("#modalMint").style.display = "flex";
  }
  function closeMintModal() {
    state.pendingMintCreditoId = null;
    $("#modalMint").style.display = "none";
  }
  async function confirmMint() {
    const id = state.pendingMintCreditoId;
    if (!id) return;
    const btn = $("#mintConfirmBtn");
    const err = $("#mintErr");
    err.style.display = "none";
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Mintando…';
    try {
      // Em prod: aprovar CR (compliance EFIX) + chamar TDICRegistry.mintCR via smart wallet client
      // Aqui usa mock que simula tx hash. Mantém UX idêntica.
      const cr = state.crs.find((c) => c.creditoId === id);
      if (!cr) {
        // Auto-aprova como compliance simulado (produção: backend gateado)
        await window.TdicMock.aprovarCR(id);
      }
      await window.TdicMock.mintarCR(id);
      closeMintModal();
      await loadDashboard();
    } catch (e) {
      err.textContent = e.message || "Falha ao mintar.";
      err.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmar mint";
    }
  }

  // ── Logout ──────────────────────────────────────────────
  async function logout() {
    await window.EfixAuth.logout();
    state.user = null;
    state.cedente = null;
    showLogin();
    document.getElementById("emailForm").style.display = "flex";
    document.getElementById("codeForm").style.display = "none";
    document.getElementById("emailInput").value = "";
    document.getElementById("codeInput").value = "";
  }

  // Carry slug forward on the brand link
  document.addEventListener("tdic:brand-ready", () => {
    const link = document.getElementById("brandLink");
    if (link) link.href = "/tdic/" + slugQS();
  });

  // Expose
  window.tdicApp = {
    logout,
    openCreditoModal,
    closeCreditoModal,
    closeMintModal,
    state,
  };
})();
