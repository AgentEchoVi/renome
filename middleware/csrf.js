const crypto = require('crypto');

function csrfProtection(req, res, next) {
  if (!req.session._csrf) {
    req.session._csrf = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session._csrf;

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/json')) return next();

    const token = req.body._csrf || req.query._csrf;
    if (!token || token !== req.session._csrf) {
      const msg = (req.t && req.t.errors) ? req.t.errors.csrf : 'Security error (CSRF). Reload the page.';
      return res.status(403).send(msg);
    }
  }
  next();
}

module.exports = csrfProtection;
