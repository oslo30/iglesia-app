import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok } from '../../../utils/response.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────
async function porServicio(servicioId) {
  const { data } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('servicio_id', servicioId)
    .maybeSingle();
  return data;
}

// Total de todas las categorías
function calcTotal(feligreses, visitantes) {
  const f = feligreses ?? {};
  const v = visitantes ?? {};
  return (
    (f.caballeros || 0) + (f.damas || 0) +
    (f.adol_varones || 0) + (f.adol_damas || 0) +
    (f.ninos_varones || 0) + (f.ninos_damas || 0) +
    (v.vm || 0) + (v.vf || 0) +
    (v.vm_adolescentes || 0) + (v.vf_adolescentes || 0) +
    (v.vm_ninos || 0) + (v.vf_ninas || 0)
  );
}

async function registrar({ servicioId, feligreses, visitantes, notas, ujierId }) {
  const { data: svc } = await supabase
    .from('servicios').select('id, estado').eq('id', servicioId).single();
  if (!svc)                    throw new AppError('Servicio no encontrado', 404);
  if (svc.estado === 'cancelado') throw new AppError('Servicio cancelado', 400);

  const f = feligreses ?? {};
  const v = visitantes ?? {};
  const total = calcTotal(feligreses, visitantes);

  const { data, error } = await supabase
    .from('registros_asistencia')
    .upsert({
      servicio_id:       servicioId,
      // Feligreses
      caballeros:      f.caballeros    ?? 0,
      damas:           f.damas         ?? 0,
      adol_varones:    f.adol_varones  ?? 0,
      adol_damas:      f.adol_damas    ?? 0,
      ninos_varones:   f.ninos_varones ?? 0,
      ninos_damas:     f.ninos_damas   ?? 0,
      // Visitantes
      vm:              v.vm            ?? 0,
      vf:              v.vf            ?? 0,
      vm_adolescentes: v.vm_adolescentes ?? 0,
      vf_adolescentes: v.vf_adolescentes ?? 0,
      vm_ninos:        v.vm_ninos      ?? 0,
      vf_ninas:        v.vf_ninas      ?? 0,
      // Meta
      total,
      notas:           notas    ?? null,
      ujier_id:        ujierId ?? null,
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
        id, servicio_id,
        caballeros, damas, adol_varones, adol_damas, ninos_varones, ninos_damas,
        vm, vf, vm_adolescentes, vf_adolescentes, vm_ninos, vf_ninas,
        total, notas, created_at, ujier_id,
        servicios ( id, nombre, fecha_hora, tipo, caracter )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (desde) query = query.gte('created_at', desde + 'T00:00:00');
    if (hasta) query = query.lte('created_at', hasta + 'T23:59:59');

    const { data, error, count } = await query;
    if (error) throw new AppError(error.message, 500);
    ok(res, data || [], { total: count });
  } catch (e) { next(e); }
});

// GET /api/asistencia/estadisticas
router.get('/estadisticas', async (req, res, next) => {
  try {
    const { data: ultimo } = await supabase
      .from('registros_asistencia')
      .select('*, servicios(nombre, fecha_hora)')
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
      ultimoServicio:   ultimo || null,
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
    const { feligreses, visitantes, notas, ujier_id } = req.body;
    const data = await registrar({
      servicioId: req.params.servicioId,
      feligreses: feligreses ?? {},
      visitantes: visitantes ?? {},
      notas, ujierId: ujier_id
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
