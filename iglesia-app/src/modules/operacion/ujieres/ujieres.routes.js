import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { ok } from '../../../utils/response.js';

const router = Router();

// GET /api/ujieres — todos los ujieres activos ordenados
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('ujieres')
      .select('id, nombre, apellido')
      .order('nombre');
    if (error) throw error;
    const ujieres = (data || []).map(u => ({
      id: u.id,
      nombre_completo: [u.nombre, u.apellido].filter(Boolean).join(' ')
    }));
    ok(res, ujieres);
  } catch (e) { next(e); }
});

export default router;
