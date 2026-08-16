/* Public events calendar. Realtime (onSnapshot), live countdowns, ICS download
   so "Add to calendar" drops the event into the visitor's device calendar.
   Upcoming events sort soonest-first; ended events fall into a muted archive. */

let allEvents = [];
let countdownTimer = null;

function eventStart(e) {
  const raw = e.startAt || e.date || e.eventDate;
  if (!raw) return 0;
  if (e.date && e.time && !/T/.test(String(e.date))) return new Date(`${e.date}T${e.time}`).getTime() || 0;
  const t = window.docTime ? window.docTime(raw) : new Date(raw).getTime();
  return t || new Date(raw).getTime() || 0;
}
function eventEnd(e) {
  const t = eventStart(e);
  const end = e.endAt ? (window.docTime ? window.docTime(e.endAt) : new Date(e.endAt).getTime()) : 0;
  return end || (t ? t + 2 * 60 * 60 * 1000 : 0);
}
function isPast(e) { const end = eventEnd(e); return end > 0 && end < Date.now(); }

function fmtLong(ts) {
  if (!ts) return 'Date to be announced';
  return new Date(ts).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function dayParts(ts) {
  const d = new Date(ts || Date.now());
  return {
    day: ts ? String(d.getDate()).padStart(2, '0') : '--',
    month: ts ? d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : 'TBA',
  };
}
function countdownParts(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return [
    { v: d, l: 'days' }, { v: h, l: 'hrs' }, { v: m, l: 'min' }, { v: s, l: 'sec' },
  ];
}
function countdownHtml(ts) {
  const parts = countdownParts(ts);
  if (!parts) return `<div class="cal-countdown cal-countdown--live"><span>Happening now</span></div>`;
  return `<div class="cal-countdown" data-ts="${ts}">
    ${parts.map(p => `<div class="cal-countdown__unit"><b>${String(p.v).padStart(2, '0')}</b><span>${p.l}</span></div>`).join('')}
  </div>`;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsStamp(ts) { return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

window.addEventToCalendar = function (id) {
  const e = allEvents.find(x => x.id === id);
  if (!e) return;
  const start = eventStart(e);
  if (!start) return showToast('This event has no date yet', 'error');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Drips and Drops//Events//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@dripsanddrops`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(eventEnd(e))}`,
    `SUMMARY:${icsEscape(e.name || e.title || 'Drips & Drops event')}`,
    `DESCRIPTION:${icsEscape(e.description || '')}`,
    e.location ? `LOCATION:${icsEscape(e.location)}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(e.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Added — open the file to save it to your calendar');
  if (window.logEvent) window.logEvent('event_add_to_calendar', { eventId: e.id, name: e.name || '' });
};

function cardHtml(e, past) {
  const ts = eventStart(e);
  const parts = dayParts(ts);
  const img = cldOpt(e.imageUrl || e.image || (e.images && e.images[0]) || '/images/placeholder.svg', 700);
  return `
    <article class="cal-card ${past ? 'is-past' : ''}" data-id="${e.id}">
      <div class="cal-card__media">
        <img src="${img}" alt="${esc(e.name || 'Event')}" loading="lazy" />
        <div class="cal-card__date"><b>${parts.day}</b><span>${parts.month}</span></div>
        <button class="cal-card__zoom" type="button" data-zoom="${e.id}" aria-label="View full image"><i data-lucide="maximize-2"></i></button>
        ${past ? '<div class="cal-card__ended">Ended</div>' : ''}
      </div>

      <div class="cal-card__body">
        <h3 class="cal-card__title">${esc(e.name || e.title || 'Untitled event')}</h3>
        <div class="cal-card__when">${fmtLong(ts)}${e.location ? ' · ' + esc(e.location) : ''}</div>
        ${e.description ? `<p class="cal-card__desc">${esc(e.description)}</p>` : ''}
        ${past ? '' : countdownHtml(ts)}
        <div class="cal-card__actions">
          <button class="btn btn--sm" data-open="${e.id}">View details</button>
          ${past ? '' : `<button class="btn btn--solid btn--sm" data-add="${e.id}">Add to calendar</button>`}
        </div>
      </div>
    </article>`;
}

function render() {
  const listEl = document.getElementById('calList');
  const pastEl = document.getElementById('calPast');
  const pastWrap = document.getElementById('calPastWrap');
  if (!listEl) return;

  const upcoming = allEvents.filter(e => !isPast(e)).sort((a, b) => eventStart(a) - eventStart(b));
  const past = allEvents.filter(isPast).sort((a, b) => eventStart(b) - eventStart(a));

  listEl.innerHTML = upcoming.length
    ? upcoming.map(e => cardHtml(e, false)).join('')
    : `<div class="empty-state">No upcoming events right now — check back soon.</div>`;

  if (past.length) {
    pastWrap.style.display = '';
    pastEl.innerHTML = past.map(e => cardHtml(e, true)).join('');
  } else {
    pastWrap.style.display = 'none';
    pastEl.innerHTML = '';
  }

  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); addEventToCalendar(b.dataset.add);
  }));
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation(); openEvent(b.dataset.open);
  }));
  document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const e = allEvents.find(x => x.id === b.dataset.zoom);
    if (e) openLightbox(cldOpt(e.imageUrl || e.image || (e.images && e.images[0]) || '/images/placeholder.svg', 1600), e.name || 'Event');
  }));
  document.querySelectorAll('.cal-card__media').forEach(m => m.addEventListener('click', () => {
    openEvent(m.closest('.cal-card').dataset.id);
  }));
  if (window.lucide) window.lucide.createIcons();
  startCountdowns();

}

function startCountdowns() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    let needsRerender = false;
    document.querySelectorAll('.cal-countdown[data-ts]').forEach(el => {
      const ts = Number(el.dataset.ts);
      const parts = countdownParts(ts);
      if (!parts) { needsRerender = true; return; }
      const units = el.querySelectorAll('.cal-countdown__unit b');
      parts.forEach((p, i) => { if (units[i]) units[i].textContent = String(p.v).padStart(2, '0'); });
    });
    if (needsRerender) render();
  }, 1000);
}

function openLightbox(src, alt) {
  let lb = document.getElementById('imgLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'imgLightbox';
    lb.className = 'img-lightbox';
    lb.innerHTML = '<button class="img-lightbox__close" aria-label="Close">&times;</button><img alt="" />';
    document.body.appendChild(lb);
    lb.addEventListener('click', (ev) => {
      if (ev.target === lb || ev.target.closest('.img-lightbox__close')) lb.classList.remove('open');
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') lb.classList.remove('open'); });
  }
  const img = lb.querySelector('img');
  img.src = src;
  img.alt = alt || '';
  lb.classList.add('open');
}
window.openLightbox = openLightbox;

function openEvent(id) {
  const e = allEvents.find(x => x.id === id);
  if (!e) return;
  const ts = eventStart(e);
  const past = isPast(e);
  const raw = e.imageUrl || e.image || (e.images && e.images[0]) || '/images/placeholder.svg';
  const modal = document.getElementById('eventModal');
  document.getElementById('eventModalPanel').innerHTML = `
    <button class="event-modal__close" id="eventModalClose" aria-label="Close">&times;</button>
    <div class="event-modal__media">
      <img src="${cldOpt(raw, 1000)}" alt="${esc(e.name || 'Event')}" />
      <button class="event-modal__zoom" type="button" data-zoom><i data-lucide="maximize-2"></i> View full image</button>
    </div>
    <div class="event-modal__body">
      ${past ? '<span class="badge-pill">Ended</span>' : ''}
      <h3>${esc(e.name || e.title || 'Untitled event')}</h3>
      <div class="event-modal__when">${fmtLong(ts)}</div>
      ${e.location ? `<div class="event-modal__when">${esc(e.location)}</div>` : ''}
      ${past ? '' : countdownHtml(ts)}
      ${e.description ? `<p>${esc(e.description)}</p>` : ''}
      <div class="cal-card__actions">
        ${past ? '' : `<button class="btn btn--solid" data-add="${e.id}">Add to calendar</button>`}
        <a class="btn" href="/shop">Shop the drop</a>
      </div>
    </div>`;
  modal.classList.add('open');
  document.body.classList.add('modal-open');
  document.getElementById('eventModalClose').addEventListener('click', closeEvent);
  document.querySelector('#eventModalPanel [data-zoom]')?.addEventListener('click', () => {
    openLightbox(cldOpt(raw, 1600), e.name || 'Event');
  });
  document.querySelector('#eventModalPanel [data-add]')?.addEventListener('click', () => addEventToCalendar(e.id));
  if (window.lucide) window.lucide.createIcons();

  startCountdowns();
}
function closeEvent() {
  document.getElementById('eventModal')?.classList.remove('open');
  document.body.classList.remove('modal-open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('eventModal')?.addEventListener('click', ev => {
    if (ev.target.id === 'eventModal') closeEvent();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeEvent(); });

  initFirebase().then(({ db }) => {
    db.collection('events').onSnapshot(snap => {
      allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.active !== false);
      render();
    }, () => {
      document.getElementById('calList').innerHTML = `<div class="empty-state">Couldn't load events right now.</div>`;
    });
  });
});
