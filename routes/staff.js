const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/init');
const { isStaff } = require('../middleware/auth');
const orderEmitter = require('../lib/orderEvents');

// Helper: load full order with items
function getFullOrder(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return order;
}

// GET /staff/login
router.get('/login', (req, res) => {
  if (req.session.user && (req.session.user.role === 'staff' || req.session.user.role === 'admin')) {
    return res.redirect('/staff');
  }
  res.render('staff/login', { error: req.query.error || null });
});

// POST /staff/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const hash = crypto.createHash('sha256').update(password || '').digest('hex');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || user.password !== hash || (user.role !== 'staff' && user.role !== 'admin')) {
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
  });

  res.render('staff/dashboard', { orders });
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

  db.prepare(`
    UPDATE orders SET customer_name = ?, customer_phone = ?, delivery_address = ?, comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    customer_name || order.customer_name,
    customer_phone || order.customer_phone,
    delivery_address !== undefined ? delivery_address : order.delivery_address,
    comment !== undefined ? comment : order.comment,
    order.id
  );

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

module.exports = router;
