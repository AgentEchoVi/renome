const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database/init');
const { isAdmin } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'public', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(isAdmin);

// Dashboard
router.get('/', (req, res) => {
  const itemCount = db.prepare('SELECT COUNT(*) as cnt FROM menu_items').get().cnt;
  const orderCount = db.prepare('SELECT COUNT(*) as cnt FROM orders').get().cnt;
  const todayOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE DATE(created_at) = DATE('now')").get().cnt;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status != 'cancelled'").get().total;
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10').all();
  res.render('admin/dashboard', { stats: { itemCount, orderCount, todayOrders, revenue }, recentOrders });
});

// Menu items list
router.get('/menu', (req, res) => {
  const items = db.prepare('SELECT m.*, c.name as category_name FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id ORDER BY c.sort_order, m.sort_order').all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.render('admin/menu-items', { items, categories });
});

// Add item form
router.get('/menu/add', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.render('admin/menu-edit', { item: null, categories });
});

// Create item
router.post('/menu/add', upload.single('image'), (req, res) => {
  const { name, slug, description, price, old_price, category_id, weight, is_popular, is_new, name_ru, description_ru } = req.body;
  const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  const imagePath = req.file ? '/uploads/' + req.file.filename : null;

  db.prepare(`INSERT INTO menu_items (name, slug, description, price, old_price, category_id, image, weight, is_popular, is_new, name_ru, description_ru) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    name, finalSlug, description || null, parseFloat(price) || 0, old_price ? parseFloat(old_price) : null,
    category_id ? parseInt(category_id) : null, imagePath, weight || null, is_popular ? 1 : 0, is_new ? 1 : 0,
    name_ru || null, description_ru || null
  );
  res.redirect('/admin/menu');
});

// Edit item form
router.get('/menu/edit/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.redirect('/admin/menu');
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.render('admin/menu-edit', { item, categories });
});

// Update item
router.post('/menu/edit/:id', upload.single('image'), (req, res) => {
  const { name, slug, description, price, old_price, category_id, weight, is_popular, is_new, is_available, name_ru, description_ru } = req.body;
  const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
  let imagePath = req.file ? '/uploads/' + req.file.filename : null;
  if (!imagePath) {
    const existing = db.prepare('SELECT image FROM menu_items WHERE id = ?').get(req.params.id);
    imagePath = existing ? existing.image : null;
  }

  db.prepare(`UPDATE menu_items SET name=?, slug=?, description=?, price=?, old_price=?, category_id=?, image=?, weight=?, is_popular=?, is_new=?, is_available=?, name_ru=?, description_ru=? WHERE id=?`).run(
    name, finalSlug, description || null, parseFloat(price) || 0, old_price ? parseFloat(old_price) : null,
    category_id ? parseInt(category_id) : null, imagePath, weight || null,
    is_popular ? 1 : 0, is_new ? 1 : 0, is_available !== undefined ? (is_available ? 1 : 0) : 1,
    name_ru || null, description_ru || null, req.params.id
  );
  res.redirect('/admin/menu');
});

// Delete item
router.post('/menu/delete/:id', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.redirect('/admin/menu');
});

// Users
router.get('/users', (req, res) => {
  const users = db.prepare("SELECT * FROM users WHERE role = 'user' ORDER BY created_at DESC").all();
  res.render('admin/users', { users });
});

// Orders
router.get('/orders', (req, res) => {
  const status = req.query.status || '';
  const orders = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.render('admin/orders', { orders, currentStatus: status });
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.render('admin/order-detail', { order, items });
});

router.post('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'confirmed', 'cooking', 'delivery', 'completed', 'cancelled'];
  if (valid.includes(status)) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  res.redirect('back');
});

module.exports = router;
