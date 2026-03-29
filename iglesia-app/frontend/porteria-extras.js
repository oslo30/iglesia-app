// Archivo separado para las nuevas funcionalidades de porteria.html
// Este archivo se carga al final y extiende la funcionalidad sin modificar el HTML original

async function cargarPreviewMiembros() {
  const el = document.getElementById('miembros-preview');
  if (!el) return;
  try {
    const d = await fetch('/api/miembros?limit=5', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('iglesia_token') || '') }
    }).then(r => r.json());
    const lista = (d.data || d) || [];
    if (!lista.length) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">Sin miembros</div>';
      return;
    }
    el.innerHTML = lista.map(m => {
      const nombre = (m.nombre || '') + ' ' + (m.apellido || '');
      const iniciales = ((m.nombre || '')[0] + (m.apellido || '')[0]).toUpperCase();
      return `<div style="display:flex;align-items:center;gap:10px;font-size:13px;padding:8px 0;border-bottom:0.5px solid var(--border)">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-l);color:var(--primary-d);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px">${iniciales || '?'}</div>
        <div>
          <div style="font-weight:500">${nombre.trim() || 'Sin nombre'}</div>
          <div style="font-size:11px;color:var(--text2)">${m.tipo || 'miembro'}${m.telefono ? ' · ' + m.telefono : ''}</div>
        </div>
      </div>`;
    }).join('');
  } catch {
    if (el) el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">Error al cargar</div>';
  }
}

async function cargarPreviewAsientos() {
  const el = document.getElementById('asientos-preview');
  if (!el) return;
  try {
    const svcs = await fetch('/api/servicios/hoy', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('iglesia_token') || '') }
    }).then(r => r.json());
    const lista = (svcs.data || svcs) || [];
    if (!lista.length) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">No hay servicios hoy</div>';
      return;
    }
    let html = '';
    for (const s of lista.slice(0, 3)) {
      try {
        const a = await fetch('/api/asientos/' + s.id, {
          headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('iglesia_token') || '') }
        }).then(r => r.json());
        const asientos = (a.data || a) || [];
        const libres = asientos.filter(x => x.estado === 'libre').length;
        const total = asientos.length;
        const pct = total > 0 ? Math.round(libres / total * 100) : 0;
        html += `<div style="padding:8px 0;border-bottom:0.5px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:500;font-size:13px">${s.nombre || 'Servicio'}</div>
            ${total > 0 ? '<div style="font-size:16px;font-weight:700;color:var(--primary)">' + pct + '%</div>' : ''}
          </div>
          <div style="font-size:11px;color:var(--text2)">${total ? libres + '/' + total + ' libres' : 'Sin asientos config.'}</div>
        </div>`;
      } catch {
        html += '<div style="padding:8px 0;border-bottom:0.5px solid var(--border);font-size:13px;color:var(--text2)">' + (s.nombre || 'Servicio') + '</div>';
      }
    }
    if (lista.length > 3) {
      html += '<div style="text-align:center;font-size:12px;color:var(--text2);padding:6px">+' + (lista.length - 3) + ' más</div>';
    }
    el.innerHTML = html;
  } catch {
    if (el) el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">Error al cargar</div>';
  }
}

