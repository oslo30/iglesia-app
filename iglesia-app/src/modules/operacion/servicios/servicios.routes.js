import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok, created } from '../../../utils/response.js';

const router = Router();

// columnas asistencia (con fallback si no existen las nuevas)
const COLS_NEW = 'caballeros, damas, adol_varones, adol_damas, ninos_varones, ninos_damas, vm, vf, vm_adolescentes, vf_adolescentes, vm_ninos, vf_ninas, total, notas, ujier_id';
const COLS_FALLBACK = 'caballeros, damas, adol_varones, adol_damas, ninos_varones, ninos_damas, total, notas, ujier_id';

async function selectCols(supabase) {
  try {
    const { error } = await supabase.from('registros_asistencia').select('vm').limit(1);
    if (!error) return COLS_NEW;
  } catch {}
  return COLS_FALLBACK;
}

async function porId(id) {
  const cols = await selectCols(supabase);
  const { data, error } = await supabase
    .from('servicios')
    .select(`*, registros_asistencia(${cols})`)
    .eq('id', id)
    .single();
  if (error) throw new AppError('Servicio no encontrado', 404);
  return data;
}

router.get('/hoy', async (req, res, next) => {
  try {
    const cols = await selectCols(supabase);
    // Mostrar servicios de los últimos 7 días basados en la fecha del frontend
    const fechaHoy = new Date(req.query.fecha + 'T12:00:00Z'); // mediodía para evitar problemas de zona
    const hace7dias = new Date(fechaHoy);
    hace7dias.setDate(hace7dias.getDate() - 7);
    const desde = hace7dias.toISOString();
    const { data, error } = await supabase
      .from('servicios')
      .select(`*, registros_asistencia(${cols})`)
      .gte('fecha_hora', desde)
      .order('fecha_hora', { ascending: false });
    if (error) throw new AppError(error.message, 500);
    ok(res, data || []);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const cols = await selectCols(supabase);
    const { estado, fecha, limit = 20, offset = 0 } = req.query;
    let query = supabase
      .from('servicios')
      .select(`*, registros_asistencia(${cols})`, { count: 'exact' })
      .order('fecha_hora', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (estado) query = query.eq('estado', estado);
    if (fecha)  query = query
      .gte('fecha_hora', fecha + 'T00:00:00')
      .lte('fecha_hora', fecha + 'T23:59:59');
    const { data, error, count } = await query;
    if (error) throw new AppError(error.message, 500);
    ok(res, data || [], { total: count });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { ok(res, await porId(req.params.id)); }
  catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    // Columnas válidas — ignorar campos que no existen en la tabla
    const { nombre, tipo, estado, fecha_hora, aforo_max, caracter, descripcion } = req.body;
    const payload = {
      nombre:     nombre    || 'Servicio',
      tipo:       tipo      || 'otro',
      estado:     estado    || 'programado',
      fecha_hora: fecha_hora,
      aforo_max:  aforo_max || 300,
    };
    // caracter y descripcion solo si la columna existe (agregada en SQL)
    if (caracter)    payload.caracter    = caracter;
    if (descripcion) payload.descripcion = descripcion;

    const { data, error } = await supabase
      .from('servicios')
      .insert(payload)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { nombre, tipo, estado, fecha_hora, aforo_max, caracter, descripcion } = req.body;
    const payload = { updated_at: new Date().toISOString() };
    if (nombre)     payload.nombre     = nombre;
    if (tipo)       payload.tipo       = tipo;
    if (estado)     payload.estado     = estado;
    if (fecha_hora) payload.fecha_hora = fecha_hora;
    if (aforo_max)  payload.aforo_max  = aforo_max;
    if (caracter !== undefined) payload.caracter    = caracter;
    if (descripcion !== undefined) payload.descripcion = descripcion;

    const { data, error } = await supabase
      .from('servicios')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

router.patch('/:id/estado', async (req, res, next) => {
  try {
    const TRANS = {
      programado: ['en_curso', 'cancelado'],
      en_curso:   ['finalizado', 'cancelado'],
      finalizado: [], cancelado: []
    };
    const actual = await porId(req.params.id);
    if (!TRANS[actual.estado]?.includes(req.body.estado))
      throw new AppError('Transición de estado no permitida', 400);
    const { data, error } = await supabase
      .from('servicios')
      .update({ estado: req.body.estado, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { modo } = req.query;
    if (modo !== 'solo') {
      await supabase.from('registros_asistencia').delete().eq('servicio_id', req.params.id);
    }
    const { error } = await supabase.from('servicios').delete().eq('id', req.params.id);
    if (error) throw new AppError(error.message, 500);
    ok(res, { mensaje: 'Servicio eliminado' });
  } catch (e) { next(e); }
});

export default router;
