// Cart management with localStorage.
const CART_KEY = 'dd_cart';

function paystackFee(subtotal) {
  if (!subtotal || subtotal <= 0) return 0;
  return Math.round(subtotal * 0.015 + 120);
}

function getCart() {
  try {
    const data = localStorage.getItem(CART_KEY);
    return data ? JSON.parse(data) : { items: [] };
  } catch { return { items: [] }; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cart:changed'));
}

function addToCart(product, sizeOrOptions, qty = 1) {
  const options = typeof sizeOrOptions === 'object' && sizeOrOptions !== null
    ? sizeOrOptions
    : { size: sizeOrOptions || null };
  const cart = getCart();
  const existing = cart.items.find(item =>
    item.id === product.id &&
    (item.size || null) === (options.size || null) &&
    (item.color || null) === (options.color || null)
  );
  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0] || product.image || '',
      size: options.size || null,
      color: options.color || null,
      colorHex: options.colorHex || null,
      comboItems: options.comboItems || null,
      qty,
    });
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(index) {
  const cart = getCart();
  cart.items.splice(index, 1);
  saveCart(cart);
  return cart;
}

function updateCartQty(index, newQty) {
  const cart = getCart();
  if (newQty <= 0) return removeFromCart(index);
  cart.items[index].qty = newQty;
  saveCart(cart);
  return cart;
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cart:changed'));
}

function getCartTotal() {
  return getCart().items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getCartItemCount() {
  return getCart().items.reduce((sum, item) => sum + item.qty, 0);
}

function money(n) {
  return '\u20A6' + Number(n || 0).toLocaleString('en-NG');
}

function updateCartBadge() {
  const n = getCartItemCount();
  document.querySelectorAll('.navbar__cart-count').forEach(el => {
    el.textContent = n; el.setAttribute('data-count', String(n));
  });
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
window.addEventListener('cart:changed', updateCartBadge);

window.Cart = {
  get: getCart, add: addToCart, remove: removeFromCart,
  updateQty: updateCartQty, clear: clearCart,
  total: getCartTotal, count: getCartItemCount, money, fee: paystackFee,
};
