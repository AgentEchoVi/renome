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
      // Auto-redirect back instead of showing error
      const backUrl = req.get('Referer') || req.originalUrl || '/';
      return res.status(403).send(
        '<html><head><meta http-equiv="refresh" content="0;url=' + backUrl + '"></head>' +
        '<body><p>Обновление... / Reloading...</p></body></html>'
      );
    }
  }
  next();
}

module.exports = csrfProtection;
