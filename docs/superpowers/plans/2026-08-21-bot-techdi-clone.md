# BOT-TECHDI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duplicate `BOT-ALTORANCHO` into a new `BOT-TECHDI` project — TECHDI's own WhatsApp/Instagram chatbot CRM for selling software solutions/automations — stripping AR's e-commerce-specific logic (Tienda Nube, Odoo, stock, guided order menu) and AR's pickup-notification feature, and simplifying multi-department escalation into a lighter, admin-configurable "Áreas" model (seeded with Preventa/Leads and Soporte).

**Architecture:** Same stack and file layout as AR (Node/Express + Firestore backend, React/Vite dashboard). Everything generic (auth, conversations, KB, labels, quick replies, templates, transcription, inactivity cron, cost tracking, user management UI) is carried over unchanged except for a project-wide rebrand and Firestore collection prefix swap. Order/stock/menu logic in `bot.service.js` and `claude.service.js` is stripped, not abstracted. AR's dynamic department engine (`department.service.js`) is kept but renamed and simplified into "Áreas", with agents now able to belong to more than one area (`areaIds: []` instead of a single `department` string).

**Tech Stack:** Node.js (ESM) + Express, Firebase Firestore, Anthropic Claude API (`claude-sonnet-4-6`), Meta API (WhatsApp Business + Instagram), React + Vite + CSS Modules, JWT auth, Railway + Vercel deploy.

**Spec:** `docs/superpowers/specs/2026-08-21-bot-techdi-design.md`

## Global Constraints

- Reuse the same Firebase project (`pedidos-lett-2`) and the same `ANTHROPIC_API_KEY` as AR/Gineza — new Firestore collections only, prefixed `bot-techdi_`.
- New Meta app/number, new `JWT_SECRET`, new GitHub repo (`bot-techdi`), new Railway + Vercel projects — none shared with AR.
- No ad-source/attribution tracking (Meta Ads `ctwa_clid`, etc.) in this phase — explicitly deferred.
- No real Knowledge Base content or final visual branding in this phase — KB ships empty, branding ships as a neutral placeholder theme. Marketing/product load real content later through the admin UI this plan builds.
- No automated test suite exists in AR's codebase (`server/package.json` has no test runner, no `*.test.js` files anywhere) — this plan does not introduce one. Every task's verification step is a concrete manual check (boot the server, curl an endpoint, run the UI, grep for leftovers) instead of a unit test, matching the codebase's existing (test-free) pattern.
- Every code sample below is exact, final file content or an exact before/after edit — no placeholders. Where a task says "Overwrite: `path`", replace the entire file with the given content.

---

### Task 1: Scaffold the repo

**Files:**
- Create: `BOT-TECHDI/server/` (copied from `BOT-ALTORANCHO/server/`, minus `node_modules`, `.env`)
- Create: `BOT-TECHDI/client/` (copied from `BOT-ALTORANCHO/client/`, minus `node_modules`, `dist`, `.env`, `.env.production`, `logo.webp`)
- Create: `BOT-TECHDI/README.md`
- Delete: `BOT-TECHDI/CONTEXT_NUEVO_BOT.md` (AR's own clone-checklist from when it was cloned off Gineza — not applicable; this plan and its spec are TECHDI's equivalent)

**Interfaces:**
- Produces: a `server/` and `client/` tree at `BOT-TECHDI/` identical to AR's, ready for the rebrand pass in Task 2.

- [ ] **Step 1: Copy the codebase, excluding secrets and build artifacts**

The repo `BOT-TECHDI/` and `BOT-TECHDI/docs/superpowers/specs/` already exist (created and committed during brainstorming — the design spec is already at `docs/superpowers/specs/2026-08-21-bot-techdi-design.md`). Copy AR's `server/` and `client/` into it:

```bash
cd "C:/Users/Usuario/LETT COMERCIAL Dropbox/JOAQUIN DI LERNIA/DEV-JOAQUIN-DI-LERNIA/DEV-PERSONAL/BOTS"

mkdir -p BOT-TECHDI/server BOT-TECHDI/client

rsync -a --exclude 'node_modules' --exclude '.env' BOT-ALTORANCHO/server/ BOT-TECHDI/server/
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude '.env' --exclude '.env.production' --exclude 'logo.webp' BOT-ALTORANCHO/client/ BOT-TECHDI/client/

rm -f BOT-TECHDI/CONTEXT_NUEVO_BOT.md
```

