import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok } from '../../../utils/response.js';

const router = Router();

// ── Service ───────────────────────────────────────────────────
async function mapaServicio(servicioId) {
  const { data: asientos, error } = await supabase
    .from('asientos')
    .select('id, codigo, fila, numero, zona')
    .eq('activo', true)
    .order('fila')
    .order('numero');

  if (error) throw new AppError(error.message, 500);

  const { data: ocupados } = await supabase
    .from('ocupacion_asientos')
    .select('asiento_id, estado')
    .eq('servicio_id', servicioId);

  const ocupadosMap = {};
  (ocupados || []).forEach(o => { ocupadosMap[o.asiento_id] = o.estado; });

  const mapa = asientos.map(a => ({
    ...a,
    estado: ocupadosMap[a.id] ?? 'libre'
  }));

  return {
    asientos:    mapa,
    disponibles: mapa.filter(a => a.estado === 'libre').length,
    ocupados:    mapa.filter(a => a.estado === 'ocupado').length,
    total:       mapa.length
  };
}

async function cambiarEstado(servicioId, asientoId, estado) {
  const { data, error } = await supabase
    .from('ocupacion_asientos')
    .upsert(
      { servicio_id: servicioId, asiento_id: asientoId, estado,
        updated_at: new Date().toISOString() },
      { onConflict: 'servicio_id,asiento_id' }
    )
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function resetServicio(servicioId) {
  const { error } = await supabase
    .from('ocupacion_asientos')
    .delete()
    .eq('servicio_id', servicioId);
  if (error) throw new AppError(error.message, 500);
  return { mensaje: 'Asientos liberados correctamente' };
}

// ── Rutas ─────────────────────────────────────────────────────
router.get('/:servicioId', async (req, res, next) => {
  try {
    const result = await mapaServicio(req.params.servicioId);
    ok(res, result.asientos, {
      disponibles: result.disponibles,
      ocupados:    result.ocupados,
      total:       result.total
    });
  } catch (e) { next(e); }
});

router.patch('/:servicioId/:asientoId', async (req, res, next) => {
  try {
    const { servicioId, asientoId } = req.params;
    const { estado } = req.body;
    if (!['libre', 'ocupado', 'reservado'].includes(estado))
      return res.status(400).json({ error: 'Estado inválido' });
    ok(res, await cambiarEstado(servicioId, asientoId, estado));
  } catch (e) { next(e); }
});

router.post('/:servicioId/reset', async (req, res, next) => {
  try { ok(res, await resetServicio(req.params.servicioId)); }
  catch (e) { next(e); }
});

export default router;
