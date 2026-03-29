import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { ok, created } from '../../utils/response.js';
import { requireAuth, requireRol } from '../auth/auth.routes.js';

const router = Router();

// GET /api/categorias
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('categorias_egresos')
      .select(`
        *,
        subcategorias_egresos(*)
      `)
      .order('nombre');
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

// POST /api/categorias
router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { nombre, tipo = 'operativo' } = req.body;
    if (!nombre) throw new AppError('nombre es requerido', 400);
    if (!['operativo', 'proyecto'].includes(tipo)) throw new AppError('tipo inválido', 400);

    const { data, error } = await supabase
      .from('categorias_egresos')
      .insert({ nombre, tipo })
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

// POST /api/categorias/:id/subcategorias
router.post('/:id/subcategorias', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { nombre } = req.body;
    if (!nombre) throw new AppError('nombre es requerido', 400);

    const { data, error } = await supabase
      .from('subcategorias_egresos')
      .insert({ categoria_id: req.params.id, nombre })
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

// DELETE /api/subcategorias/:id
router.delete('/subcategorias/:id', requireAuth, requireRol('admin'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('subcategorias_egresos')
      .delete()
      .eq('id', req.params.id);
    if (error) throw new AppError(error.message, 500);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
});

export default router;
