const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/init');
const { isStaff } = require('../middleware/auth');
const orderEmitter = require('../lib/orderEvents');

// Helper: history
const insertHistory = db.prepare(
  'INSERT INTO order_history (order_id, action, details, staff_name) VALUES (?, ?, ?, ?)'
);
const stmtHistory = db.prepare('SELECT * FROM order_history WHERE order_id = ? ORDER BY created_at ASC');

// Helper: load full order with items + history
function getFullOrder(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  order.history = stmtHistory.all(orderId);
  return order;
}

// GET /staff/login
router.get('/login', (req, res) => {
  if (req.session.user && (req.session.user.role === 'staff' || req.session.user.role === 'admin')) {
    return res.redirect('/staff');
  }
  res.render('staff/login', { error: req.query.error || null });
});

// POST /staff/login — password only
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.redirect('/staff/login?error=invalid');

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const user = db.prepare("SELECT * FROM users WHERE password = ? AND (role = 'staff' OR role = 'admin')").get(hash);

  if (!user) {
    return res.redirect('/staff/login?error=invalid');
  }

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect('/staff');
});

// GET /staff/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/staff/login');
  });
});

// GET /staff — Dashboard
router.get('/', isStaff, (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE DATE(created_at) = DATE('now')
    ORDER BY created_at DESC
  `).all();

  const stmtItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  orders.forEach(order => {
    order.items = stmtItems.all(order.id);
    order.history = stmtHistory.all(order.id);
  });

  res.render('staff/dashboard', { orders, vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// POST /staff/orders/:id/status — change order status
router.post('/orders/:id/status', isStaff, (req, res) => {
  const { status, cancel_reason } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  const allowed = {
    'new': ['confirmed', 'cancelled'],
    'confirmed': ['completed', 'cancelled']
  };

  if (!allowed[order.status] || !allowed[order.status].includes(status)) {
    return res.status(400).json({ error: 'Invalid status transition' });
  }

  if (status === 'cancelled') {
    db.prepare('UPDATE orders SET status = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, cancel_reason || null, order.id);
  } else {
    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, order.id);
  }

  insertHistory.run(
    order.id, 'status_change',
    JSON.stringify({ from: order.status, to: status, cancel_reason: cancel_reason || null }),
    req.session.user.name
  );

  const fullOrder = getFullOrder(order.id);
  orderEmitter.emit('order-update', fullOrder);
  res.json({ success: true, order: fullOrder });
});

// POST /staff/orders/:id/items — edit order items
router.post('/orders/:id/items', isStaff, (req, res) => {
  const { items } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'completed' || order.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot edit finished order' });
  }
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Items required' });

  const oldItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const oldTotal = order.total;

  const updateQty = db.prepare('UPDATE order_items SET quantity = ? WHERE id = ? AND order_id = ?');
  const deleteItem = db.prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?');

  const editItems = db.transaction(() => {
    for (const item of items) {
      if (item.quantity <= 0) {
        deleteItem.run(item.id, order.id);
      } else {
        updateQty.run(item.quantity, item.id, order.id);
      }
    }

    // Recalculate total
    const remaining = db.prepare('SELECT price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    const newTotal = remaining.reduce((sum, i) => sum + i.price * i.quantity, 0);
    db.prepare('UPDATE orders SET total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newTotal, order.id);
  });

  editItems();

  // Log item changes
  const changes = [];
  for (const item of items) {
    const old = oldItems.find(o => o.id === item.id);
    if (!old) continue;
    if (item.quantity <= 0) {
      changes.push({ name: old.name, from: old.quantity, to: 0, removed: true });
    } else if (item.quantity !== old.quantity) {
      changes.push({ name: old.name, from: old.quantity, to: item.quantity });
    }
  }
  if (changes.length > 0) {
    const newTotal = db.prepare('SELECT total FROM orders WHERE id = ?').get(order.id).total;
    insertHistory.run(
      order.id, 'item_edit',
      JSON.stringify({ changes, old_total: oldTotal, new_total: newTotal }),
      req.session.user.name
    );
  }

  const fullOrder = getFullOrder(order.id);
  orderEmitter.emit('order-update', fullOrder);
  res.json({ success: true, order: fullOrder });
});

// POST /staff/orders/:id/customer — edit customer info
router.post('/orders/:id/customer', isStaff, (req, res) => {
  const { customer_name, customer_phone, delivery_address, comment } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'completed' || order.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot edit finished order' });
  }

  const newName = customer_name || order.customer_name;
  const newPhone = customer_phone || order.customer_phone;
  const newAddress = delivery_address !== undefined ? delivery_address : order.delivery_address;
  const newComment = comment !== undefined ? comment : order.comment;

  db.prepare(`
    UPDATE orders SET customer_name = ?, customer_phone = ?, delivery_address = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newName, newPhone, newAddress, newComment, order.id);

  // Log customer changes
  const customerChanges = {};
  if (newName !== order.customer_name) customerChanges.customer_name = { from: order.customer_name, to: newName };
  if (newPhone !== order.customer_phone) customerChanges.customer_phone = { from: order.customer_phone, to: newPhone };
  if (newAddress !== order.delivery_address) customerChanges.delivery_address = { from: order.delivery_address, to: newAddress };
  if (newComment !== order.comment) customerChanges.comment = { from: order.comment, to: newComment };

  if (Object.keys(customerChanges).length > 0) {
    insertHistory.run(
      order.id, 'customer_edit',
      JSON.stringify(customerChanges),
      req.session.user.name
    );
  }

  const fullOrder = getFullOrder(order.id);
  orderEmitter.emit('order-update', fullOrder);
  res.json({ success: true, order: fullOrder });
});

