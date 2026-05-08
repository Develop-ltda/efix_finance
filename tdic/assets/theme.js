/**
 * TDIC White-label Theme Loader
 * ──────────────────────────────
 * Reads ?c=<slug> from URL → fetches cedentes.json → applies CSS variables
 * and updates branded text/logo elements.
 *
 * Falls back to "default" (EFIX neutral) if no slug or fetch fails.
 *
 * Usage:
 *   <script src="/tdic/assets/theme.js" defer></script>
 *   <link rel="brand" id="brandLogo">
 *   <span data-brand="displayName"></span>
 *   <span data-brand="tagline"></span>
 */

(function (global) {
  "use strict";

  const CONFIG_URL = "/tdic/cedentes.json";

  function getSlug() {
    const params = new URLSearchParams(global.location.search);
    return (params.get("c") || "default").toLowerCase();
  }

  function applyTheme(brand) {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", brand.primary);
    root.style.setProperty("--brand-primary-dark", brand.primaryDark || brand.primary);
    root.style.setProperty("--brand-secondary", brand.secondary);
    root.style.setProperty("--brand-accent", brand.accent || brand.primary);

    document.querySelectorAll("[data-brand]").forEach((el) => {
      const key = el.getAttribute("data-brand");
      if (brand[key] !== undefined) el.textContent = brand[key];
    });

    document.querySelectorAll("[data-brand-attr]").forEach((el) => {
      const spec = el.getAttribute("data-brand-attr"); // "src:logo"
      const [attr, key] = spec.split(":");
      if (brand[key] !== undefined) el.setAttribute(attr, brand[key]);
    });

    document.querySelectorAll("[data-brand-issuer]").forEach((el) => {
      const key = el.getAttribute("data-brand-issuer");
      if (brand.issuer && brand.issuer[key] !== undefined) {
        el.textContent = brand.issuer[key];
      }
    });

    if (brand.displayName) {
      const titleEl = document.querySelector("title");
      if (titleEl && titleEl.dataset.brandTitle) {
        titleEl.textContent = titleEl.dataset.brandTitle.replace("{name}", brand.displayName);
      }
    }

    document.documentElement.setAttribute("data-cedente", brand._slug || "default");
  }

  async function load() {
    const slug = getSlug();
    let config;
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-cache" });
      config = await res.json();
    } catch (e) {
      console.warn("[TdicTheme] Failed to load cedentes.json:", e);
      return null;
    }
    const brand = config[slug] || config.default;
    brand._slug = slug in config ? slug : "default";
    applyTheme(brand);
    global.TdicBrand = brand;
    document.dispatchEvent(new CustomEvent("tdic:brand-ready", { detail: brand }));
    return brand;
  }

  global.TdicTheme = { load, getSlug, applyTheme };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})(typeof window !== "undefined" ? window : globalThis);
