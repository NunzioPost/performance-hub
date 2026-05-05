export function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Errore interno del server',
    code: err.code || 'INTERNAL_ERROR'
  });
}
