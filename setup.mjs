import { mkdirSync, writeFileSync } from 'fs';

// ── Crear carpetas ────────────────────────────────────────────
const dirs = [
  'src/config',
  'src/middlewares',
  'src/utils',
  'src/modules/operacion/servicios',
  'src/modules/operacion/asistencia',
  'src/modules/operacion/asientos',
  'src/modules/operacion/vehiculos',
  'frontend',
];
dirs.forEach(d => mkdirSync(d, { recursive: true }));
console.log('✅ Carpetas creadas');

// ── Archivos ──────────────────────────────────────────────────
const files = {};

// ── src/config/supabase.js
files['src/config/supabase.js'] = `
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  Variables SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas en .env');
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_KEY || 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } }
);
`.trimStart();

// ── src/middlewares/errorHandler.js
files['src/middlewares/errorHandler.js'] = `
export function errorHandler(err, req, res, _next) {
  console.error('[ERROR]', req.method, req.path, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
}

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
`.trimStart();

// ── src/utils/response.js
files['src/utils/response.js'] = `
export const ok      = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ ok: true, data, ...meta });

export const created = (res, data) => ok(res, data, {}, 201);
export const noContent = (res) => res.status(204).send();
`.trimStart();

// ── src/modules/operacion/servicios/servicios.routes.js
files['src/modules/operacion/servicios/servicios.routes.js'] = `
import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok, created } from '../../../utils/response.js';

const router = Router();

async function listar({ estado, fecha, limit = 20, offset = 0 }) {
  let query = supabase
    .from('servicios')
    .select('*, registros_asistencia(adultos, ninos, amigos, total)', { count: 'exact' })
    .order('fecha_hora', { ascending: false })
    .range(offset, offset + limit - 1);

  if (estado) query = query.eq('estado', estado);
  if (fecha)  query = query
    .gte('fecha_hora', fecha + 'T00:00:00')
    .lte('fecha_hora', fecha + 'T23:59:59');

  const { data, error, count } = await query;
  if (error) throw new AppError(error.message, 500);
  return { servicios: data, total: count };
}

async function porId(id) {
  const { data, error } = await supabase
    .from('servicios')
    .select('*, registros_asistencia(*)')
    .eq('id', id)
    .single();
  if (error) throw new AppError('Servicio no encontrado', 404);
  return data;
}

router.get('/hoy', async (req, res, next) => {
  try {
    const fecha = new Date().toISOString().split('T')[0];
    const result = await listar({ fecha, limit: 10 });
    ok(res, result.servicios);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { estado, fecha, limit, offset } = req.query;
    const result = await listar({ estado, fecha,
      limit: Number(limit) || 20, offset: Number(offset) || 0 });
    ok(res, result.servicios, { total: result.total });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { ok(res, await porId(req.params.id)); } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('servicios').insert(req.body).select().single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

router.patch('/:id/estado', async (req, res, next) => {
  try {
    const TRANS = {
      programado: ['en_curso','cancelado'],
      en_curso:   ['finalizado','cancelado'],
      finalizado: [], cancelado: []
    };
    const actual = await porId(req.params.id);
    if (!TRANS[actual.estado]?.includes(req.body.estado))
      throw new AppError('Transición de estado no permitida', 400);
    const { data, error } = await supabase
      .from('servicios')
      .update({ estado: req.body.estado, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

export default router;
`.trimStart();

