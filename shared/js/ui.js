// shared/js/ui.js — Shared DOM utilities
// Consumed by: app/wallet/admin, card/app, app/wallet, protocol

function toast(msg, ms) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  el.style.display = 'block';
  setTimeout(function() {
    el.classList.remove('show');
    el.style.display = 'none';
  }, ms || 3000);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

function showError(id, msg, ms) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, ms || 5000);
}

function setLoading(btnId, loading) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.text = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>Aguarde...';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.text || 'OK';
    btn.disabled = false;
  }
}

function copyText(text, opts) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  var o = opts || {};
  if (o.toastMsg) toast(o.toastMsg);
  if (o.feedbackEl) {
    var el = typeof o.feedbackEl === 'string' ? document.getElementById(o.feedbackEl) : o.feedbackEl;
    if (el) {
      var orig = el.textContent;
      el.textContent = o.feedbackText || 'Copiado!';
      setTimeout(function() { el.textContent = orig; }, o.feedbackMs || 1500);
    }
  }
}

function switchTab(name, clickedBtn, opts) {
  var o = opts || {};
  var tabSel = o.tabSelector || '.tab';
  var panelSel = o.panelSelector || '.tab-panel';
  var prefix = o.panelPrefix || 'panel-';
  var activeCls = o.activeClass || 'active';
  var scope = o.scope ? document.querySelector(o.scope) : document;
  scope.querySelectorAll(tabSel).forEach(function(t) { t.classList.remove(activeCls); });
  scope.querySelectorAll(panelSel).forEach(function(p) { p.classList.remove(activeCls); });
  clickedBtn.classList.add(activeCls);
  var panel = document.getElementById(prefix + name);
  if (panel) panel.classList.add(activeCls);
  if (o.onSwitch) o.onSwitch(name);
}
