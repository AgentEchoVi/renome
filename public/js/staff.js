(function() {
  'use strict';

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

  // === SSE Connection ===
  var evtSource = null;

  function setStatus(state) {
    if (statusDot) statusDot.className = 'staff-status__dot staff-status__dot--' + state;
    if (statusText) {
      var texts = { connected: 'Онлайн', reconnecting: 'Переподключение...', disconnected: 'Офлайн' };
      statusText.textContent = texts[state] || state;
    }
  }

  function connectSSE() {
    if (evtSource) evtSource.close();
    evtSource = new EventSource('/staff/events');

    evtSource.addEventListener('connected', function() {
      setStatus('connected');
    });

    evtSource.addEventListener('new-order', function(e) {
      try {
        var order = JSON.parse(e.data);
        handleNewOrder(order);
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    });

    evtSource.onopen = function() {
      setStatus('connected');
    };

    evtSource.onerror = function() {
      setStatus('reconnecting');
    };
  }

  // === Handle New Order ===
  function handleNewOrder(order) {
    // Remove empty state
    if (emptyState) {
      emptyState.remove();
      emptyState = null;
    }

    // Build and insert card
    var html = buildOrderCard(order);
    container.insertAdjacentHTML('afterbegin', html);

    // Animate
    var newCard = container.firstElementChild;
    if (newCard) {
      newCard.classList.add('staff-order-card--new');
      setTimeout(function() {
        newCard.classList.remove('staff-order-card--new');
      }, 2000);
    }

    // Update stats
    updateStats(order);

    // Sound
    playNotificationSound();

    // Vibrate
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    // Browser notification
    showBrowserNotification(order);
  }

  function buildOrderCard(order) {
    var items = order.items || [];
    var itemsHtml = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      itemsHtml += '<div class="staff-item-row">' +
        '<span class="staff-item-row__qty">' + it.quantity + 'x</span>' +
        '<span class="staff-item-row__name">' + esc(it.name) + '</span>' +
        '<span class="staff-item-row__price">' + (it.price * it.quantity) + ' MDL</span>' +
        '</div>';
    }

    var typeLabel = order.delivery_type === 'delivery' ? 'Доставка' : 'Самовывоз';
    var payLabel = order.payment_method === 'cash' ? 'Наличные' : 'Карта';
    var time = new Date(order.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    var h = '<div class="staff-order-card" data-order-id="' + order.id + '">';
    h += '<div class="staff-order-card__header">';
    h += '<span class="staff-order-card__id">#' + order.id + '</span>';
    h += '<span class="staff-order-card__time">' + time + '</span>';
    h += '</div>';

    h += '<div class="staff-order-card__customer">';
    h += '<div class="staff-order-card__name">' + esc(order.customer_name) + '</div>';
    h += '<a href="tel:' + esc(order.customer_phone) + '" class="staff-order-card__phone">' + esc(order.customer_phone) + '</a>';
    h += '</div>';

    h += '<div class="staff-order-card__type">';
    h += '<span class="staff-badge staff-badge--' + order.delivery_type + '">' + typeLabel + '</span>';
    h += '<span class="staff-badge staff-badge--payment">' + payLabel + '</span>';
    h += '</div>';

    if (order.delivery_address) {
      h += '<div class="staff-order-card__address">';
      h += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
      h += esc(order.delivery_address);
      h += '</div>';
    }

    h += '<div class="staff-order-card__items">' + itemsHtml + '</div>';

    if (order.comment) {
      h += '<div class="staff-order-card__comment">"' + esc(order.comment) + '"</div>';
    }

    h += '<div class="staff-order-card__total"><span>Итого</span><span>' + order.total + ' MDL</span></div>';
    h += '</div>';
    return h;
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function updateStats(order) {
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

  // === Audio — Web Audio API (no mp3 needed) ===
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

  // === Browser Notifications ===
  function showBrowserNotification(order) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var items = (order.items || []).map(function(i) {
      return i.quantity + 'x ' + i.name;
    }).join(', ');

    var body = order.customer_name + ' · ' + order.total + ' MDL\n' + items;

    try {
      var n = new Notification('Новый заказ #' + order.id, {
        body: body,
        icon: '/img/logo.png',
        badge: '/img/logo.png',
        tag: 'order-' + order.id,
        requireInteraction: true
      });

      n.onclick = function() {
        window.focus();
        n.close();
      };
    } catch (e) { /* notification failed */ }
  }

  // === Notification Permission Banner ===
  if ('Notification' in window && Notification.permission === 'default') {
    if (notifyBanner) notifyBanner.style.display = 'flex';
  }

  if (enableBtn) {
    enableBtn.addEventListener('click', function() {
      Notification.requestPermission().then(function() {
        if (notifyBanner) notifyBanner.style.display = 'none';
      });
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

  // === Activate audio on first tap (iOS requirement) ===
  var audioActivated = false;
  document.addEventListener('click', function() {
    if (!audioActivated) {
      audioActivated = true;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (e) { /* ok */ }
    }
  }, { once: true });

  // === Start SSE ===
  connectSSE();

})();