async function cargarGraficaPorteria(periodo) {
  const canvas = document.getElementById('grafica-asistencia');
  const statsEl = document.getElementById('stats-resumen');
  if (!canvas || typeof Chart === 'undefined') return;

  let desde = '';
  if (periodo === 'semana') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    desde = d.toISOString().split('T')[0];
  } else if (periodo === 'mes') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    desde = d.toISOString().split('T')[0];
  }

  try {
    const token = localStorage.getItem('iglesia_token');
    const url = '/api/asistencia/historial?limit=30' + (desde ? '&desde=' + desde : '');
    const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + (token || '') } });
    const j = await r.json();
    const regs = (j.data || j) || [];
    const data = regs.length ? regs : [{ servicios: { nombre: 'Culto Prueba', fecha_hora: new Date().toISOString(), caracter: 'Evangelístico' }, adultos: 158, ninos: 28, amigos: 17, total: 203, notas: 'Pastor invitado', registrado_por_nombre: 'Juan Pérez' }];
    const rev = [...data].reverse();
    const labels = rev.map(r => {
      const fh = r.servicios?.fecha_hora;
      return fh ? new Date(fh).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—';
    });

    if (window._chartInstance) {
      window._chartInstance.destroy();
      window._chartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    window._chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Adultos', data: rev.map(r => r.adultos || 0), backgroundColor: '#1D9E75cc', borderRadius: 4 },
          { label: 'Niños', data: rev.map(r => r.ninos || 0), backgroundColor: '#378ADDcc', borderRadius: 4 },
          { label: 'Amigos', data: rev.map(r => r.amigos || 0), backgroundColor: '#BA7517cc', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });

    if (data.length > 0) {
      const tots = data.map(r => r.total || 0);
      const prom = Math.round(tots.reduce((a, b) => a + b, 0) / tots.length);
      if (statsEl) {
        statsEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:4px">
          <div class="hist-stat card"><div class="hist-stat-val">${prom}</div><div class="hist-stat-lbl">Promedio</div></div>
          <div class="hist-stat card"><div class="hist-stat-val" style="color:var(--primary)">${Math.max(...tots)}</div><div class="hist-stat-lbl">Máximo</div></div>
          <div class="hist-stat card"><div class="hist-stat-val" style="color:var(--amber)">${Math.min(...tots)}</div><div class="hist-stat-lbl">Mínimo</div></div>
        </div>`;
      }
    }
  } catch (e) {
    console.error('Error cargando gráfica:', e);
  }
}

async function cargarHistorialPorteria() {
  const el = document.getElementById('historial-list');
  if (!el) return;
  try {
    const token = localStorage.getItem('iglesia_token');
    const r = await fetch('/api/asistencia/historial?limit=20', {
      headers: { 'Authorization': 'Bearer ' + (token || '') }
    });
    const j = await r.json();
    const lista = (j.data || j) || [];
    window._historialData = lista;
    renderHistorialPorteria(lista);
  } catch {
    window._historialData = [];
    renderHistorialPorteria([]);
  }
}

function renderHistorialPorteria(lista) {
  const el = document.getElementById('historial-list');
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--text2);font-size:14px">Sin registros aún</div>';
    return;
  }
  el.innerHTML = lista.map(r => {
    const svc = r.servicios || {};
    const fecha = svc.fecha_hora ? new Date(svc.fecha_hora).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
    const hora = svc.fecha_hora ? new Date(svc.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
    const portero = r.registrado_por_nombre || 'No registrado';
    const caracter = svc.caracter || r.caracter || null;
    return `<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:13px;font-weight:600">${svc.nombre || 'Servicio'}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${fecha} · ${hora}</div>
        </div>
        <span style="background:var(--blue-l);color:var(--blue);font-size:14px;font-weight:700;padding:4px 12px;border-radius:99px;white-space:nowrap">${r.total ?? 0}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px;text-align:center"><div style="font-size:16px;font-weight:700;color:var(--primary)">${r.adultos ?? 0}</div><div style="font-size:10px;color:var(--text2);margin-top:2px">Adultos</div></div>
        <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px;text-align:center"><div style="font-size:16px;font-weight:700;color:var(--blue)">${r.ninos ?? 0}</div><div style="font-size:10px;color:var(--text2);margin-top:2px">Niños</div></div>
        <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px;text-align:center"><div style="font-size:16px;font-weight:700;color:var(--amber)">${r.amigos ?? 0}</div><div style="font-size:10px;color:var(--text2);margin-top:2px">Amigos</div></div>
      </div>
      ${r.notas ? '<div style="font-size:12px;color:var(--text2);padding:8px 10px;background:var(--bg2);border-radius:var(--radius-sm);margin-bottom:8px;font-style:italic">"' + r.notas + '"</div>' : ''}
      <div style="font-size:11px;color:var(--text2);margin-bottom:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span>👤 ${portero}</span>
        ${caracter ? '<span style="background:var(--primary-l);color:var(--primary-d);font-size:10px;padding:2px 8px;border-radius:99px;font-weight:500">' + caracter + '</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

// Agregar tabs de navegación extras
function initPorteriaExtras() {
  if (!document.getElementById('home-0')) return;

  const tabsContainer = document.querySelector('.tabs');
  if (tabsContainer && !document.getElementById('tab-miembros')) {
    // Agregar tabs extras: miembros y asientos
    ['miembros', 'asientos'].forEach(name => {
      const tab = document.createElement('div');
      tab.className = 'tab-item';
      tab.id = 'tab-' + name;
      tab.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      tab.style.cursor = 'pointer';
      tabsContainer.appendChild(tab);
    });

    // Agregar contenedores de contenido
    const contentContainer = document.querySelector('.content');
    if (contentContainer) {
      const div3 = document.createElement('div');
      div3.id = 'home-3';
      div3.style.display = 'none';
      div3.innerHTML = '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);margin:16px 0 8px">Directorio de miembros</div><div id="miembros-preview"><div style="text-align:center;padding:32px 16px;color:var(--text2)">Cargando...</div></div><button class="btn-secondary" onclick="window.location.href=\'/miembros.html\'">Ver directorio completo →</button>';
      contentContainer.appendChild(div3);

      const div4 = document.createElement('div');
      div4.id = 'home-4';
      div4.style.display = 'none';
      div4.innerHTML = '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);margin:16px 0 8px">Mapa de asientos</div><div id="asientos-preview"><div style="text-align:center;padding:32px 16px;color:var(--text2)">Cargando...</div></div><button class="btn-secondary" onclick="window.location.href=\'/asientos.html\'">Abrir mapa de asientos →</button>';
      contentContainer.appendChild(div4);
    }

    // Configurar eventos de los nuevos tabs
    const allTabs = document.querySelectorAll('.tab-item');

    allTabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => {
        const tabs = document.querySelectorAll('.tab-item');
        const contents = [
          document.getElementById('home-0'),
          document.getElementById('home-1'),
          document.getElementById('home-2'),
          document.getElementById('home-3'),
          document.getElementById('home-4')
        ];

        tabs.forEach((t, i) => t.classList.toggle('active', i === idx));
        contents.forEach((c, i) => { if (c) c.style.display = i === idx ? 'block' : 'none'; });

        if (idx === 1) cargarHistorialPorteria();
        if (idx === 2) cargarGraficaPorteria('semana');
        if (idx === 3) cargarPreviewMiembros();
        if (idx === 4) cargarPreviewAsientos();
      });
    });
  }
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPorteriaExtras);
} else {
  setTimeout(initPorteriaExtras, 100);
}
