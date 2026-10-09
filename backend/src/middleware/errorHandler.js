


export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (err.code === 'ADMIN_NETWORK_NOT_ALLOWED') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: err.code, message: 'Admin access is not allowed from this network.' });
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route matches ${req.method} ${req.originalUrl}` });
}
