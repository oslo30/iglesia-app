import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok, created } from '../../../utils/response.js';

const router = Router();

// GET /api/miembros?limit=100&tipo=miembro
router.get('/', async (req, res, next) => {
  try {
    const { limit = 100, offset = 0, tipo, estado } = req.query;
    let query = supabase
      .from('miembros')
      .select('id, nombre, apellido, tipo, estado, telefono, email', { count: 'exact' })
      .order('apellido')
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (tipo)   query = query.eq('tipo', tipo);
    if (estado) query = query.eq('estado', estado);
    else        query = query.eq('estado', 'activo');

    const { data, error, count } = await query;
    if (error) throw new AppError(error.message, 500);
    ok(res, data, { total: count });
  } catch (e) { next(e); }
});

// GET /api/miembros/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('miembros')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw new AppError('Miembro no encontrado', 404);
    ok(res, data);
  } catch (e) { next(e); }
});

// POST /api/miembros
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('miembros')
      .insert(req.body)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

// PATCH /api/miembros/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('miembros')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

// DELETE /api/miembros/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('miembros')
      .update({ estado: 'inactivo', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw new AppError(error.message, 500);
    ok(res, { mensaje: 'Miembro desactivado' });
  } catch (e) { next(e); }
});

export default router;
