import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok, created } from '../../../utils/response.js';

const router = Router();

// ── Service ───────────────────────────────────────────────────
async function buscarPorPlaca(placa) {
  const { data } = await supabase
    .from('vehiculos')
    .select('*, miembros(id, nombre, apellido, telefono)')
    .ilike('placa', placa.trim().toUpperCase())
    .eq('activo', true)
    .maybeSingle();
  return data;
}

async function registrarEntrada({ placa, tipo, color, marca, servicioId, zonaParqueo, vigilanteId }) {
  let vehiculo = await buscarPorPlaca(placa);

  if (!vehiculo) {
    const { data, error } = await supabase
      .from('vehiculos')
      .insert({ placa: placa.toUpperCase(), tipo: tipo || 'carro', color: color || null, marca: marca || null })
      .select()
      .single();
    if (error) throw new AppError('Error al registrar vehículo: ' + error.message, 500);
    vehiculo = data;
  }

  const { data: yaRegistrado } = await supabase
    .from('registro_vehiculos')
    .select('id')
    .eq('vehiculo_id', vehiculo.id)
    .eq('servicio_id', servicioId)
    .is('hora_salida', null)
    .maybeSingle();

  if (yaRegistrado)
    throw new AppError(`El vehículo ${placa.toUpperCase()} ya está dentro del servicio`, 409);

  const { data: registro, error: regErr } = await supabase
    .from('registro_vehiculos')
    .insert({
      vehiculo_id:  vehiculo.id,
      servicio_id:  servicioId,
      hora_entrada: new Date().toISOString(),
      zona_parqueo: zonaParqueo || null,
      vigilante_id: vigilanteId || null
    })
    .select('*, vehiculos(placa, tipo, color, marca, miembros(nombre, apellido, telefono))')
    .single();

  if (regErr) throw new AppError(regErr.message, 500);
  return registro;
}

async function registrarSalida(registroId) {
  const { data: reg } = await supabase
    .from('registro_vehiculos')
    .select('id, hora_salida')
    .eq('id', registroId)
    .single();

  if (!reg)            throw new AppError('Registro no encontrado', 404);
  if (reg.hora_salida) throw new AppError('Este vehículo ya registró salida', 409);

  const { data, error } = await supabase
    .from('registro_vehiculos')
    .update({ hora_salida: new Date().toISOString() })
    .eq('id', registroId)
    .select('*, vehiculos(placa, tipo, color, marca)')
    .single();

  if (error) throw new AppError(error.message, 500);
  return data;
}

async function activos(servicioId) {
  let query = supabase
    .from('registro_vehiculos')
    .select('id, hora_entrada, zona_parqueo, vehiculos(placa, tipo, color, marca, miembros(nombre, apellido, telefono))')
    .is('hora_salida', null)
    .order('hora_entrada', { ascending: true });

  if (servicioId) query = query.eq('servicio_id', servicioId);

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function porServicio(servicioId) {
  const { data, error } = await supabase
    .from('registro_vehiculos')
    .select('id, hora_entrada, hora_salida, zona_parqueo, vehiculos(placa, tipo, color, marca, miembros(nombre, apellido))')
    .eq('servicio_id', servicioId)
    .order('hora_entrada', { ascending: false });

  if (error) throw new AppError(error.message, 500);
  return {
    registros: data,
    dentro:    data.filter(r => !r.hora_salida).length,
    salieron:  data.filter(r =>  r.hora_salida).length,
    total:     data.length
  };
}

// ── Rutas ─────────────────────────────────────────────────────
router.get('/buscar', async (req, res, next) => {
  try {
    const { placa } = req.query;
    if (!placa) return res.status(400).json({ error: 'Parámetro placa requerido' });
    ok(res, await buscarPorPlaca(placa));
  } catch (e) { next(e); }
});

router.get('/activos', async (req, res, next) => {
  try { ok(res, await activos(req.query.servicioId)); }
  catch (e) { next(e); }
});

router.get('/servicio/:servicioId', async (req, res, next) => {
  try {
    const result = await porServicio(req.params.servicioId);
    ok(res, result.registros, { dentro: result.dentro, salieron: result.salieron, total: result.total });
  } catch (e) { next(e); }
});

router.post('/entrada', async (req, res, next) => {
  try { created(res, await registrarEntrada(req.body)); }
  catch (e) { next(e); }
});

router.patch('/:id/salida', async (req, res, next) => {
  try { ok(res, await registrarSalida(req.params.id)); }
  catch (e) { next(e); }
});

export default router;
