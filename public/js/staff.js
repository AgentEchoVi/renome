(function() {
  'use strict';

  // === Translations ===
  var lang = window.STAFF_LANG || 'ro';
  var T = window.STAFF_T || {};

  var statusNames = lang === 'ru'
    ? { 'new': 'Новый', confirmed: 'Принят', completed: 'Завершён', cancelled: 'Отменён' }
    : { 'new': 'Nou', confirmed: 'Confirmat', completed: 'Finalizat', cancelled: 'Anulat' };

  var sseTexts = lang === 'ru'
    ? { connected: 'Онлайн', reconnecting: 'Переподключение...' }
    : { connected: 'Online', reconnecting: 'Reconectare...' };

  // === DOM refs ===
  var statusDot = document.querySelector('.staff-status__dot');
  var statusText = document.querySelector('.staff-status__text');
  var container = document.getElementById('ordersContainer');
  var emptyState = document.getElementById('emptyState');
  var orderCountEl = document.getElementById('orderCount');
  var orderTotalEl = document.getElementById('orderTotal');
  var notifyBanner = document.getElementById('notifyBanner');
  var enableBtn = document.getElementById('enableNotifyBtn');
  var dismissBtn = document.getElementById('dismissNotifyBtn');

  // Store orders data for edit modal
  var ordersCache = {};
  // Initialize from server-rendered cards
  document.querySelectorAll('.staff-order-card').forEach(function(card) {
    var oid = card.getAttribute('data-order-id');
    if (oid) ordersCache[oid] = null; // placeholder
  });

  // === SSE Connection ===
  var evtSource = null;

  function setStatus(state) {
    if (statusDot) statusDot.className = 'staff-status__dot staff-status__dot--' + state;
    if (statusText) statusText.textContent = sseTexts[state] || state;
  }

  var sseRetries = 0;

  function connectSSE() {
    if (evtSource) evtSource.close();
    evtSource = new EventSource('/staff/events');

    evtSource.addEventListener('connected', function() {
      sseRetries = 0;
      setStatus('connected');
    });

    evtSource.addEventListener('new-order', function(e) {
      try {
        var order = JSON.parse(e.data);
        order.status = order.status || 'new';
        ordersCache[order.id] = order;
        handleNewOrder(order);
      } catch (err) { console.error('SSE parse:', err); }
    });

    evtSource.addEventListener('order-update', function(e) {
      try {
        var order = JSON.parse(e.data);
        ordersCache[order.id] = order;
        handleOrderUpdate(order);
      } catch (err) { console.error('SSE parse:', err); }
    });

    evtSource.onopen = function() {
      sseRetries = 0;
      setStatus('connected');
    };

    evtSource.onerror = function() {
      sseRetries++;
      setStatus('reconnecting');
      // After 3 failed retries, check if session expired
      if (sseRetries >= 3) {
        evtSource.close();
        fetch('/staff/push-status').then(function(r) {
          if (r.redirected || r.url.indexOf('/login') !== -1 || r.status === 401) {
            window.location.href = '/staff/login';
          } else {
            // Server is up, just SSE hiccup — retry after delay
            sseRetries = 0;
            setTimeout(connectSSE, 5000);
          }
        }).catch(function() {
          // Network error — retry later
          setTimeout(connectSSE, 10000);
        });
      }
    };
  }

  // === Handle New Order ===
  function handleNewOrder(order) {
    if (emptyState) { emptyState.remove(); emptyState = null; }

    var html = buildOrderCard(order);
    container.insertAdjacentHTML('afterbegin', html);

    var newCard = container.firstElementChild;
    if (newCard) {
      newCard.classList.add('staff-order-card--new');
      setTimeout(function() { newCard.classList.remove('staff-order-card--new'); }, 2000);
    }

    updateStatsAdd(order);
    playNotificationSound();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    showBrowserNotification(order);
  }

  // === Handle Order Update (SSE) ===
  function handleOrderUpdate(order) {
    var existing = container.querySelector('[data-order-id="' + order.id + '"]');
    if (!existing) return;

    var html = buildOrderCard(order);
    var temp = document.createElement('div');
    temp.innerHTML = html;
    var newCard = temp.firstElementChild;
    existing.replaceWith(newCard);
  }

  // === Build Order Card ===
  function buildOrderCard(order) {
    var items = order.items || [];
    var st = order.status || 'new';
    var itemsHtml = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      itemsHtml += '<div class="staff-item-row" data-item-id="' + it.id + '">' +
        '<span class="staff-item-row__qty">' + it.quantity + 'x</span>' +
        '<span class="staff-item-row__name">' + esc(it.name) + '</span>' +
        '<span class="staff-item-row__price">' + (it.price * it.quantity) + ' MDL</span>' +
        '</div>';
    }

    var typeLabel = order.delivery_type === 'delivery' ? (T.delivery || 'Livrare') : (T.pickup || 'Ridicare');
    var payLabel = order.payment_method === 'cash' ? (T.cash || 'Numerar') : (T.card || 'Card');
    var time = new Date(order.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    var cardClass = 'staff-order-card';
    if (st === 'completed') cardClass += ' staff-order-card--completed';
    if (st === 'cancelled') cardClass += ' staff-order-card--cancelled';

    var h = '<div class="' + cardClass + '" data-order-id="' + order.id + '" data-status="' + st + '">';

    // Header with status badge
    h += '<div class="staff-order-card__header">';
    h += '<div style="display:flex;align-items:center;gap:8px">';
    h += '<span class="staff-order-card__id">#' + order.id + '</span>';
    h += '<span class="staff-status-badge staff-status-badge--' + st + '">' + (statusNames[st] || st) + '</span>';
    h += '</div>';
    h += '<span class="staff-order-card__time">' + time + '</span>';
    h += '</div>';

    // Customer
    h += '<div class="staff-order-card__customer">';
    h += '<div>';
    h += '<div class="staff-order-card__name">' + esc(order.customer_name) + '</div>';
    if (order.customer_email) {
      h += '<div class="staff-order-card__email">' + esc(order.customer_email) + '</div>';
    }
    h += '</div>';
    h += '<a href="tel:' + esc(order.customer_phone) + '" class="staff-order-card__phone">' + esc(order.customer_phone) + '</a>';
    h += '</div>';

    // Type badges
    h += '<div class="staff-order-card__type">';
    h += '<span class="staff-badge staff-badge--' + order.delivery_type + '">' + typeLabel + '</span>';
    h += '<span class="staff-badge staff-badge--payment">' + payLabel + '</span>';
    h += '</div>';

    // Address
    if (order.delivery_address) {
      h += '<div class="staff-order-card__address">';
      h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
      h += esc(order.delivery_address);
      h += '</div>';
    }

    // Items
    h += '<div class="staff-order-card__items">' + itemsHtml + '</div>';

    // Comment
    if (order.comment) {
      h += '<div class="staff-order-card__comment">"' + esc(order.comment) + '"</div>';
    }

    // Cancel reason
    if (st === 'cancelled' && order.cancel_reason) {
      h += '<div class="staff-order-card__cancel-reason">' + (T.reason || 'Motiv') + ': ' + esc(order.cancel_reason) + '</div>';
    }

    // History
    if (order.history && order.history.length > 0) {
      h += '<div class="staff-history">';
      h += '<button class="staff-history__toggle" onclick="staffActions.toggleHistory(this)">';
      h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      h += (T.history || 'Istoric') + ' (' + order.history.length + ')';
      h += '<svg class="staff-history__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
      h += '</button>';
      h += '<div class="staff-history__timeline" style="display:none">';
      for (var hi = 0; hi < order.history.length; hi++) {
        var entry = order.history[hi];
        var entryTime = new Date(entry.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        h += '<div class="staff-history__entry staff-history__entry--' + entry.action + '">';
        h += '<div class="staff-history__dot"></div>';
        h += '<div class="staff-history__content">';
        h += '<div class="staff-history__action">';
        if (entry.action === 'status_change') {
          var d = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
          h += (T.historyStatus || 'Status schimbat') + ': ' + (statusNames[d.from] || d.from) + ' &rarr; ' + (statusNames[d.to] || d.to);
        } else if (entry.action === 'item_edit') {
          h += (T.historyItems || 'Poziții modificate');
        } else if (entry.action === 'customer_edit') {
          h += (T.historyCustomer || 'Date client modificate');
        }
        h += '</div>';
        h += '<div class="staff-history__meta">' + esc(entry.staff_name) + ' &middot; ' + entryTime + '</div>';
        h += '</div></div>';
      }
      h += '</div></div>';
    }

    // Action buttons
    if (st === 'new' || st === 'confirmed') {
      h += '<div class="staff-actions">';
      if (st === 'new') {
        h += '<button class="staff-action-btn staff-action-btn--accept" onclick="staffActions.accept(' + order.id + ')">' + (T.accept || 'Acceptă') + '</button>';
      } else {
        h += '<button class="staff-action-btn staff-action-btn--complete" onclick="staffActions.complete(' + order.id + ')">' + (T.complete || 'Finalizează') + '</button>';
      }
      h += '<button class="staff-action-btn staff-action-btn--cancel" onclick="staffActions.openCancel(' + order.id + ')">' + (T.cancel || 'Anulează') + '</button>';
      h += '<button class="staff-action-btn staff-action-btn--edit" onclick="staffActions.openEdit(' + order.id + ')">' + (T.edit || 'Editează') + '</button>';
      h += '</div>';
    }

    // Total
    h += '<div class="staff-order-card__total"><span>' + (T.total || 'Total') + '</span><span>' + order.total + ' MDL</span></div>';
    h += '</div>';
    return h;
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function updateStatsAdd(order) {
    if (orderCountEl) {
      var count = parseInt(orderCountEl.textContent) || 0;
      orderCountEl.textContent = count + 1;
    }
    if (orderTotalEl) {
      var txt = orderTotalEl.textContent.replace(/[^\d]/g, '');
      var total = parseInt(txt) || 0;
      orderTotalEl.textContent = (total + order.total) + ' MDL';
    }
  }

  // === API helpers ===
  function getCsrf() {
    var m = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function apiPost(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  // === Actions (global for onclick) ===
  var cancelOrderId = null;
  var editOrderId = null;

  window.staffActions = {
    accept: function(id) {
      apiPost('/staff/orders/' + id + '/status', { status: 'confirmed' });
    },

    complete: function(id) {
      apiPost('/staff/orders/' + id + '/status', { status: 'completed' });
    },

    openCancel: function(id) {
      cancelOrderId = id;
      document.getElementById('cancelReason').value = '';
      document.getElementById('cancelModal').classList.add('staff-modal--open');
    },

    closeCancel: function() {
      cancelOrderId = null;
      document.getElementById('cancelModal').classList.remove('staff-modal--open');
    },

    openEdit: function(id) {
      editOrderId = id;
      var order = ordersCache[id];

      // If not in cache, read from DOM
      if (!order) {
        var card = container.querySelector('[data-order-id="' + id + '"]');
        if (!card) return;
        // Fetch fresh data
        fetch('/staff/orders/' + id + '/status', { method: 'GET' }).catch(function() {});
        // Populate from DOM as fallback
        document.getElementById('editName').value = card.querySelector('.staff-order-card__name')?.textContent || '';
        document.getElementById('editPhone').value = card.querySelector('.staff-order-card__phone')?.textContent || '';
        var addrEl = card.querySelector('.staff-order-card__address');
        document.getElementById('editAddress').value = addrEl ? addrEl.textContent.trim() : '';
        var commentEl = card.querySelector('.staff-order-card__comment');
        document.getElementById('editComment').value = commentEl ? commentEl.textContent.replace(/^"|"$/g, '') : '';
        document.getElementById('editItemsList').innerHTML = '<div style="color:var(--s-text2);font-size:13px;padding:8px 0">...</div>';
        document.getElementById('editOrderId').textContent = '#' + id;
        document.getElementById('editModal').classList.add('staff-modal--open');
        return;
      }

      document.getElementById('editOrderId').textContent = '#' + id;
      document.getElementById('editName').value = order.customer_name || '';
      document.getElementById('editPhone').value = order.customer_phone || '';
      document.getElementById('editAddress').value = order.delivery_address || '';
      document.getElementById('editComment').value = order.comment || '';

      // Build items list
      var itemsHtml = '';
      var items = order.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        itemsHtml += '<div class="staff-edit-item" data-item-id="' + it.id + '" data-price="' + it.price + '">';
        itemsHtml += '<span class="staff-edit-item__name">' + esc(it.name) + '</span>';
        itemsHtml += '<span class="staff-edit-item__price">' + it.price + ' MDL</span>';
        itemsHtml += '<div class="staff-qty-controls">';
        itemsHtml += '<button class="staff-qty-btn staff-qty-btn--remove" onclick="staffActions.qtyChange(this,-1)">−</button>';
        itemsHtml += '<span class="staff-qty-value">' + it.quantity + '</span>';
        itemsHtml += '<button class="staff-qty-btn" onclick="staffActions.qtyChange(this,1)">+</button>';
        itemsHtml += '</div>';
        itemsHtml += '</div>';
      }
      document.getElementById('editItemsList').innerHTML = itemsHtml;
      document.getElementById('editModal').classList.add('staff-modal--open');
    },

    closeEdit: function() {
      editOrderId = null;
      document.getElementById('editModal').classList.remove('staff-modal--open');
    },

    toggleHistory: function(btn) {
      var timeline = btn.nextElementSibling;
      var chevron = btn.querySelector('.staff-history__chevron');
      if (timeline.style.display === 'none') {
        timeline.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      } else {
        timeline.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0)';
      }
    },

    qtyChange: function(btn, delta) {
      var row = btn.closest('.staff-edit-item');
      var valEl = row.querySelector('.staff-qty-value');
      var val = parseInt(valEl.textContent) || 0;
      val = Math.max(0, val + delta);
      valEl.textContent = val;
      if (val === 0) {
        row.style.opacity = '0.3';
        row.style.textDecoration = 'line-through';
      } else {
        row.style.opacity = '1';
        row.style.textDecoration = 'none';
      }
    }
  };

  // Cancel confirm button
  document.getElementById('confirmCancelBtn').addEventListener('click', function() {
    if (!cancelOrderId) return;
    var reason = document.getElementById('cancelReason').value.trim();
    apiPost('/staff/orders/' + cancelOrderId + '/status', {
      status: 'cancelled',
      cancel_reason: reason || null
    });
    window.staffActions.closeCancel();
  });

  // Save edit button
  document.getElementById('saveEditBtn').addEventListener('click', function() {
    if (!editOrderId) return;

    // Save customer info
    apiPost('/staff/orders/' + editOrderId + '/customer', {
      customer_name: document.getElementById('editName').value.trim(),
      customer_phone: document.getElementById('editPhone').value.trim(),
      delivery_address: document.getElementById('editAddress').value.trim(),
      comment: document.getElementById('editComment').value.trim()
    });

    // Save items changes
    var itemRows = document.querySelectorAll('#editItemsList .staff-edit-item');
    var itemChanges = [];
    itemRows.forEach(function(row) {
      var itemId = parseInt(row.getAttribute('data-item-id'));
      var qty = parseInt(row.querySelector('.staff-qty-value').textContent) || 0;
      itemChanges.push({ id: itemId, quantity: qty });
    });

    if (itemChanges.length > 0) {
      apiPost('/staff/orders/' + editOrderId + '/items', { items: itemChanges });
    }

    window.staffActions.closeEdit();
  });

  // === Audio — Web Audio API ===
  var audioCtx = null;

  function playNotificationSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      playTone(880, 0, 0.15);
      playTone(1108, 0.15, 0.15);
      playTone(1318, 0.3, 0.2);
    } catch (e) { /* audio not available */ }
  }

  function playTone(freq, startTime, duration) {
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    var t = audioCtx.currentTime + startTime;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  // === Capacitor detection ===
  var isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var capPush = isCapacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.PushNotifications : null;
  var capLocal = isCapacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins.LocalNotifications : null;

  // Register for FCM push notifications (Capacitor)
  if (capPush) {
    capPush.requestPermissions().then(function(result) {
      if (result.receive === 'granted') {
        capPush.register();
      }
      if (notifyBanner) notifyBanner.style.display = 'none';
    }).catch(function() {});

    // Get FCM token and send to server with language
    capPush.addListener('registration', function(token) {
      console.log('FCM token:', token.value);
      fetch('/staff/register-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ token: token.value, lang: lang })
      }).catch(function() {});
    });

    capPush.addListener('registrationError', function(err) {
      console.error('FCM registration error:', err);
    });

    // When push received while app is open — just play sound (SSE handles UI update)
    capPush.addListener('pushNotificationReceived', function(notification) {
      playNotificationSound();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });

    // When user taps push notification — focus the app
    capPush.addListener('pushNotificationActionPerformed', function() {
      window.focus();
    });
  }

  // === Browser Notifications ===
  function showBrowserNotification(order) {
    var items = (order.items || []).map(function(i) {
      return i.quantity + 'x ' + i.name;
    }).join(', ');

    var body = order.customer_name + ' · ' + order.total + ' MDL\n' + items;
    var title = (T.newOrder || 'Comandă nouă') + ' #' + order.id;

    // In Capacitor — FCM handles background push, use local for foreground
    if (capLocal && !capPush) {
      capLocal.schedule({
        notifications: [{
          title: title,
          body: body,
          id: order.id,
          smallIcon: 'ic_launcher',
          largeIcon: 'ic_launcher'
        }]
      }).catch(function() {});
      return;
    }

    // On Capacitor with FCM — push comes from server, skip client-side notification
    if (isCapacitor) return;

    // Web Notifications fallback (desktop/PWA)
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      var n = new Notification(title, {
        body: body,
        icon: '/img/logo.png',
        badge: '/img/logo.png',
        tag: 'order-' + order.id,
        requireInteraction: true
      });
      n.onclick = function() { window.focus(); n.close(); };
    } catch (e) { /* notification failed */ }
  }

  // === Notification Permission Banner ===
  if (!isCapacitor && 'Notification' in window && Notification.permission === 'default') {
    if (notifyBanner) notifyBanner.style.display = 'flex';
  }

  if (enableBtn) {
    enableBtn.addEventListener('click', function() {
      if ('Notification' in window) {
        Notification.requestPermission().then(function() {
          if (notifyBanner) notifyBanner.style.display = 'none';
        });
      }
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', function() {
      if (notifyBanner) notifyBanner.style.display = 'none';
    });
  }

  // === Service Worker ===
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-staff.js', { scope: '/staff' })
      .then(function(reg) { console.log('Staff SW registered:', reg.scope); })
      .catch(function(err) { console.log('Staff SW registration failed:', err); });
  }

  // === Activate audio on first tap (iOS) ===
  document.addEventListener('click', function() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ok */ }
  }, { once: true });

  // === Start SSE ===
  connectSSE();

})();
