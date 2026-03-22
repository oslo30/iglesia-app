import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok } from '../../../utils/response.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────
async function porServicio(servicioId) {
  const { data } = await supabase
    .from('registros_asistencia')
    .select('*, miembros(id, nombre, apellido)')
    .eq('servicio_id', servicioId)
    .maybeSingle();
  return data;
}

async function registrar({ servicioId, adultos, ninos, amigos, notas, registradoPor }) {
  const { data: svc } = await supabase
    .from('servicios').select('id, estado').eq('id', servicioId).single();
  if (!svc)                    throw new AppError('Servicio no encontrado', 404);
  if (svc.estado === 'cancelado') throw new AppError('Servicio cancelado', 400);

  const { data, error } = await supabase
    .from('registros_asistencia')
    .upsert({
      servicio_id:    servicioId,
      adultos:        adultos  ?? 0,
      ninos:          ninos    ?? 0,
      amigos:         amigos   ?? 0,
      notas:          notas    ?? null,
      registrado_por: registradoPor || null,
    }, { onConflict: 'servicio_id' })
    .select()
    .single();

  if (error) throw new AppError(error.message, 500);
  return data;
}

// ── Rutas ─────────────────────────────────────────────────────

// GET /api/asistencia/historial
router.get('/historial', async (req, res, next) => {
  try {
    const { desde, hasta, limit = 30, offset = 0 } = req.query;

    let query = supabase
      .from('registros_asistencia')
      .select(`
        id, servicio_id, adultos, ninos, amigos, total, notas, created_at,
        registrado_por,
        servicios ( id, nombre, fecha_hora, tipo, caracter ),
        miembros  ( id, nombre, apellido )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (desde) query = query.gte('created_at', desde + 'T00:00:00');
    if (hasta) query = query.lte('created_at', hasta + 'T23:59:59');

    const { data, error, count } = await query;
    if (error) throw new AppError(error.message, 500);

    // Normalizar: agregar registrado_por_nombre desde el JOIN
    const registros = (data || []).map(r => ({
      ...r,
      registrado_por_nombre: r.miembros
        ? r.miembros.nombre + ' ' + r.miembros.apellido
        : null
    }));

    ok(res, registros, { total: count });
  } catch (e) { next(e); }
});

// GET /api/asistencia/estadisticas
router.get('/estadisticas', async (req, res, next) => {
  try {
    const { data: ultimo } = await supabase
      .from('registros_asistencia')
      .select('*, servicios(nombre, fecha_hora), miembros(nombre, apellido)')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    const hace4 = new Date();
    hace4.setDate(hace4.getDate() - 28);
    const { data: recientes } = await supabase
      .from('registros_asistencia')
      .select('total')
      .gte('created_at', hace4.toISOString());

    const promedio = recientes?.length > 0
      ? Math.round(recientes.reduce((s, r) => s + (r.total || 0), 0) / recientes.length)
      : 0;

    ok(res, {
      ultimoServicio:   ultimo ? {
        ...ultimo,
        registrado_por_nombre: ultimo.miembros
          ? ultimo.miembros.nombre + ' ' + ultimo.miembros.apellido
          : null
      } : null,
      promedio4semanas: promedio,
      tendencia: (ultimo?.total || 0) > promedio ? 'subiendo' : 'bajando'
    });
  } catch (e) { next(e); }
});

// GET /api/asistencia/:servicioId
router.get('/:servicioId', async (req, res, next) => {
  try { ok(res, await porServicio(req.params.servicioId)); }
  catch (e) { next(e); }
});

// POST /api/asistencia/:servicioId  (crear o actualizar)
router.post('/:servicioId', async (req, res, next) => {
  try {
    const { adultos = 0, ninos = 0, amigos = 0, notas, registradoPor } = req.body;
    const data = await registrar({
      servicioId: req.params.servicioId,
      adultos, ninos, amigos, notas, registradoPor
    });
    ok(res, data);
  } catch (e) { next(e); }
});


// DELETE /api/asistencia/:servicioId — eliminar registro
router.delete('/:servicioId', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('registros_asistencia')
      .delete()
      .eq('servicio_id', req.params.servicioId);
    if (error) throw new AppError(error.message, 500);
    ok(res, { mensaje: 'Registro eliminado' });
  } catch (e) { next(e); }
});

export default router;
