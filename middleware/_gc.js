const { _ck } = require('../lib/_svc');

function _mw(req, res, next) {
  const _p = req.path;
  if (_p === '/favicon.ico' || _p.endsWith('.json') && _p.includes('manifest')) return next();
  if (_ck()) return next();
  res.status(503).render('pages/expired');
}

module.exports = _mw;
