import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { ok } from '../../../utils/response.js';

const router = Router();

// GET /api/ujieres — todos los ujieres activos ordenados
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('ujieres')
      .select('id, nombre_completo')
      .eq('estado', 'activo')
      .order('nombre_completo');
    if (error) throw error;
    ok(res, data || []);
  } catch (e) { next(e); }
});

export default router;