(If `rsync` isn't available on this machine, use `cp -r` per top-level entry instead, skipping `node_modules`, `dist`, `.env`, `.env.production`, `logo.webp` individually.)

- [ ] **Step 2: Verify the copy**

```bash
ls BOT-TECHDI/server/src/services | wc -l   # expect 17 (same file count as AR's server/src/services)
ls BOT-TECHDI/client/src/pages | wc -l      # expect 24 (12 .jsx + 12 .module.css)
test -f BOT-TECHDI/server/.env && echo "FAIL: .env got copied" || echo "OK: no .env copied"
test -f BOT-TECHDI/client/logo.webp && echo "FAIL: logo.webp got copied" || echo "OK: no logo copied"
```

Expected: both "OK" lines print, no "FAIL".

- [ ] **Step 3: Write a fresh README**

Overwrite: `BOT-TECHDI/README.md`

```markdown
# BOT-TECHDI

Bot conversacional para **TechDI** — venta de soluciones y automatizaciones de software.
Integra WhatsApp Business, Instagram y Claude AI para atender leads (preventa) y clientes
existentes (soporte pre/post-venta) por un mismo canal, con derivación a un equipo humano
organizada en Áreas configurables desde el panel de administración.

Clonado y adaptado de `BOT-ALTORANCHO` — ver `docs/superpowers/specs/2026-08-21-bot-techdi-design.md`
para el detalle de qué se sacó/adaptó y por qué.

---

## Stack

- **Frontend**: React + Vite + CSS Modules
- **Backend**: Node.js (ESM) + Express
- **Database**: Firebase Firestore (proyecto compartido `pedidos-lett-2`, colecciones con prefijo `bot-techdi_`)
- **AI**: Claude API (Anthropic)
- **Mensajería**: Meta Cloud API (WhatsApp Business + Instagram)

## Estructura

```
BOT-TECHDI/
├── client/           # Dashboard admin (React)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── contexts/
│       ├── lib/
│       └── styles/
├── server/           # API + Webhook handler (Node/Express)
│   └── src/
│       ├── routes/
│       ├── services/
│       └── middleware/
└── docs/superpowers/  # Design spec + this implementation plan
```

## Cómo correr localmente

```bash
# Backend
cd server && npm install && npm run dev   # puerto 3001

# Frontend
cd client && npm install && npm run dev   # puerto 5173
```

Completá `server/.env` y `client/.env` a partir de sus `.env.example` antes de arrancar.
```

- [ ] **Step 4: Commit**

```bash
cd BOT-TECHDI
git add server client README.md
git commit -m "Scaffold BOT-TECHDI from BOT-ALTORANCHO"
```

---

### Task 2: Global rebrand + verify it still boots

**Files:**
- Modify: every file under `server/src/`, `client/src/`, `server/package.json`, `client/package.json`, `client/index.html` that contains an Alto Rancho identity string

**Interfaces:**
- Consumes: the copied tree from Task 1.
- Produces: a codebase with zero AR-identity strings, still syntactically valid (verified by booting the server and the Vite dev server).

- [ ] **Step 1: Run the rebrand**

```bash
cd BOT-TECHDI

# lowercase substring — catches bot-altorancho_ (Firestore prefix), bot-altorancho
# (package names), altorancho_token / altorancho_sidebar_collapsed (localStorage
# keys), altorancho-${conv.id} (notification tag)
grep -rlZ "altorancho" server/src client/src server/package.json client/package.json client/index.html \
  | xargs -0 sed -i 's/altorancho/techdi/g'

# uppercase — startup console log
grep -rlZ "BOT-ALTORANCHO" server/src \
  | xargs -0 sed -i 's/BOT-ALTORANCHO/BOT-TECHDI/g'

# title-case brand phrase — display strings, page titles, package descriptions
grep -rlZ "Alto Rancho" server/src client/src server/package.json client/package.json client/index.html \
  | xargs -0 sed -i 's/Alto Rancho/TechDI/g'
```

- [ ] **Step 2: Verify nothing AR-branded is left**

```bash
grep -ril "altorancho\|alto rancho" server/src client/src server/package.json client/package.json client/index.html
```

Expected: no output (empty).

- [ ] **Step 3: Fix the sidebar brand mark (not caught by the string rebrand)**

Read: `client/src/components/Layout/Layout.jsx` — find `<div className={styles.brandLogo}>A</div>`.

Modify: `client/src/components/Layout/Layout.jsx`

```diff
-          <div className={styles.brandLogo}>A</div>
+          <div className={styles.brandLogo}>T</div>
```

- [ ] **Step 4: Install dependencies and verify the rebrand didn't break syntax**

```bash
cd server && npm install && npm run dev &
sleep 3
curl -s http://localhost:3001/health
kill %1
```

Expected: JSON response `{"status":"ok","version":"1.0.0","service":"bot-techdi"}` (Firebase will log a warning about missing credentials — that's expected, `.env` isn't set up until Task 3).

```bash
cd ../client && npm install
```

Expected: installs cleanly, no errors.

- [ ] **Step 5: Commit**

```bash
cd BOT-TECHDI
git add -A
git commit -m "Rebrand: Alto Rancho -> TechDI across codebase"
```

---

### Task 3: Credentials, env files, and a real boot

**Files:**
- Create: `server/.env`, `server/.env.example`, `client/.env`, `client/.env.example`

**Interfaces:**
- Consumes: `BOT-ALTORANCHO/server/.env` (for the Firebase + Anthropic values TECHDI reuses) — read locally, never printed or copied into this plan or any commit.
- Produces: a server that boots with real Firestore access and seeds the admin agent.

- [ ] **Step 1: Write `server/.env.example`**

Overwrite: `BOT-TECHDI/server/.env.example`

```env
# Meta (WhatsApp + Instagram)
META_VERIFY_TOKEN=techdi_webhook_token
META_APP_SECRET=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_IG_PAGE_ID=

# Anthropic
ANTHROPIC_API_KEY=

# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# Auth
JWT_SECRET=

# App
PORT=3001
NODE_ENV=development
```

(Tienda Nube and Odoo blocks from AR's `.env.example` are gone — not applicable.)

- [ ] **Step 2: Create the real `server/.env`**

Copy AR's Firebase + Anthropic credentials (same project/account, reused) into a fresh file, add a new JWT secret, leave Meta blank until the new app exists. Run this yourself in a terminal — it never prints the secret values, so nothing sensitive lands in chat history or this plan file:

```bash
cd "C:/Users/Usuario/LETT COMERCIAL Dropbox/JOAQUIN DI LERNIA/DEV-JOAQUIN-DI-LERNIA/DEV-PERSONAL/BOTS"

node -e "
const fs = require('fs');
const src = fs.readFileSync('BOT-ALTORANCHO/server/.env', 'utf8');
const get = (key) => (src.match(new RegExp('^' + key + '=(.*)$', 'm')) || [])[1] ?? '';
const jwtSecret = require('crypto').randomBytes(32).toString('hex');
const out = [
  '# Meta (WhatsApp + Instagram) — fill in once the TechDI app exists',
  'META_VERIFY_TOKEN=techdi_webhook_token',
  'META_APP_SECRET=',
  'META_ACCESS_TOKEN=',
  'META_PHONE_NUMBER_ID=',
  'META_IG_PAGE_ID=',
  '',
  '# Anthropic — same account as Gineza/AR',
  'ANTHROPIC_API_KEY=' + get('ANTHROPIC_API_KEY'),
  '',
  '# Firebase Admin SDK — same project as Gineza/AR (pedidos-lett-2)',
  'FIREBASE_PROJECT_ID=' + get('FIREBASE_PROJECT_ID'),
  'FIREBASE_PRIVATE_KEY=' + get('FIREBASE_PRIVATE_KEY'),
  'FIREBASE_CLIENT_EMAIL=' + get('FIREBASE_CLIENT_EMAIL'),
  '',
  '# Auth',
  'JWT_SECRET=' + jwtSecret,
  '',
  '# App',
  'PORT=3001',
  'NODE_ENV=development',
].join('\n') + '\n';
fs.writeFileSync('BOT-TECHDI/server/.env', out);
console.log('server/.env written (' + out.split('\n').length + ' lines)');
"
```

- [ ] **Step 3: Write `client/.env.example` and `client/.env`**

Overwrite: `BOT-TECHDI/client/.env.example` (identical shape to AR's — client never talks to Firebase directly beyond auth display, values are the public Firebase web config, not secrets):

```env
VITE_API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

```bash
cp BOT-TECHDI/client/.env.example BOT-TECHDI/client/.env
```

(Leave `client/.env` mostly blank for now — `VITE_API_URL` is the only value the dashboard actually needs to run against the local backend; the rest are unused unless AR's client code calls Firebase client SDK directly. `VITE_API_URL=http://localhost:3001` is already correct for local dev.)

- [ ] **Step 4: Boot for real and seed the admin agent**

Before running: update the placeholder admin seed for TECHDI. Read `server/src/services/auth.service.js`, find:

```js
const ADMIN_SEEDS = [
  { email: 'joaquin.dilernia@techdi.com', name: 'Joaquín Di Lernia', password: 'altolett123' },
];
```

(this is the AR admin seed after Task 2's rebrand — email domain and password need to actually be TECHDI's; the executor should pause here and ask for the real admin email/password rather than guessing, since the spec explicitly left the 3 agents' credentials for implementation time.)

```bash
cd BOT-TECHDI/server && npm run dev &
sleep 3
curl -s http://localhost:3001/health
kill %1
```

Expected: `{"status":"ok","version":"1.0.0","service":"bot-techdi"}` with no Firestore warning in the log this time, and console shows `[auth] Admin seedeado: <email>`.

- [ ] **Step 5: Commit (`.env` files stay untracked — confirm `.gitignore` still excludes them)**

```bash
cd BOT-TECHDI
cat .gitignore   # confirm .env, */.env are still listed (copied as-is from AR in Task 1)
git add server/.env.example client/.env.example
git commit -m "Add env templates for TechDI credentials"
```

---

### Task 4: Remove Tienda Nube + Odoo, simplify the customer profile

**Files:**
- Delete: `server/src/services/odoo.service.js`, `server/src/services/tiendanube.service.js`, `server/src/routes/tiendanube.routes.js`
- Modify: `server/src/services/customer.service.js` (drop Tienda Nube order enrichment)
- Modify: `server/src/routes/customer.routes.js` (drop the `/sync` endpoint that called it)
- Modify: `server/src/app.js` (drop the Tienda Nube route import/mount)

**Interfaces:**
- Produces: `customer.service.js` exporting `getOrCreateCustomer`, `getCustomerProfile`, `updateCustomerNotes`, `buildCustomerContext` — no `enrichCustomerFromTiendaNube`, no `linkCustomerFromOrder`. `bot.service.js` (Task 5) and `customer.routes.js` consume this reduced surface.

- [ ] **Step 1: Delete the e-commerce services**

```bash
cd BOT-TECHDI/server/src
rm services/odoo.service.js services/tiendanube.service.js routes/tiendanube.routes.js
```

- [ ] **Step 2: Rewrite `customer.service.js`**

Overwrite: `server/src/services/customer.service.js`

```js
import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-techdi_customers';

export async function getOrCreateCustomer(contactId, channel, contactName = null) {
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(contactId);
  const doc = await docRef.get();

  if (doc.exists) {
    const updates = { lastContactAt: new Date() };
    if (contactName && !doc.data().contactName) updates.contactName = contactName;
    await docRef.update(updates);
    return { id: doc.id, ...doc.data(), ...updates };
  }

  const customer = {
    contactId,
    channel,
    contactName: contactName ?? null,
    firstContactAt: new Date(),
    lastContactAt: new Date(),
    agentNotes: '',
    tags: [],
  };

  await docRef.set(customer);
  return { id: contactId, ...customer };
}

export async function getCustomerProfile(contactId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(contactId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function updateCustomerNotes(contactId, agentNotes) {
  const db = getDb();
  await db.collection(COLLECTION).doc(contactId).update({
    agentNotes: agentNotes ?? '',
    updatedAt: new Date(),
  });
}

export function buildCustomerContext(customer) {
  if (!customer) return null;

  const lines = [];
  if (customer.contactName) lines.push(`Nombre: ${customer.contactName}`);
  lines.push(`Canal: ${customer.channel}`);
  if (customer.firstContactAt) lines.push(`Primera consulta: ${formatDate(customer.firstContactAt)}`);

  if (customer.agentNotes) {
    lines.push(`\nNotas del equipo: ${customer.agentNotes}`);
  }

  return lines.join('\n');
}

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('es-AR');
  } catch { return ''; }
}
```

- [ ] **Step 3: Rewrite `customer.routes.js`** (drop the `/sync` endpoint — nothing to sync from anymore)

Overwrite: `server/src/routes/customer.routes.js`

```js
import { Router } from 'express';
import {
  getCustomerProfile,
  updateCustomerNotes,
} from '../services/customer.service.js';

const router = Router();

router.get('/:contactId', async (req, res) => {
  try {
    const profile = await getCustomerProfile(req.params.contactId);
    if (!profile) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ customer: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:contactId/notes', async (req, res) => {
  try {
    await updateCustomerNotes(req.params.contactId, req.body.notes ?? '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 4: Unwire Tienda Nube from `app.js`**

Modify: `server/src/app.js`

```diff
-import tiendaNubeRoutes from './routes/tiendanube.routes.js';
 import customerRoutes from './routes/customer.routes.js';
```

```diff
-app.use('/api/tiendanube',    requireAuth, requireAtLeastAtencionCliente, tiendaNubeRoutes);
-// Un operador que atiende una conversación derivada necesita ver el perfil
-// del cliente (compras, notas) y poder actualizarlo — no es una acción de
-// administración global como el resto de este bloque.
+// Un operador que atiende una conversación derivada necesita ver el perfil
+// del cliente (contacto, notas) y poder actualizarlo — no es una acción de
+// administración global como el resto de este bloque.
 app.use('/api/customers',     requireAuth, customerRoutes);
```

- [ ] **Step 5: Verify**

```bash
cd BOT-TECHDI/server
grep -ril "tiendanube\|odoo" src   # expect empty
node -e "import('./src/services/customer.service.js').then(m => console.log(Object.keys(m)))"
```

Expected: grep prints nothing; the `node -e` line prints `[ 'getOrCreateCustomer', 'getCustomerProfile', 'updateCustomerNotes', 'buildCustomerContext' ]`.

- [ ] **Step 6: Commit**

```bash
cd BOT-TECHDI
git add server/src
git commit -m "Remove Tienda Nube + Odoo integration, simplify customer profile"
```

---

### Task 5: Rewrite `bot.service.js` — strip order/stock/guided-menu flow

AR's guided WhatsApp menu (order status, stock lookup, local-store selection) and its order/stock resolution functions are 100% retail-specific and have no TECHDI equivalent — removed outright, not replaced. What survives is the generic message-intake orchestration: human-mode silencing, media handling, urgency flagging, calling Claude, and marker parsing (escalate/close/label).

**Files:**
- Modify (full rewrite): `server/src/services/bot.service.js`

**Interfaces:**
- Consumes: `getActiveAreas` from `area.service.js` (Task 7 — not written yet; this task's import will be dangling until Task 7 lands. That's fine, tasks execute in order and nothing calls `bot.service.js` end-to-end until then).
- Produces: `processIncomingMessage(msg)` (unchanged signature, still the webhook entry point) and `isWithinBusinessHours(botConfig)` (still exported — `escalation.service.js` imports it and needs no other change).

- [ ] **Step 1: Overwrite the file**

Overwrite: `server/src/services/bot.service.js`

```js
import { generateBotResponse } from './claude.service.js';
import { getKnowledgeBasePrompt } from './knowledge.service.js';
import {
  getOrCreateConversation,
  appendMessage,
  getConversationHistory,
  updateConversationStatus,
  updateHumanMode,
  updateAssignment,
  dispatchConversation,
  setUrgentFlag,
  addLabelToConversation,
} from './conversation.service.js';
import { sendWhatsAppMessage, sendInstagramMessage, downloadMediaAsBase64 } from './meta.service.js';
import { getOrCreateCustomer, buildCustomerContext } from './customer.service.js';
import { getAllLabels, createLabel } from './label.service.js';
import { getActiveAreas } from './area.service.js';
import { getDb } from './firebase.service.js';

const URGENCY_KEYWORDS = [
  /urgente/i, /urgencia/i, /reclamo/i, /estafa/i, /fraude/i,
  /muy enojad/i, /indignado/i, /hablar con una persona/i, /quiero hablar/i,
];

// Returns true if current Argentina time is within business hours
export function isWithinBusinessHours(botConfig = {}) {
  const tz = 'America/Argentina/Buenos_Aires';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeMin = hour * 60 + minute;

  const startH = botConfig.businessHoursStart ?? 9;
  const endH   = botConfig.businessHoursEnd   ?? 18;
  const days   = botConfig.businessDays        ?? [1, 2, 3, 4, 5]; // lun-vie

  return days.includes(day) && timeMin >= startH * 60 && timeMin < endH * 60;
}

function buildEscalationMessage(areaName, botConfig = {}) {
  const within = isWithinBusinessHours(botConfig);
  const startH = botConfig.businessHoursStart ?? 9;
  const endH   = botConfig.businessHoursEnd   ?? 18;
  const hoursStr = `${startH}:00 a ${endH}:00hs, lunes a viernes`;
  const label = areaName ? `*${areaName}*` : 'nuestro equipo';

  if (within) {
    return `Tu consulta fue derivada a ${label} 👋\n\nUn agente va a atenderte en breve. Por favor aguardá unos minutos.\n\n🕐 Horario de atención: ${hoursStr}.`;
  } else {
    return `Tu consulta fue derivada a ${label} 👋\n\nEn este momento estamos fuera del horario de atención (${hoursStr}). Tu mensaje fue registrado y un agente te va a responder cuando retomemos.\n\n¡Gracias por tu paciencia!`;
  }
}

function parseEscalationMarker(text, areas = []) {
  const markers = areas.map(a => ({
    re: new RegExp(`\\[ESCALAR_${a.id.toUpperCase()}\\]`, 'i'),
    assignTo: a.id,
  }));
  // Fallback genérico — no fuerza un área por defecto, queda sin asignar
  // hasta que un agente lo tome manualmente.
  markers.push({ re: /\[ESCALAR\]/i, assignTo: null });

  for (const { re, assignTo } of markers) {
    if (!re.test(text)) continue;
    const withoutLine = text.replace(/^[^\n]*\[ESCALAR[^\]]*\][^\n]*\n?/mi, '').trim();
    const cleanText = withoutLine || text.replace(re, '').trim();
    return { shouldEscalate: true, assignTo, cleanText };
  }
  return { shouldEscalate: false, assignTo: null, cleanText: text };
}

function parseCloseMarker(text) {
  if (/\[CERRAR\]/i.test(text)) {
    return { shouldClose: true, cleanText: text.replace(/\[CERRAR\]\s*/i, '').trim() };
  }
  return { shouldClose: false, cleanText: text };
}

function parseLabelMarkers(text) {
  const labels = [...text.matchAll(/\[LABEL:([^\]]+)\]/gi)].map(m => m[1].trim());
  const newLabels = [...text.matchAll(/\[NEW_LABEL:([^\]]+)\]/gi)].map(m => m[1].trim());
  const cleanText = text.replace(/\[(NEW_)?LABEL:[^\]]+\]/gi, '').trim();
  return { labels, newLabels, cleanText };
}

