/**
 * TDIC — Sign Providers
 * ─────────────────────
 * Abstração sobre plataformas de assinatura eletrônica/qualificada.
 *
 *   window.TdicSign = {
 *     active(),                                 // retorna o provider configurado
 *     setProvider(slug),                        // "none" | "clicksign" | "d4sign" | "docusign"
 *     requestSignature(payload, opts),          // dispara a assinatura
 *     getSignatureStatus(envelopeId),           // poll do status
 *   }
 *
 * Configuração:
 *   EFIX_CONFIG.tdic = { signProvider: "clicksign", clicksign: { sandboxKey: "..." } }
 *   ?provider=docusign na URL força um provider para teste.
 *
 * Atualmente todos os providers (exceto "none") rodam em modo mock-redirect:
 * abrem uma janela que simula a UX de redirect/callback do provedor real,
 * marcam como assinado e retornam um envelopeId + timestamp simulado da CA.
 *
 * Para troca por integração real, o backend (tdic-backend / efixdi-backend)
 * deve expor os endpoints listados nos comentários TODO de cada provider.
 */

(function (global) {
  "use strict";

  const CONFIG = (global.EFIX_CONFIG && global.EFIX_CONFIG.tdic) || {};
  const URL_PROVIDER = new URLSearchParams(global.location.search).get("provider");

  let _active = (URL_PROVIDER || CONFIG.signProvider || "none").toLowerCase();
  if (!["none", "clicksign", "d4sign", "docusign"].includes(_active)) _active = "none";

  // ── helpers ──────────────────────────────────────────────────
  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function caTimestamp() {
    // Em prod: o server da CA (Clicksign/D4Sign/DocuSign) retorna o timestamp.
    // No mock simulamos com um suffix "Z" e um "trace" de TSA fictícia.
    return {
      ts: isoNow(),
      tsa: "MOCK-TSA · ICP-Brasil simulada",
      tsaCert: "CN=Mock TSA, O=EFIX Sandbox, C=BR",
    };
  }

  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function openMockRedirect(providerName, envelopeId) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("data-tdic-sign-overlay", providerName);
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(10,10,10,0.55)",
        zIndex: "10001",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(8px)",
      });
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:1.75rem;max-width:460px;width:92vw;box-shadow:0 24px 64px rgba(0,0,0,0.25);font-family:'Syne','Inter',sans-serif">
          <div style="font-family:'Space Mono',monospace;font-size:0.65rem;color:#737373;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">redirecionando para</div>
          <div style="font-size:1.15rem;font-weight:700;margin-bottom:6px">${providerName.toUpperCase()}</div>
          <div style="font-size:0.85rem;color:#525252;line-height:1.65;margin-bottom:1rem">
            Em produção, o cedente é redirecionado para a plataforma de assinatura
            (${providerName}) onde valida a identidade (e-CPF/SMS/biometria) e
            assina o documento. O servidor da CA carimba o tempo (RFC 3161) e
            retorna o documento + hash + envelope ID.
          </div>
          <div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:0.7rem 0.85rem;font-family:'Space Mono',monospace;font-size:0.7rem;color:#404040;margin-bottom:1rem">
            envelope: ${envelopeId}<br>
            modo: <strong style="color:#22c55e">SANDBOX / mock-redirect</strong>
          </div>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end">
            <button id="tdicSignCancel" type="button" style="padding:0.6rem 1rem;border-radius:8px;border:1px solid #e5e5e5;background:#fff;font-family:inherit;font-size:0.82rem;font-weight:600;cursor:pointer">Cancelar</button>
            <button id="tdicSignConfirm" type="button" style="padding:0.6rem 1rem;border-radius:8px;border:none;background:#0a0a0a;color:#fff;font-family:inherit;font-size:0.82rem;font-weight:600;cursor:pointer">Simular assinatura</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector("#tdicSignConfirm").addEventListener("click", () => {
        overlay.remove();
        resolve(true);
      });
      overlay.querySelector("#tdicSignCancel").addEventListener("click", () => {
        overlay.remove();
        resolve(false);
      });
    });
  }

  // ── provider: none (aceitação eletrônica simples) ─────────────
  const noneProvider = {
    slug: "none",
    displayName: "Aceitação eletrônica EFIX",
    qualifiedSignature: false,
    helpText:
      "Aceite eletrônico nos termos da MP 2.200-2/2001 art. 10 §2º + CC art. 425. Hash SHA-256 calculado no cliente; backend grava o snapshot.",
    async requestSignature(payload) {
      const documentHash = await sha256Hex(payload.canonicalText);
      return {
        ok: true,
        provider: this.slug,
        status: "signed",
        envelopeId: uid("EFIX-SIGN"),
        documentHash,
        caTimestamp: caTimestamp(),
        signedAt: isoNow(),
        signedDocumentUrl: null,
      };
    },
  };

  // ── provider: clicksign ───────────────────────────────────────
  // TODO: integração real
  //   POST {backend}/api/tdic/sign/clicksign/envelopes
  //     body: { documentHtml, signers:[{email,cpf,name}] }
  //     resp: { envelopeId, signingUrl }
  //   Webhook Clicksign → POST {backend}/api/tdic/sign/clicksign/webhook
  //     marca o envelope como signed; salva hash e CMS PKCS#7 no S3.
  //   GET {backend}/api/tdic/sign/clicksign/envelopes/:id → status atual.
  // Docs: https://developers.clicksign.com/reference/
  const clicksignProvider = {
    slug: "clicksign",
    displayName: "Clicksign",
    qualifiedSignature: true,
    helpText:
      "Assinatura eletrônica avançada via Clicksign. Suporta e-CPF/e-CNPJ ICP-Brasil quando o signatário possui certificado.",
    async requestSignature(payload) {
      const ok = await openMockRedirect("Clicksign", uid("CKS-ENV"));
      if (!ok) return { ok: false, error: "cancelado pelo usuário" };
      const documentHash = await sha256Hex(payload.canonicalText);
      return {
        ok: true,
        provider: this.slug,
        status: "signed",
        envelopeId: uid("CKS-ENV"),
        documentHash,
        caTimestamp: caTimestamp(),
        signedAt: isoNow(),
        signedDocumentUrl: "https://app.clicksign.com/sign/MOCK-ENVELOPE",
      };
    },
  };

  // ── provider: d4sign ──────────────────────────────────────────
  // TODO: integração real
  //   POST {backend}/api/tdic/sign/d4sign/envelopes
  //   Webhook D4Sign → /api/tdic/sign/d4sign/webhook
  //   Docs: https://docapi.d4sign.com.br/docs
  const d4signProvider = {
    slug: "d4sign",
    displayName: "D4Sign",
    qualifiedSignature: true,
    helpText:
      "Assinatura eletrônica via D4Sign. Trilha de auditoria e suporte a certificado ICP-Brasil.",
    async requestSignature(payload) {
      const ok = await openMockRedirect("D4Sign", uid("D4S-ENV"));
      if (!ok) return { ok: false, error: "cancelado pelo usuário" };
      const documentHash = await sha256Hex(payload.canonicalText);
      return {
        ok: true,
        provider: this.slug,
        status: "signed",
        envelopeId: uid("D4S-ENV"),
        documentHash,
        caTimestamp: caTimestamp(),
        signedAt: isoNow(),
        signedDocumentUrl: "https://secure.d4sign.com.br/sign/MOCK-ENVELOPE",
      };
    },
  };

  // ── provider: docusign ────────────────────────────────────────
  // TODO: integração real (REST API v2.1, JWT grant)
  const docusignProvider = {
    slug: "docusign",
    displayName: "DocuSign",
    qualifiedSignature: true,
    helpText:
      "Assinatura eletrônica via DocuSign. Padrão internacional; para qualificada ICP-Brasil exige integração com CAs locais.",
    async requestSignature(payload) {
      const ok = await openMockRedirect("DocuSign", uid("DOCU-ENV"));
      if (!ok) return { ok: false, error: "cancelado pelo usuário" };
      const documentHash = await sha256Hex(payload.canonicalText);
      return {
        ok: true,
        provider: this.slug,
        status: "signed",
        envelopeId: uid("DOCU-ENV"),
        documentHash,
        caTimestamp: caTimestamp(),
        signedAt: isoNow(),
        signedDocumentUrl: "https://demo.docusign.net/sign/MOCK-ENVELOPE",
      };
    },
  };

  const providers = {
    none: noneProvider,
    clicksign: clicksignProvider,
    d4sign: d4signProvider,
    docusign: docusignProvider,
  };

  global.TdicSign = {
    active() {
      return providers[_active] || noneProvider;
    },
    listProviders() {
      return Object.values(providers).map((p) => ({
        slug: p.slug,
        displayName: p.displayName,
        qualifiedSignature: p.qualifiedSignature,
        helpText: p.helpText,
      }));
    },
    setProvider(slug) {
      if (providers[slug]) _active = slug;
    },
    async requestSignature(payload, opts) {
      const p = providers[_active] || noneProvider;
      return p.requestSignature(payload, opts);
    },
    sha256Hex,
  };

  console.log("[TdicSign] provider ativo:", _active);
})(typeof window !== "undefined" ? window : globalThis);
