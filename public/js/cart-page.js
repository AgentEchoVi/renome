/* ============================================================
   cart-page.js — Cart page rendering
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  var cartEmpty = document.getElementById('cartEmpty');
  var cartContent = document.getElementById('cartContent');
  var cartItemsEl = document.getElementById('cartItems');

  function render() {
    var items = Cart.getItems();

    if (items.length === 0) {
      cartEmpty.style.display = '';
      cartContent.style.display = 'none';
      return;
    }

    cartEmpty.style.display = 'none';
    cartContent.style.display = '';

    var html = '';
    items.forEach(function (item) {
      html += '<div class="cart-item" data-id="' + item.id + '">';
      html += '  <div class="cart-item__img">';
      if (item.image) {
        html += '    <img src="' + item.image + '" alt="' + item.name + '">';
      } else {
        html += '    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg></div>';
      }
      html += '  </div>';
      html += '  <div class="cart-item__info">';
      html += '    <div class="cart-item__name">' + item.name + '</div>';
      if (item.weight) html += '    <div class="cart-item__weight">' + item.weight + '</div>';
      html += '  </div>';
      html += '  <div class="cart-item__qty">';
      html += '    <button class="cart-item__qty-btn" data-action="decrease" data-id="' + item.id + '">−</button>';
      html += '    <span class="cart-item__qty-value">' + item.quantity + '</span>';
      html += '    <button class="cart-item__qty-btn" data-action="increase" data-id="' + item.id + '">+</button>';
      html += '  </div>';
      html += '  <div class="cart-item__price">' + (item.price * item.quantity) + ' MDL</div>';
      html += '  <button class="cart-item__remove" data-id="' + item.id + '">';
      html += '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      html += '  </button>';
      html += '</div>';
    });

    cartItemsEl.innerHTML = html;

    document.getElementById('cartCount').textContent = Cart.getCount();
    document.getElementById('cartSubtotal').textContent = Cart.getTotal() + ' MDL';
    document.getElementById('cartTotal').textContent = Cart.getTotal() + ' MDL';
  }

  render();

  // Event delegation for cart actions
  cartItemsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (btn) {
      var id = parseInt(btn.dataset.id);
      var items = Cart.getItems();
      var item = items.find(function (i) { return i.id === id; });
      if (item) {
        if (btn.dataset.action === 'increase') {
          Cart.updateQuantity(id, item.quantity + 1);
        } else if (btn.dataset.action === 'decrease') {
          if (item.quantity <= 1) {
            Cart.removeItem(id);
          } else {
            Cart.updateQuantity(id, item.quantity - 1);
          }
        }
      }
      render();
      return;
    }

    var removeBtn = e.target.closest('.cart-item__remove');
    if (removeBtn) {
      Cart.removeItem(parseInt(removeBtn.dataset.id));
      render();
    }
  });
});
