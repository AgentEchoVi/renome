function isAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/auth/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login?returnTo=' + encodeURIComponent(req.originalUrl));
  }
  const msg = (req.t && req.t.errors) ? req.t.errors.forbidden : 'Access denied';
  res.status(403).send(msg);
}

function isStaff(req, res, next) {
  if (req.session && req.session.user &&
      (req.session.user.role === 'staff' || req.session.user.role === 'admin')) {
    return next();
  }
  res.redirect('/staff/login');
}

module.exports = { isAuth, isAdmin, isStaff };
