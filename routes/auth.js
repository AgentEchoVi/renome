const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/init');

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/account');
  res.render('pages/login', { error: req.query.error || null, returnTo: req.query.returnTo || '' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const returnTo = req.body.returnTo || '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || user.password !== hashPassword(password)) {
    return res.redirect('/auth/login?error=invalid' + (returnTo ? '&returnTo=' + encodeURIComponent(returnTo) : ''));
  }

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect(returnTo || '/account');
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/account');
  res.render('pages/register', { error: req.query.error || null });
});

router.post('/register', (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.redirect('/auth/register?error=validation');
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.redirect('/auth/register?error=exists');
  }

  db.prepare('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)').run(
    name, email, phone || null, hashPassword(password)
  );

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect('/account');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
