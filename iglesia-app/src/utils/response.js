/**
 * Respuesta exitosa estándar
 * { ok: true, data: ..., meta: ... }
 */
export function ok(res, data, meta = {}, status = 200) {
  return res.status(status).json({ ok: true, data, ...meta });
}

/**
 * Respuesta de creación
 */
export function created(res, data) {
  return ok(res, data, {}, 201);
}

/**
 * Sin contenido
 */
export function noContent(res) {
  return res.status(204).send();
}
