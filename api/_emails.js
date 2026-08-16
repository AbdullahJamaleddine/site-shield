// ---------------------------------------------------------------------------
// Order emails — customer confirmation + admin new-order notice.
//
// Plain, editorial layout that matches the storefront: cream page, white card,
// ink type, hairline rules, one red accent. No emoji, no coloured pills, no
// gradients. Built with tables and inline styles so Gmail/Outlook render it
// the same way.
// ---------------------------------------------------------------------------
const nodemailer = require('nodemailer');

const BRAND = 'DRIPS & DROPS';
const CREAM = '#FAF7F2';
const INK = '#141414';
const MUTED = '#6B6B6B';
const LINE = '#E6DFD1';
const ACCENT = '#E63946';
const WHITE = '#FFFFFF';
const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  return '\u20A6' + Number(n || 0).toLocaleString('en-NG');
}

function orderTotal(o) {
  const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
  if (n(o.total) > 0) return n(o.total);
  if (n(o.customerTotal) > 0) return n(o.customerTotal);
  const sub = n(o.subtotal) || n(o.originalSubtotal);
  return Math.max(0, sub - n(o.couponDiscount)) + n(o.fee);
}

function orderDate(o) {
  const d = new Date(o.paidAt || o.createdAt || Date.now());
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function label(text, color) {
  return `<div style="font:600 11px/1.4 ${FONT};letter-spacing:0.14em;text-transform:uppercase;color:${color || MUTED};">${esc(text)}</div>`;
}

function itemRows(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return '';
  return items.map((i, idx) => {
    const variant = [i.size ? `Size ${i.size}` : '', i.color ? String(i.color) : '']
      .filter(Boolean).join(' &nbsp;·&nbsp; ');
    const top = idx === 0 ? '0' : '14px';
    return `
      <tr>
        <td style="padding:${top} 0 14px;border-bottom:1px solid ${LINE};font:400 15px/1.45 ${FONT};color:${INK};">
          ${esc(i.name)}
          ${variant ? `<div style="margin-top:4px;font:400 13px/1.4 ${FONT};color:${MUTED};">${variant}</div>` : ''}
          <div style="margin-top:4px;font:400 13px/1.4 ${FONT};color:${MUTED};">Qty ${Number(i.qty || 1)}</div>
        </td>
        <td style="padding:${top} 0 14px;border-bottom:1px solid ${LINE};font:500 15px/1.45 ${FONT};color:${INK};text-align:right;white-space:nowrap;vertical-align:top;">
          ${money(Number(i.price || 0) * Number(i.qty || 1))}
        </td>
      </tr>`;
  }).join('');
}

function totalsRows(order) {
  const rows = [];
  const line = (k, v, strong) => `
    <tr>
      <td style="padding:6px 0;font:${strong ? '600' : '400'} ${strong ? '16px' : '14px'}/1.5 ${FONT};color:${strong ? INK : MUTED};">${esc(k)}</td>
      <td style="padding:6px 0;font:${strong ? '600' : '400'} ${strong ? '16px' : '14px'}/1.5 ${FONT};color:${strong ? INK : MUTED};text-align:right;white-space:nowrap;">${v}</td>
    </tr>`;
  rows.push(line('Subtotal', money(order.subtotal)));
  if (Number(order.couponDiscount) > 0) {
    const code = order.appliedCoupon && order.appliedCoupon.code ? ` (${order.appliedCoupon.code})` : '';
    rows.push(line('Discount' + code, '&minus;' + money(order.couponDiscount)));
  }
  if (Number(order.fee) > 0) rows.push(line('Transaction fee', money(order.fee)));
  rows.push(`<tr><td colspan="2" style="padding:8px 0 0;"><div style="border-top:1px solid ${LINE};"></div></td></tr>`);
  rows.push(line('Total paid', money(orderTotal(order)), true));
  return rows.join('');
}

function addressBlock(order) {
  const lines = [order.address, [order.city, order.state].filter(Boolean).join(', ')].filter(Boolean);
  return lines.map(l => `<div style="font:400 15px/1.6 ${FONT};color:${INK};">${esc(l)}</div>`).join('');
}

function shell(inner) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
        <tr><td style="padding:0 0 22px;text-align:center;font:700 14px/1 ${FONT};letter-spacing:0.28em;color:${INK};">${BRAND}</td></tr>
        <tr><td style="background:${WHITE};border:1px solid ${LINE};padding:36px 32px;">${inner}</td></tr>
        <tr><td style="padding:20px 8px 0;text-align:center;font:400 12px/1.7 ${FONT};color:${MUTED};">
          Lagos, Nigeria &nbsp;·&nbsp; Questions? Reply to this email and we'll get back to you.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function metaRow(left, right) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
    <tr>
      <td style="vertical-align:top;">${label('Order')}<div style="margin-top:5px;font:500 14px/1.5 ${FONT};color:${INK};">${esc(left)}</div></td>
      <td style="vertical-align:top;text-align:right;">${label('Placed')}<div style="margin-top:5px;font:400 14px/1.5 ${FONT};color:${INK};">${esc(right)}</div></td>
    </tr>
  </table>`;
}

// --- Customer confirmation ---------------------------------------------------
function renderCustomerEmail(order) {
  return shell(`
    <div style="width:28px;border-top:2px solid ${ACCENT};margin:0 0 18px;"></div>
    <h1 style="margin:0 0 10px;font:600 24px/1.25 ${FONT};color:${INK};letter-spacing:-0.01em;">Your order is confirmed</h1>
    <p style="margin:0 0 28px;font:400 15px/1.65 ${FONT};color:${MUTED};">
      Thanks${order.name ? ', ' + esc(String(order.name).split(' ')[0]) : ''} — we've received your payment and started packing.
      You'll hear from us again as soon as it ships.
    </p>
    ${metaRow(order.reference || order.id || '', orderDate(order))}
    ${label('Items')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 22px;">${itemRows(order)}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">${totalsRows(order)}</table>
    <div style="border-top:1px solid ${LINE};padding-top:22px;">
      ${label('Delivering to')}
      <div style="margin-top:8px;">
        <div style="font:500 15px/1.6 ${FONT};color:${INK};">${esc(order.name)}</div>
        ${addressBlock(order)}
        <div style="font:400 15px/1.6 ${FONT};color:${MUTED};">${esc(order.phone)}</div>
      </div>
    </div>
  `);
}

// --- Admin notification ------------------------------------------------------
function renderAdminEmail(order) {
  const itemCount = (order.items || []).reduce((s, i) => s + Number(i.qty || 1), 0);
  return shell(`
    <div style="width:28px;border-top:2px solid ${ACCENT};margin:0 0 18px;"></div>
    <h1 style="margin:0 0 10px;font:600 24px/1.25 ${FONT};color:${INK};letter-spacing:-0.01em;">New paid order</h1>
    <p style="margin:0 0 28px;font:400 15px/1.65 ${FONT};color:${MUTED};">
      ${esc(order.name)} paid ${money(orderTotal(order))} for ${itemCount} item${itemCount === 1 ? '' : 's'}.
    </p>
    ${metaRow(order.reference || order.id || '', orderDate(order))}
    ${label('Items')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 22px;">${itemRows(order)}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">${totalsRows(order)}</table>
    <div style="border-top:1px solid ${LINE};padding-top:22px;">
      ${label('Customer')}
      <div style="margin-top:8px;">
        <div style="font:500 15px/1.6 ${FONT};color:${INK};">${esc(order.name)}</div>
        <div style="font:400 15px/1.6 ${FONT};color:${MUTED};">${esc(order.email)} &nbsp;·&nbsp; ${esc(order.phone)}</div>
      </div>
      <div style="margin-top:18px;">
        ${label('Ship to')}
        <div style="margin-top:8px;">${addressBlock(order)}</div>
      </div>
      <div style="margin-top:18px;">
        ${label('Payment')}
        <div style="margin-top:8px;font:400 15px/1.6 ${FONT};color:${INK};">
          ${esc(String(order.paymentMethod || 'paystack').replace(/^./, c => c.toUpperCase()))} &nbsp;·&nbsp; ref ${esc(order.paystackRef || order.reference || '')}
        </div>
      </div>
    </div>
  `);
}

function renderOrderHtml(order, type) {
  return type === 'admin_notification' ? renderAdminEmail(order) : renderCustomerEmail(order);
}

async function logEmail(entry) {
  try {
    const { db } = require('./_order-service');
    await db().collection('emailLogs').add(entry);
  } catch (e) { console.warn('emailLogs write failed', e.message); }
}

async function sendOne(type, order) {
  const isAdmin = type === 'admin_notification';
  const to = isAdmin ? process.env.ADMIN_EMAIL : order.email;
  if (!to) return { ok: false, error: 'No recipient email' };
  const subject = isAdmin
    ? `New order ${order.reference || ''} — ${order.name || ''}`.trim()
    : `Order confirmed — ${order.reference || ''}`.trim();
  const base = {
    type, to, subject,
    orderRef: order.reference || null,
    orderId: order.id || null,
    createdAt: new Date().toISOString(),
  };
  try {
    await transporter().sendMail({
      from: `Drips and Drops <${process.env.EMAIL_USER}>`,
      to, subject, html: renderOrderHtml(order, type),
    });
    await logEmail({ ...base, status: 'sent' });
    return { ok: true };
  } catch (err) {
    await logEmail({ ...base, status: 'failed', error: err.message });
    return { ok: false, error: err.message };
  }
}

async function sendOrderEmails(order) {
  const customer = await sendOne('customer_confirmation', order);
  const admin = await sendOne('admin_notification', order);
  return { customer, admin };
}

module.exports = { renderOrderHtml, renderCustomerEmail, renderAdminEmail, sendOne, sendOrderEmails, money };
