import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cron from 'node-cron';

import webhookRoutes from './routes/webhook.routes.js';
import publicStatsRoutes from './routes/publicStats.routes.js';
import { computeResolvedByBotTotals } from './services/publicStats.service.js';
import knowledgeRoutes from './routes/knowledge.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import configRoutes from './routes/config.routes.js';
import customerRoutes from './routes/customer.routes.js';
import testRoutes from './routes/test.routes.js';
import authRoutes from './routes/auth.routes.js';
import labelRoutes from './routes/label.routes.js';
import statsRoutes from './routes/stats.routes.js';
import quickReplyRoutes from './routes/quickreply.routes.js';
import templateRoutes from './routes/template.routes.js';
import costsRoutes from './routes/costs.routes.js';
import { initFirebase } from './services/firebase.service.js';
import areaRoutes from './routes/area.routes.js';
import projectRoutes from './routes/project.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import { seedAgentsIfNeeded } from './services/auth.service.js';
import { seedAreasIfNeeded } from './services/area.service.js';
import { requireAuth, requireAtLeastAtencionCliente } from './middleware/requireAuth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Init Firebase
initFirebase();
seedAgentsIfNeeded().catch(err => console.error('[seed] Error seeding agents:', err));
seedAreasIfNeeded().catch(err => console.error('[seed] Error seeding areas:', err));

// Contador de "resueltos por el bot" para la landing pública — se calcula al
// arrancar y después una vez al día. Vive acá porque los 4 bots comparten el
// mismo proyecto de Firebase, así que esta conexión ya puede leer los 4.
computeResolvedByBotTotals().catch(err => console.error('[public-stats] Error inicial:', err.message));
cron.schedule('0 9 * * *', () => {
  computeResolvedByBotTotals().catch(err => console.error('[cron] public-stats error:', err.message));
});

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s => s.trim()) : []),
].filter(Boolean);

// Público, CORS abierto — se registra antes del cors restrictivo de abajo
// para que una request a este path nunca pase por el chequeo de origin.
app.use('/api/public-stats', cors(), publicStatsRoutes);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));
app.use(morgan('dev'));

// Raw body para validación de firma Meta (debe ir antes del JSON parser)
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Routes (public)
app.use('/api/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);

// Routes (protected)
// Operador can access: conversations (filtered), labels
// atencion_cliente + admin: all of the below
app.use('/api/conversations', requireAuth, conversationRoutes);
app.use('/api/labels', requireAuth, labelRoutes);

// Requires at least atencion_cliente
app.use('/api/knowledge',     requireAuth, requireAtLeastAtencionCliente, knowledgeRoutes);
app.use('/api/config',        requireAuth, requireAtLeastAtencionCliente, configRoutes);
// Un operador que atiende una conversación derivada necesita ver el perfil
// del cliente (contacto, notas) y poder actualizarlo — no es una acción de
// administración global como el resto de este bloque.
app.use('/api/customers',     requireAuth, customerRoutes);
app.use('/api/test',          requireAuth, requireAtLeastAtencionCliente, testRoutes);
app.use('/api/stats',         requireAuth, requireAtLeastAtencionCliente, statsRoutes);
app.use('/api/quick-replies', requireAuth, requireAtLeastAtencionCliente, quickReplyRoutes);
// Los operadores necesitan leer templates: Conversations.jsx los usa para el
// modal de "nueva conversación" (disponible para cualquier rol) — la
// restricción de escritura (crear/sincronizar/borrar) vive dentro del router.
app.use('/api/templates',     requireAuth, templateRoutes);
app.use('/api/costs',         requireAuth, requireAtLeastAtencionCliente, costsRoutes);
// El propio router ya restringe crear/editar/borrar a requireAdmin —
// la lectura la necesita cualquier operador para derivar conversaciones.
app.use('/api/areas',         requireAuth, areaRoutes);
// Lectura abierta a cualquier rol autenticado (para vincular tickets);
// alta/baja/edición requiere al menos atencion_cliente (restringido dentro
// del propio router, igual criterio que /api/areas).
app.use('/api/projects',      requireAuth, projectRoutes);
// Sin restricción de rol adicional — cualquier agente autenticado puede ver,
// crear y comentar tickets (ver Global Constraints del plan).
app.use('/api/tickets',       requireAuth, ticketRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'bot-techdi' });
});

app.listen(PORT, () => {
  console.log(`[server] BOT-TECHDI corriendo en puerto ${PORT}`);
});

export default app;
