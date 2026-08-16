/* Storefront → Roles.
   Lists the open roles from Firestore (live) and renders each role's custom
   application form exactly as the admin built it. */
(function () {
  var roles = [];
  var active = null;
  var uploads = {};   // fieldId -> [urls]
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function $(id) { return document.getElementById(id); }

  // ------------------------------------------------------------------ listing
  function renderList() {
    var wrap = $('rolesList');
    var open = roles.filter(function (r) { return r.status !== 'closed'; });
    var closed = roles.filter(function (r) { return r.status === 'closed'; });
    var all = open.concat(closed);
    if (!all.length) {
      wrap.innerHTML = '<div class="empty-state">No open roles right now — check back soon.</div>';
      return;
    }
    wrap.innerHTML = all.map(function (r) {
      var isClosed = r.status === 'closed';
      var meta = [r.category, r.location].filter(Boolean).map(esc).join(' · ');
      return '<article class="role-card">' +
        (r.cover ? '<div class="role-card__media"><img src="' + cldOpt(r.cover, 700) + '" alt="' + esc(r.title) + '" loading="lazy" /></div>' : '') +
        '<div class="role-card__body">' +
        (meta ? '<div class="role-card__meta">' + meta + '</div>' : '') +
        '<h3 class="role-card__title">' + esc(r.title) + '</h3>' +
        (r.description ? '<p class="role-card__desc">' + esc(r.description) + '</p>' : '') +
        (r.deadline ? '<div class="role-card__meta">Closes ' + esc(new Date(r.deadline).toDateString()) + '</div>' : '') +
        '<div class="role-card__foot">' +
        '<span class="role-chip' + (isClosed ? ' role-chip--closed' : '') + '">' + (isClosed ? 'Closed' : 'Open') + '</span>' +
        (isClosed ? '' : '<button class="btn btn--solid btn--sm" data-apply="' + r.id + '">Apply</button>') +
        '</div></div></article>';
    }).join('');

    Array.prototype.forEach.call(wrap.querySelectorAll('[data-apply]'), function (b) {
      b.addEventListener('click', function () { openPanel(b.getAttribute('data-apply')); });
    });
  }

  // --------------------------------------------------------------- form build
  function fieldHtml(f) {
    var id = 'ap_' + f.id;
    var req = f.required ? ' <span class="req">*</span>' : '';
    var hint = f.hint ? '<p class="ap-hint">' + esc(f.hint) + '</p>' : '';
    var label = '<label for="' + id + '">' + esc(f.label) + req + '</label>';

    switch (f.type) {
      case 'textarea':
        return '<div class="field">' + label + '<textarea id="' + id + '" rows="4" data-f="' + f.id + '"></textarea>' + hint + '</div>';
      case 'select':
        return '<div class="field">' + label + '<select id="' + id + '" data-f="' + f.id + '">' +
          '<option value="">Choose…</option>' +
          (f.options || []).map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') +
          '</select>' + hint + '</div>';
      case 'checkbox':
        return '<label class="ap-check"><input type="checkbox" id="' + id + '" data-f="' + f.id + '" /> ' + esc(f.label) + req + '</label>' + hint;
      case 'images':
        return '<div class="field">' + label + hint +
          '<div class="ap-drop" data-drop="' + f.id + '">Click or drop up to ' + (Number(f.max) || 5) + ' images</div>' +
          '<input type="file" accept="image/*" multiple hidden data-file="' + f.id + '" />' +
          '<div class="ap-thumbs" data-thumbs="' + f.id + '"></div></div>';
      case 'social':
        return '<div class="field">' + label + '<input type="text" id="' + id + '" data-f="' + f.id + '" placeholder="@handle or link" />' + hint + '</div>';
      default:
        var t = ['text', 'email', 'tel', 'number', 'url', 'date'].indexOf(f.type) >= 0 ? f.type : 'text';
        return '<div class="field">' + label + '<input type="' + t + '" id="' + id + '" data-f="' + f.id + '" />' + hint + '</div>';
    }
  }

  function renderThumbs(fid) {
    var box = document.querySelector('[data-thumbs="' + fid + '"]');
    if (!box) return;
    var list = uploads[fid] || [];
    box.innerHTML = list.map(function (u, i) {
      return '<div class="ap-thumb"><img src="' + cldOpt(u, 200) + '" alt="" /><button type="button" data-rm="' + fid + '" data-i="' + i + '">&times;</button></div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-rm]'), function (b) {
      b.addEventListener('click', function () {
        uploads[fid].splice(Number(b.getAttribute('data-i')), 1);
        renderThumbs(fid);
      });
    });
  }

  function wireUploads(role) {
    role.fields.filter(function (f) { return f.type === 'images'; }).forEach(function (f) {
      var drop = document.querySelector('[data-drop="' + f.id + '"]');
      var input = document.querySelector('[data-file="' + f.id + '"]');
      if (!drop || !input) return;
      var max = Number(f.max) || 5;

      function handle(files) {
        var picked = Array.prototype.slice.call(files || []);
        if (!picked.length) return;
        uploads[f.id] = uploads[f.id] || [];
        var room = max - uploads[f.id].length;
        if (room <= 0) { note('You can upload up to ' + max + ' images here.', 'err'); return; }
        picked = picked.slice(0, room);
        drop.textContent = 'Uploading…';
        Promise.all(picked.map(upload)).then(function (urls) {
          uploads[f.id] = uploads[f.id].concat(urls.filter(Boolean));
          renderThumbs(f.id);
        }).catch(function () { note('One of those images failed to upload.', 'err'); })
          .then(function () { drop.textContent = 'Click or drop up to ' + max + ' images'; input.value = ''; });
      }

      drop.addEventListener('click', function () { input.click(); });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('dragover'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('dragover'); });
      drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('dragover'); handle(e.dataTransfer.files); });
      input.addEventListener('change', function () { handle(input.files); });
    });
  }

  function upload(file) {
    if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('too big'));
    return fetch('/api/config?type=cloudinary').then(function (r) { return r.json(); }).then(function (cfg) {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', cfg.uploadPreset);
      return fetch('https://api.cloudinary.com/v1_1/' + cfg.cloudName + '/image/upload', { method: 'POST', body: fd });
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.secure_url) throw new Error('upload failed');
      return d.secure_url;
    });
  }

  // ------------------------------------------------------------------- panel
  function openPanel(id) {
    var role = roles.find(function (r) { return r.id === id; });
    if (!role) return;
    active = role;
    uploads = {};
    $('apRoleKicker').textContent = [role.category, role.location].filter(Boolean).join(' · ') || 'Apply';
    $('apRoleTitle').textContent = role.title;
    $('apFields').innerHTML = (role.fields || []).map(fieldHtml).join('');
    note('');
    $('rolePanel').classList.remove('is-done');
    $('rolePanel').classList.add('open');
    $('roleBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
    wireUploads(role);
  }
  function closePanel() {
    $('rolePanel').classList.remove('open');
    $('roleBackdrop').classList.remove('open');
    document.body.style.overflow = '';
  }
  function note(msg, kind) {
    var n = $('apNote');
    n.textContent = msg || '';
    n.className = 'ap-note' + (kind ? ' ' + kind : '');
  }

  // ------------------------------------------------------------------ submit
  function valueOf(f) {
    if (f.type === 'images') return (uploads[f.id] || []).slice();
    var elm = document.getElementById('ap_' + f.id);
    if (!elm) return '';
    if (f.type === 'checkbox') return !!elm.checked;
    if (f.type === 'number') return elm.value === '' ? '' : Number(elm.value);
    return String(elm.value || '').trim();
  }

  function submit(e) {
    e.preventDefault();
    if (busy || !active) return;
    var answers = {};
    var missing = null;
    var name = '';
    var email = '';

    active.fields.forEach(function (f) {
      var v = valueOf(f);
      var empty = v === '' || v === false || (Array.isArray(v) && !v.length);
      if (f.required && empty && !missing) missing = f.label;
      if (!empty) answers[f.id] = v;
      var l = String(f.label || '').toLowerCase();
      if (!name && /name/.test(l) && typeof v === 'string') name = v;
      if (!email && f.type === 'email' && typeof v === 'string') email = v;
    });

    if (missing) { note('Please fill in "' + missing + '".', 'err'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { note('That email address does not look right.', 'err'); return; }

    busy = true;
    $('apSubmit').disabled = true;
    note('Sending…');

    window.initFirebase().then(function (r) {
      return r.db.collection('roleApplications').add({
        roleId: active.id,
        roleTitle: active.title,
        applicantName: name || 'Applicant',
        applicantEmail: email || '',
        answers: answers,
        status: 'new',
        createdAt: new Date().toISOString(),
      });
    }).then(function () {
      $('rolePanel').classList.add('is-done');
      if (window.logEvent) window.logEvent('role_application', { roleId: active.id, role: active.title });
    }).catch(function () {
      note('We could not send that right now. Please try again.', 'err');
    }).then(function () {
      busy = false;
      $('apSubmit').disabled = false;
    });
  }

  // -------------------------------------------------------------------- boot
  document.addEventListener('DOMContentLoaded', function () {
    $('apClose').addEventListener('click', closePanel);
    $('apDoneClose').addEventListener('click', closePanel);
    $('roleBackdrop').addEventListener('click', closePanel);
    $('applyForm').addEventListener('submit', submit);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });

    window.watchCollection('roles', function (list) {
      roles = list;
      renderList();
    });
  });
})();