// GET /staff/events — SSE endpoint
router.get('/events', isStaff, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write('event: connected\ndata: {"status":"ok"}\n\n');

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  function onNewOrder(orderData) {
    res.write('event: new-order\ndata: ' + JSON.stringify(orderData) + '\n\n');
  }

  function onOrderUpdate(orderData) {
    res.write('event: order-update\ndata: ' + JSON.stringify(orderData) + '\n\n');
  }

  orderEmitter.on('new-order', onNewOrder);
  orderEmitter.on('order-update', onOrderUpdate);

  req.on('close', () => {
    clearInterval(heartbeat);
    orderEmitter.off('new-order', onNewOrder);
    orderEmitter.off('order-update', onOrderUpdate);
  });
});

// POST /staff/register-push — save FCM token with lang
router.post('/register-push', isStaff, (req, res) => {
  const { token, lang } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  const userLang = (lang === 'ru') ? 'ru' : 'ro';

  db.prepare('INSERT OR REPLACE INTO push_tokens (user_id, token, lang) VALUES (?, ?, ?)')
    .run(req.session.user.id, token, userLang);

  console.log('Push token registered for user', req.session.user.name, '(lang=' + userLang + '):', token.substring(0, 20) + '...');
  res.json({ success: true });
});

// GET /staff/push-status — debug: check Firebase + tokens
router.get('/push-status', isStaff, (req, res) => {
  const admin = require('firebase-admin');
  const tokens = db.prepare('SELECT id, user_id, token, created_at FROM push_tokens').all();
  res.json({
    firebaseInitialized: admin.apps.length > 0,
    tokenCount: tokens.length,
    tokens: tokens.map(t => ({ id: t.id, user_id: t.user_id, token: t.token.substring(0, 20) + '...', created_at: t.created_at }))
  });
});

// POST /staff/unregister-push — remove FCM token (logout)
router.post('/unregister-push', isStaff, (req, res) => {
  const { token } = req.body;
  if (token) {
    db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
  }
  res.json({ success: true });
});

// POST /staff/register-web-push — save Web Push subscription
router.post('/register-web-push', isStaff, (req, res) => {
  const { endpoint, p256dh, auth, lang } = req.body;
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Invalid subscription' });
  const userLang = (lang === 'ru') ? 'ru' : 'ro';

  db.prepare(`INSERT OR REPLACE INTO web_push_subs (endpoint, p256dh, auth, lang) VALUES (?, ?, ?, ?)`)
    .run(endpoint, p256dh, auth, userLang);

  console.log('Web Push registered (lang=' + userLang + '):', endpoint.substring(0, 40) + '...');
  res.json({ success: true });
});

module.exports = router;
