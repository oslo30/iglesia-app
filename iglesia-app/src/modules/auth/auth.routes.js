import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { ok, created } from '../../utils/response.js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Middleware: verificar JWT ─────────────────────────────────
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const token = header.split(' ')[1];
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido o expirado' });
  req.user = user;
  next();
}

// ── Middleware: verificar rol ─────────────────────────────────
export function requireRol(...roles) {
  return async (req, res, next) => {
    try {
      const { data: perfil } = await supabase
        .from('usuarios_sistema')
        .select('rol, activo')
        .eq('user_id', req.user.id)
        .single();

      if (!perfil || !perfil.activo) {
        return res.status(403).json({ error: 'Usuario inactivo o sin perfil' });
      }
      if (roles.length && !roles.includes(perfil.rol)) {
        return res.status(403).json({ error: `Acceso restringido. Rol requerido: ${roles.join(' o ')}` });
      }
      req.perfil = perfil;
      next();
    } catch {
      res.status(403).json({ error: 'Sin permisos' });
    }
  };
}

// ── GET /api/auth/perfil ──────────────────────────────────────
router.get('/perfil', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select('*, miembros(nombre, apellido)')
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      return ok(res, { email: req.user.email, rol: 'portero', nuevo: true });
    }

    ok(res, {
      ...data,
      email: req.user.email,
      nombre: data.miembros
        ? data.miembros.nombre + ' ' + data.miembros.apellido
        : data.nombre_display || req.user.email
    });
  } catch (e) { next(e); }
});

// ── POST /api/auth/usuarios — crear usuario (solo admin) ──────
router.post('/usuarios', requireAuth, requireRol('admin'), async (req, res, next) => {
  try {
    const { email, password, rol, miembro_id, nombre_display } = req.body;
    if (!email || !password || !rol)
      throw new AppError('email, password y rol son requeridos', 400);

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (authErr) throw new AppError(authErr.message, 400);

    const { data, error } = await supabase
      .from('usuarios_sistema')
      .insert({
        user_id:        authData.user.id,
        rol,
        miembro_id:     miembro_id     || null,
        nombre_display: nombre_display || email,
        activo:         true
      })
      .select()
      .single();

    if (error) throw new AppError(error.message, 500);
    created(res, { user_id: authData.user.id, email, rol, ...data });
  } catch (e) { next(e); }
});

// ── GET /api/auth/usuarios — listar (solo admin) ──────────────
router.get('/usuarios', requireAuth, requireRol('admin'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select('*, miembros(nombre, apellido)')
      .order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

// ── PATCH /api/auth/usuarios/:id — cambiar rol/estado ─────────
router.patch('/usuarios/:id', requireAuth, requireRol('admin'), async (req, res, next) => {
  try {
    const { rol, activo } = req.body;
    const payload = {};
    if (rol    !== undefined) payload.rol    = rol;
    if (activo !== undefined) payload.activo = activo;

    const { data, error } = await supabase
      .from('usuarios_sistema')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});


// ── POST /api/auth/registro — registro público (rol portero) ──
router.post('/registro', requireAuth, async (req, res, next) => {
  try {
    const { nombre_display, rol = 'portero' } = req.body;

    // Verificar si ya tiene perfil
    const { data: existe } = await supabase
      .from('usuarios_sistema')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (existe) return ok(res, existe);

    const { data, error } = await supabase
      .from('usuarios_sistema')
      .insert({
        user_id:        req.user.id,
        rol:            'portero', // siempre portero al registrarse
        nombre_display: nombre_display || req.user.email,
        activo:         true
      })
      .select()
      .single();

    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

export default router;
