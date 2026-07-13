// Central error responder. Express 5 auto-forwards thrown/rejected errors from async
// route handlers here, so controllers can just `throw new ApiError(...)` (or even a
// plain Error) without any try/catch or asyncHandler wrapper boilerplate.
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route matches ${req.method} ${req.originalUrl}` });
}
