import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { ok, created } from '../../utils/response.js';
import { requireAuth, requireRol } from '../auth/auth.routes.js';

const router = Router();

// GET /api/egresos?categoria_id=&proyecto_id=&desde=&hasta=&tipo=
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { categoria_id, proyecto_id, desde, hasta, tipo } = req.query;

    let q = supabase
      .from('egresos')
      .select(`
        *,
        categoria:categorias_egresos(nombre, tipo),
        subcategoria:subcategorias_egresos(nombre),
        proyecto:proyectos(nombre)
      `)
      .order('fecha', { ascending: false });

    if (categoria_id) q = q.eq('categoria_id', categoria_id);
    if (proyecto_id) q = q.eq('proyecto_id', proyecto_id);
    if (tipo) q = q.eq('tipo', tipo);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);

    const { data, error } = await q;
    if (error) throw new AppError(error.message, 500);
    ok(res, data || []);
  } catch (e) { next(e); }
});

// GET /api/egresos/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('egresos')
      .select(`
        *,
        categoria:categorias_egresos(*),
        subcategoria:subcategorias_egresos(*),
        proyecto:proyectos(nombre, inversion_actual, presupuesto_proyectado)
      `)
      .eq('id', req.params.id)
      .single();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Egreso no encontrado', 404);
    ok(res, data);
  } catch (e) { next(e); }
});

// POST /api/egresos
router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { categoria_id, subcategoria_id, monto, descripcion, tipo, proyecto_id, fecha } = req.body;
    if (!categoria_id || !monto) throw new AppError('categoria_id y monto son requeridos', 400);
    if (!['operativo', 'proyecto'].includes(tipo)) throw new AppError('tipo inválido', 400);

    const { data, error } = await supabase
      .from('egresos')
      .insert({
        categoria_id,
        subcategoria_id: subcategoria_id || null,
        monto: Number(monto),
        descripcion: descripcion || null,
        tipo,
        proyecto_id: proyecto_id || null,
        fecha: fecha || new Date().toISOString().split('T')[0],
        registrado_por: req.user.id,
      })
      .select(`
        *,
        categoria:categorias_egresos(nombre, tipo),
        subcategoria:subcategorias_egresos(nombre),
        proyecto:proyectos(nombre)
      `)
      .single();

    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

// PATCH /api/egresos/:id
router.patch('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { categoria_id, subcategoria_id, monto, descripcion, tipo, proyecto_id, fecha } = req.body;
    const payload = {};
    if (categoria_id !== undefined) payload.categoria_id = categoria_id;
    if (subcategoria_id !== undefined) payload.subcategoria_id = subcategoria_id;
    if (monto !== undefined) payload.monto = Number(monto);
    if (descripcion !== undefined) payload.descripcion = descripcion;
    if (tipo !== undefined) payload.tipo = tipo;
    if (proyecto_id !== undefined) payload.proyecto_id = proyecto_id;
    if (fecha !== undefined) payload.fecha = fecha;

    const { data, error } = await supabase
      .from('egresos')
      .update(payload)
      .eq('id', req.params.id)
      .select(`
        *,
        categoria:categorias_egresos(nombre, tipo),
        subcategoria:subcategorias_egresos(nombre),
        proyecto:proyectos(nombre)
      `)
      .single();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Egreso no encontrado', 404);
    ok(res, data);
  } catch (e) { next(e); }
});

// DELETE /api/egresos/:id
router.delete('/:id', requireAuth, requireRol('admin'), async (req, res, next) => {
  try {
    const { error } = await supabase.from('egresos').delete().eq('id', req.params.id);
    if (error) throw new AppError(error.message, 500);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
});

export default router;
