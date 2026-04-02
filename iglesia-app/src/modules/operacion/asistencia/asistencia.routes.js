import { Router } from 'express';
import { supabase } from '../../../config/supabase.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import { ok } from '../../../utils/response.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────
async function porServicio(servicioId) {
  const { data } = await supabase
    .from('registros_asistencia')
    .select('*')
    .eq('servicio_id', servicioId)
    .maybeSingle();
  return data;
}

// Total se calcula en la BD via trigger
async function registrar({ servicioId, feligreses, visitantes, notas, ujierId }) {
  const { data: svc } = await supabase
    .from('servicios').select('id, estado').eq('id', servicioId).single();
  if (!svc)                    throw new AppError('Servicio no encontrado', 404);
  if (svc.estado === 'cancelado') throw new AppError('Servicio cancelado', 400);

  const f = feligreses ?? {};
  const v = visitantes ?? {};

  const { data, error } = await supabase
    .from('registros_asistencia')
    .upsert({
      servicio_id:       servicioId,
      caballeros:      f.caballeros    ?? 0,
      damas:           f.damas         ?? 0,
      adol_varones:    f.adol_varones  ?? 0,
      adol_damas:      f.adol_damas   ?? 0,
      ninos_varones:   f.ninos_varones ?? 0,
      ninos_damas:     f.ninos_damas   ?? 0,
      vm:              v.vm            ?? 0,
      vf:              v.vf            ?? 0,
      notas:           notas           ?? null,
      ujier_id:        ujierId         ?? null,
    }, { onConflict: 'servicio_id' })
    .select()
    .single();

  if (error) throw new AppError(error.message, 500);
  return data;
}

// ── Rutas ─────────────────────────────────────────────────────

