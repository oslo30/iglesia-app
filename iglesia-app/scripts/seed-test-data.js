/**
 * Script para crear datos de prueba para el dashboard de estadísticas
 * Uso: node scripts/seed-test-data.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Tipos de culto (valores válidos del enum: dominical_am, dominical_pm, especial)
const TIPOS_SERVICIO = [
  { nombre: 'Domingo Mañana', tipo: 'dominical_am' },
  { nombre: 'Domingo Noche', tipo: 'dominical_pm' },
  { nombre: 'Miércoles', tipo: 'especial' },
  { nombre: 'Viernes', tipo: 'especial' },
  { nombre: 'Sábado Noche', tipo: 'especial' },
];

// Nombres de servicios base para agrupacion
const BASE_SERVICIOS = ['Domingo', 'Miércoles', 'Viernes', 'Sábado'];

// asistente aleatorio entre min y max
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function limpiarDatosPrevios() {
  console.log('🗑️  Limpiando datos previos...');
  // Primero eliminar registros de asistencia
  await supabase.from('registros_asistencia').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // Luego eliminar servicios de prueba (últimos 30 días)
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  await supabase.from('servicios').delete().gte('fecha_hora', hace30.toISOString());
  console.log('✅ Datos previos eliminados');
}

async function crearServiciosYRegistros() {
  console.log('📝 Creando servicios y registros de asistencia...');

  const ahora = new Date();
  const hace6Meses = new Date(ahora);
  hace6Meses.setMonth(hace6Meses.getMonth() - 6);

  // Crear servicios cada semana por 6 meses + algunos servicios especiales
  const serviciosCreados = [];

  // Iterar por cada semana de los últimos 6 meses
  const inicio = new Date(hace6Meses);
  inicio.setDate(inicio.getDate() - inicio.getDay()); // empezar en domingo

  let semanaIdx = 0;
  while (inicio <= ahora) {
    // Domingo Mañana (semanaIdx 0)
    const domMañana = new Date(inicio);
    domMañana.setHours(9, 0, 0, 0);
    if (domMañana <= ahora) {
      serviciosCreados.push({ fecha: domMañana, nombre: 'Domingo Mañana', tipo: 'dominical_am' });
    }

    // Domingo Noche (semanaIdx 0)
    const domNoche = new Date(inicio);
    domNoche.setDate(domNoche.getDate() + 1); // lunes
    domNoche.setHours(19, 0, 0, 0);
    if (domNoche <= ahora) {
      // No crear si ya pasó más de 2 semanas
      const diffDias = Math.floor((ahora - domNoche) / (1000 * 60 * 60 * 24));
      if (diffDias < 14) {
        serviciosCreados.push({ fecha: domNoche, nombre: 'Domingo Noche', tipo: 'dominical_pm' });
      }
    }

    // Miércoles (semanaIdx 1)
    const miercoles = new Date(inicio);
    miercoles.setDate(miercoles.getDate() + 3); // miércoles
    miercoles.setHours(19, 0, 0, 0);
    if (miercoles <= ahora) {
      serviciosCreados.push({ fecha: miercoles, nombre: 'Miércoles', tipo: 'especial' });
    }

    // Viernes - jóvenes (semanaIdx 2)
    const viernes = new Date(inicio);
    viernes.setDate(viernes.getDate() + 5); // viernes
    viernes.setHours(19, 0, 0, 0);
    if (viernes <= ahora) {
      serviciosCreados.push({ fecha: viernes, nombre: 'Viernes', tipo: 'especial' });
    }

    // Avanzar a la siguiente semana
    inicio.setDate(inicio.getDate() + 7);
    semanaIdx++;
  }

  console.log(`   Creando ${serviciosCreados.length} servicios...`);

  // Insertar servicios y obtener IDs
  const idsMap = {};

  for (const svc of serviciosCreados) {
    const { data, error } = await supabase
      .from('servicios')
      .insert({
        nombre: svc.nombre,
        fecha_hora: svc.fecha.toISOString(),
        tipo: svc.tipo,
        estado: 'finalizado'
      })
      .select('id, nombre, fecha_hora')
      .single();

    if (error) {
      console.error('Error creando servicio:', error);
      continue;
    }

    // Guardar con clave única basada en fecha+nombre
    const key = `${data.nombre}_${data.fecha_hora.split('T')[0]}`;
    idsMap[key] = data.id;

    // Crear registro de asistencia para este servicio
    const caballeros = rand(15, 45);
    const damas = rand(20, 55);
    const adolVarones = rand(5, 20);
    const adolDamas = rand(5, 20);
    const ninosVarones = rand(3, 15);
    const ninosDamas = rand(3, 15);
    const visitas = rand(0, 12);

    const { error: regError } = await supabase
      .from('registros_asistencia')
      .insert({
        servicio_id: data.id,
        caballeros,
        damas,
        adol_varones: adolVarones,
        adol_damas: adolDamas,
        ninos_varones: ninosVarones,
        ninos_damas: ninosDamas,
        vm: visitas > 0 ? Math.floor(visitas * 0.6) : 0,
        vf: visitas > 0 ? Math.floor(visitas * 0.4) : 0,
      });

    if (regError) {
      console.error('Error creando registro:', regError);
    }
  }

  console.log(`   ✅ ${Object.keys(idsMap).length} servicios con registros creados`);
  return serviciosCreados.length;
}

async function verificarDatos() {
  console.log('\n📊 Verificando datos creados...');

  // Contar servicios
  const { count: totalServicios } = await supabase
    .from('servicios')
    .select('*', { count: 'exact', head: true });

  // Contar registros
  const { count: totalRegistros } = await supabase
    .from('registros_asistencia')
    .select('*', { count: 'exact', head: true });

  // Obtener últimos 5 registros
  const { data: ultimos } = await supabase
    .from('registros_asistencia')
    .select('caballeros, damas, adol_varones, adol_damas, ninos_varones, ninos_damas, total, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`   Servicios totales: ${totalServicios}`);
  console.log(`   Registros totales: ${totalRegistros}`);
  console.log('\n   Últimos 5 registros:');
  ultimos?.forEach(r => {
    const total = (r.caballeros||0) + (r.damas||0) + (r.adol_varones||0) + (r.adol_damas||0) + (r.ninos_varones||0) + (r.ninos_damas||0);
    console.log(`   - ${new Date(r.created_at).toLocaleDateString('es-ES')}: ${total} personas (Cab:${r.caballeros}, Dam:${r.damas}, Jóv:${r.adol_varones+r.adol_damas}, Niñ:${r.ninos_varones+r.ninos_damas})`);
  });

  // Test del endpoint dashboard
  console.log('\n🌐 Testeando endpoint /api/asistencia/dashboard...');
  try {
    const response = await fetch('http://localhost:3000/api/asistencia/dashboard');
    const data = await response.json();
    console.log('   Respuesta del dashboard:');
    console.log(`   - Hoy: ${data.data?.resumen?.hoy || 0}`);
    console.log(`   - Semana: ${data.data?.resumen?.semana || 0}`);
    console.log(`   - Mes: ${data.data?.resumen?.mes || 0}`);
    console.log(`   - Insights: ${data.data?.insights?.length || 0}`);
    console.log(`   - Categorías:`, JSON.stringify(data.data?.porCategoria));
  } catch (e) {
    console.log('   ⚠️  No se pudo testar el endpoint (verificar que el servidor esté corriendo)');
  }

  console.log('\n✨ Datos de prueba creados exitosamente!');
  console.log('\n📋 Para verificar en la app:');
  console.log('   1. Abre http://localhost:5500/porteria.html');
  console.log('   2. Ve a la pestaña de Estadísticas');
  console.log('   3. Deberías ver datos en todos los gráficos e insights');
}

async function main() {
  console.log('===========================================');
  console.log('🚀 Script de Datos de Prueba para Iglesia App');
  console.log('===========================================\n');

  try {
    await limpiarDatosPrevios();
    await crearServiciosYRegistros();
    await verificarDatos();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