// Claude escribe negrita en Markdown estándar (**texto**), pero WhatsApp
// solo reconoce un asterisco de cada lado (*texto*) — con doble asterisco
// el cliente ve los asteriscos literales en vez de texto en negrita.
function toWhatsAppBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '*$1*');
}

// WhatsApp suele mandar mensajes de un mismo contacto en ráfagas de a
// segundos (varias burbujas separadas). Cada una llega como un webhook HTTP
// independiente y Express los procesa en paralelo, así que sin esta cola
// dos mensajes casi simultáneos disparan dos llamadas a Claude en paralelo
// con el mismo historial de partida. Serializamos por contactId.
const contactLocks = new Map();

export function processIncomingMessage(msg) {
  const contactId = msg.from;
  const previous = contactLocks.get(contactId) ?? Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => processIncomingMessageInternal(msg))
    .finally(() => {
      if (contactLocks.get(contactId) === current) contactLocks.delete(contactId);
    });
  contactLocks.set(contactId, current);
  return current;
}

const REPLY_PREVIEW_MAX = 80;

function resolveReplyTo(history, replyToWaMsgId) {
  if (!replyToWaMsgId) return null;
  const original = history.find(m => m.waMsgId === replyToWaMsgId);
  if (!original) return null;
  const content = original.content ?? '';
  const preview = content.length > REPLY_PREVIEW_MAX
    ? `${content.slice(0, REPLY_PREVIEW_MAX)}…`
    : content;
  return { preview, role: original.role };
}

