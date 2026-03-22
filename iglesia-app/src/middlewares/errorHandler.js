// ── errorHandler.js ──────────────────────────────────────────
export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  const status  = err.status  || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(status).json({ error: message });
}

// ── AppError: lanza errores con código HTTP ───────────────────
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