// ── src/modules/operacion/asistencia/asistencia.routes.js
files['src/modules/operacion/asistencia/asistencia.routes.js'] = `
import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok } from '../../../utils/response.js';

const router = Router();

router.get('/historial', async (req, res, next) => {
  try {
    const { desde, hasta, limit, offset } = req.query;
    let query = supabase
      .from('registros_asistencia')
      .select('*, servicios(nombre, fecha_hora, tipo)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset)||0, (Number(offset)||0) + (Number(limit)||30) - 1);
    if (desde) query = query.gte('created_at', desde + 'T00:00:00');
    if (hasta) query = query.lte('created_at', hasta + 'T23:59:59');
    const { data, error, count } = await query;
    if (error) throw new AppError(error.message, 500);
    ok(res, data, { total: count });
  } catch (e) { next(e); }
});

router.get('/estadisticas', async (req, res, next) => {
  try {
    const { data: ultimo } = await supabase
      .from('registros_asistencia')
      .select('*, servicios(nombre, fecha_hora)')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    const hace4 = new Date();
    hace4.setDate(hace4.getDate() - 28);
    const { data: recientes } = await supabase
      .from('registros_asistencia')
      .select('total')
      .gte('created_at', hace4.toISOString());

    const promedio = recientes?.length > 0
      ? Math.round(recientes.reduce((s, r) => s + (r.total || 0), 0) / recientes.length)
      : 0;
    ok(res, { ultimoServicio: ultimo, promedio4semanas: promedio,
      tendencia: (ultimo?.total || 0) > promedio ? 'subiendo' : 'bajando' });
  } catch (e) { next(e); }
});

router.get('/:servicioId', async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('registros_asistencia')
      .select('*')
      .eq('servicio_id', req.params.servicioId)
      .maybeSingle();
    ok(res, data);
  } catch (e) { next(e); }
});

router.post('/:servicioId', async (req, res, next) => {
  try {
    const { adultos = 0, ninos = 0, amigos = 0, notas } = req.body;
    const { data: svc } = await supabase
      .from('servicios').select('estado').eq('id', req.params.servicioId).single();
    if (!svc) throw new AppError('Servicio no encontrado', 404);
    if (svc.estado === 'cancelado') throw new AppError('Servicio cancelado', 400);

    const { data, error } = await supabase
      .from('registros_asistencia')
      .upsert({ servicio_id: req.params.servicioId, adultos, ninos, amigos, notas: notas || null },
        { onConflict: 'servicio_id' })
      .select().single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

export default router;
`.trimStart();

// ── src/modules/operacion/asientos/asientos.routes.js
files['src/modules/operacion/asientos/asientos.routes.js'] = `
import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok } from '../../../utils/response.js';

const router = Router();

router.get('/:servicioId', async (req, res, next) => {
  try {
    const { data: asientos, error } = await supabase
      .from('asientos').select('id, codigo, fila, numero, zona')
      .eq('activo', true).order('fila').order('numero');
    if (error) throw new AppError(error.message, 500);

    const { data: ocupados } = await supabase
      .from('ocupacion_asientos').select('asiento_id, estado')
      .eq('servicio_id', req.params.servicioId);

    const map = {};
    (ocupados || []).forEach(o => { map[o.asiento_id] = o.estado; });
    const mapa = asientos.map(a => ({ ...a, estado: map[a.id] ?? 'libre' }));

    ok(res, mapa, {
      disponibles: mapa.filter(a => a.estado === 'libre').length,
      ocupados:    mapa.filter(a => a.estado === 'ocupado').length,
      total:       mapa.length
    });
  } catch (e) { next(e); }
});

router.patch('/:servicioId/:asientoId', async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!['libre','ocupado','reservado'].includes(estado))
      return res.status(400).json({ error: 'Estado inválido' });
    const { data, error } = await supabase
      .from('ocupacion_asientos')
      .upsert({ servicio_id: req.params.servicioId, asiento_id: req.params.asientoId,
        estado, updated_at: new Date().toISOString() },
        { onConflict: 'servicio_id,asiento_id' })
      .select().single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

router.post('/:servicioId/reset', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('ocupacion_asientos').delete().eq('servicio_id', req.params.servicioId);
    if (error) throw new AppError(error.message, 500);
    ok(res, { mensaje: 'Asientos liberados correctamente' });
  } catch (e) { next(e); }
});

export default router;
`.trimStart();

