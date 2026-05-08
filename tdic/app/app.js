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
    pendingPdfDoc: null,
    kybDocs: {},
  };

  // ── Init ────────────────────────────────────────────────
  // IMPORTANTE: declarar _initDone ANTES de chamar init(), senão a chamada
  // síncrona quando readyState já é "interactive" cai em TDZ.
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
    bindImportModal();

    // Inicializa signer Alchemy (real ou stub).
    const isStubSigner = window.EfixWallet?.config?.apiKey === "STUB";
    console.log(
      "[TDIC] signer:",
      isStubSigner ? "STUB (e-mail simulado, OTP não chega)" : "Alchemy (real)",
      "apiKey:",
      window.EfixWallet?.config?.apiKey || "missing"
    );
    try {
      if (window.EfixWallet?.init) window.EfixWallet.init();
    } catch (e) {
      console.warn("[TDIC] EfixWallet.init failed:", e);
    }

    // 1) Tenta restaurar JWT no backend efixdi (caminho normal).
    let session = null;
    try {
      session = await window.EfixAuth.restore();
    } catch (e) {
      console.warn("[TDIC] EfixAuth.restore failed:", e);
    }
    if (session?.user?.address) {
      state.user = session.user;
      return loadCedenteAndRoute();
    }

    // 2) Sem JWT: se o Alchemy ainda tem sessão local (signer cookie), usa o
    //    smart account address e segue sem precisar de novo OTP.
    try {
      const signerAddr = await window.EfixWallet?.checkSession?.();
      if (signerAddr) {
        const address = await getSmartAccountAddress();
        const cached = JSON.parse(localStorage.getItem("efix_user_data") || "null");
        const email = cached?.email || (window.EfixAuth?.getUser?.()?.email) || "";
        state.user = { email, address };
        return loadCedenteAndRoute();
      }
    } catch (e) {
      console.warn("[TDIC] signer session check failed:", e);
    }

    showLogin();
  }

  // Triggers (depois da declaração de _initDone para evitar TDZ).
  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();

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
  // Flow padrão efix.finance (idêntico a /app/wallet/index.html):
  //   1. EfixWallet.sendOTP(email)        → Alchemy envia o e-mail
  //   2. EfixWallet.verifyOTP(code)       → assina sessão
  //   3. getSmartAccountAddress()         → obtem endereço ERC-4337
  //   4. EfixAuth.login(email, address)   → backend cria/restaura JWT
  // Se EfixWallet for o stub local (apiKey === 'STUB'), usamos o caminho
  // legacy EfixAuth.sendOTP/verifyOTP que persiste em localStorage.
  function isStub() {
    return window.EfixWallet?.config?.apiKey === "STUB";
  }

  async function getSmartAccountAddress() {
    // Stub expõe getAddress() direto; o bundle real expõe getSmartClient().
    if (isStub()) return window.EfixWallet.getAddress?.() || null;
    const client = await window.EfixWallet.getSmartClient();
    if (typeof client.requestAccount === "function") {
      const acct = await client.requestAccount();
      return acct.address;
    }
    if (client.account?.address) return client.account.address;
    throw new Error("Não foi possível resolver o endereço do smart account");
  }

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
        // 15s race contra o hang conhecido do Alchemy stamper iframe quando
        // bloqueado por third-party cookies (incognito, Brave, uBlock).
        await Promise.race([
          window.EfixWallet.sendOTP(email),
          new Promise((_, rej) =>
            setTimeout(
              () =>
                rej(
                  new Error(
                    "Timeout. Tente uma janela não-anônima e libere cookies de signer.alchemy.com."
                  )
                ),
              15000
            )
          ),
        ]);
        _email = email;
        $("#codeEmail").textContent = email;
        emailForm.style.display = "none";
        codeForm.style.display = "flex";
        $("#codeInput").focus();
      } catch (e) {
        console.error("[TDIC] sendOTP error:", e);
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
        await window.EfixWallet.verifyOTP(code);
        const address = await getSmartAccountAddress();

        // Backend efixdi guarda perfil + JWT (não-bloqueante).
        let user = { email: _email, address };
        try {
          const session = await window.EfixAuth.login(_email, address);
          if (session?.user) user = session.user;
        } catch (be) {
          console.warn("[TDIC] backend login falhou (continuando local):", be.message);
        }
        state.user = user;
        await loadCedenteAndRoute();
      } catch (e) {
        console.error("[TDIC] verifyOTP error:", e);
        err.textContent = e.message || "Código inválido.";
        err.style.display = "block";
      } finally {
        btn.disabled = false;
        btn.textContent = "Confirmar";
      }
    });

    $("#resendBtn").addEventListener("click", () => {
      // Reset completo: derruba sessão Alchemy local + stub residual.
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("alchemy-signer-session") || k.startsWith("tdic_stub_"))
          .forEach((k) => localStorage.removeItem(k));
      } catch (_) {}
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
    $("#importCreditosBtn").addEventListener("click", () => openImportModal());
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
        docs: state.pendingPdfDoc ? [state.pendingPdfDoc] : [],
        origem: state.pendingPdfDoc ? "import-pdf" : "manual",
      };
      if (!payload.devedorCnpj || !payload.devedorRazaoSocial || !payload.faceValue || !payload.maturityDate) {
        alert("Preencha todos os campos obrigatórios.");
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Enviando…';
      try {
        await window.TdicMock.cadastrarCredito(state.user.address, payload);
        state.pendingPdfDoc = null;
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
    $("#credTipo").value = state.pendingPdfDoc ? "duplicata" : "confissao-divida";
    // Mostra anexo PDF (se vier do import) num bloco discreto.
    const ph = $("#credPdfPlaceholder");
    if (ph) {
      if (state.pendingPdfDoc) {
        ph.innerHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:0.6rem 0.85rem;font-size:0.78rem;display:flex;align-items:center;gap:0.5rem;margin-bottom:0.85rem">
          <span>📄</span><span class="mono">${escapeHtml(state.pendingPdfDoc.name)}</span>
          <span style="margin-left:auto;color:#15803d;font-weight:700">anexado</span></div>`;
        ph.hidden = false;
      } else {
        ph.innerHTML = "";
        ph.hidden = true;
      }
    }
    $("#modalCredito").style.display = "flex";
  }
  function closeCreditoModal() {
    $("#modalCredito").style.display = "none";
    state.pendingPdfDoc = null;
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

  // ── Importar planilha / PDF ─────────────────────────────
  // Schema da planilha modelo: 16 colunas (caixa-alta, com acentuação),
  // mapeadas para o payload do tdic. Aceita .xlsx, .xls, .csv via SheetJS
  // e PDFs como anexo único (1 PDF = 1 crédito; abre o modal padrão).
  const IMPORT_HEADERS = [
    { key: "cedenteNome", aliases: ["NOME DO CEDENTE", "CEDENTE", "NOME CEDENTE"] },
    { key: "cedenteCnpj", aliases: ["CNPJ DO CEDENTE", "CNPJ CEDENTE"] },
    { key: "devedorRazaoSocial", aliases: ["NOME DO SACADO", "SACADO", "NOME SACADO", "DEVEDOR"] },
    { key: "devedorCnpj", aliases: ["CNPJ SACADO", "CNPJ DO SACADO", "CNPJ DEVEDOR"] },
    { key: "dupl", aliases: ["Nº DUPL", "N DUPL", "DUPL", "DUPLICATA", "NUMERO DUPLICATA"] },
    { key: "faceValue", aliases: ["VALOR", "VALOR FACE", "VALOR DUPLICATA"] },
    { key: "maturityDate", aliases: ["VENCTO", "VENCIMENTO", "DATA VENCIMENTO"] },
    { key: "chaveNF", aliases: ["CHAVE NF", "CHAVE NFE", "CHAVE NF-E"] },
    { key: "endereco", aliases: ["ENDEREÇO", "ENDERECO"] },
    { key: "bairro", aliases: ["BAIRRO"] },
    { key: "cidade", aliases: ["CIDADE"] },
    { key: "uf", aliases: ["UF", "ESTADO"] },
    { key: "cep", aliases: ["CEP"] },
    { key: "email", aliases: ["EMAIL", "E-MAIL", "EMAIL CONTATO"] },
    { key: "telefone", aliases: ["TELEFONE", "FONE", "TELEFONE CONTATO"] },
    { key: "abatimento", aliases: ["ABATIMENTO", "ABAT"] },
  ];

  let _importParsed = []; // [{raw, payload, errors[]}]
  let _importPdf = null;

  function bindImportModal() {
    $("#importDrop").addEventListener("dragover", (e) => {
      e.preventDefault();
      $("#importDrop").classList.add("dragover");
    });
    $("#importDrop").addEventListener("dragleave", () => $("#importDrop").classList.remove("dragover"));
    $("#importDrop").addEventListener("drop", (e) => {
      e.preventDefault();
      $("#importDrop").classList.remove("dragover");
      const file = e.dataTransfer.files?.[0];
      if (file) handleImportFile(file);
    });
    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    });
    $("#importBackBtn").addEventListener("click", () => resetImportModal());
    $("#importSelAll").addEventListener("change", (e) => {
      $$("input[data-import-row]", $("#importPreviewBody")).forEach((c) => {
        if (!c.disabled) c.checked = e.target.checked;
      });
      updateImportSummary();
    });
    $("#importConfirmBtn").addEventListener("click", confirmImport);
    $("#downloadTemplateBtn").addEventListener("click", downloadTemplate);
  }

  function openImportModal() {
    resetImportModal();
    $("#modalImport").style.display = "flex";
  }
  function closeImportModal() {
    $("#modalImport").style.display = "none";
    resetImportModal();
  }
  function resetImportModal() {
    _importParsed = [];
    _importPdf = null;
    $("#importStep1").hidden = false;
    $("#importStep2").hidden = true;
    $("#importStep3").hidden = true;
    $("#importFile").value = "";
    $("#importErr1").style.display = "none";
    $("#importErr2").style.display = "none";
    $("#importProgress").classList.remove("show");
    $("#importPreviewBody").innerHTML = "";
    $("#importSummary").innerHTML = "";
    $("#importConfirmBtn").disabled = true;
    $("#importConfirmBtn").textContent = "Importar";
  }

  async function handleImportFile(file) {
    if (file.size > 10 * 1024 * 1024) {
      return showImportErr1("Arquivo maior que 10 MB. Divida em arquivos menores.");
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (file.type === "application/pdf" || ext === "pdf") {
      return handlePdfImport(file);
    }
    if (["xlsx", "xls", "csv"].includes(ext) || /sheet|excel|csv/.test(file.type)) {
      return handleExcelImport(file);
    }
    showImportErr1("Tipo de arquivo não suportado. Envie .xlsx, .xls, .csv ou .pdf.");
  }

  function showImportErr1(msg) {
    const el = $("#importErr1");
    el.textContent = msg;
    el.style.display = "block";
  }

  // ── Excel ─────────────────────────────────────────────
  async function handleExcelImport(file) {
    if (typeof window.XLSX === "undefined") {
      return showImportErr1("Biblioteca de planilhas não carregou. Recarregue a página.");
    }
    let rows;
    try {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = window.XLSX.utils.sheet_to_json(sheet, { defval: null });
    } catch (e) {
      console.error("[TDIC] xlsx parse error:", e);
      return showImportErr1("Não consegui ler a planilha: " + (e.message || "formato inválido"));
    }
    if (!rows.length) return showImportErr1("Planilha vazia.");

    const colMap = buildColMap(Object.keys(rows[0]));
    if (!colMap.devedorRazaoSocial || !colMap.devedorCnpj || !colMap.faceValue || !colMap.maturityDate) {
      return showImportErr1(
        "Colunas obrigatórias não encontradas. A planilha precisa ter pelo menos: NOME DO SACADO, CNPJ SACADO, VALOR e VENCTO. Use o modelo como referência."
      );
    }

    _importParsed = rows.map((raw, idx) => normalizeRow(raw, colMap, idx + 2));
    $("#importStep1").hidden = true;
    $("#importStep2").hidden = false;
    $("#importFileName").textContent = file.name;
    renderImportPreview();
    updateImportSummary();
  }

  function buildColMap(actualHeaders) {
    const norm = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
    const headerByNorm = {};
    actualHeaders.forEach((h) => (headerByNorm[norm(h)] = h));
    const map = {};
    IMPORT_HEADERS.forEach((spec) => {
      for (const alias of spec.aliases) {
        const k = norm(alias);
        if (headerByNorm[k]) {
          map[spec.key] = headerByNorm[k];
          break;
        }
      }
    });
    return map;
  }

  function normalizeRow(raw, colMap, lineNo) {
    const get = (k) => (colMap[k] ? raw[colMap[k]] : null);
    const errors = [];

    const devedorRazaoSocial = String(get("devedorRazaoSocial") || "").trim();
    const devedorCnpj = String(get("devedorCnpj") || "").trim();
    const dupl = String(get("dupl") || "").trim();
    const faceValueRaw = get("faceValue");
    const faceValue = parseNumber(faceValueRaw);
    const maturityRaw = get("maturityDate");
    const maturityDate = parseDate(maturityRaw);
    const abatimento = parseNumber(get("abatimento")) || 0;

    if (!devedorRazaoSocial) errors.push("Nome do sacado vazio");
    if (!devedorCnpj) errors.push("CNPJ do sacado vazio");
    else if (!isValidCnpjFormat(devedorCnpj)) errors.push("CNPJ inválido");
    if (!faceValue || faceValue <= 0) errors.push("Valor inválido");
    if (!maturityDate) errors.push("Vencimento inválido");

    return {
      lineNo,
      raw,
      errors,
      payload: {
        tipo: "duplicata",
        devedorRazaoSocial,
        devedorCnpj,
        dupl,
        faceValue,
        maturityDate,
        chaveNF: get("chaveNF") ? String(get("chaveNF")).trim() : null,
        abatimento,
        discountBps: 1500,
        origem: "import-planilha",
        devedorContato: {
          email: String(get("email") || "").trim() || null,
          telefone: String(get("telefone") || "").trim() || null,
          endereco: String(get("endereco") || "").trim() || null,
          bairro: String(get("bairro") || "").trim() || null,
          cidade: String(get("cidade") || "").trim() || null,
          uf: String(get("uf") || "").trim() || null,
          cep: String(get("cep") || "").trim() || null,
        },
      },
    };
  }

  function parseNumber(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return v;
    // Aceita "R$ 1.234,56" ou "1234.56" ou "1,234.56"
    const cleaned = String(v).replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    // dd/mm/yyyy
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    // yyyy-mm-dd
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return null;
  }

  function isValidCnpjFormat(s) {
    return /\d/.test(s) && String(s).replace(/\D/g, "").length === 14;
  }

  function renderImportPreview() {
    const body = $("#importPreviewBody");
    body.innerHTML = _importParsed
      .map((r, i) => {
        const ok = r.errors.length === 0;
        const cls = ok ? "" : "row-error";
        const status = ok
          ? '<span class="pill brand"><span class="dot"></span>OK</span>'
          : `<span class="pill amber"><span class="dot"></span>Erro</span>
             <span class="row-err">${r.errors.join("; ")}</span>`;
        return `<tr class="${cls}">
        <td><input type="checkbox" data-import-row="${i}" ${ok ? "checked" : "disabled"}></td>
        <td>${escapeHtml(r.payload.devedorRazaoSocial || "—")}</td>
        <td class="mono" style="font-size:0.72rem">${escapeHtml(r.payload.devedorCnpj || "—")}</td>
        <td class="mono" style="font-size:0.72rem">${escapeHtml(r.payload.dupl || "—")}</td>
        <td class="mono">${fmtBRL(r.payload.faceValue)}</td>
        <td class="mono">${fmtDate(r.payload.maturityDate)}</td>
        <td class="mono">${r.payload.abatimento ? fmtBRL(r.payload.abatimento) : "—"}</td>
        <td>${status}</td>
      </tr>`;
      })
      .join("");
    $$("input[data-import-row]", body).forEach((c) =>
      c.addEventListener("change", updateImportSummary)
    );
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function updateImportSummary() {
    const total = _importParsed.length;
    const okCount = _importParsed.filter((r) => r.errors.length === 0).length;
    const checked = $$("input[data-import-row]:checked", $("#importPreviewBody")).length;
    const sumFace = _importParsed
      .filter((r, i) => r.errors.length === 0 && $(`input[data-import-row="${i}"]`)?.checked)
      .reduce((s, r) => s + r.payload.faceValue, 0);

    $("#importSummary").innerHTML = `
      <span class="chip"><strong>${total}</strong> linhas lidas</span>
      <span class="chip ok"><strong>${okCount}</strong> válidas</span>
      ${total - okCount > 0 ? `<span class="chip warn"><strong>${total - okCount}</strong> com erro</span>` : ""}
      <span class="chip"><strong>${checked}</strong> selecionadas · <strong>${fmtBRL0(sumFace)}</strong></span>
    `;
    $("#importConfirmBtn").disabled = checked === 0;
    $("#importConfirmBtn").textContent =
      checked === 0
        ? "Importar"
        : `Importar ${checked} crédito${checked === 1 ? "" : "s"}`;
  }

  async function confirmImport() {
    if (_importPdf) return confirmPdfImport();

    const selected = _importParsed.filter(
      (r, i) => r.errors.length === 0 && $(`input[data-import-row="${i}"]`)?.checked
    );
    if (!selected.length) return;

    $("#importErr2").style.display = "none";
    $("#importConfirmBtn").disabled = true;
    $("#importProgress").classList.add("show");
    const total = selected.length;
    let done = 0;
    const errs = [];

    for (const item of selected) {
      try {
        await window.TdicMock.cadastrarCredito(state.user.address, item.payload);
        done++;
      } catch (e) {
        console.error("[TDIC] cadastrarCredito falhou:", e);
        errs.push(`Linha ${item.lineNo}: ${e.message}`);
      }
      const pct = Math.round((done / total) * 100);
      $("#importProgressLbl").textContent = `Cadastrando ${done}/${total}…`;
      $("#importProgressPct").textContent = pct + "%";
      $("#importProgressBar").style.width = pct + "%";
    }

    if (errs.length) {
      const err = $("#importErr2");
      err.innerHTML = `<strong>${errs.length} falharam.</strong><br>` + errs.slice(0, 5).map(escapeHtml).join("<br>");
      err.style.display = "block";
      $("#importConfirmBtn").disabled = false;
    } else {
      closeImportModal();
      await loadDashboard();
      switchTab("creditos");
    }
  }

  // ── PDF ───────────────────────────────────────────────
  function handlePdfImport(file) {
    _importPdf = file;
    $("#importStep1").hidden = true;
    $("#importStep2").hidden = true;
    $("#importStep3").hidden = false;
    $("#importPdfName").textContent = file.name;
    $("#importPdfSize").textContent = (file.size / 1024).toFixed(1) + " KB · application/pdf";
    $("#importConfirmBtn").disabled = false;
    $("#importConfirmBtn").textContent = "Anexar e abrir cadastro";
  }

  async function confirmPdfImport() {
    const file = _importPdf;
    if (!file) return;
    // Anexa o PDF aos docs do próximo crédito e abre modal de cadastro padrão.
    state.pendingPdfDoc = {
      key: "duplicata-pdf",
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    closeImportModal();
    openCreditoModal();
    // Se quiser no futuro: ler texto via pdf.js e auto-preencher campos.
  }

  // ── Template download ─────────────────────────────────
  function downloadTemplate() {
    if (typeof window.XLSX === "undefined") {
      alert("Biblioteca de planilhas ainda carregando. Tente novamente em 1s.");
      return;
    }
    const headers = [
      "NOME DO CEDENTE",
      "CNPJ DO CEDENTE",
      "NOME DO SACADO",
      "CNPJ SACADO",
      "Nº DUPL",
      "VALOR",
      "VENCTO",
      "CHAVE NF",
      "Endereço",
      "Bairro",
      "Cidade",
      "UF",
      "CEP",
      "Email",
      "Telefone",
      "ABATIMENTO",
    ];
    const sample = [
      "EMPRESA CEDENTE LTDA",
      "00.000.000/0001-00",
      "EMPRESA SACADO S/A",
      "00.000.000/0001-00",
      "00001-1",
      10000,
      "2026-12-31",
      "",
      "Rua Exemplo, 100",
      "Centro",
      "São Paulo",
      "SP",
      "01000-000",
      "contato@sacado.com.br",
      "11999990000",
      0,
    ];
    const aoa = [headers, sample];
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Recebíveis");
    window.XLSX.writeFile(wb, "tdic-modelo-importacao.xlsx");
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
    openImportModal,
    closeImportModal,
    state,
  };
})();
