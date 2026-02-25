const express = require('express');
const router = express.Router();
const db = require('../database/init');
const orderEmitter = require('../lib/orderEvents');

// Helper: get localized field from DB row
function L(item, field, lang) {
  if (lang === 'ru') {
    const ruField = field + '_ru';
    if (item[ruField]) return item[ruField];
  }
  return item[field];
}

// GET / — Home page
router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const popular = db.prepare('SELECT m.*, c.name as category_name, c.name_ru as category_name_ru FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id WHERE m.is_popular = 1 AND m.is_available = 1 ORDER BY m.sort_order LIMIT 8').all();
  res.render('pages/home', { categories, popular, L });
});

// GET /menu — Full menu
router.get('/menu', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const items = db.prepare('SELECT m.*, c.name as category_name, c.name_ru as category_name_ru, c.slug as category_slug FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id WHERE m.is_available = 1 ORDER BY c.sort_order, m.sort_order').all();

  // Group items by category
  const menuByCategory = {};
  categories.forEach(cat => {
    menuByCategory[cat.slug] = { category: cat, items: [] };
  });
  items.forEach(item => {
    if (item.category_slug && menuByCategory[item.category_slug]) {
      menuByCategory[item.category_slug].items.push(item);
    }
  });

  res.render('pages/menu', { categories, menuByCategory, L });
});

// GET /menu/:slug — Product detail page
router.get('/menu/:slug', (req, res) => {
  const item = db.prepare(`
    SELECT m.*, c.name as category_name, c.name_ru as category_name_ru, c.slug as category_slug
    FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.slug = ?
  `).get(req.params.slug);

  if (!item) return res.status(404).render('pages/404');

  const related = db.prepare(`
    SELECT m.*, c.name as category_name, c.name_ru as category_name_ru, c.slug as category_slug
    FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.category_id = ? AND m.id != ? AND m.is_available = 1
    ORDER BY RANDOM() LIMIT 4
  `).all(item.category_id, item.id);

  res.render('pages/menu-item', { item, related, L });
});

// GET /cart — Cart page
router.get('/cart', (req, res) => {
  res.render('pages/cart');
});

// GET /checkout — Checkout page
router.get('/checkout', (req, res) => {
  const user = req.session.user || null;
  res.render('pages/checkout', { user });
});

// POST /checkout — Place order
router.post('/checkout', (req, res) => {
  const t = req.t || {};
  const errors = t.errors || {};
  const { name, phone, email, address, delivery_type, payment_method, comment, items } = req.body;

  if (!name || !phone || !items) {
    return res.status(400).json({ success: false, error: errors.requiredFields || 'Fill required fields' });
  }

  let cartItems;
  try {
    cartItems = JSON.parse(items);
  } catch (e) {
    return res.status(400).json({ success: false, error: errors.invalidCart || 'Invalid cart data' });
  }

  if (!cartItems || cartItems.length === 0) {
    return res.status(400).json({ success: false, error: errors.emptyCart || 'Cart is empty' });
  }

  // Calculate total
  let total = 0;
  const resolvedItems = cartItems.map(ci => {
    const menuItem = db.prepare('SELECT id, name, price FROM menu_items WHERE id = ? AND is_available = 1').get(ci.id);
    if (!menuItem) return null;
    const qty = Math.max(1, Math.min(99, parseInt(ci.quantity) || 1));
    total += menuItem.price * qty;
    return { ...menuItem, quantity: qty };
  }).filter(Boolean);

  if (resolvedItems.length === 0) {
    return res.status(400).json({ success: false, error: errors.itemsUnavailable || 'Items unavailable' });
  }

  const userId = req.session.user ? req.session.user.id : null;

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, customer_name, customer_phone, customer_email, delivery_address, delivery_type, payment_method, comment, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)');

  const placeOrder = db.transaction(() => {
    const result = insertOrder.run(userId, name, phone, email || null, address || null, delivery_type || 'delivery', payment_method || 'cash', comment || null, total);
    const orderId = result.lastInsertRowid;

    resolvedItems.forEach(item => {
      insertItem.run(orderId, item.id, item.name, item.price, item.quantity);
    });

    return orderId;
  });

  const orderId = placeOrder();

  // Broadcast to staff SSE clients
  const fullOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (fullOrder) {
    fullOrder.items = resolvedItems;
    orderEmitter.emit('new-order', fullOrder);
  }

  res.json({ success: true, orderId });
});

// GET /order-success/:id
router.get('/order-success/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.render('pages/order-success', { order, items });
});

// API: get menu items (for cart validation)
router.get('/api/menu', (req, res) => {
  const lang = req.lang || 'ro';
  const items = db.prepare('SELECT id, name, name_ru, price, image, weight, is_available FROM menu_items WHERE is_available = 1').all();
  const result = items.map(item => ({
    id: item.id,
    name: lang === 'ru' && item.name_ru ? item.name_ru : item.name,
    price: item.price,
    image: item.image,
    weight: item.weight,
    is_available: item.is_available
  }));
  res.json(result);
});

module.exports = router;
