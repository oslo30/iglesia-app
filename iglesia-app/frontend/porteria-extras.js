// Funciones de extensión para porteria.html
// Eliminado: tabs de miembros y asientos (no se usan en iglesia-app)

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
        statsEl.innerHTML = `<div class="hist-stats">
          <div class="hist-stat" style="background:var(--surface);border:1px solid var(--border)"><div class="hist-stat-val">${prom}</div><div class="hist-stat-lbl">Promedio</div></div>
          <div class="hist-stat" style="background:var(--surface);border:1px solid var(--border)"><div class="hist-stat-val" style="color:var(--primary)">${Math.max(...tots)}</div><div class="hist-stat-lbl">Máximo</div></div>
          <div class="hist-stat" style="background:var(--surface);border:1px solid var(--border)"><div class="hist-stat-val" style="color:var(--amber)">${Math.min(...tots)}</div><div class="hist-stat-lbl">Mínimo</div></div>
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
    el.innerHTML = '<div class="empty"><div class="empty-icon">📊</div><p>Sin registros aún</p></div>';
    return;
  }
  el.innerHTML = lista.map(r => {
    const svc = r.servicios || {};
    const fecha = svc.fecha_hora ? new Date(svc.fecha_hora).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
    const hora = svc.fecha_hora ? new Date(svc.fecha_hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
    const portero = r.registrado_por_nombre || 'No registrado';
    const caracter = svc.caracter || r.caracter || null;
    return `<div class="hist-card">
      <div class="hist-card-header">
        <div>
          <div class="hist-card-title">${svc.nombre || 'Servicio'}</div>
          <div class="hist-card-date">${fecha} · ${hora}</div>
        </div>
        <span class="hist-total-badge">${r.total ?? 0}</span>
      </div>
      <div class="hist-stats">
        <div class="hist-stat"><div class="hist-stat-val" style="color:var(--primary)">${r.adultos ?? 0}</div><div class="hist-stat-lbl">Adultos</div></div>
        <div class="hist-stat"><div class="hist-stat-val" style="color:var(--blue)">${r.ninos ?? 0}</div><div class="hist-stat-lbl">Niños</div></div>
        <div class="hist-stat"><div class="hist-stat-val" style="color:var(--amber)">${r.amigos ?? 0}</div><div class="hist-stat-lbl">Amigos</div></div>
      </div>
      ${r.notas ? `<div class="hist-notas">"${r.notas}"</div>` : ''}
      <div class="hist-meta"><span>👤 ${portero}</span>${caracter ? `<span class="hist-caracter">${caracter}</span>` : ''}</div>
      <div class="hist-actions">
        <button class="btn-sm" style="flex:1" onclick="abrirEditarHist(window['_hist_${r.id}'])">✏️ Editar</button>
        <button class="btn-sm btn-sm-danger" onclick="pedirEliminar('historial','${r.id}','${r.servicio_id || svc.id || ''}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}
