// Injects the shared admin sidebar + mobile drawer controls.
(function () {
  // Load fonts + lucide icons once
  if (!document.querySelector('link[data-admin-fonts]')) {
    const l1 = document.createElement('link'); l1.rel = 'stylesheet';
    l1.href = 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,700,800&display=swap';
    l1.setAttribute('data-admin-fonts', '1'); document.head.appendChild(l1);
    const l2 = document.createElement('link'); l2.rel = 'stylesheet';
    l2.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(l2);
  }
  if (!window.lucide) {
    const s = document.createElement('script'); s.src = 'https://unpkg.com/lucide@latest';
    s.onload = () => { try { window.lucide.createIcons(); } catch (e) {} };
    document.head.appendChild(s);
  }

  const links = [
    { href: '/admin', label: 'Dashboard', icon: 'layout-dashboard' },
    { href: '/admin/analytics', label: 'Analytics', icon: 'bar-chart-3' },
    { href: '/admin/products', label: 'Products', icon: 'package' },
    { href: '/admin/featured', label: 'Featured', icon: 'star' },
    { href: '/admin/combos', label: 'Combos', icon: 'layers' },
    { href: '/admin/calendar', label: 'Calendar', icon: 'calendar-days' },
    { href: '/admin/orders', label: 'Orders', icon: 'shopping-bag' },
    { href: '/admin/customers', label: 'Customers', icon: 'users' },
    { href: '/admin/coupons', label: 'Coupons', icon: 'ticket-percent' },
    { href: '/admin/lookbook', label: 'Lookbook', icon: 'image' },
    { href: '/admin/newsletter', label: 'Newsletter', icon: 'mail' },
    { href: '/admin/reviews', label: 'Reviews', icon: 'message-square' },
    { href: '/admin/faqs', label: 'FAQs', icon: 'help-circle' },
    { href: '/admin/email-logs', label: 'Email logs', icon: 'send' },
    { href: '/admin/logs', label: 'Activity logs', icon: 'activity' },
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('adminSidebarSlot');
    if (!slot) return;

    const current = location.pathname.replace(/\/$/, '') || '/admin';
    const isActive = (href) => {
      const h = href.replace(/\/$/, '');
      if (h === '/admin') return current === '/admin' || current === '/admin/index.html';
      return current === h || current === (h + '.html');
    };

    slot.innerHTML = `
      <a href="/admin" class="admin-sidebar__logo">
        <img src="/images/logo_icon_white.png" alt="" style="width:34px;height:34px;object-fit:contain;" />
        <span>DRIPS &amp; DROPS</span>
      </a>
      <nav class="admin-sidebar__nav">
        ${links.map(l => `<a href="${l.href}" ${isActive(l.href) ? 'class="active"' : ''}><i data-lucide="${l.icon}"></i><span>${l.label}</span></a>`).join('')}
      </nav>
      <div class="admin-sidebar__logout">
        <a href="#" onclick="adminLogout(); return false;"><i data-lucide="log-out"></i><span>Sign out</span></a>
      </div>
    `;
    if (window.lucide) { try { window.lucide.createIcons(); } catch(e) {} }
    else { setTimeout(() => { try { window.lucide?.createIcons(); } catch(e) {} }, 400); }

    // Mobile drawer wiring
    const closeDrawer = () => {
      slot.classList.remove('open');
      document.getElementById('adminBackdrop')?.classList.remove('open');
      document.body.classList.remove('admin-nav-open');
    };
    const openDrawer = () => {
      slot.classList.add('open');
      document.getElementById('adminBackdrop')?.classList.add('open');
      document.body.classList.add('admin-nav-open');
    };

    let bd = document.getElementById('adminBackdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'adminBackdrop';
      bd.className = 'admin-backdrop';
      document.body.appendChild(bd);
      bd.addEventListener('click', closeDrawer);
    }

    const header = document.querySelector('.admin-header');
    if (header && !document.getElementById('adminBurger')) {
      const burger = document.createElement('button');
      burger.id = 'adminBurger';
      burger.className = 'admin-burger';
      burger.setAttribute('aria-label', 'Menu');
      burger.innerHTML = '<span></span><span></span><span></span>';
      header.insertBefore(burger, header.firstChild);
      burger.addEventListener('click', () => {
        if (slot.classList.contains('open')) closeDrawer(); else openDrawer();
      });
    }

    slot.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      if (a.getAttribute('href') && a.getAttribute('href') !== '#') closeDrawer();
    }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    // Slide-in panel: click-outside-to-close for any .form-panel
    installFormPanelBackdrop();
  });

  function installFormPanelBackdrop() {
    if (document.getElementById('formPanelBackdrop')) return;
    const bd = document.createElement('div');
    bd.id = 'formPanelBackdrop';
    bd.className = 'form-panel-backdrop';
    document.body.appendChild(bd);
    bd.addEventListener('click', () => {
      document.querySelectorAll('.form-panel.open').forEach(p => p.classList.remove('open'));
      bd.classList.remove('open');
    });
    // Watch for any .form-panel opening: use MutationObserver on class attribute
    const panels = document.querySelectorAll('.form-panel');
    const sync = () => {
      const anyOpen = Array.from(document.querySelectorAll('.form-panel')).some(p => p.classList.contains('open'));
      bd.classList.toggle('open', anyOpen);
    };
    panels.forEach(p => {
      new MutationObserver(sync).observe(p, { attributes: true, attributeFilter: ['class'] });
    });
    // Escape closes any open panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.form-panel.open').forEach(p => p.classList.remove('open'));
        bd.classList.remove('open');
      }
    });
    // In case new panels appear later
    new MutationObserver(() => {
      document.querySelectorAll('.form-panel').forEach(p => {
        if (!p.dataset.watched) {
          p.dataset.watched = '1';
          new MutationObserver(sync).observe(p, { attributes: true, attributeFilter: ['class'] });
        }
      });
      sync();
    }).observe(document.body, { childList: true, subtree: true });
  }
})();

