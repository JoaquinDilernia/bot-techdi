# Proyectos + Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new linked modules to BOT-TECHDI: a **Proyectos** database (clients/projects TechDI has built, each with one or more linked WhatsApp contacts) and a **Tickets** support-tracking system, where the bot can open a ticket conversationally when a client reports a problem, auto-linking it to the right project and notifying the client via an approved WhatsApp template when it's marked resolved.

**Architecture:** Two new Firestore-backed services/routes (`project.service.js`/`project.routes.js`, `ticket.service.js`/`ticket.routes.js`) following the exact CRUD patterns already used by `area.service.js`/`area.routes.js`. `bot.service.js` gains a new marker (`[CREAR_TICKET:{...}]`) parsed the same way as the existing `[ESCALAR_*]`/`[CERRAR]` markers. Two new admin panel pages (`Proyectos.jsx`, `Tickets.jsx`) follow the existing `Areas.jsx` CRUD-page pattern. No new external dependencies.

**Tech Stack:** Same as the rest of BOT-TECHDI — Node.js (ESM) + Express, Firebase Firestore, React + Vite + CSS Modules, Anthropic Claude API, Meta Cloud API.

**Spec:** `docs/superpowers/specs/2026-08-26-proyectos-tickets-design.md`

## Global Constraints

- Firestore collection prefix: `bot-techdi_` — new collections are `bot-techdi_projects` and `bot-techdi_tickets`.
- A Proyecto can have **multiple** linked contacts (array), not just one — confirmed design decision.
- Tickets are visible to **every authenticated role** (admin, atencion_cliente, operador) with **no area-based filtering** — confirmed design decision. Do not gate ticket routes behind `requireAtLeastAtencionCliente` or `requireAdmin` (only `requireAuth`, applied once at the `app.js` mount point like `/api/conversations` already is).
- Ticket-marker parsing follows the exact same pattern as `parseEscalationMarker`/`parseCloseMarker` already in `bot.service.js` — same file, same style, inserted into the same marker-parsing chain.
- The bot must **never** create a ticket silently — the resolved open decision from the spec is: Claude's own conversational text (not a separate hardcoded message) must mention that a ticket is being created, enforced via a new prompt instruction block in `claude.service.js`, **plus** a short follow-up confirmation message from `bot.service.js` after creation (mirrors the existing booking-confirmation pattern used elsewhere in this codebase family).
- Resolved open decisions from the spec (do not re-litigate, just implement as follows):
  - Notification template is looked up by a **fixed name**, `ticket_resuelto`, via the existing `getAllTemplates()` — not a new "purpose" field on the template model.
  - Default `assignedTo` on ticket creation is **looked up dynamically** (first agent with `role: 'admin'` via `listUsers()`) — never hardcode an email string in source.
  - Manual ticket creation from the panel **does** support uploading a brand-new image (not just referencing existing WhatsApp media) — reuses `uploadMetaMedia` exactly like the existing conversation media-upload endpoint does, and the resulting `mediaId` is served back through the **existing** `GET /api/conversations/media/:mediaId` route (no new media-serving endpoint needed).
- No automated test framework exists in this project (confirmed convention across this whole workspace) — verification is real boot + `curl`/`/api/test/message` checks + a manual panel pass, matching every other plan in this workspace.

---

## Task 1: `project.service.js` — Proyectos data layer

**Files:**
- Create: `server/src/services/project.service.js`

**Interfaces:**
- Produces: `getAllProjects()`, `getProjectById(id)`, `createProject({nombre, empresa, descripcion, estado, contactos})`, `updateProject(id, patch)`, `deleteProject(id)`, `findProjectByPhone(phone)` — `findProjectByPhone` is consumed by Task 5's `bot.service.js` change; the rest are consumed by Task 2's routes.

- [ ] **Step 1: Create `server/src/services/project.service.js`**

```js
import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-techdi_projects';

// contactPhones es un array plano de strings, separado de `contactos` (array
// de objetos), porque Firestore no permite hacer `array-contains` sobre un
// campo DENTRO de objetos anidados en un array — solo sobre valores
// primitivos. Se recalcula server-side en cada write, nunca se confía en que
// el cliente lo mande sincronizado con `contactos`.
function buildContactPhones(contactos = []) {
  return [...new Set(contactos.map(c => c.telefono).filter(Boolean))];
}

export async function getAllProjects() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('nombre').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProjectById(id) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function createProject({ nombre, empresa, descripcion = '', estado = 'activo', contactos = [] }) {
  const db = getDb();
  const project = {
    nombre,
    empresa,
    descripcion,
    estado,
    contactos,
    contactPhones: buildContactPhones(contactos),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const ref = await db.collection(COLLECTION).add(project);
  return { id: ref.id, ...project };
}

export async function updateProject(id, { nombre, empresa, descripcion, estado, contactos } = {}) {
  const db = getDb();
  const update = { updatedAt: new Date() };
  if (nombre !== undefined) update.nombre = nombre;
  if (empresa !== undefined) update.empresa = empresa;
  if (descripcion !== undefined) update.descripcion = descripcion;
  if (estado !== undefined) update.estado = estado;
  if (contactos !== undefined) {
    update.contactos = contactos;
    update.contactPhones = buildContactPhones(contactos);
  }
  await db.collection(COLLECTION).doc(id).update(update);
  const doc = await db.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deleteProject(id) {
  await getDb().collection(COLLECTION).doc(id).delete();
}

// Usado por bot.service.js para vincular un ticket al proyecto correcto según
// el número de WhatsApp que escribe. Sin `.orderBy()` a propósito — una
// equality-only query con `array-contains` no necesita un índice compuesto
// (mismo criterio ya aplicado en otros bots de este workspace para no
// depender de índices que no existen todavía en un proyecto Firestore
// recién creado/migrado).
export async function findProjectByPhone(phone) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('contactPhones', 'array-contains', phone).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
```

- [ ] **Step 2: Verify syntax**

```bash
cd server && node -c src/services/project.service.js
```

Expected: no output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add server/src/services/project.service.js
git commit -m "Add project.service.js (Proyectos data layer)"
```

---

## Task 2: `project.routes.js` + wire into `app.js`

**Files:**
- Create: `server/src/routes/project.routes.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Produces: `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects`, `PUT /api/projects/:id`, `DELETE /api/projects/:id` — consumed by Task 7's `Proyectos.jsx`.

- [ ] **Step 1: Create `server/src/routes/project.routes.js`**