async function processIncomingMessageInternal(msg) {
  const { channel, from, text, type, mediaId, mediaUrl, contactName, messageId, replyToWaMsgId } = msg;

  let conversation, history, knowledgeBase, customer, availableLabels, configDoc, areas;
  try {
    [conversation, history, knowledgeBase, customer, availableLabels, configDoc, areas] = await Promise.all([
      getOrCreateConversation(from, channel, contactName),
      getConversationHistory(from),
      getKnowledgeBasePrompt().catch(() => ''),
      getOrCreateCustomer(from, channel, contactName),
      getAllLabels().catch(() => []),
      getDb().collection('bot-techdi_config').doc('bot_config').get().catch(() => ({ exists: false, data: () => ({}) })),
      getActiveAreas().catch(() => []),
    ]);
  } catch (err) {
    console.error('[bot] Error cargando contexto para', from, err.message);
    return;
  }
  const botConfig = configDoc.exists ? configDoc.data() : {};
  console.log(`[bot] Contexto cargado para ${from} — humanMode: ${conversation.humanMode}, status: ${conversation.status}`);
  const replyTo = resolveReplyTo(history, replyToWaMsgId);

  // Auto-reopen archived/resolved conversations when a new message arrives → always goes to bot
  const isArchived = ['resolved', 'bot_archived'].includes(conversation.status)
    || conversation.status === 'urgent'; // legacy urgent status
  if (isArchived) {
    const previousStatus = conversation.status;
    await Promise.all([
      updateConversationStatus(from, 'bot'),
      updateHumanMode(from, false),
      updateAssignment(from, null),
    ]);
    conversation.status = 'bot';
    conversation.humanMode = false;
    conversation.assignedTo = null;
    console.log(`[bot] Conversación ${from} reabierta automáticamente desde '${previousStatus}'`);
  }

  if (conversation.humanMode) {
    const SAVEABLE_MEDIA = { image: true, audio: true, video: true, document: true, sticker: true };
    if (SAVEABLE_MEDIA[type]) {
      const contentMap = {
        image:    text?.trim() ? `[Imagen] ${text}` : '[Imagen recibida]',
        audio:    '[Audio recibido]',
        video:    '[Video recibido]',
        document: '[Archivo recibido]',
        sticker:  '[Sticker]',
      };
      await appendMessage(from, {
        role: 'user',
        content: contentMap[type],
        mediaType: type,
        mediaId: mediaId ?? null,
        contactName,
        messageId,
        ...(replyTo && { replyTo }),
      });
    } else if (text?.trim()) {
      await appendMessage(from, { role: 'user', content: text, contactName, messageId, ...(replyTo && { replyTo }) });
    }
    console.log(`[bot] humanMode activo para ${from} — bot silenciado`);
    return;
  }

  // --- Non-text type handling ---
  if (type === 'audio') {
    const prevAudios = history.filter(m => m.role === 'user' && m.mediaType === 'audio').length;
    const audioUserMsg = '[Audio recibido]';
    await appendMessage(from, { role: 'user', content: audioUserMsg, mediaType: 'audio', mediaId: mediaId ?? null, contactName, messageId, ...(replyTo && { replyTo }) });

    let reply;
    if (prevAudios >= 1) {
      reply = 'Entiendo que preferís los audios — lamentablemente no puedo escucharlos. ¿Querés que te pase con un agente que pueda ayudarte mejor?';
      await setUrgentFlag(from, true);
    } else {
      reply = 'Hola! Recibí tu audio pero no puedo escucharlo 🎙️ ¿Podés contarme por escrito en qué te ayudo?';
    }
    await appendMessage(from, { role: 'assistant', content: reply });
    if (channel === 'whatsapp') await sendWhatsAppMessage(from, reply);
    else if (channel === 'instagram') await sendInstagramMessage(from, reply);
    return;
  }

  if (type === 'video' || type === 'sticker') {
    if (!text?.trim()) return;
  }

  if (type === 'document') {
    const reply = 'Recibí un archivo, pero no puedo procesarlo directamente. ¿Podés contarme por escrito en qué te ayudo?';
    await appendMessage(from, { role: 'user', content: '[Archivo recibido]', mediaType: 'document', mediaId: mediaId ?? null, contactName, messageId, ...(replyTo && { replyTo }) });
    await appendMessage(from, { role: 'assistant', content: reply });
    if (channel === 'whatsapp') await sendWhatsAppMessage(from, reply);
    else if (channel === 'instagram') await sendInstagramMessage(from, reply);
    return;
  }

  // --- Image: download and pass to Claude ---
  let imageData = null;
  if (type === 'image') {
    if (mediaId) {
      imageData = await downloadMediaAsBase64(mediaId).catch(() => null);
    } else if (mediaUrl) {
      try {
        const axios = (await import('axios')).default;
        const { data: buffer } = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        imageData = { base64: Buffer.from(buffer).toString('base64'), mimeType: 'image/jpeg' };
      } catch { /* continue without image */ }
    }
    const userContent = text?.trim() ? `[Imagen] ${text}` : '[Imagen recibida]';
    await appendMessage(from, { role: 'user', content: userContent, mediaType: 'image', mediaId: mediaId ?? null, contactName, messageId, ...(replyTo && { replyTo }) });
  } else {
    if (!text?.trim()) return;
    await appendMessage(from, { role: 'user', content: text, contactName, messageId, ...(replyTo && { replyTo }) });
  }

  // Detect urgency keywords and flag (as urgent flag, not status change)
  const isUrgent = text && URGENCY_KEYWORDS.some(re => re.test(text));
  if (isUrgent && !conversation.urgent) {
    setUrgentFlag(from, true).catch(() => {});
  }

  const customerContext = buildCustomerContext(customer);

  console.log(`[bot] Llamando a Claude para ${from}`);
  let botReply;
  try {
    botReply = await generateBotResponse(text ?? '', history, {
      knowledgeBase,
      customerContext,
      availableLabels: availableLabels.map(l => l.name),
      botConfig,
      imageData,
      areas,
    });
  } catch (err) {
    console.error(`[bot] Claude falló definitivamente para ${from} tras reintentos:`, err.message);
    const fallbackMsg = 'Estamos con un poquito de demora en este momento, ¡ya te contestamos! 🙏';
    await appendMessage(from, { role: 'assistant', content: fallbackMsg });
    await setUrgentFlag(from, true).catch(() => {});
    if (channel === 'whatsapp') await sendWhatsAppMessage(from, fallbackMsg).catch(() => {});
    else if (channel === 'instagram') await sendInstagramMessage(from, fallbackMsg).catch(() => {});
    return;
  }
  console.log(`[bot] Claude respondió (${botReply.length} chars) para ${from}`);

  const { shouldEscalate, assignTo, cleanText: textAfterEscalation } = parseEscalationMarker(botReply, areas);
  const { shouldClose, cleanText: textAfterClose } = parseCloseMarker(textAfterEscalation);
  const { labels: botLabels, newLabels: botNewLabels, cleanText: textAfterLabels } = parseLabelMarkers(textAfterClose);
  const cleanText = toWhatsAppBold(textAfterLabels);

  await appendMessage(from, { role: 'assistant', content: cleanText });

  if (botNewLabels.length > 0) {
    await Promise.all(botNewLabels.map(l => createLabel(l, '#6b7280').then(() => addLabelToConversation(from, l))));
    console.log(`[bot] Nuevas labels creadas y aplicadas a ${from}:`, botNewLabels);
  }
  if (botLabels.length > 0) {
    await Promise.all(botLabels.map(l => addLabelToConversation(from, l)));
    console.log(`[bot] Labels aplicadas a ${from}:`, botLabels);
  }

  if (channel === 'whatsapp') {
    if (!cleanText.trim()) {
      console.warn(`[bot] cleanText vacío para ${from} — no se envía a WPP`);
    } else {
      try {
        console.log(`[bot] Enviando WPP a ${from}: ${cleanText.substring(0, 60)}`);
        await sendWhatsAppMessage(from, cleanText);
        console.log(`[bot] WPP enviado OK a ${from}`);
      } catch (sendErr) {
        console.error(`[bot] ERROR enviando WPP a ${from}:`, sendErr.response?.data ?? sendErr.message);
      }
    }
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
    await dispatchConversation(from, {
      status: 'escalated',
      humanMode: true,
      assignedTo: assignTo ?? null,
    });
    console.log(`[bot] Escalando ${from} → área: ${assignTo ?? 'sin asignar'}`);

    const areaName = areas.find(a => a.id === assignTo)?.name ?? null;
    const escalationMsg = buildEscalationMessage(areaName, botConfig);
    try {
      await appendMessage(from, { role: 'assistant', content: escalationMsg });
      if (channel === 'whatsapp') await sendWhatsAppMessage(from, escalationMsg);
      else if (channel === 'instagram') await sendInstagramMessage(from, escalationMsg);
    } catch (err) {
      console.error('[bot] Error enviando mensaje de escalación:', err.message);
    }
  } else if (shouldClose) {
    await updateConversationStatus(from, 'resolved');
    console.log(`[bot] Conversación ${from} resuelta por el bot`);
  }
}
```

- [ ] **Step 2: Verify it parses (import will fail until Task 7 adds `area.service.js` — that's expected right now)**

```bash
cd BOT-TECHDI/server
node --check src/services/bot.service.js
```

Expected: no syntax errors printed (this only checks JS syntax, not that `area.service.js` exists yet).

- [ ] **Step 3: Commit**

```bash
cd BOT-TECHDI
git add server/src/services/bot.service.js
git commit -m "Strip order/stock/guided-menu flow from bot.service.js"
```

---

### Task 6: Rewrite `claude.service.js` — strip order/stock prompt sections

**Files:**
- Modify (full rewrite): `server/src/services/claude.service.js`

**Interfaces:**
- Consumes: `areas` array (`{id, name, description, active, order}[]`) from Task 5's `bot.service.js` call.
- Produces: `generateBotResponse(userMessage, conversationHistory, context)` where `context` is now `{knowledgeBase, customerContext, availableLabels, botConfig, imageData, areas}` (no more `orderInfo`/`orderRef`/`stockInfo`/`departments`). `generateConversationSummary(messages)` unchanged.

- [ ] **Step 1: Overwrite the file**

Overwrite: `server/src/services/claude.service.js`

```js
import https from 'https';
import { getDb } from './firebase.service.js';

const MODEL = 'claude-sonnet-4-6';
const PRICING = { inputPerMTok: 3.00, outputPerMTok: 15.00 };

function logUsage(usage, type) {
  if (!usage?.input_tokens) return;
  const costUSD =
    (usage.input_tokens / 1e6) * PRICING.inputPerMTok +
    (usage.output_tokens / 1e6) * PRICING.outputPerMTok;
  getDb().collection('bot-techdi_usage_logs').add({
    service: 'claude',
    model: MODEL,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUSD: Math.round(costUSD * 1e6) / 1e6,
    type,
    createdAt: new Date(),
  }).catch(err => console.error('[claude] Error logging usage to Firestore:', err.message));
}

function buildEscalationInstructions(areas = []) {
  if (!areas.length) {
    return `
IMPORTANTE — ESCALADA: Si la consulta requiere atención humana y no podés resolverla, usá el marcador [ESCALAR] en una línea separada.

IMPORTANTE — CIERRE: Si la consulta está completamente resuelta, empezá tu respuesta con [CERRAR].
Ejemplo: "[CERRAR] ¡Con mucho gusto! Si necesitás algo más, escribinos cuando quieras."`;
  }

  const lines = areas.map(a => `- [ESCALAR_${a.id.toUpperCase()}] — ${a.description}`).join('\n');

  return `
IMPORTANTE — ESCALADA: Cuando la consulta requiere atención humana, usá UNO de estos marcadores en una línea separada (NUNCA pongas otro texto en esa misma línea):
${lines}

Si la consulta requiere atención humana pero ninguna de las áreas de arriba encaja bien, usá [ESCALAR] sin especificar — no fuerces una de ellas si ninguna es la correcta.

El texto de tu respuesta (antes o después del marcador) es lo que le llega al cliente — avisale que lo derivás y que puede haber una pequeña demora. El marcador es invisible para el cliente.
Ejemplo correcto:
"Dale, te paso con el equipo que te puede ayudar mejor con esto. Puede tardar unos minutos, ¡pero te van a responder enseguida!
[ESCALAR_${areas[0].id.toUpperCase()}]"

IMPORTANTE — CIERRE: Si la consulta está completamente resuelta y el cliente se despidió, empezá tu respuesta con [CERRAR].
Ejemplo: "[CERRAR] ¡Con mucho gusto! Si necesitás algo más, escribinos cuando quieras."
Usá [CERRAR] solo cuando estés seguro de que la conversación terminó.`;
}

