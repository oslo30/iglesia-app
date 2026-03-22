# Sistema de Gestión Iglesia Cristiana
**Stack:** Node.js + Express + Supabase (PostgreSQL)

## Arranque rápido

```bash
# 1. Clonar / descomprimir el proyecto
cd iglesia-app

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# → Edita .env con tus claves de Supabase

# 4. Crear base de datos
# → Abre app.supabase.com → SQL Editor
# → Pega el contenido de docs/iglesia_schema.sql
# → Ejecuta (Run)

# 5. Iniciar servidor
npm run dev
# ✅ API corriendo en http://localhost:3000

# 6. Abrir el frontend de portería
# → Abre frontend/porteria.html en tu navegador
# → O usa Live Server en VS Code
```

## Estructura del proyecto

```
src/
├── index.js                        ← Servidor Express
├── config/supabase.js              ← Cliente Supabase
├── middlewares/
│   ├── auth.js                     ← Verificación JWT
│   └── errorHandler.js             ← Manejo de errores
├── modules/operacion/
│   ├── servicios/servicios.js      ← CRUD de servicios
│   ├── asistencia/asistencia.js    ← Registro de asistencia
│   ├── asientos/asientos.js        ← Mapa de asientos
│   └── vehiculos/vehiculos.js      ← Asegurabilidad
└── utils/response.js               ← Respuestas estándar

frontend/
└── porteria.html                   ← App móvil PWA (porteros)

docs/
└── iglesia_schema.sql              ← Esquema completo PostgreSQL
```

## Endpoints disponibles — Fase 1

### Servicios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/servicios/hoy | Servicios de hoy |
| GET | /api/servicios | Listar con filtros |
| GET | /api/servicios/:id | Detalle |
| POST | /api/servicios | Crear servicio |
| PATCH | /api/servicios/:id/estado | Cambiar estado |

### Asistencia
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/asistencia/historial | Historial con filtros |
| GET | /api/asistencia/estadisticas | Stats del dashboard |
| GET | /api/asistencia/:servicioId | Registro de un servicio |
| POST | /api/asistencia/:servicioId | Crear/actualizar registro |

### Asientos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/asientos/:servicioId | Mapa del servicio |
| PATCH | /api/asientos/:servicioId/:asientoId | Cambiar estado |
| POST | /api/asientos/:servicioId/reset | Liberar todos |

### Vehículos (Asegurabilidad)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/vehiculos/buscar?placa= | Buscar por placa |
| GET | /api/vehiculos/activos | Dentro del servicio |
| GET | /api/vehiculos/servicio/:id | Historial del servicio |
| POST | /api/vehiculos/entrada | Registrar entrada |
| PATCH | /api/vehiculos/:id/salida | Registrar salida |

## Modo sin backend (offline)
El frontend tiene fallbacks con datos de ejemplo. Funciona sin API mientras
desarrollas. Solo en estos casos, conecta el API_BASE en porteria.html.

## Fase 3 — Próximos módulos
- [ ] Feligresía y grupos
- [ ] Ministerios y diáconos
- [ ] Finanzas y donaciones
- [ ] Eventos y recursos
- [ ] Dashboard estadístico
- [ ] Reportes PDF/Excel
