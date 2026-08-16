/* Admin → Website lock.
   Reads/writes settings/siteLock (public config, live on the storefront) and
   talks to /api/site-lock for the password (never stored in the clear). */

const LOCK_PAGES = [
  { key: '/', label: 'Home' },
  { key: '/shop', label: 'Shop' },
  { key: '/product', label: 'Product page' },
  { key: '/checkout', label: 'Checkout' },
  { key: '/lookbook', label: 'Lookbook' },
  { key: '/calendar', label: 'Calendar' },
  { key: '/reviews', label: 'Reviews & FAQs' },
  { key: '/review', label: 'Leave a review' },
  { key: '/roles', label: 'Roles / casting' },
  { key: '/contact', label: 'Contact' },
  { key: '/account', label: 'Account' },
];

const DEFAULTS = {
  enabled: false,
  headline: 'We’ll be right back.',
  message: 'The store is locked while we get the next drop ready.',
  buttonText: 'Notify me',
  collectEmail: true,
  allowPassword: true,
  lockOnBlur: true,
  sessionMinutes: 30,
  timerEnabled: false,
  endsAt: '',
  showTimer: true,
  autoUnlockOnEnd: true,
  scope: 'all',
  lockedPages: [],
  hasPassword: false,
  passwordVersion: 0,
};

let dbRef = null;
let current = { ...DEFAULTS };

const $ = (id) => document.getElementById(id);

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function renderPages() {
  const wrap = $('lkPages');
  wrap.innerHTML = LOCK_PAGES.map(p => `
    <label class="lk-page">
      <input type="checkbox" data-page="${p.key}" ${current.lockedPages.includes(p.key) ? 'checked' : ''} />
      <span>${p.label}</span>
    </label>`).join('');
  wrap.querySelectorAll('input[data-page]').forEach(cb => cb.addEventListener('change', () => {
    const key = cb.dataset.page;
    const set = new Set(current.lockedPages);
    cb.checked ? set.add(key) : set.delete(key);
    current.lockedPages = [...set];
    paintStats();
  }));
  wrap.classList.toggle('is-off', current.scope !== 'custom');
}

function paintStats() {
  $('lkStatus').textContent = current.enabled ? 'Locked' : 'Open';
  $('lkStatusSub').textContent = current.enabled ? 'Visitors see the lock screen' : 'The storefront is fully open';
  $('lkHasPass').textContent = current.hasPassword ? 'Set' : 'None';
  $('lkTimerVal').textContent = current.timerEnabled && current.endsAt
    ? new Date(current.endsAt).toLocaleString()
    : 'Off';
  $('lkTimerSub').textContent = current.timerEnabled
    ? (current.autoUnlockOnEnd ? 'Unlocks automatically at zero' : 'Stays locked at zero')
    : 'Countdown shown on the lock';
  $('lkPagesVal').textContent = current.scope === 'custom' ? `${current.lockedPages.length}` : 'All';
  $('lkEnabledLabel').textContent = current.enabled ? 'Site is LOCKED' : 'Site is unlocked';
}

function paintForm() {
  $('lkEnabled').checked = !!current.enabled;
  $('lkHeadline').value = current.headline || '';
  $('lkMessage').value = current.message || '';
  $('lkButtonText').value = current.buttonText || '';
  $('lkSessionMinutes').value = current.sessionMinutes || 30;
  $('lkCollectEmail').checked = current.collectEmail !== false;
  $('lkAllowPassword').checked = current.allowPassword !== false;
  $('lkLockOnBlur').checked = current.lockOnBlur !== false;
  $('lkTimerEnabled').checked = !!current.timerEnabled;
  $('lkEndsAt').value = toLocalInput(current.endsAt);
  $('lkShowTimer').checked = current.showTimer !== false;
  $('lkAutoUnlock').checked = current.autoUnlockOnEnd !== false;
  $('lkScopeAll').checked = current.scope !== 'custom';
  $('lkScopeCustom').checked = current.scope === 'custom';
  renderPages();
  paintStats();
}

