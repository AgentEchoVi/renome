/* ============================================================
   checkout.js — Checkout page logic
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  var T = window.__t || {};
  var checkoutItemsEl = document.getElementById('checkoutItems');
  var checkoutTotal = document.getElementById('checkoutTotal');
  var checkoutForm = document.getElementById('checkoutForm');
  var addressGroup = document.getElementById('addressGroup');
  var submitBtn = document.getElementById('submitOrderBtn');

  // Render order summary
  function renderSummary() {
    var items = Cart.getItems();
    if (items.length === 0) {
      window.location.href = '/cart';
      return;
    }

    var html = '';
    items.forEach(function (item) {
      html += '<div class="cart-summary__row">';
      html += '  <span>' + item.name + ' x' + item.quantity + '</span>';
      html += '  <span>' + (item.price * item.quantity) + ' MDL</span>';
      html += '</div>';
    });
    checkoutItemsEl.innerHTML = html;
    checkoutTotal.textContent = Cart.getTotal() + ' MDL';
  }

  renderSummary();

  // Toggle address based on delivery type
  var deliveryRadios = document.querySelectorAll('input[name="delivery_type"]');
  deliveryRadios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      addressGroup.style.display = radio.value === 'pickup' ? 'none' : '';
    });
  });

  // Submit order
  checkoutForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var items = Cart.getItems();
    if (items.length === 0) return;

    submitBtn.disabled = true;
    submitBtn.textContent = T.placingOrder || 'Placing order...';

    var formData = new FormData(checkoutForm);
    var body = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email') || '',
      address: formData.get('address') || '',
      delivery_type: formData.get('delivery_type'),
      payment_method: formData.get('payment_method'),
      comment: formData.get('comment') || '',
      items: JSON.stringify(items.map(function (i) { return { id: i.id, quantity: i.quantity }; })),
      _csrf: formData.get('_csrf')
    };

    fetch('/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          Cart.clear();
          window.location.href = '/order-success/' + data.orderId;
        } else {
          alert((T.errorPrefix || 'Error: ') + (data.error || (T.unknownError || 'Unknown error')));
          submitBtn.disabled = false;
          submitBtn.textContent = T.placeOrder || 'Place order';
        }
      })
      .catch(function (err) {
        alert((T.networkError || 'Network error: ') + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = T.placeOrder || 'Place order';
      });
  });
});
