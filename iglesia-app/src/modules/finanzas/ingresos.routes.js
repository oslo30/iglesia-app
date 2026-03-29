import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { ok, created } from '../../utils/response.js';
import { requireAuth, requireRol } from '../auth/auth.routes.js';

const router = Router();

// GET /api/ingresos?desde=&hasta=&tipo=
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { desde, hasta, tipo } = req.query;

    let diezmos = [], ofrendas = [];

    // Diezmos
    if (!tipo || tipo === 'diezmo') {
      let q = supabase.from('diezmos').select('*').order('created_at', { ascending: false });
      if (desde) q = q.gte('created_at', desde);
      if (hasta) q = q.lte('created_at', hasta);
      const { data, error } = await q;
      if (error) throw new AppError(error.message, 500);
      diezmos = (data || []).map(d => ({ ...d, tipo: 'Diezmo' }));
    }

    // Ofrendas
    if (!tipo || tipo === 'ofrenda') {
      let q = supabase.from('ofrendas').select('*').order('created_at', { ascending: false });
      if (desde) q = q.gte('created_at', desde);
      if (hasta) q = q.lte('created_at', hasta);
      const { data, error } = await q;
      if (error) throw new AppError(error.message, 500);
      ofrendas = (data || []).map(o => ({ ...o, tipo: 'Ofrenda' }));
    }

    const combined = [...diezmos, ...ofrendas].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    ok(res, combined);
  } catch (e) { next(e); }
});

// POST /api/ingresos/diezmos
router.post('/diezmos', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { miembro_id, monto, mes, ano, metodo } = req.body;
    if (!monto || !metodo) throw new AppError('monto y metodo son requeridos', 400);

    const { data, error } = await supabase
      .from('diezmos')
      .insert({
        miembro_id: miembro_id || null,
        monto: Number(monto),
        mes,
        ano: ano || new Date().getFullYear(),
        metodo,
      })
      .select()
      .single();

    if (error) throw new AppError(error.message, 500);
    created(res, { ...data, tipo: 'Diezmo' });
  } catch (e) { next(e); }
});

// POST /api/ingresos/ofrendas
router.post('/ofrendas', requireAuth, requireRol('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { monto, metodo, descripcion } = req.body;
    if (!monto || !metodo) throw new AppError('monto y metodo son requeridos', 400);

    const { data, error } = await supabase
      .from('ofrendas')
      .insert({
        monto: Number(monto),
        metodo,
        descripcion: descripcion || null,
      })
      .select()
      .single();

    if (error) throw new AppError(error.message, 500);
    created(res, { ...data, tipo: 'Ofrenda' });
  } catch (e) { next(e); }
});

export default router;