function collect() {
  return {
    ...current,
    enabled: $('lkEnabled').checked,
    headline: $('lkHeadline').value.trim() || DEFAULTS.headline,
    message: $('lkMessage').value.trim(),
    buttonText: $('lkButtonText').value.trim() || DEFAULTS.buttonText,
    sessionMinutes: Math.min(1440, Math.max(1, Number($('lkSessionMinutes').value) || 30)),
    collectEmail: $('lkCollectEmail').checked,
    allowPassword: $('lkAllowPassword').checked,
    lockOnBlur: $('lkLockOnBlur').checked,
    timerEnabled: $('lkTimerEnabled').checked,
    endsAt: fromLocalInput($('lkEndsAt').value),
    showTimer: $('lkShowTimer').checked,
    autoUnlockOnEnd: $('lkAutoUnlock').checked,
    scope: $('lkScopeCustom').checked ? 'custom' : 'all',
    lockedPages: current.lockedPages,
    updatedAt: new Date().toISOString(),
  };
}

async function save() {
  const btn = $('saveLockBtn');
  btn.disabled = true;
  try {
    const payload = collect();
    if (payload.enabled && payload.scope === 'custom' && !payload.lockedPages.length) {
      showToast('Pick at least one page to lock', 'error');
      return;
    }
    await dbRef.collection('settings').doc('siteLock').set(payload, { merge: true });
    current = payload;
    paintStats();
    showToast(payload.enabled ? 'Website locked' : 'Website unlocked');
  } catch (e) {
    console.error(e);
    showToast('Could not save the lock settings', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function idToken() {
  const { auth } = await initFirebase();
  const user = auth && auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function setPassword() {
  const p1 = $('lkPassword').value;
  const p2 = $('lkPassword2').value;
  if (p1.length < 4) { showToast('Password must be at least 4 characters', 'error'); return; }
  if (p1 !== p2) { showToast('The two passwords do not match', 'error'); return; }
  const btn = $('lkSetPassBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/site-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-password', password: p1, idToken: await idToken() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
    $('lkPassword').value = '';
    $('lkPassword2').value = '';
    showToast('Password set');
  } catch (e) {
    showToast(e.message || 'Could not set the password', 'error');
  } finally {
    btn.disabled = false;
  }
}

function clearPassword() {
  confirmModal({
    title: 'Remove the password?',
    message: 'Visitors will no longer be able to unlock the site themselves.',
    confirmText: 'Remove',
    danger: true,
    onConfirm: async () => {
      try {
        const res = await fetch('/api/site-lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear-password', idToken: await idToken() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
        showToast('Password removed');
      } catch (e) {
        showToast(e.message || 'Could not remove the password', 'error');
      }
    },
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  $('saveLockBtn').addEventListener('click', save);
  $('lkSetPassBtn').addEventListener('click', setPassword);
  $('lkClearPassBtn').addEventListener('click', clearPassword);
  $('lkEnabled').addEventListener('change', () => {
    current.enabled = $('lkEnabled').checked;
    paintStats();
  });
  document.querySelectorAll('input[name="lkScope"]').forEach(r => r.addEventListener('change', () => {
    current.scope = $('lkScopeCustom').checked ? 'custom' : 'all';
    renderPages();
    paintStats();
  }));
  $('lkQuick').addEventListener('change', (e) => {
    const hours = Number(e.target.value);
    if (!hours) return;
    const d = new Date(Date.now() + hours * 3600000);
    $('lkEndsAt').value = toLocalInput(d.toISOString());
    $('lkTimerEnabled').checked = true;
    e.target.value = '';
  });

  const { db } = await initFirebase();
  dbRef = db;
  db.collection('settings').doc('siteLock').onSnapshot((doc) => {
    const data = doc.exists ? doc.data() : {};
    current = { ...DEFAULTS, ...data, lockedPages: Array.isArray(data.lockedPages) ? data.lockedPages : [] };
    paintForm();
  }, () => showToast('Could not read the lock settings', 'error'));
});