// GET /api/asistencia/historial
router.get('/historial', async (req, res, next) => {
  try {
    const { desde, hasta, limit = 30, offset = 0 } = req.query;

    let query = supabase
      .from('registros_asistencia')
      .select(`
        id, servicio_id,
        caballeros, damas, adol_varones, adol_damas, ninos_varones, ninos_damas,
        vm, vf, vm_adolescentes, vf_adolescentes, vm_ninos, vf_ninas,
        total, notas, created_at, ujier_id,
        servicios ( id, nombre, fecha_hora, tipo, caracter )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (desde) query = query.gte('created_at', desde + 'T00:00:00');
    if (hasta) query = query.lte('created_at', hasta + 'T23:59:59');

    const { data, error, count } = await query;
    if (error) throw new AppError(error.message, 500);
    ok(res, data || [], { total: count });
  } catch (e) { next(e); }
});

// GET /api/asistencia/estadisticas
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

    ok(res, {
      ultimoServicio:   ultimo || null,
      promedio4semanas: promedio,
      tendencia: (ultimo?.total || 0) > promedio ? 'subiendo' : 'bajando'
    });
  } catch (e) { next(e); }
});

// GET /api/asistencia/dashboard — datos para dashboard de estadísticas
router.get('/dashboard', async (req, res, next) => {
  try {
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // Obtener todos los registros con datos del servicio
    const { data: todosRegistros } = await supabase
      .from('registros_asistencia')
      .select('caballeros, damas, adol_varones, adol_damas, ninos_varones, ninos_damas, servicios(fecha_hora, nombre)')
      .order('created_at', { ascending: false });

    // Filtrar y calcular en JavaScript
    const filtrar = (min, max) => (todosRegistros || []).filter(r => {
      const f = new Date(r.servicios?.fecha_hora);
      return f >= min && f < max;
    });

    // total se calcula desde columnas porque el trigger BD puede dar 0
    const totalR = (r) => (r.caballeros||0) + (r.damas||0) + (r.adol_varones||0) + (r.adol_damas||0) + (r.ninos_varones||0) + (r.ninos_damas||0);
    const sumar = (arr) => arr.reduce((s, r) => s + totalR(r), 0);

    // Asistencia hoy
    const regsHoy = filtrar(hoy, manana);
    const asistenciaHoy = sumar(regsHoy);

    // Asistencia semana
    const regsSemana = filtrar(inicioSemana, new Date());
    const asistenciaSemana = sumar(regsSemana);

    // Asistencia mes
    const regsMes = filtrar(inicioMes, new Date());
    const asistenciaMes = sumar(regsMes);

    // Último servicio
    const ultimo = (todosRegistros || [])[0];
    const vsUltimo = totalR(ultimo);

    // Tendencia semanal
    const haceSemana = new Date(inicioSemana);
    haceSemana.setDate(haceSemana.getDate() - 7);
    const regsSemanaPasada = filtrar(haceSemana, inicioSemana);
    const asistenciaSemanaPasada = sumar(regsSemanaPasada);
    const tendenciaSemana = asistenciaSemanaPasada > 0
      ? Math.round(((asistenciaSemana - asistenciaSemanaPasada) / asistenciaSemanaPasada) * 100)
      : 0;

    // Tendencia mensual
    const haceMes = new Date(inicioMes);
    haceMes.setMonth(haceMes.getMonth() - 1);
    const regsMesPasado = filtrar(haceMes, inicioMes);
    const asistenciaMesPasado = sumar(regsMesPasado);
    const tendenciaMes = asistenciaMesPasado > 0
      ? Math.round(((asistenciaMes - asistenciaMesPasado) / asistenciaMesPasado) * 100)
      : 0;

    // Por categoría (últimos 50 registros)
    const ultimosRegistros = (todosRegistros || []).slice(0, 50);
    let porCategoria = { caballeros: 0, damas: 0, jovenes: 0, ninos: 0, visitas: 0 };
    ultimosRegistros.forEach(r => {
      porCategoria.caballeros += r.caballeros || 0;
      porCategoria.damas += r.damas || 0;
      porCategoria.jovenes += (r.adol_varones || 0) + (r.adol_damas || 0);
      porCategoria.ninos += (r.ninos_varones || 0) + (r.ninos_damas || 0);
      // Visitas = vm + vf (visitantes varones y femeninos)
      porCategoria.visitas += (r.vm || 0) + (r.vf || 0);
    });

    const totalCategoria = Object.values(porCategoria).reduce((s, v) => s + v, 0) || 1;
    porCategoria = {
      caballeros: { cantidad: porCategoria.caballeros, porcentaje: Math.round(porCategoria.caballeros / totalCategoria * 100) },
      damas: { cantidad: porCategoria.damas, porcentaje: Math.round(porCategoria.damas / totalCategoria * 100) },
      jovenes: { cantidad: porCategoria.jovenes, porcentaje: Math.round(porCategoria.jovenes / totalCategoria * 100) },
      ninos: { cantidad: porCategoria.ninos, porcentaje: Math.round(porCategoria.ninos / totalCategoria * 100) },
      visitas: { cantidad: porCategoria.visitas, porcentaje: Math.round(porCategoria.visitas / totalCategoria * 100) }
    };

    // Tendencia mensual (últimos 6 meses)
    const hace6Meses = new Date(hoy);
    hace6Meses.setMonth(hace6Meses.getMonth() - 6);
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const tendenciaMensual = {};
    (todosRegistros || []).forEach(r => {
      const f = new Date(r.servicios?.fecha_hora);
      if (f >= hace6Meses) {
        const mes = mesesNombres[f.getMonth()];
        tendenciaMensual[mes] = (tendenciaMensual[mes] || 0) + totalR(r);
      }
    });

    // Por servicio
    const serviciosAgrupados = {};
    (todosRegistros || []).forEach(r => {
      const nombre = r.servicios?.nombre || 'Otro';
      const base = nombre.split(' ')[0];
      serviciosAgrupados[base] = (serviciosAgrupados[base] || 0) + totalR(r);
    });

    // Insights automáticos
    const insights = [];
    const todos = todosRegistros || [];

    // Insight: categoría con mayor asistencia
    const catEntries = Object.entries(porCategoria).filter(([,v]) => v.cantidad > 0);
    if (catEntries.length > 0) {
      const mayor = catEntries.reduce((a, b) => a[1].cantidad > b[1].cantidad ? a : b);
      const labels = { caballeros: 'Caballeros', damas: 'Damas', jovenes: 'Jóvenes', ninos: 'Niños', visitas: 'Visitas' };
      insights.push({ tipo: 'highlight', icon: '★', text: `${labels[mayor[0]] || mayor[0]} es la categoría con mayor asistencia (${mayor[1].porcentaje}%)` });
    }

    // Insight: tendencia de la semana
    if (tendenciaSemana > 0) {
      insights.push({ tipo: 'positive', icon: '▲', text: `La asistencia subió ${tendenciaSemana}% esta semana` });
    } else if (tendenciaSemana < 0) {
      insights.push({ tipo: 'negative', icon: '▼', text: `La asistencia bajó ${Math.abs(tendenciaSemana)}% esta semana` });
    }

    // Insight: mejor servicio
    const svcEntries = Object.entries(serviciosAgrupados).filter(([,v]) => v > 0);
    if (svcEntries.length > 0) {
      const mejor = svcEntries.reduce((a, b) => a[1] > b[1] ? a : b);
      insights.push({ tipo: 'highlight', icon: '★', text: `${mejor[0]} lidera en asistencia total` });
    }

    ok(res, {
      resumen: {
        hoy: asistenciaHoy,
        semana: asistenciaSemana,
        mes: asistenciaMes,
        tendenciaSemana,
        tendenciaMes,
        vsUltimo
      },
      porCategoria,
      tendenciaMensual,
      porServicio: serviciosAgrupados,
      insights: insights.slice(0, 3)
    });
  } catch (e) { next(e); }
});

// GET /api/asistencia/:servicioId
router.get('/:servicioId', async (req, res, next) => {
  try { ok(res, await porServicio(req.params.servicioId)); }
  catch (e) { next(e); }
});

// POST /api/asistencia/:servicioId  (crear o actualizar)
router.post('/:servicioId', async (req, res, next) => {
  try {
    const { feligreses, visitantes, notas, ujier_id } = req.body;
    const data = await registrar({
      servicioId: req.params.servicioId,
      feligreses: feligreses ?? {},
      visitantes: visitantes ?? {},
      notas, ujierId: ujier_id
    });
    ok(res, data);
  } catch (e) { next(e); }
});


// DELETE /api/asistencia/:servicioId — eliminar registro
router.delete('/:servicioId', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('registros_asistencia')
      .delete()
      .eq('servicio_id', req.params.servicioId);
    if (error) throw new AppError(error.message, 500);
    ok(res, { mensaje: 'Registro eliminado' });
  } catch (e) { next(e); }
});

export default router;