```js
import { Router } from 'express';
import { requireAtLeastAtencionCliente } from '../middleware/requireAuth.js';
import {
  getAllProjects, getProjectById, createProject, updateProject, deleteProject,
} from '../services/project.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json({ projects: await getAllProjects() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAtLeastAtencionCliente, async (req, res) => {
  const { nombre, empresa, descripcion, estado, contactos } = req.body;
  if (!nombre?.trim() || !empresa?.trim()) return res.status(400).json({ error: 'nombre y empresa son requeridos' });
  try {
    const project = await createProject({
      nombre: nombre.trim(),
      empresa: empresa.trim(),
      descripcion: descripcion ?? '',
      estado: estado || 'activo',
      contactos: contactos ?? [],
    });
    res.status(201).json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAtLeastAtencionCliente, async (req, res) => {
  try {
    const project = await updateProject(req.params.id, req.body);
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAtLeastAtencionCliente, async (req, res) => {
  try {
    await deleteProject(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Wire into `server/src/app.js`**

```
old: import areaRoutes from './routes/area.routes.js';
new:
import areaRoutes from './routes/area.routes.js';
import projectRoutes from './routes/project.routes.js';
```

```
old: app.use('/api/areas',         requireAuth, areaRoutes);
new:
app.use('/api/areas',         requireAuth, areaRoutes);
// Lectura abierta a cualquier rol autenticado (para vincular tickets);
// alta/baja/edición requiere al menos atencion_cliente (restringido dentro
// del propio router, igual criterio que /api/areas).
app.use('/api/projects',      requireAuth, projectRoutes);
```

- [ ] **Step 3: Boot and verify**

```bash
cd server && npm run dev
```

In another terminal (get a token first via `POST /api/auth/login` with your admin credentials):

```bash
curl -s http://localhost:3001/api/projects -H "Authorization: Bearer <token>"
```

Expected: `{"projects":[]}` (empty, nothing created yet).

```bash
curl -s -X POST http://localhost:3001/api/projects -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"nombre":"Bot de prueba","empresa":"Cliente Test","contactos":[{"nombre":"Juan","telefono":"5491100000001","email":"juan@test.com"}]}'
```

Expected: `201` with the created project, including `"contactPhones":["5491100000001"]` computed server-side.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/project.routes.js server/src/app.js
git commit -m "Add project.routes.js, wire into app.js"
```

---

## Task 3: `ticket.service.js` — Tickets data layer + resolution notification

**Files:**
- Create: `server/src/services/ticket.service.js`