/* ---------------- Custom select control ----------------
   Keeps the native <select> as the single source of truth (all existing
   code that reads/sets .value keeps working) but renders a styled control. */
(function () {
  function optionLabel(sel) {
    const o = sel.options[sel.selectedIndex];
    return o ? o.textContent.trim() : '';
  }

  function build(sel) {
    if (sel.dataset.csReady || sel.multiple || sel.size > 1 || sel.closest('.cs')) return;
    sel.dataset.csReady = '1';

    const wrap = document.createElement('div');
    wrap.className = 'cs' + (sel.classList.contains('cs-sm') ? ' cs--sm' : '');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs__btn';
    btn.innerHTML = `<span class="cs__label"></span><i data-lucide="chevron-down"></i>`;
    wrap.appendChild(btn);

    const menu = document.createElement('div');
    menu.className = 'cs__menu';
    wrap.appendChild(menu);

    const label = btn.querySelector('.cs__label');

    const paint = () => {
      label.textContent = optionLabel(sel) || sel.getAttribute('placeholder') || 'Select';
      wrap.classList.toggle('cs--empty', !sel.value);
      menu.innerHTML = Array.from(sel.options).map((o, i) =>
        `<button type="button" class="cs__opt${i === sel.selectedIndex ? ' is-active' : ''}" data-i="${i}"${o.disabled ? ' disabled' : ''}>
           <span>${o.textContent.replace(/</g, '&lt;')}</span><i data-lucide="check"></i>
         </button>`).join('');
      menu.querySelectorAll('.cs__opt').forEach(b => b.addEventListener('click', () => {
        sel.selectedIndex = Number(b.dataset.i);
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        close();
        paint();
      }));
      if (window.lucide) { try { window.lucide.createIcons({ nameAttr: 'data-lucide' }); } catch (e) {} }
    };

    const close = () => wrap.classList.remove('open');
    const open = () => {
      document.querySelectorAll('.cs.open').forEach(w => w !== wrap && w.classList.remove('open'));
      paint();
      wrap.classList.add('open');
      const r = wrap.getBoundingClientRect();
      menu.classList.toggle('cs__menu--up', r.bottom + 260 > window.innerHeight && r.top > 300);
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sel.disabled) return;
      wrap.classList.contains('open') ? close() : open();
    });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    sel.addEventListener('change', paint);
    // Sync when code changes .value or rebuilds options programmatically
    new MutationObserver(paint).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'disabled'] });
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (desc && desc.set && !sel.dataset.csHooked) {
      sel.dataset.csHooked = '1';
      Object.defineProperty(sel, 'value', {
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); paint(); },
        configurable: true,
      });
    }
    paint();
  }

  let queued = false;
  const scan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.querySelectorAll('select:not([data-cs-ready]):not([data-no-cs])').forEach(build);
    });
  };

  document.addEventListener('click', () => document.querySelectorAll('.cs.open').forEach(w => w.classList.remove('open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.cs.open').forEach(w => w.classList.remove('open')); });
  document.addEventListener('DOMContentLoaded', () => {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  });
})();
