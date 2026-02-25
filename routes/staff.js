const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/init');
const { isStaff } = require('../middleware/auth');
const orderEmitter = require('../lib/orderEvents');

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

// GET /staff/events — SSE endpoint
router.get('/events', isStaff, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Connected
  res.write('event: connected\ndata: {"status":"ok"}\n\n');

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Listen for new orders
  function onNewOrder(orderData) {
    res.write('event: new-order\ndata: ' + JSON.stringify(orderData) + '\n\n');
  }

  orderEmitter.on('new-order', onNewOrder);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    orderEmitter.off('new-order', onNewOrder);
  });
});

module.exports = router;
