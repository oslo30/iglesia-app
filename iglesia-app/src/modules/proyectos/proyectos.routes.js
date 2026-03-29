import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { ok, created } from '../../utils/response.js';
import { requireAuth, requireRol } from '../auth/auth.routes.js';

const router = Router();

const VALID_TRANSITIONS = {
  por_iniciar: ['en_progreso'],
  en_progreso: ['en_pausa', 'completado'],
  en_pausa: ['en_progreso', 'completado'],
  completado: [],
};

// GET /api/proyectos?estado=
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { estado } = req.query;
    let q = supabase
      .from('proyectos')
      .select(`
        *,
        egresos_linked:egresos(id, monto, fecha, categoria:categorias_egresos(nombre))
      `)
      .order('updated_at', { ascending: false });
    if (estado) q = q.eq('estado', estado);
    const { data, error } = await q;
    if (error) throw new AppError(error.message, 500);
    ok(res, data || []);
  } catch (e) { next(e); }
});

// GET /api/proyectos/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('proyectos')
      .select(`
        *,
        egresos_linked:egresos(
          id, monto, fecha, descripcion,
          categoria:categorias_egresos(nombre),
          subcategoria:subcategorias_egresos(nombre)
        )
      `)
      .eq('id', req.params.id)
      .single();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Proyecto no encontrado', 404);
    ok(res, data);
  } catch (e) { next(e); }
});

// GET /api/proyectos/:id/estadisticas
router.get('/:id/estadisticas', requireAuth, async (req, res, next) => {
  try {
    const { data: proyecto, error: pErr } = await supabase
      .from('proyectos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (pErr || !proyecto) throw new AppError('Proyecto no encontrado', 404);

    const { data: egresos } = await supabase
      .from('egresos')
      .select('monto')
      .eq('proyecto_id', req.params.id);

    const inversion_actual = (egresos || []).reduce((s, e) => s + Number(e.monto || 0), 0);
    const quanto_falta = proyecto.presupuesto_proyectado
      ? Number(proyecto.presupuesto_proyectado) - inversion_actual
      : null;
    const porcentaje_real = proyecto.presupuesto_proyectado
      ? Math.min(100, (inversion_actual / Number(proyecto.presupuesto_proyectado)) * 100).toFixed(1)
      : null;

    ok(res, {
      ...proyecto,
      inversion_actual,
      quanto_falta,
      porcentaje_real: Number(porcentaje_real),
      total_egresos: (egresos || []).length,
    });
  } catch (e) { next(e); }
});

// POST /api/proyectos
router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const {
      nombre, descripcion, estado = 'por_iniciar', meta_porcentaje = 0,
      fecha_inicio, fecha_fin_estimada, presupuesto_proyectado, cotizacion_url, notas,
    } = req.body;
    if (!nombre) throw new AppError('nombre es requerido', 400);

    const { data, error } = await supabase
      .from('proyectos')
      .insert({
        nombre, descripcion: descripcion || null, estado,
        meta_porcentaje: Number(meta_porcentaje) || 0,
        fecha_inicio: fecha_inicio || null,
        fecha_fin_estimada: fecha_fin_estimada || null,
        presupuesto_proyectado: presupuesto_proyectado ? Number(presupuesto_proyectado) : null,
        cotizacion_url: cotizacion_url || null,
        notas: notas || null,
      })
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

// PATCH /api/proyectos/:id
router.patch('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const {
      nombre, descripcion, estado, meta_porcentaje,
      fecha_inicio, fecha_fin_estimada, fecha_fin_real,
      presupuesto_proyectado, cotizacion_url, notas,
    } = req.body;
    const payload = {};
    if (nombre !== undefined) payload.nombre = nombre;
    if (descripcion !== undefined) payload.descripcion = descripcion;
    if (estado !== undefined) {
      const from = (await supabase.from('proyectos').select('estado').eq('id', req.params.id).single())?.data?.estado;
      if (from && !VALID_TRANSITIONS[from]?.includes(estado)) {
        throw new AppError(`Transición de estado inválida: ${from} → ${estado}`, 400);
      }
      payload.estado = estado;
    }
    if (meta_porcentaje !== undefined) payload.meta_porcentaje = Number(meta_porcentaje);
    if (fecha_inicio !== undefined) payload.fecha_inicio = fecha_inicio;
    if (fecha_fin_estimada !== undefined) payload.fecha_fin_estimada = fecha_fin_estimada;
    if (fecha_fin_real !== undefined) payload.fecha_fin_real = fecha_fin_real;
    if (presupuesto_proyectado !== undefined) {
      payload.presupuesto_proyectado = presupuesto_proyectado ? Number(presupuesto_proyectado) : null;
    }
    if (cotizacion_url !== undefined) payload.cotizacion_url = cotizacion_url;
    if (notas !== undefined) payload.notas = notas;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('proyectos')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

// PATCH /api/proyectos/:id/estado
router.patch('/:id/estado', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!estado) throw new AppError('estado es requerido', 400);

    const { data: current } = await supabase
      .from('proyectos')
      .select('estado')
      .eq('id', req.params.id)
      .single();
    if (!current) throw new AppError('Proyecto no encontrado', 404);
    if (!VALID_TRANSITIONS[current.estado]?.includes(estado)) {
      throw new AppError(`Transición inválida: ${current.estado} → ${estado}`, 400);
    }

    const payload = { estado, updated_at: new Date().toISOString() };
    if (estado === 'completado' && !current.fecha_fin_real) {
      payload.fecha_fin_real = new Date().toISOString().split('T')[0];
    }

    const { data, error } = await supabase
      .from('proyectos')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

// DELETE /api/proyectos/:id
router.delete('/:id', requireAuth, requireRol('admin'), async (req, res, next) => {
  try {
    const { error } = await supabase.from('proyectos').delete().eq('id', req.params.id);
    if (error) throw new AppError(error.message, 500);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
});

export default router;
