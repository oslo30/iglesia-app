import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { ok } from '../../utils/response.js';
import { requireAuth } from '../auth/auth.routes.js';

const router = Router();

function getDateRange(periodo, params) {
  const now = new Date();
  let desde, hasta;

  if (periodo === 'dia') {
    const fecha = params.fecha || now.toISOString().split('T')[0];
    desde = `${fecha}T00:00:00`;
    hasta = `${fecha}T23:59:59`;
  } else if (periodo === 'semana') {
    const anio = parseInt(params.anio) || now.getFullYear();
    const semana = parseInt(params.semana) || getWeekNumber(now);
    const { start, end } = getWeekRange(anio, semana);
    desde = `${start}T00:00:00`;
    hasta = `${end}T23:59:59`;
  } else if (periodo === 'mes') {
    const anio = parseInt(params.anio) || now.getFullYear();
    const mes = parseInt(params.mes) || (now.getMonth() + 1);
    desde = `${anio}-${String(mes).padStart(2, '0')}-01T00:00:00`;
    const lastDay = new Date(anio, mes, 0).getDate();
    hasta = `${anio}-${String(mes).padStart(2, '0')}-${lastDay}T23:59:59`;
  } else if (periodo === 'anio') {
    const anio = parseInt(params.anio) || now.getFullYear();
    desde = `${anio}-01-01T00:00:00`;
    hasta = `${anio}-12-31T23:59:59`;
  }

  return { desde, hasta };
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getWeekRange(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const isoWeekStart = simple;
  if (dow <= 4) isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  const isoWeekEnd = new Date(isoWeekStart);
  isoWeekEnd.setDate(isoWeekStart.getDate() + 6);
  return {
    start: isoWeekStart.toISOString().split('T')[0],
    end: isoWeekEnd.toISOString().split('T')[0],
  };
}

async function getResumen(deshoy, hastahoy) {
  const [{ data: dz }, { data: of }] = await Promise.all([
    supabase.from('diezmos').select('monto, created_at').gte('created_at', deshoy).lte('created_at', hastahoy),
    supabase.from('ofrendas').select('monto, created_at').gte('created_at', deshoy).lte('created_at', hastahoy),
  ]);

  const diezmos_total = (dz || []).reduce((s, d) => s + Number(d.monto || 0), 0);
  const ofrendas_total = (of || []).reduce((s, o) => s + Number(o.monto || 0), 0);

  // Agrupar por día
  const por_dia = {};
  for (const d of (dz || [])) {
    const day = d.created_at.split('T')[0];
    por_dia[day] = por_dia[day] || { diezmos: 0, ofrendas: 0, total: 0 };
    por_dia[day].diezmos += Number(d.monto || 0);
    por_dia[day].total += Number(d.monto || 0);
  }
  for (const o of (of || [])) {
    const day = o.created_at.split('T')[0];
    por_dia[day] = por_dia[day] || { diezmos: 0, ofrendas: 0, total: 0 };
    por_dia[day].ofrendas += Number(o.monto || 0);
    por_dia[day].total += Number(o.monto || 0);
  }

  return {
    total: diezmos_total + ofrendas_total,
    diezmos_total,
    ofrendas_total,
    count_diezmos: (dz || []).length,
    count_ofrendas: (of || []).length,
    por_dia: Object.entries(por_dia)
      .map(([fecha, vals]) => ({ fecha, ...vals }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

// GET /api/ingresos/resumen/dia?fecha=2026-03-28
router.get('/dia', requireAuth, async (req, res, next) => {
  try {
    const { desde, hasta } = getDateRange('dia', req.query);
    const resumen = await getResumen(desde, hasta);

    // Comparativa con día anterior
    const prevDate = new Date(desde.split('T')[0]);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDesde = prevDate.toISOString().split('T')[0] + 'T00:00:00';
    const prevHasta = prevDate.toISOString().split('T')[0] + 'T23:59:59';
    const anterior = await getResumen(prevDesde, prevHasta);

    resumen.comparativa = {
      dia_anterior_total: anterior.total,
      variacion: anterior.total > 0 ? ((resumen.total - anterior.total) / anterior.total * 100).toFixed(1) : 0,
    };

    ok(res, resumen);
  } catch (e) { next(e); }
});

// GET /api/ingresos/resumen/semana?anio=2026&semana=13
router.get('/semana', requireAuth, async (req, res, next) => {
  try {
    const { desde, hasta } = getDateRange('semana', req.query);
    const resumen = await getResumen(desde, hasta);

    // Comparativa con semana anterior
    const prevWeekStart = new Date(desde.split('T')[0]);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(hasta.split('T')[0]);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
    const anterior = await getResumen(
      prevWeekStart.toISOString().split('T')[0] + 'T00:00:00',
      prevWeekEnd.toISOString().split('T')[0] + 'T23:59:59'
    );

    resumen.comparativa = {
      semana_anterior_total: anterior.total,
      variacion: anterior.total > 0 ? ((resumen.total - anterior.total) / anterior.total * 100).toFixed(1) : 0,
    };

    ok(res, resumen);
  } catch (e) { next(e); }
});

// GET /api/ingresos/resumen/mes?anio=2026&mes=3
router.get('/mes', requireAuth, async (req, res, next) => {
  try {
    const { desde, hasta } = getDateRange('mes', req.query);
    const resumen = await getResumen(desde, hasta);

    // Comparativa con mes anterior
    const prevMesDate = new Date(desde.split('T')[0]);
    prevMesDate.setMonth(prevMesDate.getMonth() - 1);
    const prevYear = prevMesDate.getFullYear();
    const prevMonth = prevMesDate.getMonth() + 1;
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const anterior = await getResumen(
      `${prevYear}-${String(prevMonth).padStart(2, '0')}-01T00:00:00`,
      `${prevYear}-${String(prevMonth).padStart(2, '0')}-${prevLastDay}T23:59:59`
    );

    resumen.comparativa = {
      mes_anterior_total: anterior.total,
      variacion: anterior.total > 0 ? ((resumen.total - anterior.total) / anterior.total * 100).toFixed(1) : 0,
    };

    ok(res, resumen);
  } catch (e) { next(e); }
});

// GET /api/ingresos/resumen/anio?anio=2026
router.get('/anio', requireAuth, async (req, res, next) => {
  try {
    const { desde, hasta } = getDateRange('anio', req.query);
    const resumen = await getResumen(desde, hasta);

    // Comparativa con año anterior
    const prevYear = parseInt(desde.split('-')[0]) - 1;
    const anterior = await getResumen(
      `${prevYear}-01-01T00:00:00`,
      `${prevYear}-12-31T23:59:59`
    );

    resumen.comparativa = {
      anio_anterior_total: anterior.total,
      variacion: anterior.total > 0 ? ((resumen.total - anterior.total) / anterior.total * 100).toFixed(1) : 0,
    };

    ok(res, resumen);
  } catch (e) { next(e); }
});

export default router;
