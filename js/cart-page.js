function render() {
  const page = document.getElementById('cartPage');
  const cart = Cart.get();

  if (!cart.items.length) {
    page.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:80px 0;">
      Your cart is empty. <a href="/shop.html" style="text-decoration:underline;">Go shop the drop →</a>
    </div>`;
    return;
  }

  const rows = cart.items.map((item, i) => `
    <div class="cart-row">
      <img src="${item.image || '/images/placeholder.svg'}" alt="${item.name}" />
      <div>
        <div class="cart-row__name">${item.name}</div>
        <div class="cart-row__meta">${item.size ? 'Size: ' + item.size : ''}</div>
        <div class="qty-control mt-24" style="margin-top:10px;">
          <button data-i="${i}" class="qtyMinus">−</button>
          <span>${item.qty}</span>
          <button data-i="${i}" class="qtyPlus">+</button>
        </div>
        <div class="cart-row__remove" data-i="${i}" role="button">Remove</div>
      </div>
      <div class="cart-row__price">${Cart.money(item.price * item.qty)}</div>
    </div>
  `).join('');

  const total = Cart.total();

  page.innerHTML = `
    <div class="cart-list">${rows}</div>
    <div class="cart-summary">
      <div class="summary-line"><span>Subtotal</span><span>${Cart.money(total)}</span></div>
      <div class="summary-line"><span>Delivery</span><span>Confirmed after order</span></div>
      <div class="summary-line total"><span>Total</span><span>${Cart.money(total)}</span></div>
      <a href="/checkout.html" class="btn btn--solid btn--block mt-24">Checkout</a>
    </div>
  `;

  page.querySelectorAll('.qtyMinus').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.i);
    const item = Cart.get().items[i];
    Cart.updateQty(i, item.qty - 1);
    render();
  }));
  page.querySelectorAll('.qtyPlus').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.i);
    const item = Cart.get().items[i];
    Cart.updateQty(i, item.qty + 1);
    render();
  }));
  page.querySelectorAll('.cart-row__remove').forEach(el => el.addEventListener('click', () => {
    Cart.remove(Number(el.dataset.i));
    render();
  }));
}

document.addEventListener('DOMContentLoaded', render);