// ── src/modules/operacion/vehiculos/vehiculos.routes.js
files['src/modules/operacion/vehiculos/vehiculos.routes.js'] = `
import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok, created } from '../../../utils/response.js';

const router = Router();

router.get('/buscar', async (req, res, next) => {
  try {
    const { placa } = req.query;
    if (!placa) return res.status(400).json({ error: 'Placa requerida' });
    const { data } = await supabase
      .from('vehiculos')
      .select('*, miembros(id, nombre, apellido, telefono)')
      .ilike('placa', placa.trim().toUpperCase())
      .eq('activo', true).maybeSingle();
    ok(res, data);
  } catch (e) { next(e); }
});

router.get('/activos', async (req, res, next) => {
  try {
    let query = supabase
      .from('registro_vehiculos')
      .select('id, hora_entrada, zona_parqueo, vehiculos(placa, tipo, color, marca, miembros(nombre, apellido, telefono))')
      .is('hora_salida', null).order('hora_entrada', { ascending: true });
    if (req.query.servicioId) query = query.eq('servicio_id', req.query.servicioId);
    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

router.get('/servicio/:servicioId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('registro_vehiculos')
      .select('id, hora_entrada, hora_salida, zona_parqueo, vehiculos(placa, tipo, color, marca, miembros(nombre, apellido))')
      .eq('servicio_id', req.params.servicioId)
      .order('hora_entrada', { ascending: false });
    if (error) throw new AppError(error.message, 500);
    ok(res, data, {
      dentro:   data.filter(r => !r.hora_salida).length,
      salieron: data.filter(r =>  r.hora_salida).length,
      total:    data.length
    });
  } catch (e) { next(e); }
});

router.post('/entrada', async (req, res, next) => {
  try {
    const { placa, tipo, color, marca, servicioId, zonaParqueo, vigilanteId } = req.body;
    if (!placa || !servicioId) throw new AppError('placa y servicioId son requeridos', 400);

    let { data: vehiculo } = await supabase
      .from('vehiculos').select('*').ilike('placa', placa.toUpperCase()).eq('activo', true).maybeSingle();

    if (!vehiculo) {
      const { data, error } = await supabase
        .from('vehiculos')
        .insert({ placa: placa.toUpperCase(), tipo: tipo || 'carro', color: color || null, marca: marca || null })
        .select().single();
      if (error) throw new AppError(error.message, 500);
      vehiculo = data;
    }

    const { data: yaAdentro } = await supabase
      .from('registro_vehiculos').select('id')
      .eq('vehiculo_id', vehiculo.id).eq('servicio_id', servicioId).is('hora_salida', null).maybeSingle();
    if (yaAdentro) throw new AppError('El vehículo ya está registrado dentro', 409);

    const { data, error } = await supabase
      .from('registro_vehiculos')
      .insert({ vehiculo_id: vehiculo.id, servicio_id: servicioId,
        hora_entrada: new Date().toISOString(),
        zona_parqueo: zonaParqueo || null, vigilante_id: vigilanteId || null })
      .select('*, vehiculos(placa, tipo, color, marca, miembros(nombre, apellido, telefono))')
      .single();
    if (error) throw new AppError(error.message, 500);
    created(res, data);
  } catch (e) { next(e); }
});

router.patch('/:id/salida', async (req, res, next) => {
  try {
    const { data: reg } = await supabase
      .from('registro_vehiculos').select('id, hora_salida').eq('id', req.params.id).single();
    if (!reg) throw new AppError('Registro no encontrado', 404);
    if (reg.hora_salida) throw new AppError('Ya registró salida', 409);
    const { data, error } = await supabase
      .from('registro_vehiculos')
      .update({ hora_salida: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*, vehiculos(placa, tipo, color, marca)').single();
    if (error) throw new AppError(error.message, 500);
    ok(res, data);
  } catch (e) { next(e); }
});

export default router;
`.trimStart();

// ── src/index.js
files['src/index.js'] = `
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler } from './middlewares/errorHandler.js';
import serviciosRoutes  from './modules/operacion/servicios/servicios.routes.js';
import asistenciaRoutes from './modules/operacion/asistencia/asistencia.routes.js';
import asientosRoutes   from './modules/operacion/asientos/asientos.routes.js';
import vehiculosRoutes  from './modules/operacion/vehiculos/vehiculos.routes.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

app.use('/api/servicios',  serviciosRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/asientos',   asientosRoutes);
app.use('/api/vehiculos',  vehiculosRoutes);

app.use(errorHandler);

app.listen(PORT, () =>
  console.log('✅ Iglesia API corriendo en http://localhost:' + PORT)
);

export default app;
`.trimStart();

// ── Escribir todos los archivos
Object.entries(files).forEach(([path, content]) => {
  writeFileSync(path, content, 'utf8');
  console.log('  ✓', path);
});

console.log('\n🎉 Proyecto listo. Ahora corre: npm run dev\n');