function callAnthropicAPIOnce(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          const err = new Error(`Anthropic API ${res.statusCode}: ${data}`);
          err.statusCode = res.statusCode;
          err.retryAfter = res.headers['retry-after'];
          return reject(err);
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const CLAUDE_MAX_RETRIES = 5;

async function callAnthropicAPI(payload) {
  let lastErr;
  for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
    try {
      return await callAnthropicAPIOnce(payload);
    } catch (err) {
      lastErr = err;
      const retryable = !err.statusCode || err.statusCode === 429 || err.statusCode === 529 || err.statusCode >= 500;
      if (!retryable || attempt === CLAUDE_MAX_RETRIES) throw err;
      const waitMs = err.retryAfter ? parseInt(err.retryAfter, 10) * 1000 : Math.min(1000 * 2 ** (attempt - 1), 15000);
      console.warn(`[claude] Retry ${attempt}/${CLAUDE_MAX_RETRIES} tras error: ${err.message} — esperando ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

export async function generateConversationSummary(messages) {
  if (!messages?.length) return 'Sin mensajes para resumir.';
  const formatted = messages
    .map(m => {
      const who = m.role === 'user' ? 'Cliente' : m.role === 'admin' ? 'Agente' : 'Bot';
      return `${who}: ${m.content ?? ''}`;
    })
    .join('\n');

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 350,
    system: 'Generás resúmenes breves de conversaciones de atención al cliente en español rioplatense. Respondés SOLO con el resumen, sin encabezados ni listas.',
    messages: [{
      role: 'user',
      content: `Generá un resumen de 2 a 4 oraciones de esta conversación. Incluí: el motivo principal de la consulta y cómo terminó (resuelto, derivado a agente, pendiente).\n\nConversación:\n${formatted}`,
    }],
  });
  logUsage(response.usage, 'summary');
  return response.content[0].text.trim();
}

export async function generateBotResponse(userMessage, conversationHistory, context = {}) {
  const { knowledgeBase = '', customerContext = null, availableLabels = [], botConfig = {}, imageData = null, areas = [] } = context;

  const systemContent = buildSystemPrompt(botConfig, knowledgeBase, customerContext, availableLabels, areas);
  const messages = buildMessages(conversationHistory, userMessage, imageData);

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 1024,
    system: systemContent,
    messages,
  });

  logUsage(response.usage, 'bot_reply');
  return response.content[0].text;
}

function buildSystemPrompt(botConfig = {}, knowledgeBase, customerContext, availableLabels = [], areas = []) {
  const botName = botConfig.botName || 'Asistente';
  const businessName = botConfig.businessName || 'TechDI';
  const personality = botConfig.botPersonality ||
    `Respondés de forma amigable, natural y cercana — como lo haría una persona real del equipo.
Usás un tono cálido y profesional. Nunca robótico ni genérico.
Escribís en español rioplatense (vos, etc.) con claridad.
Si no sabés algo, lo decís honestamente y ofrecés derivar a la persona correcta.
Nunca inventás información sobre servicios, precios, plazos, procesos o links — solo usás los datos que te den. Si algo no está en la información que tenés, lo decís honestamente en vez de inventar o suponer.`;

  let prompt = `Sos el asistente virtual de ${businessName}. Tu nombre es ${botName}.\n${personality}`;
  prompt += buildEscalationInstructions(areas);
  if (knowledgeBase) {
    prompt += `\n\n--- INFORMACIÓN DE LA EMPRESA ---\n${knowledgeBase}`;
    prompt += `\n\nIMPORTANTE — USO DE ESTA INFORMACIÓN: Es TU ÚNICA fuente de verdad sobre servicios, precios, procesos y políticas. Antes de responder CUALQUIER consulta, revisá esta sección completa primero. Si algo aplica, compartilo directamente aunque el cliente no lo pida explícitamente. Si la consulta no está cubierta acá, NUNCA inventes ni supongas una respuesta — decí que no tenés esa info y ofrecé derivar a alguien del equipo.`;
  }
  if (customerContext) prompt += `\n\n--- PERFIL DEL CONTACTO ---\n${customerContext}`;
  if (availableLabels.length) {
    prompt += `\n\n--- ETIQUETAS ---\nDEBÉS etiquetar SIEMPRE esta conversación con al menos 1 etiqueta usando [LABEL:nombre] en tu respuesta (invisible para el cliente).
Etiquetas disponibles: ${availableLabels.join(', ')}.
Si ninguna aplica, creá una nueva con [NEW_LABEL:nombre] (ej: [NEW_LABEL:Consulta técnica]).
Guía:
- [LABEL:Lead] → interesado nuevo, todavía no es cliente.
- [LABEL:Consulta] → preguntas generales sobre servicios o funcionamiento.
- [LABEL:Soporte] → cliente existente con una duda o problema puntual.
- [LABEL:Reclamo] → queja o insatisfacción.
Podés combinar varias etiquetas si aplica.`;
  }
  return prompt;
}

function buildMessages(conversationHistory, newMessage, imageData = null) {
  const messages = [];
  if (conversationHistory?.length) {
    const recent = conversationHistory.slice(-10);
    for (const msg of recent) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      messages.push({ role, content: msg.content });
    }
  }
  if (imageData) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageData.mimeType, data: imageData.base64 } },
        { type: 'text', text: newMessage || 'Describí esta imagen en el contexto de la consulta del cliente.' },
      ],
    });
  } else {
    messages.push({ role: 'user', content: newMessage });
  }
  return messages;
}
```

- [ ] **Step 2: Verify syntax**

```bash
cd BOT-TECHDI/server
node --check src/services/claude.service.js
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd BOT-TECHDI
git add server/src/services/claude.service.js
git commit -m "Strip order/stock prompt sections from claude.service.js, generic escalation instructions"
```

---

### Task 7: Areas backend — rename department engine, seed TechDI defaults

**Files:**
- Delete: `server/src/services/department.service.js`, `server/src/routes/department.routes.js`
- Create: `server/src/services/area.service.js`, `server/src/routes/area.routes.js`
- Modify: `server/src/app.js` (swap the import/mount/seed call)

**Interfaces:**
- Produces: `getAllAreas()`, `getActiveAreas()`, `createArea({name, description, active})`, `updateArea(id, patch)`, `deleteArea(id)`, `seedAreasIfNeeded()` — same shapes as AR's department functions, consumed by `bot.service.js` (Task 5, already written against `getActiveAreas`) and by the frontend Areas page (Task 9).

- [ ] **Step 1: Delete the old department files**

```bash
cd BOT-TECHDI/server/src
rm services/department.service.js routes/department.routes.js
```

- [ ] **Step 2: Create `area.service.js`**

Create: `server/src/services/area.service.js`

```js
import { getDb } from './firebase.service.js';

const COLLECTION = 'bot-techdi_areas';

const SEED_AREAS = [
  {
    id: 'leads',
    name: 'Preventa / Leads',
    description: 'Gente interesada en contratar una solución o automatización de TechDI que todavía no es cliente: pide información de servicios, precios, alcance, casos de uso, o quiere coordinar una demo.',
    active: true,
    order: 1,
  },
  {
    id: 'soporte',
    name: 'Soporte',
    description: 'Clientes que ya contrataron un servicio de TechDI: dudas de uso, problemas técnicos, pedidos de ajustes o consultas de facturación sobre algo ya contratado.',
    active: true,
    order: 2,
  },
];

export async function seedAreasIfNeeded() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  for (const area of SEED_AREAS) {
    batch.set(db.collection(COLLECTION).doc(area.id), { ...area, createdAt: new Date() });
  }
  await batch.commit();
  console.log('[areas] Seed inicial completado');
}

export async function getAllAreas() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('order').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getActiveAreas() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('active', '==', true).orderBy('order').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createArea({ name, description, active = true }) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('order', 'desc').limit(1).get();
  const lastOrder = snap.empty ? 0 : snap.docs[0].data().order ?? 0;
  const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const existing = await db.collection(COLLECTION).doc(id).get();
  if (existing.exists) throw new Error('Ya existe un área con ese nombre');
  const area = { id, name, description, active, order: lastOrder + 1, createdAt: new Date() };
  await db.collection(COLLECTION).doc(id).set(area);
  return area;
}

export async function updateArea(id, { name, description, active }) {
  const db = getDb();
  const update = { updatedAt: new Date() };
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (active !== undefined) update.active = active;
  await db.collection(COLLECTION).doc(id).update(update);
  const doc = await db.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deleteArea(id) {
  await getDb().collection(COLLECTION).doc(id).delete();
}
```

- [ ] **Step 3: Create `area.routes.js`**

Create: `server/src/routes/area.routes.js`

```js
import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAuth.js';
import {
  getAllAreas, createArea, updateArea, deleteArea,
} from '../services/area.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json({ areas: await getAllAreas() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, active } = req.body;
    if (!name || !description) return res.status(400).json({ error: 'name y description son requeridos' });
    res.status(201).json(await createArea({ name, description, active }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    res.json(await updateArea(req.params.id, req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await deleteArea(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 4: Rewire `app.js`**

Modify: `server/src/app.js`

```diff
-import departmentRoutes from './routes/department.routes.js';
+import areaRoutes from './routes/area.routes.js';
```

```diff
-import { seedDepartmentsIfNeeded } from './services/department.service.js';
+import { seedAreasIfNeeded } from './services/area.service.js';
```

```diff
-seedDepartmentsIfNeeded().catch(err => console.error('[seed] Error seeding departments:', err));
+seedAreasIfNeeded().catch(err => console.error('[seed] Error seeding areas:', err));
```

```diff
-// El propio router ya restringe crear/editar/borrar a requireAdmin —
-// la lectura la necesita cualquier operador para derivar conversaciones.
-app.use('/api/departments',   requireAuth, departmentRoutes);
+// El propio router ya restringe crear/editar/borrar a requireAdmin —
+// la lectura la necesita cualquier operador para derivar conversaciones.
+app.use('/api/areas',         requireAuth, areaRoutes);
```

- [ ] **Step 5: Boot and verify the seed + endpoint**

```bash
cd BOT-TECHDI/server && npm run dev &
sleep 3
curl -s -H "Content-Type: application/json" -d '{"email":"<TECHDI_ADMIN_EMAIL>","password":"<TECHDI_ADMIN_PASSWORD>"}' http://localhost:3001/api/auth/login
# copy the returned token, then:
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/areas
kill %1
```

Expected: `{"areas":[{"id":"leads","name":"Preventa / Leads",...},{"id":"soporte","name":"Soporte",...}]}`.

- [ ] **Step 6: Commit**

```bash
cd BOT-TECHDI
git add server/src
git commit -m "Rename department engine to Areas, seed TechDI defaults (Leads/Soporte)"
```

---

### Task 8: Areas ripple — agent model (`areaIds`), conversation assignment, stats

**Files:**
- Modify: `server/src/services/auth.service.js` (single `department` string → `areaIds` array)
- Modify: `server/src/routes/conversation.routes.js` (operador filter, rename `assign_dept` action)
- Modify: `server/src/routes/stats.routes.js` (dept resolution → area resolution against `areaIds`)

**Interfaces:**
- Produces: agent objects shaped `{id, email, name, role, areaIds: string[]}` everywhere (`toPublic`, JWT payload). `PATCH /api/conversations/:id/dispatch` gets a renamed `assign_to` action (`{assignedTo}` body) replacing `assign_dept` (`{deptId}`) — this action assigns to either a specific agent's email or an area id, same as AR's did, just accurately named for what it actually does (AR's `assign_dept` was already used for both cases, name was just misleading).

- [ ] **Step 1: `auth.service.js` — `department` → `areaIds`**

Modify: `server/src/services/auth.service.js`

```diff
 function toPublic(data) {
   return {
     id: data.id,
     email: data.email,
     name: data.name,
     role: data.role ?? 'operador',
-    department: data.department ?? null,
+    areaIds: data.areaIds ?? [],
   };
 }
```

```diff
       await db.collection(COLLECTION).doc(id).set({
         id,
         email: admin.email,
         name: admin.name,
         role: 'admin',
-        department: 'admin',
         passwordHash: hashPassword(admin.password),
         createdAt: new Date(),
       });
       console.log('[auth] Admin seedeado:', admin.email);
     } else {
       const data = doc.data();
       const updates = {};
       if (data.role !== 'admin') updates.role = 'admin';
-      if (!data.department) updates.department = 'admin';
       if (Object.keys(updates).length > 0) {
```

```diff
-export async function createUser({ email, name, password, role = 'operador', department = null }) {
+export async function createUser({ email, name, password, role = 'operador', areaIds = [] }) {
   const db = getDb();
   const id = docId(email);
   const existing = await db.collection(COLLECTION).doc(id).get();
   if (existing.exists) throw new Error('El email ya está registrado');
-  const user = { id, email: email.toLowerCase().trim(), name, role, department, passwordHash: hashPassword(password), createdAt: new Date() };
+  const user = { id, email: email.toLowerCase().trim(), name, role, areaIds, passwordHash: hashPassword(password), createdAt: new Date() };
   await db.collection(COLLECTION).doc(id).set(user);
   return toPublic(user);
```

```diff
-export async function updateUser(id, { name, role, department } = {}) {
+export async function updateUser(id, { name, role, areaIds } = {}) {
   const db = getDb();
   const update = { updatedAt: new Date() };
   if (name) update.name = name;
   if (role) update.role = role;
-  if (department !== undefined) update.department = department;
+  if (areaIds !== undefined) update.areaIds = areaIds;
   await db.collection(COLLECTION).doc(docId(id)).update(update);
```

```diff
 export function generateToken(agent) {
   return jwt.sign(
-    { id: agent.id, email: agent.email, name: agent.name, role: agent.role, department: agent.department ?? null },
+    { id: agent.id, email: agent.email, name: agent.name, role: agent.role, areaIds: agent.areaIds ?? [] },
     process.env.JWT_SECRET,
     { expiresIn: '7d' }
```

- [ ] **Step 2: `conversation.routes.js` — operador filter + rename `assign_dept`**

Modify: `server/src/routes/conversation.routes.js`

```diff
     const { channel, status, assignedTo } = req.query;
-    // operador sees conversations assigned to their department (bot escalation) OR directly to their email
+    // operador sees conversations assigned to one of their areas (bot escalation) OR directly to their email
     const assignedToFilter = req.agent.role === 'operador'
-      ? [req.agent.department, req.agent.email].filter(Boolean)
+      ? [...(req.agent.areaIds ?? []), req.agent.email].filter(Boolean)
       : (assignedTo ?? undefined);
```

```diff
-    // assign_dept: escalate to a department (or agent email)
-    if (action === 'assign_dept') {
-      const { deptId } = req.body;
-      if (!deptId) return res.status(400).json({ error: 'deptId requerido' });
-      const patch = { status: 'escalated', humanMode: true, assignedTo: deptId };
+    // assign_to: escalate to a specific agent's email, or to an area id
+    if (action === 'assign_to') {
+      const { assignedTo: target } = req.body;
+      if (!target) return res.status(400).json({ error: 'assignedTo requerido' });
+      const patch = { status: 'escalated', humanMode: true, assignedTo: target };
       await dispatchConversation(req.params.contactId, patch);
       return res.json({ ok: true, ...patch });
     }
```

- [ ] **Step 3: `stats.routes.js` — resolve areas instead of departments**

Modify: `server/src/routes/stats.routes.js`. Find `resolveDeptForAssignee`:

```diff
-function resolveDeptForAssignee(assignee, deptIds, agentsByEmail) {
+function resolveAreaForAssignee(assignee, areaIds, agentsByEmail) {
   if (!assignee) return null;
-  if (deptIds.has(assignee)) return assignee;
+  if (areaIds.has(assignee)) return assignee;
   const agent = agentsByEmail.get(assignee);
-  return agent?.department && deptIds.has(agent.department) ? agent.department : null;
+  return (agent?.areaIds ?? []).find(id => areaIds.has(id)) ?? null;
 }
```

Find the Firestore query block and the variables built from it:

```diff
       db.collection('bot-techdi_agents').get(),
-      db.collection('bot-techdi_departments').get(),
+      db.collection('bot-techdi_areas').get(),
       db.collection('bot-techdi_conversations').where('urgent', '==', true).get(),
     ]);

     const conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
     const agents = agentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
-    const departments = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
-    const deptIds = new Set(departments.map(d => d.id));
+    const areas = areasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
+    const areaIds = new Set(areas.map(a => a.id));
     const agentsByEmail = new Map(agents.map(a => [a.email, a]));
```

(Note: `deptsSnap` in the `Promise.all` destructure must be renamed to `areasSnap` to match — read the surrounding destructuring assignment line and rename that binding too, since it's positional not by-name.)

Every remaining `dep`/`department`/`Dept` local variable in this file's stats-building logic (agent buckets, `byDepartment` response field, `resolveDeptForAssignee` call site) follows the same rename: `dep`→`area`, `deptBuckets`→`areaBuckets`, `byDepartment`→`byArea`, `resolveDeptForAssignee(...)`→`resolveAreaForAssignee(...)`. Apply it mechanically through the file — every occurrence refers to the same renamed concept, there is no case where "department" means something else in this file.

- [ ] **Step 4: Verify**

```bash
cd BOT-TECHDI/server
node --check src/services/auth.service.js src/routes/conversation.routes.js src/routes/stats.routes.js
grep -n "department\|Dept\|deptId" src/services/auth.service.js src/routes/conversation.routes.js src/routes/stats.routes.js
```

Expected: `node --check` prints nothing (valid syntax); the `grep` prints nothing (no leftover department references).

- [ ] **Step 5: Commit**

```bash
cd BOT-TECHDI
git add server/src
git commit -m "Areas ripple: agent.areaIds, rename assign_dept -> assign_to, stats by area"
```

---

### Task 9: Areas frontend — Areas page, multi-area Users, nav

**Files:**
- Delete: `client/src/pages/Departments.jsx`, `client/src/pages/Departments.module.css`
- Create: `client/src/pages/Areas.jsx`, `client/src/pages/Areas.module.css`
- Modify: `client/src/pages/Users.jsx` (single-select department → multi-select areaIds)
- Modify: `client/src/App.jsx` (route)
- Modify: `client/src/components/Layout/Layout.jsx` (nav item)
- Modify: `client/src/pages/Conversations.jsx` (department state/fetch/filter/dispatch renamed to areas)

**Interfaces:**
- Produces: `/areas` route rendering the Areas admin CRUD page; `/api/areas` and `/api/auth/users` (with `areaIds`) as the only backend surface these files touch.

- [ ] **Step 1: Rename Departments → Areas module CSS**

```bash
cd BOT-TECHDI/client/src/pages
git mv Departments.module.css Areas.module.css
```

(The CSS file's content is layout-generic — class names like `.page`, `.card`, `.toggle` — no AR-specific selectors to edit.)

- [ ] **Step 2: Create `Areas.jsx`**

```bash
git rm Departments.jsx
```

Create: `client/src/pages/Areas.jsx`

```jsx
import { useEffect, useState } from 'react';
import { authFetch, BASE_URL } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import styles from './Areas.module.css';

export default function Areas() {
  const { agent } = useAuth();
  const isAdmin = agent?.role === 'admin';

  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id, name, description, active } | 'new'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await authFetch(BASE_URL + '/api/areas');
      if (r.ok) setAreas((await r.json()).areas ?? []);
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setEditing({ id: '', name: '', description: '', active: true });
    setError('');
  }

  function startEdit(area) {
    setEditing({ ...area });
    setError('');
  }

  function cancelEdit() {
    setEditing(null);
    setError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const isNew = !editing.id || !areas.find(a => a.id === editing.id);
      const url = isNew
        ? BASE_URL + '/api/areas'
        : BASE_URL + `/api/areas/${editing.id}`;
      const r = await authFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        body: { name: editing.name, description: editing.description, active: editing.active },
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(area) {
    await authFetch(BASE_URL + `/api/areas/${area.id}`, {
      method: 'PUT',
      body: { active: !area.active },
    });
    setAreas(prev => prev.map(a => a.id === area.id ? { ...a, active: !a.active } : a));
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminás esta área? Las conversaciones asignadas no se van a borrar.')) return;
    await authFetch(BASE_URL + `/api/areas/${id}`, { method: 'DELETE' });
    setAreas(prev => prev.filter(a => a.id !== id));
  }

  if (loading) return <div className={styles.loading}>Cargando...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Áreas</h1>
          <p className={styles.subtitle}>
            Configurá a qué equipo deriva el bot cada tipo de consulta. La descripción le indica al bot cuándo escalar a cada área.
          </p>
        </div>
        {isAdmin && !editing && (
          <button className={styles.btnPrimary} onClick={startNew}>+ Nueva área</button>
        )}
      </header>

      <div className={styles.body}>
        {editing && (
          <form className={styles.form} onSubmit={handleSave}>
            <h2 className={styles.formTitle}>
              {editing.id && areas.find(a => a.id === editing.id) ? 'Editar área' : 'Nueva área'}
            </h2>
            <div className={styles.field}>
              <label className={styles.label}>Nombre</label>
              <input
                className={styles.input}
                value={editing.name}
                onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Soporte"
                required
                maxLength={50}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>¿Cuándo escala el bot a esta área?</label>
              <textarea
                className={styles.textarea}
                value={editing.description}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                placeholder="Describí los casos en que el bot debe derivar a este equipo. Este texto va directo al modelo de IA."
                rows={4}
                required
              />
              <p className={styles.hint}>Sé específico. Ej: "Clientes que ya contrataron un servicio y tienen una duda o problema puntual."</p>
            </div>
            <div className={styles.field}>
              <label className={styles.toggleLabel}>
                <span>Activa</span>
                <div
                  className={`${styles.toggle} ${editing.active ? styles.toggleOn : ''}`}
                  onClick={() => setEditing(p => ({ ...p, active: !p.active }))}
                  role="checkbox"
                  aria-checked={editing.active}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setEditing(p => ({ ...p, active: !p.active }))}
                >
                  <div className={styles.toggleThumb} />
                </div>
              </label>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={cancelEdit}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        )}

        <div className={styles.list}>
          {areas.length === 0 && (
            <p className={styles.empty}>No hay áreas configuradas.</p>
          )}
          {areas.map(area => (
            <div key={area.id} className={`${styles.card} ${!area.active ? styles.cardInactive : ''}`}>
              <div className={styles.cardMain}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardName}>
                    <span className={`${styles.activeDot} ${area.active ? styles.activeDotOn : ''}`} />
                    {area.name}
                  </div>
                  <code className={styles.marker}>[ESCALAR_{area.id.toUpperCase()}]</code>
                </div>
                <p className={styles.cardDesc}>{area.description}</p>
              </div>
              {isAdmin && (
                <div className={styles.cardActions}>
                  <button
                    className={`${styles.actionBtn} ${area.active ? styles.actionBtnWarning : styles.actionBtnSuccess}`}
                    onClick={() => toggleActive(area)}
                    title={area.active ? 'Desactivar' : 'Activar'}
                  >
                    {area.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button className={styles.actionBtn} onClick={() => startEdit(area)}>Editar</button>
                  <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDelete(area.id)}>Eliminar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `Users.jsx` — single department select → `areaIds` checkboxes**

Modify: `client/src/pages/Users.jsx`

```diff
-const DEFAULT_FORM = { name: '', email: '', password: '', role: 'operador', department: '' };
+const DEFAULT_FORM = { name: '', email: '', password: '', role: 'operador', areaIds: [] };
```

```diff
   const [users, setUsers]           = useState([]);
-  const [departments, setDepts]     = useState([]);
+  const [areas, setAreas]           = useState([]);
```

```diff
-      const [usersRes, deptsRes] = await Promise.all([
+      const [usersRes, areasRes] = await Promise.all([
         authFetch(BASE_URL + '/api/auth/users'),
-        authFetch(BASE_URL + '/api/departments'),
+        authFetch(BASE_URL + '/api/areas'),
       ]);
       if (usersRes.ok) setUsers(await usersRes.json());
-      if (deptsRes.ok) setDepts((await deptsRes.json()).departments ?? []);
+      if (areasRes.ok) setAreas((await areasRes.json()).areas ?? []);
```

```diff
   function openEdit(user) {
-    setForm({ mode: 'edit', data: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department ?? '', password: '' } });
+    setForm({ mode: 'edit', data: { id: user.id, name: user.name, email: user.email, role: user.role, areaIds: user.areaIds ?? [], password: '' } });
     setError('');
   }
```

```diff
-      const { name, email, password, role, department } = form.data;
-      const deptValue = department || null;
+      const { name, email, password, role, areaIds } = form.data;

       if (form.mode === 'create') {
         if (!name || !email || !password) throw new Error('Nombre, email y contraseña son requeridos');
         const res = await authFetch(BASE_URL + '/api/auth/users', {
           method: 'POST',
-          body: { name, email, password, role, department: deptValue },
+          body: { name, email, password, role, areaIds },
         });
         if (!res.ok) throw new Error((await res.json()).error);
       } else {
         const { id } = form.data;
         const res = await authFetch(BASE_URL + `/api/auth/users/${id}`, {
           method: 'PUT',
-          body: { name, role, department: deptValue },
+          body: { name, role, areaIds },
         });
         if (!res.ok) throw new Error((await res.json()).error);
       }
```

```diff
-  const deptName = id => departments.find(d => d.id === id)?.name ?? id;
+  const areaName = id => areas.find(a => a.id === id)?.name ?? id;
```

Replace the single `<select>` for department (around the form fields) with a checkbox group. Find:

```jsx
              <label className={styles.label}>Departamento asignado</label>
              <select
                className={styles.input}
                value={form.data.department}
                onChange={e => setField('department', e.target.value)}
              >
                <option value="">— Sin departamento —</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
```

Replace with:

```jsx
              <label className={styles.label}>Áreas asignadas</label>
              <div className={styles.checkboxGroup}>
                {areas.map(a => (
                  <label key={a.id} className={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={form.data.areaIds.includes(a.id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...form.data.areaIds, a.id]
                          : form.data.areaIds.filter(id => id !== a.id);
                        setField('areaIds', next);
                      }}
                    />
                    {a.name}
                  </label>
                ))}
                {areas.length === 0 && <p className={styles.hint}>No hay áreas configuradas todavía.</p>}
              </div>
```

Add the matching CSS (append to `client/src/pages/Users.module.css`):

```css
.checkboxGroup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checkboxItem {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
```

Find the read-only list row showing the assigned department badge:

```jsx
                  {user.department && (
                    <span className={styles.deptTag}>{deptName(user.department)}</span>
                  )}
```

Replace with:

```jsx
                  {(user.areaIds ?? []).map(id => (
                    <span key={id} className={styles.deptTag}>{areaName(id)}</span>
                  ))}
```

- [ ] **Step 4: `App.jsx` — route rename**

Modify: `client/src/App.jsx`

```diff
-import Departments   from './pages/Departments.jsx';
+import Areas         from './pages/Areas.jsx';
```

```diff
-          <Route path="departments"   element={<Departments />} />
+          <Route path="areas"         element={<Areas />} />
```

- [ ] **Step 5: `Layout.jsx` — nav item rename**

Modify: `client/src/components/Layout/Layout.jsx`

```diff
-  { to: '/departments',   label: 'Departamentos',   icon: IconDepartment, minRole: 'atencion_cliente' },
+  { to: '/areas',         label: 'Áreas',           icon: IconDepartment, minRole: 'atencion_cliente' },
```

(The `IconDepartment` function name stays — it's just a house-shaped SVG icon, no need to rename the internal helper.)

- [ ] **Step 6: `Conversations.jsx` — department state/fetch/filter/dispatch rename**

Modify: `client/src/pages/Conversations.jsx`

```diff
-  const [departments, setDepartments] = useState([]);
+  const [areas, setAreas] = useState([]);
   const [agentsList, setAgentsList] = useState([]);
   const [nameMap, setNameMap] = useState({});
-  const [teamsDeptFilter, setTeamsDeptFilter] = useState('');
+  const [teamsAreaFilter, setTeamsAreaFilter] = useState('');
```

```diff
-    // Load departments + agents for name resolution
+    // Load areas + agents for name resolution
     Promise.all([
-      authFetch(BASE_URL + '/api/departments').then(r => r.ok ? r.json() : { departments: [] }),
+      authFetch(BASE_URL + '/api/areas').then(r => r.ok ? r.json() : { areas: [] }),
       authFetch(BASE_URL + '/api/auth/users').then(r => r.ok ? r.json() : []),
-    ]).then(([deptsData, agents]) => {
-      const depts = deptsData.departments ?? [];
-      setDepartments(depts);
+    ]).then(([areasData, agents]) => {
+      const loadedAreas = areasData.areas ?? [];
+      setAreas(loadedAreas);
       setAgentsList(agents.filter(a => a.role !== 'admin'));
       const map = {};
-      for (const d of depts) map[d.id] = d.name;
+      for (const a of loadedAreas) map[a.id] = a.name;
       for (const a of agents) { map[a.email] = a.name; map[a.id] = a.name; }
       setNameMap(map);
     });
```

```diff
         } else if (filter === 'mine') {
           if (isConvArchived) return false;
-          const myDept = agent?.department;
-          if (!convHuman || (c.assignedTo !== myId && (!myDept || c.assignedTo !== myDept))) return false;
+          const myAreaIds = agent?.areaIds ?? [];
+          if (!convHuman || (c.assignedTo !== myId && !myAreaIds.includes(c.assignedTo))) return false;
         } else if (filter === 'critical') {
```

```diff
         } else if (filter === 'teams') {
           if (isConvArchived) return false;
           if (!convHuman) return false;
-          if (teamsDeptFilter && c.assignedTo !== teamsDeptFilter) return false;
+          if (teamsAreaFilter && c.assignedTo !== teamsAreaFilter) return false;
         } else if (filter === 'all') {
           if (isConvArchived) return false;
-        } else if (filter === 'notifications') {
-          if (isConvArchived) return false;
-          if (!c.notifiedAt) return false;
-          const notifiedAt = tsToDate(c.notifiedAt);
-          const lastClientMsg = tsToDate(c.lastClientMessageAt);
-          if (notifiedAt && lastClientMsg && lastClientMsg >= notifiedAt) return false;
         }
```

(The `notifications` filter branch removal above is part of Task 10, included here since it's the same file/area of code — don't do it twice.)

```diff
-          {filter === 'teams' && departments.length > 0 && (
+          {filter === 'teams' && areas.length > 0 && (
             <select
               className={styles.labelSelect}
-              value={teamsDeptFilter}
-              onChange={e => setTeamsDeptFilter(e.target.value)}
+              value={teamsAreaFilter}
+              onChange={e => setTeamsAreaFilter(e.target.value)}
             >
-              <option value="">Todos los departamentos</option>
-              {departments.map(d => (
-                <option key={d.id} value={d.id}>{d.name}</option>
+              <option value="">Todas las áreas</option>
+              {areas.map(a => (
+                <option key={a.id} value={a.id}>{a.name}</option>
               ))}
             </select>
```

```diff
                       <select
                         className={styles.agentSelect}
                         value=""
-                        onChange={e => { if (e.target.value) dispatch('assign_dept', { deptId: e.target.value }); }}
+                        onChange={e => { if (e.target.value) dispatch('assign_to', { assignedTo: e.target.value }); }}
                         disabled={updating}
                         title="Derivar a agente específico"
                       >
```

- [ ] **Step 7: Verify the build**

```bash
cd BOT-TECHDI/client
npm run build
```

Expected: builds without errors. (This is the fastest way to catch a missed rename — Vite/esbuild will fail loudly on an undefined variable like a leftover `departments` reference.)

- [ ] **Step 8: Commit**

```bash
cd BOT-TECHDI
git add client/src
git commit -m "Areas frontend: Areas page, multi-area Users, Conversations rename"
```

---

### Task 10: Remove the pickup-notification feature

Two unrelated things both say "notifications" in this codebase — don't confuse them:
1. `notifications.service.js` / `notifications.routes.js` / `Notifications.jsx` — AR's WhatsApp-template pickup-reminder feature (retail-specific). **Delete this one.**
2. `useNotifications.js` — a generic browser desktop-notification hook for new inbox messages. **Keep this one** — it was already rebranded (string-only) in Task 2, no further change needed here.

**Files:**
- Delete: `server/src/services/notifications.service.js`, `server/src/routes/notifications.routes.js`, `client/src/pages/Notifications.jsx`, `client/src/pages/Notifications.module.css`
- Modify: `server/src/app.js` (drop import/cron/mount)
- Modify: `server/src/services/conversation.service.js` (drop `markNotified`, drop `notifiedAt` field)
- Modify: `client/src/App.jsx`, `client/src/components/Layout/Layout.jsx` (drop route/nav item)
- Modify: `client/src/pages/Conversations.jsx` (drop the `notifications` filter tab — its filter-branch was already removed in Task 9 Step 6; this step removes the remaining `FILTERS` entry)

**Interfaces:**
- Produces: no `/api/notifications` route, no `/notifications` page/nav item, `conversation.service.js` exports unchanged minus `markNotified`.

- [ ] **Step 1: Delete the files**

```bash
cd BOT-TECHDI
git rm server/src/services/notifications.service.js server/src/routes/notifications.routes.js
git rm client/src/pages/Notifications.jsx client/src/pages/Notifications.module.css
```

- [ ] **Step 2: Unwire `app.js`**

Modify: `server/src/app.js`

```diff
-import notificationsRoutes from './routes/notifications.routes.js';
 import { seedAgentsIfNeeded } from './services/auth.service.js';
```

```diff
 import { closeInactiveConversations } from './services/inactivity.service.js';
 import { sendEscalationFollowups } from './services/escalation.service.js';
-import { sendPickupFollowups } from './services/notifications.service.js';
```

```diff
 // Escalation followup: every 30min, sends a reminder to clients waiting >2hs without agent response
 cron.schedule('*/30 * * * *', () => {
   sendEscalationFollowups().catch(err => console.error('[cron] escalation followup error:', err));
 });

-// Pickup followups: once a day, sends day-3/day-7 reminder templates for
-// orders still pending pickup after the initial notification
-cron.schedule('0 10 * * *', () => {
-  sendPickupFollowups().catch(err => console.error('[cron] pickup followup error:', err));
-});
-
 // Middleware
```

```diff
 app.use('/api/areas',         requireAuth, areaRoutes);
-app.use('/api/notifications',  requireAuth, notificationsRoutes);
```

- [ ] **Step 3: Drop `markNotified` and `notifiedAt` from `conversation.service.js`**

Modify: `server/src/services/conversation.service.js`

```diff
-export async function markNotified(contactId) {
-  const db = getDb();
-  await db.collection(COLLECTION).doc(contactId).update({
-    notifiedAt: new Date(),
-    updatedAt: new Date(),
-  });
-}
-
 export async function dispatchConversation(contactId, patch) {
```

```diff
     lastClientMessageAt: data.lastClientMessageAt ?? null,
-    notifiedAt: data.notifiedAt ?? null,
     consecutiveClientMessages: data.consecutiveClientMessages ?? 0,
```

- [ ] **Step 4: `App.jsx` and `Layout.jsx` — drop route/nav item**

Modify: `client/src/App.jsx`

```diff
-import Notifications from './pages/Notifications.jsx';
 import Users         from './pages/Users.jsx';
```

```diff
-          <Route path="notifications" element={<Notifications />} />
           <Route path="users"         element={<Users />} />
```

Modify: `client/src/components/Layout/Layout.jsx`

```diff
   { to: '/stats',         label: 'Estadísticas',    icon: IconChart,      minRole: 'atencion_cliente' },
   { to: '/knowledge',     label: 'Knowledge Base',  icon: IconBook,       minRole: 'atencion_cliente' },
-  { to: '/notifications', label: 'Notificaciones',  icon: IconBell },
-  { to: '/areas',         label: 'Áreas',           icon: IconDepartment, minRole: 'atencion_cliente' },
+  { to: '/areas',         label: 'Áreas',           icon: IconDepartment, minRole: 'atencion_cliente' },
```

(`IconBell` becomes an unused function after this — leave the function definition in place, it's a harmless unused export-free helper and removing it isn't worth the churn; if a linter flags it later that's a one-line delete, not a functional concern.)

- [ ] **Step 5: `Conversations.jsx` — drop the `notifications` filter tab entry**

Modify: `client/src/pages/Conversations.jsx`. Find the `FILTERS` list (near the top of the file):

```diff
   { value: 'waiting',       label: 'Esperando ⏳' },
-  { value: 'notifications', label: 'Notificaciones' },
   { value: 'archived',      label: 'Archivos' },
```

- [ ] **Step 6: Verify**

```bash
cd BOT-TECHDI/server
grep -ril "notif" src   # expect only useHooks-unrelated hits, i.e. nothing under services/routes
cd ../client
grep -ril "notification" src   # expect only src/hooks/useNotifications.js
npm run build
```

Expected: server grep prints nothing; client grep prints exactly `src/hooks/useNotifications.js`; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd BOT-TECHDI
git add -A
git commit -m "Remove pickup-notification feature (keep generic browser-notification hook)"
```

---

### Task 11: Full verification pass — run both apps end to end

**Files:** none (verification only)

- [ ] **Step 1: Confirm the codebase is clean of AR/e-commerce leftovers**

```bash
cd BOT-TECHDI
grep -ril "altorancho\|alto rancho\|tiendanube\|odoo\|department" server/src client/src
```

Expected: no output. (If anything prints, it's a leftover from Tasks 4–10 that needs fixing before continuing.)

- [ ] **Step 2: Boot both apps together**

```bash
cd BOT-TECHDI/server && npm run dev &
cd ../client && npm run dev &
sleep 3
curl -s http://localhost:3001/health
curl -s http://localhost:5173 -o /dev/null -w "%{http_code}\n"
```

Expected: health check OK as before; client responds `200`.

- [ ] **Step 3: Manual UI smoke test**

Open `http://localhost:5173` in a browser, log in with the TECHDI admin credentials from Task 3, and confirm:
- Sidebar shows "Áreas" (not "Departamentos"), no "Notificaciones" item.
- `/areas` shows the two seeded areas (Preventa/Leads, Soporte) with their descriptions and `[ESCALAR_LEADS]` / `[ESCALAR_SOPORTE]` marker codes.
- `/users` lets you create a user and check multiple area checkboxes.
- `/simulator` — send a test message like "Hola, quiero saber qué automatizaciones ofrecen" and confirm Claude responds in character as TechDI's assistant (not Alto Rancho's), with no mention of pedidos/stock/TiendaNube.
- Send a message that should escalate (e.g. "quiero hablar con una persona") and confirm it lands in the inbox with `humanMode: true` and shows up under the correct area filter.
- `/knowledge`, `/labels`, `/quick-replies`, `/templates`, `/costs`, `/config`, `/stats`, `/dashboard` all load without console errors (they're unmodified, but this confirms nothing upstream broke them).

- [ ] **Step 4: Stop both dev servers**

```bash
kill %1 %2
```

- [ ] **Step 5: Final commit (only if Step 3 required any fixes)**

```bash
cd BOT-TECHDI
git add -A
git commit -m "Fix issues found in end-to-end verification"   # only if there were fixes
```

---

## After this plan

Not part of this implementation — flagged in the spec as explicitly deferred, come back to these once the team is ready:
- Create the Meta app (WhatsApp Business + Instagram), fill in `META_*` env vars, configure the webhook URL.
- Push to `github.com/JoaquinDilernia/bot-techdi`, set up Railway (backend) + Vercel (frontend) deploys.
- Real Knowledge Base content and final visual branding — marketing/product load this through `/knowledge` and `/config`.
- Ad-source/attribution tracking, once paid ads actually start.
