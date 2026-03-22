import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './middlewares/errorHandler.js';
import serviciosRoutes  from './modules/operacion/servicios/servicios.routes.js';
import asistenciaRoutes from './modules/operacion/asistencia/asistencia.routes.js';
import asientosRoutes   from './modules/operacion/asientos/asientos.routes.js';
import vehiculosRoutes  from './modules/operacion/vehiculos/vehiculos.routes.js';
import miembrosRoutes   from './modules/pastoral/miembros/miembros.routes.js';
import authRoutes       from './modules/auth/auth.routes.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());

// Frontend estático
app.use(express.static(join(process.cwd(), 'frontend')));

// Health check (público)
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// Rutas públicas
app.use('/api/auth', authRoutes);

// Rutas API (protegidas en cada módulo)
app.use('/api/servicios',  serviciosRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/asientos',   asientosRoutes);
app.use('/api/vehiculos',  vehiculosRoutes);
app.use('/api/miembros',   miembrosRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Iglesia API corriendo en http://localhost:${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}/login.html`);
});

export default app;
