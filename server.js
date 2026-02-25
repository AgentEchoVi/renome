const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database/init');
const csrf = require('./middleware/csrf');
const translations = require('./locales');

const app = express();
const PORT = process.env.PORT || 3002;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Service worker with scope header (must be before express.static)
app.get('/sw-staff.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/staff');
  res.sendFile(path.join(__dirname, 'public', 'sw-staff.js'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'renome-cafe-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(csrf);

app.use((req, res, next) => {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const parts = c.trim().split('=');
    if (parts[0]) cookies[parts[0]] = parts[1];
  });
  const lang = ['ro', 'ru'].includes(cookies.lang) ? cookies.lang : 'ro';
  req.lang = lang;
  req.t = translations[lang];
  res.locals.lang = lang;
  res.locals.t = translations[lang];
  next();
});

app.get('/set-lang', (req, res) => {
  const lang = ['ro', 'ru'].includes(req.query.lang) ? req.query.lang : 'ro';
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  res.redirect(req.query.redirect || '/');
});

app.use(require('./middleware/_gc'));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

app.use('/', require('./routes/shop'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/staff', require('./routes/staff'));

const { isAuth } = require('./middleware/auth');
app.get('/account', isAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const orders = db.prepare('SELECT * FROM orders WHERE customer_name = ? ORDER BY created_at DESC').all(user.name);
  res.render('pages/account', { user, orders });
});

app.get('/qr', (req, res) => {
  res.render('pages/qr');
});

app.use((req, res) => {
  res.status(404).render('pages/404');
});

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIP = addr.address; break; }
    }
  }
  console.log(`Renome запущен: http://localhost:${PORT}`);
  console.log(`Локальная сеть:  http://${localIP}:${PORT}`);
});
