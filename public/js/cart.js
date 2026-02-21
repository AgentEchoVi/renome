/* ============================================================
   Cart module — localStorage-based cart for Renome
   ============================================================ */
var Cart = (function () {
  var STORAGE_KEY = 'renome_cart';

  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
  }

  function addItem(id, name, price, image, weight) {
    var items = getItems();
    var existing = items.find(function (i) { return i.id === id; });
    if (existing) {
      existing.quantity++;
    } else {
      items.push({ id: id, name: name, price: parseFloat(price), image: image || '', weight: weight || '', quantity: 1 });
    }
    saveItems(items);
  }

  function removeItem(id) {
    var items = getItems().filter(function (i) { return i.id !== id; });
    saveItems(items);
  }

  function updateQuantity(id, qty) {
    var items = getItems();
    var item = items.find(function (i) { return i.id === id; });
    if (item) {
      item.quantity = Math.max(1, Math.min(99, qty));
    }
    saveItems(items);
  }

  function getTotal() {
    return getItems().reduce(function (sum, i) { return sum + i.price * i.quantity; }, 0);
  }

  function getCount() {
    return getItems().reduce(function (sum, i) { return sum + i.quantity; }, 0);
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    updateBadge();
  }

  function updateBadge() {
    var count = getCount();
    var badge = document.getElementById('headerCartBadge');
    if (badge) {
      badge.textContent = count > 0 ? count : '';
    }
    var mobileBadge = document.getElementById('mobileCartBadge');
    if (mobileBadge) {
      if (count > 0) {
        mobileBadge.textContent = count;
        mobileBadge.classList.add('show');
      } else {
        mobileBadge.textContent = '';
        mobileBadge.classList.remove('show');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', updateBadge);

  return {
    getItems: getItems,
    addItem: addItem,
    removeItem: removeItem,
    updateQuantity: updateQuantity,
    getTotal: getTotal,
    getCount: getCount,
    clear: clear,
    updateBadge: updateBadge
  };
})();
