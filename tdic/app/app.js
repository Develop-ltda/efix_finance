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

  // Versão do Instrumento de Cessão. Bump quando o texto mudar materialmente —
  // todos os cedentes com signedContract.version != CONTRACT_VERSION verão o
  // banner de reassinatura no dashboard.
  const CONTRACT_VERSION = "1.0.0";
  const CONTRACT_TITLE = "Instrumento Particular de Cessão de Direitos Creditórios";

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
    bindContractModal();

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

  // Converte erros do Alchemy/Turnkey em mensagens em PT-BR.
  function humanizeAuthError(e) {
    const raw = String(e?.message || e || "").trim();
    // O Turnkey costuma vir como JSON dentro do message.
    let payload = null;
    try {
      const m = raw.match(/\{[\s\S]*\}$/);
      if (m) payload = JSON.parse(m[0]);
      if (payload?.error) {
        try {
          payload = JSON.parse(payload.error);
        } catch (_) {}
      }
    } catch (_) {}

    const code = payload?.turnkeyErrorCode || payload?.code || "";
    const msg = payload?.message || raw;

    if (/MAX_OTP_INITIATED/i.test(raw) || code === "MAX_OTP_INITIATED") {
      return "Limite de envios de OTP atingido para este e-mail. Aguarde ~15-30 min e tente novamente, ou use outro e-mail.";
    }
    if (/INVALID_OTP_CODE|otp.*invalid|otp.*expired/i.test(raw)) {
      return "Código inválido ou expirado. Solicite um novo OTP.";
    }
    if (/timeout/i.test(raw)) {
      return "Tempo esgotado. Verifique se cookies de signer.alchemy.com estão liberados (extensions/incognito podem bloquear).";
    }
    if (/network|fetch|failed to load/i.test(raw)) {
      return "Falha de rede. Verifique sua conexão e tente novamente.";
    }
    return msg || "Não foi possível concluir a autenticação. Tente novamente.";
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
    let _sendOtpPromise = null;

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
      console.log("[TDIC] sendOTP: disparando para", email);

      // Mecânica do AlchemyWebSigner: `authenticate({type:"email"})` envia
      // o e-mail mas só RESOLVE quando `authenticate({type:"otp"})` (chamado
      // pelo verifyOTP) completar. Logo NÃO podemos `await` aqui.
      _sendOtpPromise = window.EfixWallet.sendOTP(email);

      // 500ms de proteção contra erro síncrono/imediato (rede, rate limit,
      // email recusado). Se rejeitar dentro disso, mostra erro e fica no
      // form de email. Se demorar mais, avança pro form de código e o
      // .catch() abaixo reverte caso rejeite tarde.
      let earlyError = null;
      const earlyHandler = (err) => {
        earlyError = err;
      };
      _sendOtpPromise.catch(earlyHandler);
      await new Promise((r) => setTimeout(r, 500));
      if (earlyError) {
        console.error("[TDIC] sendOTP early rejection:", earlyError);
        err.textContent = humanizeAuthError(earlyError);
        err.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Enviar código";
        return;
      }

      // Avança e instala handler tardio: se rejeitar enquanto o user está
      // no form de código, volta pra tela de email com erro.
      _sendOtpPromise.catch((errLate) => {
        console.warn("[TDIC] sendOTP late rejection:", errLate?.message || errLate);
        if (codeForm.style.display === "flex") {
          const errEl = $("#emailErr");
          errEl.textContent = humanizeAuthError(errLate);
          errEl.style.display = "block";
          codeForm.style.display = "none";
          emailForm.style.display = "flex";
        }
      });

      _email = email;
      $("#codeEmail").textContent = email;
      emailForm.style.display = "none";
      codeForm.style.display = "flex";
      $("#codeInput").focus();
      btn.disabled = false;
      btn.textContent = "Enviar código";
      console.log("[TDIC] UI avançou pro form de código");
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
        err.textContent = humanizeAuthError(e);
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

    // Contrato: provider selector, gating do submit pelo checkbox + nome + CPF.
    populateSignProviderSelect();
    bindBankBlock();
    const sync = () => syncContractGate();
    $("#kybSignAccept").addEventListener("change", sync);
    $("#kybSignName").addEventListener("input", sync);
    $("#kybSignCpf").addEventListener("input", maskCpfInput);
    $("#kybSignCpf").addEventListener("input", sync);
    $("#kybSignProvider").addEventListener("change", () => {
      const slug = $("#kybSignProvider").value;
      window.TdicSign?.setProvider(slug);
      const p = window.TdicSign?.active();
      const help = $("#kybSignProviderHelp");
      if (help && p) {
        help.textContent = p.helpText + (p.qualifiedSignature ? " · Assinatura qualificada disponível." : "");
      }
      sync();
    });
    $("#openContractBtn").addEventListener("click", openContractModal);
    $("#kybContractVersionLabel").textContent = "v" + CONTRACT_VERSION;
    sync();

    $("#kybForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#kybSubmitBtn");

      const accepted = $("#kybSignAccept").checked;
      const signName = $("#kybSignName").value.trim();
      const signCpf = $("#kybSignCpf").value.trim();

      if (!$("#kybCnpj").value.trim() || !$("#kybRazao").value.trim() || !$("#kybNome").value.trim()) {
        alert("Preencha CNPJ, razão social e nome do responsável.");
        return;
      }
      const bankAccount = collectBankAccount();
      const bankErr = validateBankAccount(bankAccount);
      if (bankErr) {
        alert("Dados bancários: " + bankErr);
        return;
      }
      if (!signName || !isValidCpfFormat(signCpf)) {
        alert("Informe nome e CPF do signatário do contrato.");
        return;
      }
      if (!accepted) {
        alert("É necessário aceitar o Instrumento de Cessão para continuar.");
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Assinando…';
      try {
        const signedContract = await produceSignedContract({
          signName,
          signCpf,
          cnpj: $("#kybCnpj").value.trim(),
          razaoSocial: $("#kybRazao").value.trim(),
        });
        if (!signedContract) {
          // Provider devolveu cancelado / erro — UI já tratou.
          btn.disabled = false;
          btn.textContent = "Assinar e enviar para análise";
          return;
        }

        const payload = {
          cnpj: signedContract.cedente.cnpj,
          razaoSocial: signedContract.cedente.razaoSocial,
          regimeTributario: $("#kybRegime").value,
          contato: {
            nome: $("#kybNome").value.trim(),
            cargo: $("#kybCargo").value.trim(),
            email: state.user.email,
            tel: $("#kybTel").value.trim(),
            faturamento: $("#kybFat").value,
          },
          docs: Object.values(state.kybDocs),
          bankAccount,
          signedContract,
        };

        state.cedente = await window.TdicMock.submitKyb(state.user.address, payload);
        try {
          localStorage.setItem(
            "tdic_signed_contract_" + state.user.address.toLowerCase(),
            JSON.stringify(signedContract)
          );
        } catch (_) {}
        show("kybPendingView");
      } catch (e) {
        console.error("[TDIC] submitKyb falhou:", e);
        alert(e.message || "Falha ao enviar KYB.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Assinar e enviar para análise";
      }
    });
  }

  function bindBankBlock() {
    // Mostra/esconde campo "Nome do banco" quando "OUTRO"
    $("#kybBankCompe").addEventListener("change", () => {
      const v = $("#kybBankCompe").value;
      $("#kybBankNameField").style.display = v === "OUTRO" ? "" : "none";
    });
    // Mostra/esconde campos de titularidade de terceiros
    $("#kybBankOwner").addEventListener("change", () => {
      const v = $("#kybBankOwner").value;
      $("#kybBankThirdFields").style.display = v === "third" ? "grid" : "none";
    });
    // Auto-preenche PIX (CNPJ) com o CNPJ do cedente quando trocar tipo
    $("#kybPixType").addEventListener("change", () => {
      const t = $("#kybPixType").value;
      const k = $("#kybPixKey");
      if (t === "cnpj" && !k.value) k.value = $("#kybCnpj").value || "";
    });
    // Máscaras leves
    $("#kybAgencia").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9-]/g, "").slice(0, 6);
    });
    $("#kybConta").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9-Xx]/g, "").slice(0, 14);
    });
  }

  function collectBankAccount() {
    const compe = $("#kybBankCompe").value;
    if (!compe) return null;
    const owner = $("#kybBankOwner").value;
    const out = {
      pix: $("#kybPixKey").value.trim()
        ? { type: $("#kybPixType").value, key: $("#kybPixKey").value.trim() }
        : null,
      bank: {
        compe: compe === "OUTRO" ? null : compe,
        name:
          compe === "OUTRO"
            ? $("#kybBankName").value.trim()
            : $("#kybBankCompe").options[$("#kybBankCompe").selectedIndex].text.replace(/^\d+ — /, ""),
        type: $("#kybBankType").value,
        agencia: $("#kybAgencia").value.trim(),
        conta: $("#kybConta").value.trim(),
        contaVar: $("#kybContaVar").value.trim() || null,
      },
      ownership: owner,
    };
    if (owner === "third") {
      out.thirdParty = {
        doc: $("#kybBankOwnerDoc").value.trim(),
        name: $("#kybBankOwnerName").value.trim(),
      };
    }
    return out;
  }

  function validateBankAccount(b) {
    if (!b) return "Selecione o banco e preencha agência + conta.";
    if (!b.bank.agencia) return "Informe a agência.";
    if (!b.bank.conta) return "Informe a conta com dígito verificador.";
    if (!b.bank.compe && !b.bank.name) return "Informe o nome do banco.";
    if (b.pix) {
      const k = b.pix.key;
      if (b.pix.type === "cnpj" && k.replace(/\D/g, "").length !== 14) return "Chave PIX (CNPJ) inválida.";
      if (b.pix.type === "cpf" && k.replace(/\D/g, "").length !== 11) return "Chave PIX (CPF) inválida.";
      if (b.pix.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k)) return "Chave PIX (e-mail) inválida.";
      if (b.pix.type === "phone" && k.replace(/\D/g, "").length < 10) return "Chave PIX (telefone) inválida.";
    }
    if (b.ownership === "third") {
      if (!b.thirdParty?.doc || !b.thirdParty?.name) return "Conta de terceiros: informe CNPJ/CPF e razão social.";
    }
    return null;
  }

  function populateSignProviderSelect() {
    const sel = $("#kybSignProvider");
    if (!sel || !window.TdicSign) return;
    const list = window.TdicSign.listProviders();
    const active = window.TdicSign.active().slug;
    sel.innerHTML = list
      .map((p) => `<option value="${p.slug}">${escapeHtml(p.displayName)}${p.qualifiedSignature ? " · qualificada" : ""}</option>`)
      .join("");
    sel.value = active;
    const p = window.TdicSign.active();
    const help = $("#kybSignProviderHelp");
    if (help) {
      help.textContent = p.helpText + (p.qualifiedSignature ? " · Assinatura qualificada disponível." : "");
    }
  }

  // Coleta o body canônico do contrato + metadados, dispara o provider de
  // assinatura e devolve o registro completo (signedContract).
  async function produceSignedContract({ signName, signCpf, cnpj, razaoSocial }) {
    const docBodyEl = document.getElementById("contractDocBody");
    const canonicalText = canonicalizeContract(docBodyEl);
    const documentTextHash = await window.TdicSign.sha256Hex(canonicalText);

    let providerResult = null;
    try {
      providerResult = await window.TdicSign.requestSignature({
        canonicalText,
        documentTextHash,
        contractVersion: CONTRACT_VERSION,
        contractTitle: CONTRACT_TITLE,
        signatory: { name: signName, cpf: signCpf, email: state.user.email },
        cedente: { cnpj, razaoSocial, wallet: state.user.address },
      });
    } catch (e) {
      console.error("[TDIC] provider error:", e);
      alert("Falha na plataforma de assinatura: " + (e.message || e));
      return null;
    }
    if (!providerResult || !providerResult.ok) {
      alert("Assinatura não concluída: " + (providerResult?.error || "operação cancelada"));
      return null;
    }

    const now = new Date();
    return {
      version: CONTRACT_VERSION,
      title: CONTRACT_TITLE,
      issuer: { ...(window.TdicBrand?.issuer || {}) },
      signatory: { name: signName, cpf: signCpf, email: state.user.email },
      cedente: { cnpj, razaoSocial },
      wallet: state.user.address,
      acceptedAt: now.toISOString(),
      acceptedAtLocal: now.toString(),
      userAgent: navigator.userAgent,
      // Hash + provider — backbone da prova de existência.
      documentTextHash,           // SHA-256 do texto canonicalizado (pré-assinatura)
      documentHash: providerResult.documentHash,         // SHA-256 retornado/confirmado pelo provider
      provider: providerResult.provider,
      envelopeId: providerResult.envelopeId,
      providerStatus: providerResult.status,
      signedDocumentUrl: providerResult.signedDocumentUrl || null,
      caTimestamp: providerResult.caTimestamp || null,    // RFC 3161 timestamp da CA
      documentSnapshotHtml: docBodyEl?.outerHTML || null,
    };
  }

  // Normaliza o body do contrato para gerar um hash estável.
  // Remove zonas voláteis (timestamp, "Visualizado em") e colapsa whitespace.
  function canonicalizeContract(rootEl) {
    if (!rootEl) return "";
    const clone = rootEl.cloneNode(true);
    clone.querySelectorAll(".contract-meta, #contractTimestamp").forEach((n) => n.remove());
    const text = (clone.textContent || "")
      .replace(/ /g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `TDIC-CONTRACT/${CONTRACT_VERSION}\n${CONTRACT_TITLE}\n---\n${text}`;
  }

  function syncContractGate() {
    const accepted = $("#kybSignAccept")?.checked;
    const signName = $("#kybSignName")?.value.trim();
    const signCpf = $("#kybSignCpf")?.value.trim();
    const ok = accepted && signName && isValidCpfFormat(signCpf);
    const btn = $("#kybSubmitBtn");
    if (btn) btn.disabled = !ok;
  }

  function maskCpfInput(e) {
    const digits = (e.target.value || "").replace(/\D/g, "").slice(0, 11);
    let out = digits;
    if (digits.length > 9) out = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    else if (digits.length > 6) out = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    else if (digits.length > 3) out = `${digits.slice(0, 3)}.${digits.slice(3)}`;
    e.target.value = out;
  }

  function isValidCpfFormat(s) {
    return String(s || "").replace(/\D/g, "").length === 11;
  }

  async function openContractModal() {
    const ts = new Date();
    const tEl = document.getElementById("contractTimestamp");
    if (tEl) tEl.textContent = ts.toLocaleString("pt-BR") + " (" + ts.toISOString() + ")";
    // Computa o hash live do texto canônico exibido para mostrar ao usuário
    // como prova da integridade do que ele está visualizando.
    try {
      const canon = canonicalizeContract(document.getElementById("contractDocBody"));
      const h = await window.TdicSign.sha256Hex(canon);
      const meta = document.getElementById("contractMeta");
      if (meta) {
        const provider = window.TdicSign?.active();
        meta.innerHTML = `Versão ${CONTRACT_VERSION} · SHA-256 <span class="mono" style="color:#404040">${h}</span><br>
          Plataforma: ${escapeHtml(provider?.displayName || "—")}${provider?.qualifiedSignature ? " (qualificada)" : ""} · Visualizado em ${ts.toLocaleString("pt-BR")} <span class="mono">(${ts.toISOString()})</span>`;
      }
    } catch (e) {
      console.warn("[TDIC] hash live falhou:", e);
    }
    $("#modalContract").style.display = "flex";
  }
  function closeContractModal() {
    $("#modalContract").style.display = "none";
  }
  async function downloadContractHtml() {
    const brand = window.TdicBrand || {};
    const issuer = brand.issuer || {};
    const cedente = {
      cnpj: $("#kybCnpj")?.value || state.cedente?.cnpj || "—",
      razaoSocial: $("#kybRazao")?.value || state.cedente?.razaoSocial || "—",
    };
    const sig = {
      name: $("#kybSignName")?.value || state.cedente?.signedContract?.signatory?.name || "—",
      cpf: $("#kybSignCpf")?.value || state.cedente?.signedContract?.signatory?.cpf || "—",
      email: state.user?.email || "—",
      address: state.user?.address || "—",
    };
    const docBodyEl = document.getElementById("contractDocBody");
    const body = docBodyEl?.innerHTML || "";
    const canon = canonicalizeContract(docBodyEl);
    const documentTextHash = await window.TdicSign.sha256Hex(canon);
    const provider = window.TdicSign?.active();
    const stored = state.cedente?.signedContract;
    const ts = new Date();
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Instrumento de Cessão — TDIC</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:780px;margin:32px auto;padding:24px;color:#1a1a1a;line-height:1.65}
h1{font-size:20px;margin-bottom:6px}.sub{color:#525252;font-size:13px;margin-bottom:24px}
h4{margin:18px 0 6px;font-size:15px}p{margin:0 0 8px}.clause-num{font-family:monospace;color:#525252;font-size:11px;margin-right:5px}
.box{border:1px solid #d4d4d4;border-radius:8px;padding:16px;margin-top:24px;font-size:13px}
.box .row{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid #f5f5f5;padding:6px 0}
.box .row:last-child{border-bottom:none}.box .row strong{text-align:right;word-break:break-all}
.ft{margin-top:32px;padding-top:14px;border-top:1px solid #d4d4d4;font-size:11px;color:#737373;text-align:center}
.hash{font-family:monospace;font-size:11px;word-break:break-all}</style>
</head><body>
<h1>Instrumento Particular de Cessão de Direitos Creditórios</h1>
<div class="sub">${issuer.razaoSocial || "EFIX Securitizadora S.A."} · CNPJ ${issuer.cnpj || "60.756.859/0001-57"} · Versão ${CONTRACT_VERSION}</div>
${body}
<div class="box">
  <h4 style="margin-top:0">Integridade documental</h4>
  <div class="row"><span>Versão do instrumento</span><strong>${CONTRACT_VERSION}</strong></div>
  <div class="row"><span>SHA-256 (texto canônico)</span><strong class="hash">${documentTextHash}</strong></div>
  ${stored?.documentHash ? `<div class="row"><span>SHA-256 (provider)</span><strong class="hash">${stored.documentHash}</strong></div>` : ""}
  <div class="row"><span>Plataforma de assinatura</span><strong>${provider?.displayName || "—"}${provider?.qualifiedSignature ? " (qualificada)" : ""}</strong></div>
  ${stored?.envelopeId ? `<div class="row"><span>Envelope ID</span><strong class="hash">${stored.envelopeId}</strong></div>` : ""}
  ${stored?.caTimestamp?.ts ? `<div class="row"><span>Carimbo de tempo (CA)</span><strong>${stored.caTimestamp.ts} · ${stored.caTimestamp.tsa || ""}</strong></div>` : ""}
  ${stored?.signedDocumentUrl ? `<div class="row"><span>Documento assinado</span><strong><a href="${stored.signedDocumentUrl}">${stored.signedDocumentUrl}</a></strong></div>` : ""}
</div>
<div class="box">
  <h4 style="margin-top:0">Aceitação eletrônica</h4>
  <div class="row"><span>Cedente</span><strong>${cedente.razaoSocial} · CNPJ ${cedente.cnpj}</strong></div>
  <div class="row"><span>Signatário</span><strong>${sig.name} · CPF ${sig.cpf}</strong></div>
  <div class="row"><span>E-mail validado</span><strong>${sig.email}</strong></div>
  <div class="row"><span>Smart wallet</span><strong class="hash">${sig.address}</strong></div>
  <div class="row"><span>Data e hora</span><strong>${ts.toLocaleString("pt-BR")} (${ts.toISOString()})</strong></div>
  <div class="row"><span>Dispositivo</span><strong style="font-family:monospace;font-size:11px;text-align:right">${navigator.userAgent}</strong></div>
</div>
<div class="ft">Documento gerado em ${ts.toLocaleString("pt-BR")} — válido como prova da contratação eletrônica nos termos do art. 10 §2º da MP 2.200-2/2001 e art. 425 do Código Civil. O hash SHA-256 acima permite verificação independente da integridade do texto.</div>
</body></html>`;
    download(html, "tdic-cessao-contrato-" + CONTRACT_VERSION + ".html", "text/html");
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
    syncReSignBanner();
  }

  // Mostra o banner de reassinatura quando a versão do contrato local
  // (state.cedente.signedContract.version) está desatualizada em relação
  // a CONTRACT_VERSION ou quando o cedente não tem signedContract.
  function syncReSignBanner() {
    const banner = document.getElementById("resignBanner");
    if (!banner) return;
    const sc = state.cedente?.signedContract;
    const needs = !sc || sc.version !== CONTRACT_VERSION;
    if (!needs) {
      banner.hidden = true;
      return;
    }
    const desc = document.getElementById("resignBannerDesc");
    if (!sc) {
      desc.textContent = "Assinatura do Instrumento de Cessão não localizada. Reaceite para continuar.";
    } else {
      desc.textContent = `Você assinou a versão ${sc.version}; a versão vigente é ${CONTRACT_VERSION}. Reaceite para continuar.`;
    }
    banner.hidden = false;
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
    $("#borderoConsolidadoBtn")?.addEventListener("click", downloadBorderoConsolidado);
    $("#reSignBtn")?.addEventListener("click", openReSignFlow);
  }

  // Reaceitação: prefilenche o form do KYB com os dados atuais e volta
  // para a tela KYB para o usuário re-assinar a nova versão do contrato.
  function openReSignFlow() {
    const c = state.cedente;
    if (!c) return;
    show("kybView");
    $("#kybCnpj").value = c.cnpj || "";
    $("#kybRazao").value = c.razaoSocial || "";
    $("#kybRegime").value = c.regimeTributario || "lucro-real";
    if (c.contato) {
      $("#kybNome").value = c.contato.nome || "";
      $("#kybCargo").value = c.contato.cargo || "";
      $("#kybTel").value = c.contato.tel || "";
      $("#kybFat").value = c.contato.faturamento || "";
    }
    $("#kybEmail").value = state.user.email;
    // Preenche dados bancários (BACEN) a partir do registro existente
    if (c.bankAccount) {
      const ba = c.bankAccount;
      if (ba.pix) {
        $("#kybPixType").value = ba.pix.type || "cnpj";
        $("#kybPixKey").value = ba.pix.key || "";
      }
      if (ba.bank) {
        $("#kybBankCompe").value = ba.bank.compe || (ba.bank.name ? "OUTRO" : "");
        $("#kybBankNameField").style.display = $("#kybBankCompe").value === "OUTRO" ? "" : "none";
        $("#kybBankName").value = ba.bank.compe ? "" : ba.bank.name || "";
        $("#kybBankType").value = ba.bank.type || "cc";
        $("#kybAgencia").value = ba.bank.agencia || "";
        $("#kybConta").value = ba.bank.conta || "";
        $("#kybContaVar").value = ba.bank.contaVar || "";
      }
      $("#kybBankOwner").value = ba.ownership || "self";
      $("#kybBankThirdFields").style.display = ba.ownership === "third" ? "grid" : "none";
      if (ba.thirdParty) {
        $("#kybBankOwnerDoc").value = ba.thirdParty.doc || "";
        $("#kybBankOwnerName").value = ba.thirdParty.name || "";
      }
    }
    // Limpa o aceite — re-aceitação é um ato novo.
    $("#kybSignAccept").checked = false;
    $("#kybSignName").value = "";
    $("#kybSignCpf").value = "";
    syncContractGate();
    // Scroll até o card de contrato.
    setTimeout(() => {
      document.querySelector(".contract-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
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
      "<table><thead><tr><th>ID</th><th>Devedor</th><th>Tipo</th><th>Valor face</th><th>Vencimento</th><th>Deságio</th><th>Líquido</th><th>Status</th><th>Borderô</th><th></th></tr></thead><tbody>";
    state.creditos.forEach((c) => {
      const st = STATUS[c.status] || { label: c.status, pill: "gray" };
      const cr = state.crs.find((x) => x.creditoId === c.id);
      let action = "";
      if (c.status === "aprovado") {
        // Privada: mostra "Ver oferta" (subscrição) em vez de Mint direto.
        // O mint só roda após o pagamento da subscrição confirmar.
        if (cr?.issuanceType === "private" && cr?.subscriptionLink) {
          action = `<a class="btn btn-brand" href="${cr.subscriptionLink}" target="_blank" style="padding:0.4rem 0.85rem;font-size:0.78rem;text-decoration:none">→ Ver oferta</a>`;
        } else {
          action = `<button class="btn btn-brand" data-mint="${c.id}" style="padding:0.4rem 0.85rem;font-size:0.78rem">Mintar TDIC</button>`;
        }
      } else if (c.status === "mintado") {
        action = cr
          ? `<a class="mono" style="font-size:0.74rem;color:#525252" href="https://basescan.org/token/${cr.tokenId}" target="_blank">Ver token</a>`
          : "";
      }
      const issuanceTag = cr?.issuanceType === "private"
        ? `<span class="pill amber" style="font-size:0.62rem;margin-left:4px" title="Auto-securitização: cedente é o tomador"><span class="dot"></span>Privada</span>`
        : cr?.issuanceType === "public"
        ? `<span class="pill blue" style="font-size:0.62rem;margin-left:4px" title="Oferta pública via crowdfunding CVM 88"><span class="dot"></span>Pública</span>`
        : "";
      const desconto = c.discountBrl ? fmtBRL(c.discountBrl) : (c.discountBps / 100).toFixed(2) + "% face";
      const liquido = c.netValue || c.faceValue - (c.discountBrl || 0);
      html += `<tr>
        <td class="mono" style="color:#525252">${c.id}</td>
        <td>${c.devedorRazaoSocial || "—"}<div class="mono" style="font-size:0.7rem;color:#a3a3a3">${c.devedorCnpj || ""}</div></td>
        <td>${tipoLabel(c.tipo)}</td>
        <td class="mono">${fmtBRL(c.faceValue)}</td>
        <td class="mono">${fmtDate(c.maturityDate)}</td>
        <td class="mono" style="font-size:0.78rem">${desconto}</td>
        <td class="mono" style="color:var(--brand-primary);font-weight:700">${fmtBRL(liquido)}</td>
        <td><span class="pill ${st.pill}"><span class="dot"></span>${st.label}</span>${issuanceTag}</td>
        <td><button class="btn btn-ghost" data-bordero="${c.id}" style="padding:0.3rem 0.65rem;font-size:0.72rem" title="Baixar borderô de cessão (PDF)">↓ PDF</button></td>
        <td>${action}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    body.innerHTML = html;

    $$("button[data-mint]", body).forEach((b) => {
      b.addEventListener("click", () => openMintModal(b.getAttribute("data-mint")));
    });
    $$("button[data-bordero]", body).forEach((b) => {
      b.addEventListener("click", () => downloadBorderoCessao(b.getAttribute("data-bordero")));
    });
  }

  // Borderô de Cessão — documento contábil / operacional gerado por crédito.
  // Em produção é assinado eletronicamente junto com o Termo de Adesão e
  // arquivado pelo backend. Aqui geramos um HTML standalone pra impressão.
  function downloadBorderoCessao(creditoId) {
    const c = state.creditos.find((x) => x.id === creditoId);
    if (!c) return;
    const cedente = state.cedente || {};
    const issuer = window.TdicBrand?.issuer || {};
    const cr = state.crs.find((x) => x.creditoId === c.id);
    const ts = new Date();
    const liquido = c.netValue || c.faceValue - (c.discountBrl || 0);
    const royalty = Number(c.royaltyBrl) || 0;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Borderô de Cessão — ${c.id}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.6;font-size:13px}
h1{font-size:18px;margin-bottom:6px;letter-spacing:-.01em}
.sub{color:#525252;font-size:12px;margin-bottom:24px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d4d4d4;border-radius:8px;overflow:hidden;margin-bottom:18px}
.grid .cell{padding:8px 12px;border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0}
.grid .cell:nth-child(2n){border-right:none}
.grid .lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#737373;font-weight:700;margin-bottom:2px}
.grid .val{font-size:13px;font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
th,td{border:1px solid #e5e5e5;padding:8px 10px;text-align:left}
th{background:#fafafa;font-size:10px;text-transform:uppercase;letter-spacing:0.05em}
.tot{margin-top:18px;padding:14px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px}
.tot .row{display:flex;justify-content:space-between;padding:4px 0}
.tot .row.t{border-top:1px solid #d4d4d4;margin-top:6px;padding-top:8px;font-weight:700;font-size:14px;color:#15803d}
.sig{margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
.sig .box{border-top:1px solid #1a1a1a;padding-top:8px;text-align:center;font-size:11px;color:#525252}
.ft{margin-top:32px;padding-top:14px;border-top:1px solid #d4d4d4;font-size:10px;color:#737373;text-align:center}
.mono{font-family:monospace}</style>
</head><body>
<h1>Borderô de Cessão de Direitos Creditórios</h1>
<div class="sub">Operação ${c.id} · Emitido em ${ts.toLocaleString("pt-BR")}</div>

<div class="grid">
  <div class="cell"><div class="lbl">Cessionária</div><div class="val">${issuer.razaoSocial || "EFIX Securitizadora S.A."}</div><div class="mono" style="font-size:11px;color:#737373">CNPJ ${issuer.cnpj || "60.756.859/0001-57"}</div></div>
  <div class="cell"><div class="lbl">Cedente</div><div class="val">${escapeHtml(cedente.razaoSocial || "—")}</div><div class="mono" style="font-size:11px;color:#737373">CNPJ ${cedente.cnpj || "—"}</div></div>
  <div class="cell"><div class="lbl">Data da operação</div><div class="val">${ts.toLocaleDateString("pt-BR")}</div></div>
  <div class="cell"><div class="lbl">ID do crédito</div><div class="val mono">${c.id}</div></div>
</div>

<table>
  <thead><tr><th>Devedor (sacado)</th><th>CNPJ devedor</th><th>Duplicata / referência</th><th style="text-align:right">Valor face</th><th style="text-align:right">Vencimento</th><th style="text-align:right">Prazo</th></tr></thead>
  <tbody>
    <tr>
      <td>${escapeHtml(c.devedorRazaoSocial || "—")}</td>
      <td class="mono">${c.devedorCnpj || "—"}</td>
      <td class="mono">${c.dupl || c.id}${c.chaveNF ? "<br><span style='font-size:10px;color:#737373'>NF " + c.chaveNF + "</span>" : ""}</td>
      <td class="mono" style="text-align:right">${fmtBRL(c.faceValue)}</td>
      <td class="mono" style="text-align:right">${fmtDate(c.maturityDate)}</td>
      <td class="mono" style="text-align:right">${c.prazoDias || "—"} dias</td>
    </tr>
  </tbody>
</table>

<div class="tot">
  <div class="row"><span>Valor face</span><strong class="mono">${fmtBRL(c.faceValue)}</strong></div>
  <div class="row"><span>(−) Deságio (${(c.discountBps / 100).toFixed(2)}% sobre face)</span><strong class="mono">${fmtBRL(c.discountBrl || 0)}</strong></div>
  ${royalty ? `<div class="row"><span>(−) Taxa de serviço</span><strong class="mono">${fmtBRL(royalty)}</strong></div>` : ""}
  ${c.abatimento ? `<div class="row"><span>(−) Abatimento</span><strong class="mono">${fmtBRL(c.abatimento)}</strong></div>` : ""}
  <div class="row t"><span>Valor líquido a creditar</span><strong class="mono">${fmtBRL(liquido)}</strong></div>
</div>

${cedente.bankAccount ? `
<div class="grid" style="margin-top:18px">
  <div class="cell"><div class="lbl">Conta de liquidação · Banco</div><div class="val">${escapeHtml(cedente.bankAccount.bank?.name || "—")}${cedente.bankAccount.bank?.compe ? " (" + cedente.bankAccount.bank.compe + ")" : ""}</div></div>
  <div class="cell"><div class="lbl">Tipo</div><div class="val">${({ cc: "Corrente", cp: "Poupança", cg: "Pagamento" }[cedente.bankAccount.bank?.type] || "—")}</div></div>
  <div class="cell"><div class="lbl">Agência</div><div class="val mono">${cedente.bankAccount.bank?.agencia || "—"}</div></div>
  <div class="cell"><div class="lbl">Conta</div><div class="val mono">${cedente.bankAccount.bank?.conta || "—"}${cedente.bankAccount.bank?.contaVar ? " · var " + cedente.bankAccount.bank.contaVar : ""}</div></div>
  ${cedente.bankAccount.pix ? `<div class="cell" style="grid-column:1/3"><div class="lbl">PIX (alternativo)</div><div class="val mono">${cedente.bankAccount.pix.type.toUpperCase()} · ${escapeHtml(cedente.bankAccount.pix.key)}</div></div>` : ""}
</div>` : ""}

${cr ? `
<div class="grid" style="margin-top:18px">
  <div class="cell" style="grid-column:1/3"><div class="lbl">Token TDIC vinculado</div><div class="val mono" style="font-size:11px;word-break:break-all">${cr.tokenId}</div></div>
  ${cr.mintTxHash ? `<div class="cell" style="grid-column:1/3"><div class="lbl">Transação de mint (Base mainnet)</div><div class="val mono" style="font-size:11px;word-break:break-all">${cr.mintTxHash}</div></div>` : ""}
</div>` : ""}

<div class="sig">
  <div class="box">${escapeHtml(cedente.contato?.nome || "—")}<br>Cedente · ${cedente.cnpj || "—"}</div>
  <div class="box">${issuer.razaoSocial || "EFIX Securitizadora S.A."}<br>Cessionária · ${issuer.cnpj || "60.756.859/0001-57"}</div>
</div>

<div class="ft">
  Borderô gerado em ${ts.toLocaleString("pt-BR")} (${ts.toISOString()}). Este documento integra o conjunto probatório
  da operação de cessão e deve ser conservado pela cedente para fins fiscais e contábeis (Lei 14.430/2022 + RFB IN).
</div>
</body></html>`;
    downloadAsPdf(html, "tdic-bordero-cessao-" + c.id + ".pdf");
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

  // ── Borderô consolidado: somatório de TODAS as operações do cedente ──
  // Documento operacional/contábil agregando todos os créditos por status,
  // com totais por bucket e total geral. Aceita filtro de período.
  function downloadBorderoConsolidado() {
    const cedente = state.cedente || {};
    const issuer = window.TdicBrand?.issuer || {};
    const period = document.getElementById("borderoPeriod")?.value || "all";
    const { since, label: periodLabel } = resolvePeriod(period);

    const inPeriod = (c) => {
      if (!since) return true;
      const ts = new Date(c.createdAt).getTime();
      return ts >= since.getTime();
    };
    const all = state.creditos.filter(inPeriod);

    // Agrupa por status — mantém também ordem temporal dentro do bucket.
    const byStatus = {
      "em-analise": all.filter((c) => c.status === "em-analise"),
      aprovado: all.filter((c) => c.status === "aprovado"),
      mintado: all.filter((c) => c.status === "mintado"),
      liquidado: all.filter((c) => c.status === "liquidado"),
    };
    const STATUS_LABEL = {
      "em-analise": "Em análise (aguardando compliance EFIX)",
      aprovado: "Aprovados (aguardando mint)",
      mintado: "Mintados (TDIC ativo)",
      liquidado: "Liquidados",
    };

    const sum = (arr, k) => arr.reduce((a, b) => a + (Number(b[k]) || 0), 0);
    const liquidoOf = (c) =>
      Number(c.netValue) || c.faceValue - (Number(c.discountBrl) || 0) - (Number(c.royaltyBrl) || 0) - (Number(c.abatimento) || 0);

    let buckets = "";
    let grandFace = 0,
      grandDesc = 0,
      grandRoy = 0,
      grandAbat = 0,
      grandLiq = 0;
    Object.keys(byStatus).forEach((statusKey) => {
      const list = byStatus[statusKey];
      if (!list.length) return;
      const face = sum(list, "faceValue");
      const desc = sum(list, "discountBrl");
      const roy = sum(list, "royaltyBrl");
      const abat = sum(list, "abatimento");
      const liq = list.reduce((a, c) => a + liquidoOf(c), 0);
      grandFace += face;
      grandDesc += desc;
      grandRoy += roy;
      grandAbat += abat;
      grandLiq += liq;
      const rows = list
        .map((c) => {
          const cr = state.crs.find((x) => x.creditoId === c.id);
          const liqC = liquidoOf(c);
          return `<tr>
            <td class="mono" style="font-size:11px;color:#525252">${c.id}</td>
            <td>${escapeHtml(c.devedorRazaoSocial || "—")}<div class="mono" style="font-size:10px;color:#a3a3a3">${c.devedorCnpj || ""}</div></td>
            <td class="mono" style="font-size:11px">${c.dupl || "—"}</td>
            <td class="mono" style="text-align:right">${fmtBRL(c.faceValue)}</td>
            <td class="mono" style="text-align:right">${fmtBRL(c.discountBrl || 0)}</td>
            <td class="mono" style="text-align:right">${fmtBRL(c.royaltyBrl || 0)}</td>
            <td class="mono" style="text-align:right">${fmtBRL(c.abatimento || 0)}</td>
            <td class="mono" style="text-align:right;font-weight:700;color:#15803d">${fmtBRL(liqC)}</td>
            <td class="mono">${fmtDate(c.maturityDate)}</td>
            <td class="mono" style="font-size:10px;color:#525252">${cr ? cr.tokenId.slice(0, 10) + "…" + cr.tokenId.slice(-4) : "—"}</td>
          </tr>`;
        })
        .join("");
      buckets += `
        <h4 class="bucket">${STATUS_LABEL[statusKey]} <span class="bucket-count">${list.length} operação${list.length === 1 ? "" : "ões"}</span></h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Devedor (sacado)</th>
              <th>Duplicata</th>
              <th style="text-align:right">Face</th>
              <th style="text-align:right">Deságio</th>
              <th style="text-align:right">Taxa serv.</th>
              <th style="text-align:right">Abat.</th>
              <th style="text-align:right">Líquido</th>
              <th>Vencto</th>
              <th>Token TDIC</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="font-weight:700">Subtotal · ${list.length}</td>
              <td class="mono" style="text-align:right;font-weight:700">${fmtBRL(face)}</td>
              <td class="mono" style="text-align:right;font-weight:700">${fmtBRL(desc)}</td>
              <td class="mono" style="text-align:right;font-weight:700">${fmtBRL(roy)}</td>
              <td class="mono" style="text-align:right;font-weight:700">${fmtBRL(abat)}</td>
              <td class="mono" style="text-align:right;font-weight:700;color:#15803d">${fmtBRL(liq)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      `;
    });

    if (!all.length) {
      buckets = `<div class="empty-bucket">Nenhuma operação no período selecionado.</div>`;
    }

    const ts = new Date();
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Borderô Consolidado de Cessões — TDIC</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;max-width:1080px;margin:32px auto;padding:24px;color:#1a1a1a;line-height:1.55;font-size:12px}
h1{font-size:20px;margin-bottom:6px;letter-spacing:-.01em}
.sub{color:#525252;font-size:12px;margin-bottom:24px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d4d4d4;border-radius:8px;overflow:hidden;margin-bottom:18px}
.grid .cell{padding:8px 12px;border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0}
.grid .cell:nth-child(2n){border-right:none}
.grid .lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#737373;font-weight:700;margin-bottom:2px}
.grid .val{font-size:13px;font-weight:600}
h4.bucket{margin:24px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#404040;border-bottom:1px solid #d4d4d4;padding-bottom:6px;display:flex;justify-content:space-between;align-items:center}
.bucket-count{font-family:monospace;font-size:10px;color:#737373;font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:4px;font-size:11px}
th,td{border:1px solid #e5e5e5;padding:6px 8px;text-align:left;vertical-align:middle}
th{background:#fafafa;font-size:9px;text-transform:uppercase;letter-spacing:0.04em}
tfoot td{background:#f5f5f5}
.tot{margin-top:24px;padding:14px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px}
.tot .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.tot .row.t{border-top:1px solid #d4d4d4;margin-top:6px;padding-top:8px;font-weight:700;font-size:15px;color:#15803d}
.tot .row.s{font-size:11px;color:#737373}
.empty-bucket{padding:32px;text-align:center;color:#737373;border:1px dashed #d4d4d4;border-radius:8px;margin-top:18px;font-size:12px}
.bank{margin-top:18px;padding:10px 12px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;font-size:11px;color:#525252}
.bank strong{color:#0a0a0a}
.ft{margin-top:32px;padding-top:14px;border-top:1px solid #d4d4d4;font-size:10px;color:#737373;text-align:center}
.mono{font-family:monospace}
</style>
</head><body>
<h1>Borderô Consolidado de Cessões — TDIC</h1>
<div class="sub">${periodLabel} · ${all.length} operação(ões) · Emitido em ${ts.toLocaleString("pt-BR")}</div>



<div class="grid">
  <div class="cell"><div class="lbl">Cedente</div><div class="val">${escapeHtml(cedente.razaoSocial || "—")}</div><div class="mono" style="font-size:11px;color:#737373">CNPJ ${cedente.cnpj || "—"}</div></div>
  <div class="cell"><div class="lbl">Cessionária</div><div class="val">${issuer.razaoSocial || "EFIX Securitizadora S.A."}</div><div class="mono" style="font-size:11px;color:#737373">CNPJ ${issuer.cnpj || "60.756.859/0001-57"}</div></div>
  <div class="cell" style="grid-column:1/3"><div class="lbl">Marco regulatório</div><div class="val">Lei 14.430/2022 · CVM 88/2022</div></div>
</div>

${cedente.bankAccount ? `
<div class="bank">
  <strong>Conta de liquidação:</strong>
  ${escapeHtml(cedente.bankAccount.bank?.name || "—")}${cedente.bankAccount.bank?.compe ? " (" + cedente.bankAccount.bank.compe + ")" : ""}
  · ${({ cc: "CC", cp: "CP", cg: "CG" }[cedente.bankAccount.bank?.type] || "—")}
  · Ag <span class="mono">${cedente.bankAccount.bank?.agencia || "—"}</span>
  · Conta <span class="mono">${cedente.bankAccount.bank?.conta || "—"}</span>
  ${cedente.bankAccount.pix ? ` · PIX <span class="mono">${cedente.bankAccount.pix.type.toUpperCase()} ${escapeHtml(cedente.bankAccount.pix.key)}</span>` : ""}
</div>` : ""}

${buckets}

<div class="tot">
  <div class="row s"><span>Total de operações</span><span class="mono">${all.length}</span></div>
  <div class="row"><span>Total de face cedido</span><strong class="mono">${fmtBRL(grandFace)}</strong></div>
  <div class="row s"><span>(−) Deságio total</span><span class="mono">${fmtBRL(grandDesc)}</span></div>
  <div class="row s"><span>(−) Taxa de serviço total</span><span class="mono">${fmtBRL(grandRoy)}</span></div>
  ${grandAbat > 0 ? `<div class="row s"><span>(−) Abatimentos</span><span class="mono">${fmtBRL(grandAbat)}</span></div>` : ""}
  <div class="row t"><span>Total líquido a creditar</span><strong class="mono">${fmtBRL(grandLiq)}</strong></div>
</div>

<div class="ft">
  Borderô consolidado gerado em ${ts.toLocaleString("pt-BR")} (${ts.toISOString()}) ·
  ${issuer.razaoSocial || "EFIX Securitizadora S.A."} · Documento de apoio operacional/contábil.
  Para borderô individual de cada cessão use o botão "↓ HTML" da operação correspondente.
</div>
</body></html>`;

    downloadAsPdf(html, "tdic-bordero-consolidado-" + ts.toISOString().slice(0, 10) + ".pdf");
  }

  // Resolve a janela temporal selecionada para o filtro do borderô consolidado.
  function resolvePeriod(period) {
    const now = new Date();
    if (period === "mtd") {
      const since = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since, label: "Mês corrente · " + now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
    }
    if (period === "ytd") {
      const since = new Date(now.getFullYear(), 0, 1);
      return { since, label: "Ano corrente · " + now.getFullYear() };
    }
    if (period === "last30") {
      const since = new Date(now.getTime() - 30 * 86400000);
      return { since, label: "Últimos 30 dias (desde " + since.toLocaleDateString("pt-BR") + ")" };
    }
    if (period === "last90") {
      const since = new Date(now.getTime() - 90 * 86400000);
      return { since, label: "Últimos 90 dias (desde " + since.toLocaleDateString("pt-BR") + ")" };
    }
    return { since: null, label: "Todas as operações (sem filtro temporal)" };
  }

  // Borderô de Despesa Financeira (relatório contábil para fechamento de período).
  // Lista CRs ativos com cálculo amortizado pro rata pela permanência no período.
  function exportHtmlReport() {
    const cedente = state.cedente || {};
    const issuer = window.TdicBrand?.issuer || {};
    const today = Date.now();
    const ativos = state.crs.filter((c) => c.status === "active");

    let totalDespesaPeriodo = 0;
    let totalProjetado = 0;
    let totalFace = 0;
    const rows = ativos
      .map((cr) => {
        const start = new Date(cr.mintedAt || cr.createdAt).getTime();
        const end = new Date(cr.maturityDate + "T12:00:00").getTime();
        const totalDays = Math.max(1, (end - start) / 86400000);
        const elapsedDays = Math.max(0, Math.min(totalDays, (today - start) / 86400000));
        const desagioTotal = (cr.faceValue * cr.discountBps) / 10000;
        const despesaPeriodo = (desagioTotal * elapsedDays) / totalDays;
        totalDespesaPeriodo += despesaPeriodo;
        totalProjetado += desagioTotal;
        totalFace += cr.faceValue;
        return `<tr>
          <td class="mono" style="font-size:11px">${cr.tokenId.slice(0, 14)}…${cr.tokenId.slice(-6)}</td>
          <td class="mono" style="text-align:right">${fmtBRL(cr.faceValue)}</td>
          <td style="text-align:right">${(cr.discountBps / 100).toFixed(2)}%</td>
          <td class="mono" style="text-align:right">${fmtBRL(desagioTotal)}</td>
          <td class="mono" style="text-align:right;font-weight:700">${fmtBRL(despesaPeriodo)}</td>
          <td class="mono" style="text-align:right">${Math.round(elapsedDays)}/${Math.round(totalDays)} dias</td>
          <td class="mono">${fmtDate(cr.maturityDate)}</td>
        </tr>`;
      })
      .join("");

    const ts = new Date();
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Borderô de Despesa Financeira — TDIC</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:920px;margin:32px auto;padding:24px;color:#1a1a1a;line-height:1.55;font-size:13px}
h1{font-size:20px;margin-bottom:6px;letter-spacing:-.01em}
.sub{color:#525252;font-size:12px;margin-bottom:24px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d4d4d4;border-radius:8px;overflow:hidden;margin-bottom:18px}
.grid .cell{padding:8px 12px;border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0}
.grid .cell:nth-child(2n){border-right:none}
.grid .lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#737373;font-weight:700;margin-bottom:2px}
.grid .val{font-size:13px;font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}
th,td{border:1px solid #e5e5e5;padding:8px 10px}
th{background:#fafafa;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;text-align:left}
.tot{margin-top:18px;padding:14px;background:#fafafa;border:1px solid #e5e5e5;border-radius:8px}
.tot .row{display:flex;justify-content:space-between;padding:4px 0}
.tot .row.t{border-top:1px solid #d4d4d4;margin-top:6px;padding-top:8px;font-weight:700;font-size:14px;color:#15803d}
.tot .row.s{font-size:11px;color:#737373}
.note{margin-top:18px;padding:12px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;font-size:11px;color:#7c2d12}
.ft{margin-top:32px;padding-top:14px;border-top:1px solid #d4d4d4;font-size:10px;color:#737373;text-align:center}
.mono{font-family:monospace}</style>
</head><body>
<h1>Borderô de Custo de Cessão — TDIC</h1>
<div class="sub">Apuração até ${ts.toLocaleDateString("pt-BR")} · ${ativos.length} CR(s) ativo(s) · Documento operacional</div>

<div class="grid">
  <div class="cell" style="grid-column:1/3"><div class="lbl">Cedente</div><div class="val">${escapeHtml(cedente.razaoSocial || "—")}</div><div class="mono" style="font-size:11px;color:#737373">CNPJ ${cedente.cnpj || "—"}</div></div>
  <div class="cell"><div class="lbl">Securitizadora (cessionária)</div><div class="val">${issuer.razaoSocial || "EFIX Securitizadora S.A."}</div><div class="mono" style="font-size:11px;color:#737373">CNPJ ${issuer.cnpj || "60.756.859/0001-57"}</div></div>
  <div class="cell"><div class="lbl">Marco regulatório</div><div class="val">Lei 14.430/2022 · CVM 88/2022</div></div>
</div>

<table>
  <thead>
    <tr>
      <th>Token TDIC</th>
      <th style="text-align:right">Valor face</th>
      <th style="text-align:right">Deságio</th>
      <th style="text-align:right">Deságio total (R$)</th>
      <th style="text-align:right">Custo amortizado</th>
      <th style="text-align:right">Permanência</th>
      <th>Vencimento</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#737373;padding:18px">Nenhum CR ativo no período.</td></tr>'}</tbody>
</table>

<div class="tot">
  <div class="row s"><span>Total de face em carteira</span><span class="mono">${fmtBRL(totalFace)}</span></div>
  <div class="row s"><span>Deságio total contratado</span><span class="mono">${fmtBRL(totalProjetado)}</span></div>
  <div class="row t"><span>Custo de cessão amortizado no período</span><span class="mono">${fmtBRL(totalDespesaPeriodo)}</span></div>
</div>

<div class="ft">
  Gerado em ${ts.toLocaleString("pt-BR")} (${ts.toISOString()}) · ${issuer.razaoSocial || "EFIX Securitizadora S.A."}
</div>
</body></html>`;
    downloadAsPdf(html, "tdic-bordero-custo-cessao-" + ts.toISOString().slice(0, 10) + ".pdf");
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

  // Gera PDF abrindo o documento em janela popup e disparando window.print().
  // O usuário escolhe "Salvar como PDF" no diálogo nativo do browser
  // (Chrome/Edge/Firefox/Safari oferecem essa opção há mais de 6 anos).
  // Estratégia mais robusta que html2pdf/html2canvas para documentos longos
  // com tabelas — preserva texto vetorial, paginação automática, sem CDN.
  function downloadAsPdf(htmlContent, filenamePdf) {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w || w.closed) {
      alert(
        "O navegador bloqueou a janela do PDF.\n\n" +
          "Permita popups/janelas para efix.finance e clique novamente.\n" +
          "(Chrome: ícone na barra de endereço · Firefox: aviso amarelo no topo)"
      );
      return false;
    }
    // Sugere o nome do arquivo via <title> — o diálogo de impressão usa
    // como nome default ao "Salvar como PDF".
    const safeTitle = String(filenamePdf || "tdic-bordero").replace(/\.(pdf|html)$/i, "");
    const titled = htmlContent.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHtml(safeTitle)}</title>`
    );
    // Injeta @page e print color adjust antes do </style>.
    const enriched = titled.replace(
      "</style>",
      "@page{size:A4;margin:1.5cm}" +
        "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}" +
        "table{break-inside:auto}tr{break-inside:avoid;break-after:auto}thead{display:table-header-group}tfoot{display:table-footer-group}}" +
        "</style>"
    );
    w.document.open();
    w.document.write(enriched);
    w.document.close();
    // Aguarda o render do popup e dispara o print.
    const triggerPrint = () => {
      try {
        w.focus();
        // setTimeout extra para o layout assentar (especialmente com fonts/imagens).
        setTimeout(() => {
          try {
            w.print();
          } catch (e) {
            console.error("[TDIC] print() error:", e);
          }
        }, 350);
      } catch (e) {
        console.error("[TDIC] popup focus error:", e);
      }
    };
    if (w.document.readyState === "complete") {
      triggerPrint();
    } else {
      w.addEventListener("load", triggerPrint, { once: true });
      // Backup: se o load não disparar em 1.5s, força o print.
      setTimeout(() => {
        if (!w.closed && w.document.readyState !== "complete") triggerPrint();
      }, 1500);
    }
    return true;
  }

  // ── Modal Crédito ───────────────────────────────────────
  // Estado do deságio dentro do modal de cadastro.
  // mode: "pct" (% a.m. pro rata die) | "brl" (R$ flat) | "effective" (% face)
  function getDiscountMode() {
    const active = document.querySelector(".discount-tab.active");
    return active ? active.getAttribute("data-discount-mode") : "pct";
  }

  function calcDiscountInput() {
    const face = Number($("#credFace").value) || 0;
    const venctoStr = $("#credVencto").value;
    const days = venctoStr
      ? Math.max(0, Math.ceil((new Date(venctoStr + "T12:00:00") - Date.now()) / 86400000))
      : 0;

    let discountBrl = 0;
    const mode = getDiscountMode();
    if (mode === "pct") {
      const pct = Number($("#credDiscount").value) || 0;
      const daily = pct / 30;
      discountBrl = (face * daily * days) / 100;
    } else if (mode === "brl") {
      discountBrl = Number($("#credDiscountBrl").value) || 0;
    } else if (mode === "effective") {
      const pctFace = Number($("#credDiscountEffective").value) || 0;
      discountBrl = (face * pctFace) / 100;
    }
    discountBrl = Math.min(discountBrl, face);
    const liquido = face - discountBrl;
    const discountBps = face > 0 ? Math.round((discountBrl / face) * 10000) : 0;
    return { face, days, discountBrl, liquido, discountBps, mode };
  }

  function renderCreditoSummary() {
    const r = calcDiscountInput();
    $("#sumFace").textContent = "R$ " + r.face.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $("#sumPrazo").textContent = r.days + " dia" + (r.days === 1 ? "" : "s");
    $("#sumDesconto").textContent =
      "R$ " +
      r.discountBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
      "  ·  " +
      (r.discountBps / 100).toFixed(2) +
      "% face";
    $("#sumLiquido").textContent = "R$ " + r.liquido.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function bindCreditoModal() {
    // Tabs do deságio
    $$(".discount-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".discount-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const mode = tab.getAttribute("data-discount-mode");
        ["paneDiscountPct", "paneDiscountBrl", "paneDiscountEffective"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.style.display = "none";
        });
        const map = { pct: "paneDiscountPct", brl: "paneDiscountBrl", effective: "paneDiscountEffective" };
        const show = document.getElementById(map[mode]);
        if (show) show.style.display = "";
        renderCreditoSummary();
      });
    });
    ["credFace", "credVencto", "credDiscount", "credDiscountBrl", "credDiscountEffective"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", renderCreditoSummary);
    });

    $("#creditoForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#credSubmitBtn");
      const calc = calcDiscountInput();
      const payload = {
        tipo: $("#credTipo").value,
        devedorCnpj: $("#credDevedorCnpj").value.trim(),
        devedorRazaoSocial: $("#credDevedorRazao").value.trim(),
        faceValue: calc.face,
        maturityDate: $("#credVencto").value,
        discountBps: calc.discountBps,
        discountBrl: calc.discountBrl,
        discountMode: calc.mode,
        discountInputs: {
          pctMonthly: Number($("#credDiscount").value) || 0,
          brlFlat: Number($("#credDiscountBrl").value) || 0,
          pctEffective: Number($("#credDiscountEffective").value) || 0,
        },
        netValue: calc.liquido,
        prazoDias: calc.days,
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
    $("#credDiscount").value = 2.5;
    $("#credDiscountEffective").value = 3.5;
    $$(".discount-tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-discount-mode") === "pct"));
    ["paneDiscountPct", "paneDiscountBrl", "paneDiscountEffective"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === "paneDiscountPct" ? "" : "none";
    });
    renderCreditoSummary();
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

  function bindContractModal() {
    const dl = document.getElementById("downloadContractBtn");
    if (dl) dl.addEventListener("click", downloadContractHtml);
  }

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
    openContractModal,
    closeContractModal,
    state,
  };
})();
