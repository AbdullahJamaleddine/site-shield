/* ===========================================================================
   Drips & Drops — Website lock (storefront)
   ---------------------------------------------------------------------------
   Loaded in the <head> of every storefront page so the lock paints BEFORE any
   content can flash. Behaviour:

     • Reads settings/siteLock from Firestore in REAL TIME (onSnapshot), so
       locking/unlocking from the admin takes effect on open tabs instantly.
     • Locks every storefront page by default; admin can pick specific pages.
     • Optional countdown timer, optional auto-unlock when the timer ends.
     • Email capture (writes to the `newsletter` collection).
     • "Enter with password" — the password is NEVER shipped to the browser.
       It is verified server-side by /api/site-lock.
     • The unlock lives in sessionStorage, expires after `sessionMinutes`, and
       (by default) is dropped the moment the visitor leaves the tab/app.
   =========================================================================== */
(function () {
  if (location.pathname.startsWith('/admin')) return;

  var CACHE_KEY = 'dd_lock_cfg';       // last known config (instant paint)
  var PASS_KEY = 'dd_lock_pass';       // sessionStorage unlock ticket
  var DEFAULT_SESSION_MIN = 30;

  var cfg = readCache();
  var unsub = null;
  var tick = null;
  var el = null;
  var passOpen = false;
  var busy = false;

  // ---------------------------------------------------------------- helpers
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c || null)); } catch (e) {}
  }
  function pageKey() {
    var p = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '');
    return p === '' ? '/' : p;
  }
  function scopeIncludesPage(c) {
    if (!c) return false;
    if (c.scope !== 'custom') return true;               // default: everything
    var list = Array.isArray(c.lockedPages) ? c.lockedPages : [];
    return list.indexOf(pageKey()) !== -1;
  }
  function endsAtMs(c) {
    if (!c || !c.timerEnabled || !c.endsAt) return 0;
    var t = Date.parse(c.endsAt);
    return isNaN(t) ? 0 : t;
  }
  function timerFinished(c) {
    var t = endsAtMs(c);
    return t > 0 && Date.now() >= t;
  }
  function shouldLock(c) {
    if (!c || !c.enabled) return false;
    if (timerFinished(c) && c.autoUnlockOnEnd !== false) return false;
    return scopeIncludesPage(c);
  }
  function stamp(c) {
    // Any password/config change invalidates existing unlock tickets.
    return String((c && c.passwordVersion) || 0) + ':' + String((c && c.updatedAt) || '');
  }
  function hasValidTicket() {
    try {
      var t = JSON.parse(sessionStorage.getItem(PASS_KEY) || 'null');
      if (!t) return false;
      if (t.stamp !== stamp(cfg)) return false;
      if (t.exp && Date.now() > t.exp) { dropTicket(); return false; }
      return true;
    } catch (e) { return false; }
  }
  function grantTicket(minutes) {
    var mins = Number(minutes || (cfg && cfg.sessionMinutes) || DEFAULT_SESSION_MIN);
    if (!isFinite(mins) || mins <= 0) mins = DEFAULT_SESSION_MIN;
    try {
      sessionStorage.setItem(PASS_KEY, JSON.stringify({
        stamp: stamp(cfg),
        at: Date.now(),
        exp: Date.now() + mins * 60000,
      }));
    } catch (e) {}
  }
  function dropTicket() {
    try { sessionStorage.removeItem(PASS_KEY); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ------------------------------------------------------------------ styles
  function injectStyles() {
    if (document.getElementById('ddLockStyles')) return;
    var css = [
      'html.dd-locked, html.dd-locked body { overflow: hidden !important; height: 100%; }',
      '.dd-lock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;',
      'background:#0d0d0d;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;',
      'padding:24px;overflow-y:auto;-webkit-font-smoothing:antialiased;}',
      '.dd-lock__bg{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,rgba(230,57,70,.22),transparent 60%),',
      'radial-gradient(100% 80% at 50% 110%,rgba(255,255,255,.08),transparent 60%);pointer-events:none;}',
      '.dd-lock__inner{position:relative;width:100%;max-width:440px;margin:auto;display:flex;flex-direction:column;',
      'align-items:center;text-align:center;gap:22px;}',
      '.dd-lock__logo{width:84px;height:84px;object-fit:contain;}',
      '.dd-lock__title{font-family:"Cabinet Grotesk",Inter,sans-serif;font-weight:800;letter-spacing:-.02em;',
      'font-size:clamp(28px,7vw,40px);line-height:1.05;margin:0;}',
      '.dd-lock__msg{margin:0;color:rgba(255,255,255,.66);font-size:15px;line-height:1.6;max-width:38ch;}',
      '.dd-lock__timer{display:flex;gap:10px;justify-content:center;}',
      '.dd-lock__unit{min-width:66px;padding:12px 8px;border-radius:12px;background:rgba(255,255,255,.07);',
      'border:1px solid rgba(255,255,255,.12);}',
      '.dd-lock__num{display:block;font-family:"Cabinet Grotesk",Inter,sans-serif;font-weight:800;font-size:24px;',
      'line-height:1;font-variant-numeric:tabular-nums;}',
      '.dd-lock__lab{display:block;margin-top:6px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);}',
      '.dd-lock__form{width:100%;display:flex;flex-direction:column;gap:10px;}',
      '.dd-lock__row{display:flex;gap:8px;width:100%;}',
      '.dd-lock input{flex:1;width:100%;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.16);',
      'background:rgba(255,255,255,.06);color:#fff;font-size:15px;font-family:inherit;outline:none;}',
      '.dd-lock input::placeholder{color:rgba(255,255,255,.42);}',
      '.dd-lock input:focus{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.1);}',
      '.dd-lock button{padding:14px 20px;border-radius:12px;border:0;background:#fff;color:#0d0d0d;font-weight:700;',
      'font-family:inherit;font-size:15px;cursor:pointer;transition:opacity .2s ease,transform .15s ease;white-space:nowrap;}',
      '.dd-lock button:hover{opacity:.86;} .dd-lock button:active{transform:scale(.98);}',
      '.dd-lock button[disabled]{opacity:.5;cursor:default;}',
      '.dd-lock__link{background:none;border:0;color:rgba(255,255,255,.62);font-size:13px;text-decoration:underline;',
      'text-underline-offset:4px;cursor:pointer;padding:6px;font-family:inherit;font-weight:500;}',
      '.dd-lock__link:hover{color:#fff;}',
      '.dd-lock__pass{width:100%;display:none;flex-direction:column;gap:10px;}',
      '.dd-lock__pass.is-open{display:flex;}',
      '.dd-lock__note{font-size:13px;min-height:18px;margin:0;}',
      '.dd-lock__note.err{color:#ff8a90;} .dd-lock__note.ok{color:#8ef0b6;}',
      '.dd-lock__foot{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.32);}',
      '@media(max-width:420px){.dd-lock__unit{min-width:58px;padding:10px 6px;}.dd-lock__num{font-size:20px;}}',
    ].join('');
    var s = document.createElement('style');
    s.id = 'ddLockStyles';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ------------------------------------------------------------------ render
  function mount() {
    injectStyles();
    if (el) return;
    el = document.createElement('div');
    el.className = 'dd-lock';
    el.id = 'ddSiteLock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<div class="dd-lock__bg"></div>' +
      '<div class="dd-lock__inner">' +
      '  <img class="dd-lock__logo" src="/images/logo_icon_white.png" alt="Drips &amp; Drops" ' +
      '       onerror="this.onerror=null;this.src=\'/images/logo_icon_black.png\'" />' +
      '  <h1 class="dd-lock__title" id="ddLockTitle"></h1>' +
      '  <p class="dd-lock__msg" id="ddLockMsg"></p>' +
      '  <div class="dd-lock__timer" id="ddLockTimer" style="display:none;"></div>' +
      '  <form class="dd-lock__form" id="ddLockEmailForm">' +
      '    <div class="dd-lock__row">' +
      '      <input type="email" id="ddLockEmail" placeholder="you@email.com" autocomplete="email" required />' +
      '      <button type="submit" id="ddLockEmailBtn">Notify me</button>' +
      '    </div>' +
      '  </form>' +
      '  <button type="button" class="dd-lock__link" id="ddLockPassToggle">Enter with password</button>' +
      '  <form class="dd-lock__pass" id="ddLockPassForm">' +
      '    <div class="dd-lock__row">' +
      '      <input type="password" id="ddLockPass" placeholder="Access password" autocomplete="off" />' +
      '      <button type="submit" id="ddLockPassBtn">Unlock</button>' +
      '    </div>' +
      '  </form>' +
      '  <p class="dd-lock__note" id="ddLockNote"></p>' +
      '  <div class="dd-lock__foot">Drips &amp; Drops</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
    document.documentElement.classList.add('dd-locked');

    el.querySelector('#ddLockPassToggle').addEventListener('click', function () {
      passOpen = !passOpen;
      el.querySelector('#ddLockPassForm').classList.toggle('is-open', passOpen);
      this.textContent = passOpen ? 'Hide password entry' : 'Enter with password';
      if (passOpen) setTimeout(function () { el.querySelector('#ddLockPass').focus(); }, 60);
    });
    el.querySelector('#ddLockEmailForm').addEventListener('submit', onEmail);
    el.querySelector('#ddLockPassForm').addEventListener('submit', onPassword);
    startTick();
  }

  function unmount() {
    if (tick) { clearInterval(tick); tick = null; }
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    passOpen = false;
    document.documentElement.classList.remove('dd-locked');
  }

  function note(msg, kind) {
    if (!el) return;
    var n = el.querySelector('#ddLockNote');
    n.textContent = msg || '';
    n.className = 'dd-lock__note' + (kind ? ' ' + kind : '');
  }

  function paint() {
    if (!el) return;
    var c = cfg || {};
    el.querySelector('#ddLockTitle').textContent = c.headline || 'We’ll be right back.';
    el.querySelector('#ddLockMsg').textContent = c.message || 'The store is locked while we get the next drop ready.';
    el.querySelector('#ddLockEmailBtn').textContent = c.buttonText || 'Notify me';
    el.querySelector('#ddLockEmailForm').style.display = c.collectEmail === false ? 'none' : '';
    var toggle = el.querySelector('#ddLockPassToggle');
    var passForm = el.querySelector('#ddLockPassForm');
    var allowPass = c.allowPassword !== false;
    toggle.style.display = allowPass ? '' : 'none';
    passForm.style.display = allowPass && passOpen ? 'flex' : 'none';
    paintTimer();
  }

  function paintTimer() {
    if (!el) return;
    var box = el.querySelector('#ddLockTimer');
    var target = endsAtMs(cfg);
    if (!target || (cfg && cfg.showTimer === false)) { box.style.display = 'none'; return; }
    var left = Math.max(0, target - Date.now());
    if (left <= 0 && cfg && cfg.autoUnlockOnEnd !== false) { evaluate(); return; }
    var sec = Math.floor(left / 1000);
    var units = [
      { n: Math.floor(sec / 86400), l: 'Days' },
      { n: Math.floor((sec % 86400) / 3600), l: 'Hours' },
      { n: Math.floor((sec % 3600) / 60), l: 'Mins' },
      { n: sec % 60, l: 'Secs' },
    ];
    box.style.display = 'flex';
    box.innerHTML = units.map(function (u) {
      return '<div class="dd-lock__unit"><span class="dd-lock__num">' +
        String(u.n).padStart(2, '0') + '</span><span class="dd-lock__lab">' + u.l + '</span></div>';
    }).join('');
  }

  function startTick() {
    if (tick) clearInterval(tick);
    tick = setInterval(function () {
      paintTimer();
      if (hasTicketExpired()) evaluate();
    }, 1000);
  }
  function hasTicketExpired() {
    try {
      var t = JSON.parse(sessionStorage.getItem(PASS_KEY) || 'null');
      return !!(t && t.exp && Date.now() > t.exp);
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ actions
  function onEmail(e) {
    e.preventDefault();
    if (busy) return;
    var input = el.querySelector('#ddLockEmail');
    var email = String(input.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      note('Enter a valid email address.', 'err');
      return;
    }
    busy = true;
    el.querySelector('#ddLockEmailBtn').disabled = true;
    note('Saving…');
    window.initFirebase().then(function (r) {
      return r.db.collection('newsletter').doc(email).set({
        email: email,
        source: 'site-lock',
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }).then(function () {
      note('You’re on the list — we’ll email you the moment we open.', 'ok');
      input.value = '';
    }).catch(function () {
      note('Could not save that right now. Try again.', 'err');
    }).then(function () {
      busy = false;
      if (el) el.querySelector('#ddLockEmailBtn').disabled = false;
    });
  }

  function onPassword(e) {
    e.preventDefault();
    if (busy) return;
    var input = el.querySelector('#ddLockPass');
    var pass = String(input.value || '');
    if (!pass) { note('Enter the password.', 'err'); return; }
    busy = true;
    var btn = el.querySelector('#ddLockPassBtn');
    btn.disabled = true;
    note('Checking…');
    fetch('/api/site-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', password: pass }),
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data && data.ok) {
          grantTicket(data.sessionMinutes);
          input.value = '';
          note('Unlocked. Welcome in.', 'ok');
          setTimeout(evaluate, 350);
        } else {
          note((data && data.error) || 'That password is not right.', 'err');
        }
      })
      .catch(function () { note('Could not verify right now.', 'err'); })
      .then(function () {
        busy = false;
        if (el) el.querySelector('#ddLockPassBtn').disabled = false;
      });
  }

  // ------------------------------------------------------------------ engine
  function evaluate() {
    var locked = shouldLock(cfg) && !hasValidTicket();
    if (locked) { mount(); paint(); }
    else if (el) { unmount(); }
  }

  // Leaving the tab / app relocks the site (default on).
  function wireSessionGuards() {
    var relock = function () {
      if (!cfg || cfg.lockOnBlur === false) return;
      dropTicket();
      evaluate();
    };
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') relock();
      else evaluate();
    });
    window.addEventListener('pagehide', relock);
    window.addEventListener('blur', function () {
      // Only treat a real app/tab switch as leaving, not focus moving to an iframe.
      setTimeout(function () { if (!document.hasFocus()) relock(); }, 150);
    });
    window.addEventListener('focus', evaluate);
    window.addEventListener('storage', function (e) {
      if (e.key === CACHE_KEY) { cfg = readCache(); evaluate(); }
    });
  }

  function subscribe() {
    if (typeof window.initFirebase !== 'function') { setTimeout(subscribe, 120); return; }
    window.initFirebase().then(function (r) {
      if (unsub) unsub();
      unsub = r.db.collection('settings').doc('siteLock').onSnapshot(function (doc) {
        cfg = doc.exists ? doc.data() : { enabled: false };
        writeCache(cfg);
        evaluate();
        paint();
      }, function () { /* offline — keep the cached decision */ });
    }).catch(function () {});
  }

  // Paint immediately from the cached config so locked pages never flash.
  if (document.body) evaluate();
  else document.addEventListener('DOMContentLoaded', evaluate);
  document.addEventListener('DOMContentLoaded', function () { evaluate(); });
  wireSessionGuards();
  subscribe();

  window.DDLock = {
    state: function () { return cfg; },
    relock: function () { dropTicket(); evaluate(); },
    refresh: evaluate,
  };
})();