**Interfaces:**
- Consumes: `listUsers` from `./auth.service.js` (Task 3's own import — already exists, unchanged), `getAllTemplates` from `./template.service.js` (already exists, unchanged), `sendWhatsAppTemplate` from `./meta.service.js` (already exists, unchanged, signature `(to, templateName, language, params)`).
- Produces: `getAllTickets({estado, prioridad})`, `getTicketById(id)`, `getDefaultAssignee()`, `createTicket({...})`, `updateTicket(id, patch)`, `addComment(id, {autor, texto})` — consumed by Task 4's routes and Task 5's `bot.service.js`.

- [ ] **Step 1: Create `server/src/services/ticket.service.js`**

```js
import { getDb } from './firebase.service.js';
import { listUsers } from './auth.service.js';
import { getAllTemplates } from './template.service.js';
import { sendWhatsAppTemplate } from './meta.service.js';

const COLLECTION = 'bot-techdi_tickets';
const RESOLVED_TEMPLATE_NAME = 'ticket_resuelto';

// Filtra en memoria en vez de con `.where()` encadenados: el volumen esperado
// de tickets es bajo (herramienta interna de soporte de TechDI, no un
// sistema de alto tráfico) y así se evita necesitar un índice compuesto para
// cada combinación de estado+prioridad+orderBy.
export async function getAllTickets({ estado, prioridad } = {}) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
  let tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (estado) tickets = tickets.filter(t => t.estado === estado);
  if (prioridad) tickets = tickets.filter(t => t.prioridad === prioridad);
  return tickets;
}

export async function getTicketById(id) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// Ticket sin asignación explícita cae en el primer agente admin — resuelto
// dinámicamente (nunca un email hardcodeado) para no romper si cambia quién
// es el admin.
export async function getDefaultAssignee() {
  const users = await listUsers();
  const admin = users.find(u => u.role === 'admin');
  return admin?.email ?? null;
}

export async function createTicket({ titulo, descripcion, proyectoId = null, contactId = null, prioridad = 'media', imagenes = [], createdBy }) {
  const db = getDb();
  const assignedTo = await getDefaultAssignee();
  const ticket = {
    titulo,
    descripcion,
    proyectoId,
    contactId,
    conversationId: contactId,
    prioridad,
    estado: 'abierto',
    imagenes,
    createdBy,
    assignedTo,
    comentarios: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
  };
  const ref = await db.collection(COLLECTION).add(ticket);
  return { id: ref.id, ...ticket };
}

export async function updateTicket(id, { titulo, descripcion, prioridad, estado, assignedTo, proyectoId, imagenes } = {}) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(id);
  const before = await docRef.get();
  if (!before.exists) throw new Error('Ticket no encontrado');
  const beforeData = before.data();

  const update = { updatedAt: new Date() };
  if (titulo !== undefined) update.titulo = titulo;
  if (descripcion !== undefined) update.descripcion = descripcion;
  if (prioridad !== undefined) update.prioridad = prioridad;
  if (assignedTo !== undefined) update.assignedTo = assignedTo;
  if (proyectoId !== undefined) update.proyectoId = proyectoId;
  if (imagenes !== undefined) update.imagenes = imagenes;

  const justResolved = estado === 'resuelto' && beforeData.estado !== 'resuelto';
  if (estado !== undefined) {
    update.estado = estado;
    if (justResolved) update.resolvedAt = new Date();
  }

  await docRef.update(update);
  const after = await docRef.get();
  const ticket = { id: after.id, ...after.data() };

  if (justResolved && ticket.contactId) {
    // Fire-and-forget — un fallo notificando no debe bloquear ni revertir el
    // cambio de estado que el agente ya confirmó.
    notifyTicketResolved(ticket).catch(err => console.error('[ticket] Error notificando resolución:', err.message));
  }

  return ticket;
}

export async function addComment(id, { autor, texto }) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error('Ticket no encontrado');
  const comentarios = [...(doc.data().comentarios ?? []), { autor, texto, createdAt: new Date() }];
  await docRef.update({ comentarios, updatedAt: new Date() });
  return comentarios;
}

async function notifyTicketResolved(ticket) {
  const templates = await getAllTemplates();
  const approved = templates.find(t => t.name === RESOLVED_TEMPLATE_NAME && t.metaStatus === 'APPROVED');
  if (!approved) {
    console.warn(`[ticket] Plantilla "${RESOLVED_TEMPLATE_NAME}" no existe o no está aprobada en Meta todavía — no se notifica al cliente. Creála desde Plantillas cuando esté lista.`);
    return;
  }
  await sendWhatsAppTemplate(ticket.contactId, RESOLVED_TEMPLATE_NAME, approved.language ?? 'es_AR', [ticket.titulo]);
  console.log(`[ticket] Notificación de resolución enviada para ticket ${ticket.id}`);
}
```

- [ ] **Step 2: Verify syntax**

```bash
cd server && node -c src/services/ticket.service.js
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/ticket.service.js
git commit -m "Add ticket.service.js (Tickets data layer + resolution notification)"
```

---

## Task 4: `ticket.routes.js` (+ image upload) + wire into `app.js`

**Files:**
- Create: `server/src/routes/ticket.routes.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Produces: `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets`, `PUT /api/tickets/:id`, `POST /api/tickets/:id/comments`, `POST /api/tickets/upload-image` — consumed by Task 8's `Tickets.jsx`.
- Consumes: `uploadMetaMedia` from `../services/meta.service.js` (already exists, unchanged).

- [ ] **Step 1: Create `server/src/routes/ticket.routes.js`**

```js
import { Router } from 'express';
import multer from 'multer';
import { uploadMetaMedia } from '../services/meta.service.js';
import {
  getAllTickets, getTicketById, createTicket, updateTicket, addComment,
} from '../services/ticket.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  try {
    const { estado, prioridad } = req.query;
    res.json({ tickets: await getAllTickets({ estado, prioridad }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { titulo, descripcion, proyectoId, contactId, prioridad, imagenes } = req.body;
  if (!titulo?.trim() || !descripcion?.trim()) return res.status(400).json({ error: 'titulo y descripcion son requeridos' });
  try {
    const ticket = await createTicket({
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      proyectoId: proyectoId || null,
      contactId: contactId || null,
      prioridad: prioridad || 'media',
      imagenes: imagenes || [],
      createdBy: req.agent.email,
    });
    res.status(201).json({ ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ticket = await updateTicket(req.params.id, req.body);
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/comments', async (req, res) => {
  const { texto } = req.body;
  if (!texto?.trim()) return res.status(400).json({ error: 'texto es requerido' });
  try {
    const comentarios = await addComment(req.params.id, { autor: req.agent.email, texto: texto.trim() });
    res.json({ comentarios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sube una imagen nueva (no vinculada a ningún mensaje de WhatsApp existente)
// para adjuntar a un ticket cargado a mano desde el panel. Reutiliza
// uploadMetaMedia — el archivo termina alojado en Meta igual que cualquier
// media de WhatsApp, así que se sirve después con el mismo
// GET /api/conversations/media/:mediaId que ya existe (no hace falta un
// endpoint de lectura nuevo).
router.post('/upload-image', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  try {
    const { buffer, mimetype } = req.file;
    if (!mimetype.startsWith('image/')) return res.status(400).json({ error: 'Solo se aceptan imágenes' });
    const mediaId = await uploadMetaMedia(buffer, mimetype);
    if (!mediaId) return res.status(503).json({ error: 'Meta no configurado — no se pudo subir la imagen' });
    res.json({ mediaId, mimeType: mimetype });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

Note: deliberately **no** `requireAtLeastAtencionCliente`/`requireAdmin` on any route here — per Global Constraints, every authenticated role can read, create, update, and comment on tickets.

- [ ] **Step 2: Wire into `server/src/app.js`**

```
old: import projectRoutes from './routes/project.routes.js';
new:
import projectRoutes from './routes/project.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
```

```
old:
app.use('/api/projects',      requireAuth, projectRoutes);
new:
app.use('/api/projects',      requireAuth, projectRoutes);
// Sin restricción de rol adicional — cualquier agente autenticado puede ver,
// crear y comentar tickets (ver Global Constraints del plan).
app.use('/api/tickets',       requireAuth, ticketRoutes);
```

- [ ] **Step 3: Boot and verify**

```bash
cd server && npm run dev
```

```bash
curl -s -X POST http://localhost:3001/api/tickets -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"titulo":"Botón roto","descripcion":"El botón de enviar no responde en mobile","prioridad":"alta"}'
```

Expected: `201` with the created ticket — `estado: "abierto"`, `assignedTo` populated with the admin's email (not null, not a hardcoded string — confirm it matches the real seeded admin email), `comentarios: []`.

```bash
curl -s http://localhost:3001/api/tickets -H "Authorization: Bearer <token>"
```

Expected: array with the one ticket just created.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/ticket.routes.js server/src/app.js
git commit -m "Add ticket.routes.js (+ image upload), wire into app.js"
```

---

## Task 5: `bot.service.js` — ticket marker parsing + creation flow

**Files:**
- Modify: `server/src/services/bot.service.js`

**Interfaces:**
- Consumes: `findProjectByPhone` from `./project.service.js` (Task 1), `createTicket` from `./ticket.service.js` (Task 3).
- No exported name changes — `processIncomingMessage` and `isWithinBusinessHours` keep their exact signatures.

- [ ] **Step 1: Add the two new imports**

```
old: import { getActiveAreas } from './area.service.js';
new:
import { getActiveAreas } from './area.service.js';
import { findProjectByPhone } from './project.service.js';
import { createTicket } from './ticket.service.js';
```

- [ ] **Step 2: Add `parseTicketMarker` next to the other marker parsers**

```
old:
function parseLabelMarkers(text) {
new:
function parseTicketMarker(text) {
  const match = text.match(/\[CREAR_TICKET:({.*?})\]/i);
  if (!match) return { shouldCreateTicket: false, ticketParams: null, cleanText: text };
  let ticketParams = null;
  try {
    ticketParams = JSON.parse(match[1]);
  } catch {
    ticketParams = null;
  }
  const cleanText = text.replace(match[0], '').trim();
  return { shouldCreateTicket: !!ticketParams, ticketParams, cleanText };
}

function parseLabelMarkers(text) {
```

- [ ] **Step 3: Insert the ticket-marker step into the parsing chain**

```
old:
  const { shouldEscalate, assignTo, cleanText: textAfterEscalation } = parseEscalationMarker(botReply, areas);
  const { shouldClose, cleanText: textAfterClose } = parseCloseMarker(textAfterEscalation);
  const { labels: botLabels, newLabels: botNewLabels, cleanText: textAfterLabels } = parseLabelMarkers(textAfterClose);
  const cleanText = toWhatsAppBold(textAfterLabels);
new:
  const { shouldEscalate, assignTo, cleanText: textAfterEscalation } = parseEscalationMarker(botReply, areas);
  const { shouldClose, cleanText: textAfterClose } = parseCloseMarker(textAfterEscalation);
  const { shouldCreateTicket, ticketParams, cleanText: textAfterTicket } = parseTicketMarker(textAfterClose);
  const { labels: botLabels, newLabels: botNewLabels, cleanText: textAfterLabels } = parseLabelMarkers(textAfterTicket);
  const cleanText = toWhatsAppBold(textAfterLabels);
```

- [ ] **Step 4: Add the ticket-creation block after the WhatsApp/Instagram send, before the escalation handling**

```
old:
  } else if (channel === 'instagram') {
    if (cleanText.trim()) {
      try {
        await sendInstagramMessage(from, cleanText);
      } catch (sendErr) {
        console.error(`[bot] ERROR enviando IG a ${from}:`, sendErr.response?.data ?? sendErr.message);
      }
    }
  }

  if (shouldEscalate) {
new:
  } else if (channel === 'instagram') {
    if (cleanText.trim()) {
      try {
        await sendInstagramMessage(from, cleanText);
      } catch (sendErr) {
        console.error(`[bot] ERROR enviando IG a ${from}:`, sendErr.response?.data ?? sendErr.message);
      }
    }
  }

  if (shouldCreateTicket && ticketParams) {
    try {
      const project = await findProjectByPhone(from).catch(() => null);
      // Si el mensaje que disparó el ticket era una imagen, se adjunta esa.
      // Si no, se busca la última imagen que el cliente mandó en el
      // historial reciente (el historial cargado al principio del turno
      // todavía no incluye el mensaje actual, así que no hay doble conteo).
      const lastImageMsg = [...history].reverse().find(m => m.role === 'user' && m.mediaType === 'image' && m.mediaId);
      const imageMediaId = (type === 'image' && mediaId) ? mediaId : (lastImageMsg?.mediaId ?? null);

      const ticket = await createTicket({
        titulo: ticketParams.titulo || 'Ticket sin título',
        descripcion: ticketParams.descripcion || '',
        proyectoId: project?.id ?? null,
        contactId: from,
        prioridad: ['baja', 'media', 'alta', 'urgente'].includes(ticketParams.prioridad) ? ticketParams.prioridad : 'media',
        imagenes: imageMediaId ? [{ mediaId: imageMediaId, mimeType: 'image/jpeg' }] : [],
        createdBy: 'bot',
      });
      console.log(`[bot] Ticket ${ticket.id} creado para ${from}${project ? ` (proyecto: ${project.nombre})` : ' (sin proyecto vinculado)'}`);

      const confirmMsg = `✅ Ticket #${ticket.id.slice(0, 6)} creado — en breve el equipo te contacta.`;
      await appendMessage(from, { role: 'assistant', content: confirmMsg });
      if (channel === 'whatsapp') await sendWhatsAppMessage(from, confirmMsg).catch(() => {});
      else if (channel === 'instagram') await sendInstagramMessage(from, confirmMsg).catch(() => {});
    } catch (err) {
      console.error('[bot] Error creando ticket:', err.message);
    }
  }

  if (shouldEscalate) {
```

- [ ] **Step 5: Verify syntax**

```bash
cd server && node -c src/services/bot.service.js
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/bot.service.js
git commit -m "Add ticket-marker parsing and creation flow to bot.service.js"
```

(Server won't fully exercise this yet — Task 6 adds the prompt instructions that make Claude actually emit `[CREAR_TICKET:...]`. Verification happens end-to-end in Task 9.)

---

## Task 6: `claude.service.js` — ticket prompt instructions

**Files:**
- Modify: `server/src/services/claude.service.js`

**Interfaces:**
- No signature changes to `generateBotResponse`/`buildSystemPrompt` — this task only adds a new prompt-building function and calls it.

- [ ] **Step 1: Add `buildTicketInstructions` next to `buildEscalationInstructions`**

```
old: function callAnthropicAPIOnce(payload) {
new:
function buildTicketInstructions() {
  return `
IMPORTANTE — TICKETS DE SOPORTE: Cuando un cliente describe un problema técnico, un bug, o algo que no funciona bien en un desarrollo/sistema que TechDI le hizo, conversá primero para juntar un título breve y una descripción clara del problema (y si es evidente qué tan urgente es, mejor — si no, no importa). Antes o junto con el marcador, avisale EXPLÍCITAMENTE en tu texto que le estás generando un ticket de soporte — nunca lo hagas en silencio. Recién ahí, en una línea separada (invisible para el cliente), agregá:
[CREAR_TICKET:{"titulo":"...","descripcion":"...","prioridad":"baja|media|alta|urgente"}]
El JSON tiene que ser válido y tener exactamente esas 3 claves. Si todavía no tenés información suficiente para un título/descripción claros, seguí preguntando antes de usar el marcador — nunca lo generes con datos vacíos o inventados.`;
}

function callAnthropicAPIOnce(payload) {
```

- [ ] **Step 2: Call it from `buildSystemPrompt`**

```
old:
  let prompt = `Sos el asistente virtual de ${businessName}. Tu nombre es ${botName}.\n${personality}`;
  prompt += buildEscalationInstructions(areas);
new:
  let prompt = `Sos el asistente virtual de ${businessName}. Tu nombre es ${botName}.\n${personality}`;
  prompt += buildEscalationInstructions(areas);
  prompt += buildTicketInstructions();
```

- [ ] **Step 3: Verify syntax**

```bash
cd server && node -c src/services/claude.service.js
```

- [ ] **Step 4: Commit**

```bash
git add server/src/services/claude.service.js
git commit -m "Add ticket-creation instructions to the bot's system prompt"
```

---

## Task 7: `Proyectos.jsx` admin page + nav wiring

**Files:**
- Create: `client/src/pages/Proyectos.jsx`
- Create: `client/src/pages/Proyectos.module.css`
- Modify: `client/src/components/Layout/Layout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/projects*` (Task 2).
- No new client-side exports consumed elsewhere.

- [ ] **Step 1: Create `client/src/pages/Proyectos.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { authFetch, BASE_URL } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import styles from './Proyectos.module.css';

const EMPTY_CONTACT = { nombre: '', telefono: '', email: '' };
const EMPTY_PROJECT = { nombre: '', empresa: '', descripcion: '', estado: 'activo', contactos: [] };

export default function Proyectos() {
  const { agent } = useAuth();
  const canEdit = agent?.role === 'admin' || agent?.role === 'atencion_cliente';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // objeto proyecto en edición, o null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await authFetch(BASE_URL + '/api/projects');
      if (r.ok) setProjects((await r.json()).projects ?? []);
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setEditing({ ...EMPTY_PROJECT, contactos: [{ ...EMPTY_CONTACT }] });
    setError('');
  }

  function startEdit(project) {
    setEditing({ ...project, contactos: project.contactos?.length ? project.contactos.map(c => ({ ...c })) : [{ ...EMPTY_CONTACT }] });
    setError('');
  }

  function cancelEdit() {
    setEditing(null);
    setError('');
  }

  function updateContact(idx, field, value) {
    setEditing(prev => ({
      ...prev,
      contactos: prev.contactos.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    }));
  }

  function addContact() {
    setEditing(prev => ({ ...prev, contactos: [...prev.contactos, { ...EMPTY_CONTACT }] }));
  }

  function removeContact(idx) {
    setEditing(prev => ({ ...prev, contactos: prev.contactos.filter((_, i) => i !== idx) }));
  }

  async function save() {
    if (!editing.nombre.trim() || !editing.empresa.trim()) {
      setError('Nombre y empresa son requeridos');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const contactos = editing.contactos.filter(c => c.telefono.trim());
      const body = { ...editing, contactos };
      const isNew = !editing.id;
      const r = await authFetch(BASE_URL + '/api/projects' + (isNew ? '' : `/${editing.id}`), {
        method: isNew ? 'POST' : 'PUT',
        body,
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Error guardando el proyecto');
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar este proyecto? Los tickets ya vinculados no se borran, pero quedan sin proyecto asociado.')) return;
    const r = await authFetch(BASE_URL + `/api/projects/${id}`, { method: 'DELETE' });
    if (r.ok) load();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Proyectos</h1>
          <p className={styles.subtitle}>Clientes y desarrollos de TechDI — vinculá los contactos de WhatsApp de cada uno para que el bot arme tickets con el proyecto correcto.</p>
        </div>
        {canEdit && !editing && (
          <button className={styles.newBtn} onClick={startNew}>+ Nuevo proyecto</button>
        )}
      </div>

      {editing && (
        <div className={styles.editCard}>
          <h2 className={styles.editTitle}>{editing.id ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Nombre del proyecto</span>
              <input value={editing.nombre} onChange={e => setEditing({ ...editing, nombre: e.target.value })} placeholder="Ej: Bot Altorancho" />
            </label>
            <label className={styles.field}>
              <span>Empresa</span>
              <input value={editing.empresa} onChange={e => setEditing({ ...editing, empresa: e.target.value })} placeholder="Ej: Alto Rancho SRL" />
            </label>
          </div>
          <label className={styles.field}>
            <span>Descripción (opcional)</span>
            <textarea rows={2} value={editing.descripcion} onChange={e => setEditing({ ...editing, descripcion: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Estado</span>
            <select value={editing.estado} onChange={e => setEditing({ ...editing, estado: e.target.value })}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>

          <div className={styles.contactsBlock}>
            <span className={styles.contactsLabel}>Contactos vinculados</span>
            {editing.contactos.map((c, idx) => (
              <div key={idx} className={styles.contactRow}>
                <input placeholder="Nombre" value={c.nombre} onChange={e => updateContact(idx, 'nombre', e.target.value)} />
                <input placeholder="Teléfono (ej: 5491100000001)" value={c.telefono} onChange={e => updateContact(idx, 'telefono', e.target.value)} />
                <input placeholder="Email" value={c.email} onChange={e => updateContact(idx, 'email', e.target.value)} />
                <button type="button" className={styles.removeContactBtn} onClick={() => removeContact(idx)} title="Quitar contacto">✕</button>
              </div>
            ))}
            <button type="button" className={styles.addContactBtn} onClick={addContact}>+ Agregar contacto</button>
          </div>

          <div className={styles.editActions}>
            <button className={styles.cancelBtn} onClick={cancelEdit} disabled={saving}>Cancelar</button>
            <button className={styles.saveBtn} onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : projects.length === 0 ? (
        <p className={styles.empty}>No hay proyectos cargados todavía.</p>
      ) : (
        <div className={styles.list}>
          {projects.map(p => (
            <div key={p.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{p.nombre}</span>
                <span className={`${styles.statusBadge} ${p.estado === 'activo' ? styles.statusActive : styles.statusInactive}`}>{p.estado}</span>
              </div>
              <span className={styles.cardEmpresa}>{p.empresa}</span>
              {p.descripcion && <p className={styles.cardDesc}>{p.descripcion}</p>}
              <div className={styles.cardContacts}>
                {(p.contactos ?? []).map((c, i) => (
                  <span key={i} className={styles.contactChip}>{c.nombre || c.telefono}</span>
                ))}
              </div>
              {canEdit && (
                <div className={styles.cardActions}>
                  <button className={styles.editBtn} onClick={() => startEdit(p)}>Editar</button>
                  <button className={styles.deleteBtn} onClick={() => remove(p.id)}>Eliminar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/Proyectos.module.css`**

```css
.page {
  padding: var(--space-6);
  max-width: 900px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-text);
}

.subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-1);
  max-width: 520px;
}

.newBtn {
  height: 36px;
  padding: 0 var(--space-4);
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.editCard {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  margin-bottom: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.editTitle {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.formRow {
  display: flex;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.field input,
.field select,
.field textarea {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text);
  background: var(--color-bg);
}

.contactsBlock {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}

.contactsLabel {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.contactRow {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.contactRow input {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  font-size: var(--font-size-sm);
}

.removeContactBtn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}

.addContactBtn {
  align-self: flex-start;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
}

.editActions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.cancelBtn {
  height: 34px;
  padding: 0 var(--space-4);
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.saveBtn {
  height: 34px;
  padding: 0 var(--space-4);
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
}
.saveBtn:disabled, .cancelBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.empty {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cardName {
  font-weight: 600;
  color: var(--color-text);
}

.statusBadge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  text-transform: capitalize;
}
.statusActive { background: var(--color-status-resolved-bg, #dcfce7); color: var(--color-status-resolved, #16a34a); }
.statusInactive { background: var(--color-surface-alt); color: var(--color-text-secondary); }

.cardEmpresa {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.cardDesc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.cardContacts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.contactChip {
  font-size: 11px;
  background: var(--color-surface-alt);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  color: var(--color-text-secondary);
}

.cardActions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.editBtn, .deleteBtn {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
}

.deleteBtn {
  color: var(--color-error);
}
```

- [ ] **Step 3: Add the nav item to `client/src/components/Layout/Layout.jsx`**

First add the icon component (place it near `IconDepartment`):

```
old:
function IconDepartment({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
new:
function IconDepartment({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconFolder({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
```

(Close that new function the same way `IconDepartment` closes, i.e. `</svg>\n  );\n}` right after — match the exact closing pattern used by the sibling icon functions in this file.)

Then add the nav entry:

```
old:
  { to: '/areas',         label: 'Áreas',           icon: IconDepartment, minRole: 'atencion_cliente' },
new:
  { to: '/areas',         label: 'Áreas',           icon: IconDepartment, minRole: 'atencion_cliente' },
  { to: '/proyectos',     label: 'Proyectos',       icon: IconFolder },
```

(No `minRole` — per `// minRole: undefined = all` already documented in this file, visible to every role including `operador`.)

- [ ] **Step 4: Add the route to `client/src/App.jsx`**

Find the existing route registration pattern (mirrors how `areas`/other pages are wired — read the file to find the exact import list and `<Route>` block) and add:

```
import Proyectos from './pages/Proyectos.jsx';
```

and, inside the same nested `<Route>` block as the other authenticated pages:

```
<Route path="proyectos" element={<Proyectos />} />
```

- [ ] **Step 5: Build and verify**

```bash
cd client && npm run build
```

Expected: clean build, no errors.

Boot both server and client locally, log in, click "Proyectos" in the sidebar, create a test project with one contact, confirm it appears in the list and `contactPhones` was computed (check via `curl .../api/projects` or Firestore console).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Proyectos.jsx client/src/pages/Proyectos.module.css client/src/components/Layout/Layout.jsx client/src/App.jsx
git commit -m "Add Proyectos admin page + nav wiring"
```

---

## Task 8: `Tickets.jsx` admin page + nav wiring + conversation deep-link

**Files:**
- Create: `client/src/pages/Tickets.jsx`
- Create: `client/src/pages/Tickets.module.css`
- Modify: `client/src/components/Layout/Layout.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/Conversations.jsx` (small addition: auto-select a conversation from a `?contact=` URL query param, so the ticket detail's "ver conversación" link actually jumps to it)

**Interfaces:**
- Consumes: `GET/POST/PUT /api/tickets*`, `POST /api/tickets/:id/comments`, `POST /api/tickets/upload-image` (Task 4), `GET /api/projects` (Task 2, for the proyecto-picker dropdown), `GET /api/conversations/media/:mediaId` (already exists, unchanged — used to render ticket images).

- [ ] **Step 1: Add the query-param deep-link to `client/src/pages/Conversations.jsx`**

Find where `conversations` state is loaded/set (the effect that runs on mount and populates the conversation list), and add a one-time effect that reads `?contact=` from the URL and auto-selects that conversation once the list is loaded:

```js
useEffect(() => {
  if (!conversations.length) return;
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const contactParam = params.get('contact');
  if (!contactParam) return;
  const match = conversations.find(c => c.id === contactParam || c.contactId === contactParam);
  if (match) setSelected(match);
}, [conversations]);
```

Place this near the other `useEffect` calls in the component (after the state declarations, alongside the existing data-loading effects). This only fires once conversations are loaded and only acts if the URL actually has `?contact=` — it's a no-op for normal navigation to `/conversations` without that param, so it cannot change existing behavior.

- [ ] **Step 2: Create `client/src/pages/Tickets.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { authFetch, BASE_URL } from '../lib/api';
import styles from './Tickets.module.css';

const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
const EMPTY_TICKET = { titulo: '', descripcion: '', prioridad: 'media', proyectoId: '', contactId: '' };

function TicketImage({ mediaId }) {
  const token = localStorage.getItem('techdi_token');
  return (
    <img
      className={styles.ticketImg}
      src={`${BASE_URL}/api/conversations/media/${mediaId}?token=${token}`}
      alt="Adjunto del ticket"
    />
  );
}

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPrioridad, setFilterPrioridad] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newTicket, setNewTicket] = useState(EMPTY_TICKET);
  const [newImage, setNewImage] = useState(null); // { mediaId, mimeType } tras subir
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  useEffect(() => { load(); loadProjects(); }, [filterEstado, filterPrioridad]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEstado) params.set('estado', filterEstado);
      if (filterPrioridad) params.set('prioridad', filterPrioridad);
      const r = await authFetch(BASE_URL + '/api/tickets?' + params.toString());
      if (r.ok) {
        const data = await r.json();
        setTickets(data.tickets ?? []);
        // Si el ticket seleccionado sigue en la lista nueva, refrescá su
        // referencia (por si cambió estado desde otra pestaña); si no, deselecciona.
        setSelected(prev => (prev ? data.tickets?.find(t => t.id === prev.id) ?? null : null));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    const r = await authFetch(BASE_URL + '/api/projects');
    if (r.ok) setProjects((await r.json()).projects ?? []);
  }

  function projectName(id) {
    return projects.find(p => p.id === id)?.nombre ?? null;
  }

  async function updateSelected(patch) {
    if (!selected) return;
    const r = await authFetch(BASE_URL + `/api/tickets/${selected.id}`, { method: 'PUT', body: patch });
    if (r.ok) {
      const { ticket } = await r.json();
      setSelected(ticket);
      setTickets(prev => prev.map(t => (t.id === ticket.id ? ticket : t)));
    }
  }

  async function addComment() {
    if (!commentText.trim() || !selected) return;
    setSavingComment(true);
    try {
      const r = await authFetch(BASE_URL + `/api/tickets/${selected.id}/comments`, { method: 'POST', body: { texto: commentText.trim() } });
      if (r.ok) {
        const { comentarios } = await r.json();
        setSelected(prev => ({ ...prev, comentarios }));
        setCommentText('');
      }
    } finally {
      setSavingComment(false);
    }
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await authFetch(BASE_URL + '/api/tickets/upload-image', { method: 'POST', body: form });
      if (r.ok) {
        const data = await r.json();
        setNewImage(data);
      } else {
        const data = await r.json().catch(() => ({}));
        alert(`⚠️ ${data.error ?? 'Error subiendo la imagen'}`);
      }
    } finally {
      setUploadingImage(false);
    }
  }

  async function createTicket() {
    if (!newTicket.titulo.trim() || !newTicket.descripcion.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...newTicket,
        proyectoId: newTicket.proyectoId || null,
        contactId: newTicket.contactId || null,
        imagenes: newImage ? [newImage] : [],
      };
      const r = await authFetch(BASE_URL + '/api/tickets', { method: 'POST', body });
      if (r.ok) {
        setShowNew(false);
        setNewTicket(EMPTY_TICKET);
        setNewImage(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.list}>
        <div className={styles.listHeader}>
          <h1 className={styles.title}>Tickets</h1>
          <button className={styles.newBtn} onClick={() => setShowNew(true)}>+ Nuevo</button>
        </div>
        <div className={styles.filters}>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
          </select>
          <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value)}>
            <option value="">Toda prioridad</option>
            {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {loading ? (
          <p className={styles.empty}>Cargando...</p>
        ) : tickets.length === 0 ? (
          <p className={styles.empty}>No hay tickets.</p>
        ) : (
          tickets.map(t => (
            <button key={t.id} className={`${styles.ticketItem} ${selected?.id === t.id ? styles.ticketItemActive : ''}`} onClick={() => setSelected(t)}>
              <span className={styles.ticketItemTitle}>{t.titulo}</span>
              <div className={styles.ticketItemMeta}>
                <span className={`${styles.badge} ${styles['prio_' + t.prioridad]}`}>{t.prioridad}</span>
                <span className={`${styles.badge} ${styles['estado_' + t.estado]}`}>{t.estado.replace('_', ' ')}</span>
              </div>
              {projectName(t.proyectoId) && <span className={styles.ticketItemProject}>{projectName(t.proyectoId)}</span>}
            </button>
          ))
        )}
      </aside>

      <main className={styles.detail}>
        {showNew ? (
          <div className={styles.newForm}>
            <h2>Nuevo ticket</h2>
            <label className={styles.field}>
              <span>Título</span>
              <input value={newTicket.titulo} onChange={e => setNewTicket({ ...newTicket, titulo: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Descripción</span>
              <textarea rows={4} value={newTicket.descripcion} onChange={e => setNewTicket({ ...newTicket, descripcion: e.target.value })} />
            </label>
            <div className={styles.formRow}>
              <label className={styles.field}>
                <span>Prioridad</span>
                <select value={newTicket.prioridad} onChange={e => setNewTicket({ ...newTicket, prioridad: e.target.value })}>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Proyecto (opcional)</span>
                <select value={newTicket.proyectoId} onChange={e => setNewTicket({ ...newTicket, proyectoId: e.target.value })}>
                  <option value="">Sin proyecto</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span>Teléfono de contacto (opcional — para poder notificarle cuando se resuelva)</span>
              <input value={newTicket.contactId} onChange={e => setNewTicket({ ...newTicket, contactId: e.target.value })} placeholder="5491100000001" />
            </label>
            <label className={styles.field}>
              <span>Imagen (opcional)</span>
              <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} />
              {newImage && <span className={styles.imageOk}>✓ Imagen subida</span>}
            </label>
            <div className={styles.formActions}>
              <button onClick={() => { setShowNew(false); setNewImage(null); setNewTicket(EMPTY_TICKET); }} disabled={saving}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={createTicket} disabled={saving || uploadingImage}>{saving ? 'Creando...' : 'Crear ticket'}</button>
            </div>
          </div>
        ) : !selected ? (
          <p className={styles.empty}>Seleccioná un ticket de la lista.</p>
        ) : (
          <div className={styles.ticketDetail}>
            <h2 className={styles.detailTitle}>{selected.titulo}</h2>
            <p className={styles.detailDesc}>{selected.descripcion}</p>

            <div className={styles.detailRow}>
              <label>
                <span>Estado</span>
                <select value={selected.estado} onChange={e => updateSelected({ estado: e.target.value })}>
                  {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>
                <span>Prioridad</span>
                <select value={selected.prioridad} onChange={e => updateSelected({ prioridad: e.target.value })}>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>

            {selected.proyectoId && (
              <p className={styles.detailMeta}><strong>Proyecto:</strong> {projectName(selected.proyectoId) ?? selected.proyectoId}</p>
            )}
            <p className={styles.detailMeta}><strong>Creado por:</strong> {selected.createdBy === 'bot' ? '🤖 Bot' : selected.createdBy}</p>
            <p className={styles.detailMeta}><strong>Asignado a:</strong> {selected.assignedTo ?? 'Sin asignar'}</p>
            {selected.contactId && (
              <p className={styles.detailMeta}>
                <strong>Contacto:</strong> {selected.contactId}{' '}
                <a href={`#/conversations?contact=${selected.contactId}`} className={styles.convLink}>Ver conversación →</a>
              </p>
            )}

            {selected.imagenes?.length > 0 && (
              <div className={styles.imageGrid}>
                {selected.imagenes.map((img, i) => <TicketImage key={i} mediaId={img.mediaId} />)}
              </div>
            )}

            <div className={styles.comments}>
              <h3>Seguimiento</h3>
              {(selected.comentarios ?? []).map((c, i) => (
                <div key={i} className={styles.commentItem}>
                  <span className={styles.commentAuthor}>{c.autor}</span>
                  <p className={styles.commentText}>{c.texto}</p>
                </div>
              ))}
              <div className={styles.commentForm}>
                <textarea rows={2} value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Agregar update..." />
                <button onClick={addComment} disabled={savingComment || !commentText.trim()}>{savingComment ? '...' : 'Comentar'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/Tickets.module.css`**

```css
.page {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.list {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow-y: auto;
  padding: var(--space-4);
  gap: var(--space-2);
}

.listHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.newBtn {
  height: 30px;
  padding: 0 var(--space-3);
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
}

.filters {
  display: flex;
  gap: var(--space-2);
}
.filters select {
  flex: 1;
  font-size: var(--font-size-xs);
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.empty {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  padding: var(--space-3);
}

.ticketItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  cursor: pointer;
}
.ticketItemActive {
  border-color: var(--color-text);
  background: var(--color-surface-alt);
}

.ticketItemTitle {
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.ticketItemMeta {
  display: flex;
  gap: var(--space-1);
}

.ticketItemProject {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  text-transform: capitalize;
}
.prio_baja { background: #e0f2fe; color: #0369a1; }
.prio_media { background: #fef9c3; color: #854d0e; }
.prio_alta { background: #ffedd5; color: #c2410c; }
.prio_urgente { background: var(--color-status-urgent-bg, #fee2e2); color: var(--color-status-urgent, #dc2626); }
.estado_abierto { background: var(--color-surface-alt); color: var(--color-text-secondary); }
.estado_en_progreso { background: #e0e7ff; color: #4338ca; }
.estado_resuelto { background: #dcfce7; color: #16a34a; }
.estado_cerrado { background: var(--color-surface-alt); color: var(--color-text-secondary); }

.detail {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

.newForm, .ticketDetail {
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
.field input, .field select, .field textarea {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  color: var(--color-text);
}

.formRow {
  display: flex;
  gap: var(--space-3);
}
.formRow .field { flex: 1; }

.imageOk {
  font-size: var(--font-size-xs);
  color: var(--color-status-resolved, #16a34a);
}

.formActions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.primaryBtn {
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-weight: 600;
  cursor: pointer;
}

.detailTitle {
  font-size: var(--font-size-lg);
  font-weight: 700;
}
.detailDesc {
  color: var(--color-text);
  white-space: pre-wrap;
}
.detailRow {
  display: flex;
  gap: var(--space-4);
}
.detailRow label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}
.detailRow select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.detailMeta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.convLink {
  color: var(--color-text);
  font-weight: 600;
}

.imageGrid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.ticketImg {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.comments {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.commentItem {
  background: var(--color-surface-alt);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
}
.commentAuthor {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.commentText {
  font-size: var(--font-size-sm);
  margin-top: 2px;
}
.commentForm {
  display: flex;
  gap: var(--space-2);
}
.commentForm textarea {
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}
```

- [ ] **Step 4: Add the nav item + icon to `client/src/components/Layout/Layout.jsx`**

Add the icon (same pattern as `IconFolder` added in Task 7 — place it right after):

```
old: function IconFolder({ className }) {
new:
function IconTicket({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <line x1="13" y1="5" x2="13" y2="19" strokeDasharray="2 2" />
    </svg>
  );
}

function IconFolder({ className }) {
```

Add the nav entry:

```
old:
  { to: '/proyectos',     label: 'Proyectos',       icon: IconFolder },
new:
  { to: '/proyectos',     label: 'Proyectos',       icon: IconFolder },
  { to: '/tickets',       label: 'Tickets',         icon: IconTicket },
```

- [ ] **Step 5: Add the route to `client/src/App.jsx`**

```
import Tickets from './pages/Tickets.jsx';
```

```
<Route path="tickets" element={<Tickets />} />
```

- [ ] **Step 6: Build and verify**

```bash
cd client && npm run build
```

Boot both server and client, log in, open "Tickets", create a manual ticket (with an image if `META_ACCESS_TOKEN`/`META_PHONE_NUMBER_ID` are configured — if not, expect the upload to fail with the `503` from Task 4's endpoint, which is expected without real Meta credentials), change its estado, add a comment, confirm everything persists on reload.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Tickets.jsx client/src/pages/Tickets.module.css client/src/pages/Conversations.jsx client/src/components/Layout/Layout.jsx client/src/App.jsx
git commit -m "Add Tickets admin page, nav wiring, conversation deep-link"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Boot server + client, log in**

```bash
cd server && npm run dev
```
```bash
cd client && npm run dev
```

- [ ] **Step 2: Create a project via the panel**

Go to `Proyectos`, create one with a contact phone you'll reuse in Step 3 (e.g. `5491100000099`, name "Test Contacto").

- [ ] **Step 3: Real conversation test — ticket WITH a linked project**

Get an auth token (`POST /api/auth/login`), then:

```bash
curl -s -X POST http://localhost:3001/api/test/message -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"contactId":"5491100000099","message":"Hola, tengo un problema: el botón de enviar en el panel de mi bot no responde en el celular, no puedo mandar mensajes desde ahí"}'
```

Expected in the `reply`: text that explicitly mentions generating a support ticket (per the prompt instructions), and — check server logs — a `[bot] Ticket <id> creado para 5491100000099 (proyecto: <nombre del proyecto de Step 2>)` line, confirming the phone-to-project lookup worked. If Claude doesn't have enough info yet and asks a clarifying question instead, answer it in a follow-up `/api/test/message` call with the same `contactId` until a ticket is actually created — this is expected model behavior, not a bug.

- [ ] **Step 4: Confirm the ticket in the panel**

Open `Tickets` in the browser, confirm the new ticket appears with `estado: abierto`, the correct `proyectoId`, and a non-null `assignedTo` (should be your own admin email). Click "Ver conversación →" and confirm it actually jumps to and selects that contact in `Conversaciones`.

- [ ] **Step 5: Real conversation test — ticket WITHOUT a linked project**

```bash
curl -s -X POST http://localhost:3001/api/test/message -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"contactId":"5491199999999","message":"che se me rompio algo en el sistema que me hicieron, la pagina de login tira error 500 todo el tiempo, es urgente porque no puedo entrar"}'
```

Expected: a ticket is created (check logs / panel) with `proyectoId: null` (since `5491199999999` was never linked to any project) and `prioridad: "alta"` or `"urgente"` (Claude should pick up on "es urgente" from the message).

- [ ] **Step 6: Status-change notification (mock — no real Meta template exists yet)**

In the panel, open either test ticket and change its estado to `resuelto`. Check server logs for:

```
[ticket] Plantilla "ticket_resuelto" no existe o no está aprobada en Meta todavía — no se notifica al cliente. Creála desde Plantillas cuando esté lista.
```

This confirms the notification code path runs and fails gracefully exactly as designed (per the spec, creating the real Meta template is the user's own follow-up action, out of scope for this plan).

- [ ] **Step 7: Grep for leftover placeholders**

```bash
cd ..
grep -rn "TBD\|TODO" server/src/services/project.service.js server/src/services/ticket.service.js server/src/routes/project.routes.js server/src/routes/ticket.routes.js client/src/pages/Proyectos.jsx client/src/pages/Tickets.jsx
```

Expected: no output.

- [ ] **Step 8: Final commit**

```bash
git add -A
git status
```

Review carefully — confirm nothing besides intended source files is staged (no `.env`, no stray build artifacts) — then, only if there's something genuinely left uncommitted:

```bash
git commit -m "Verify Proyectos + Tickets modules end-to-end"
```

If `git status` shows a clean tree (everything already committed in Tasks 1-8), skip this commit — there's nothing to add.

---

## Out of scope (explicitly deferred, per the spec)

- Creating the `ticket_resuelto` template in Meta Business Manager itself — user action, outside the codebase.
- Notifications on other status transitions (e.g. `en_progreso`) — same mechanism, can reuse `notifyTicketResolved`'s pattern later with a new template name.
- Smart project-matching suggestions when creating a manual ticket for an unrecognized phone number.
- Reports/dashboards aggregating tickets by project or priority beyond the existing list + filters.
