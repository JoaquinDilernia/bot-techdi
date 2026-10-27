import crypto from 'crypto';
import axios from 'axios';
import { getDb } from './firebase.service.js';
import { qualifyProspects } from './claude.service.js';
import { sendWhatsAppTemplate, sendWhatsAppMessage, fetchPhoneQuality } from './meta.service.js';
import { getOrCreateConversation, appendMessage, updateMessageStatus, updateConversationStatus } from './conversation.service.js';
import { getOrCreateCustomer, updateCustomer } from './customer.service.js';
import { getAllTemplates } from './template.service.js';
import { toWaContactId, isArgentineMobile } from './phone.js';
import { isWithinBusinessHoursAt } from './businessHours.js';
import { arMidnight } from './statsAggregate.js';

// ─────────────────────────── Prospección ───────────────────────────────────
// Busca negocios en Google Maps (Places API), los califica con Claude y les
// manda una plantilla de WhatsApp para abrir la ventana de 24 h. Si responden,
// sigue TeDI con el contexto del prospecto en las notas del contacto.
//
// Se manda desde el MISMO número que atiende a los clientes, así que todo
// está pensado para cuidar su calidad: cupo diario chico, aprobación manual
// por defecto, botón "No, gracias" que nunca más se contacta, y la calidad
// del número según Meta baja el cupo a la mitad (YELLOW) o pausa todo (RED,
// número marcado o plantilla pausada por Meta).

const PROSPECTS = 'bot-techdi_prospects';
const CUSTOMERS = 'bot-techdi_customers';
const CONFIG_COLLECTION = 'bot-techdi_config';
const CONFIG_DOC = 'prospecting';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.primaryTypeDisplayName',
  'places.googleMapsUri', 'places.businessStatus', 'nextPageToken',
].join(',');
const PLACES_MAX_PAGES = 3; // Places no devuelve más de 60 resultados (3 páginas de 20) por búsqueda

const SENDS_PER_TICK = 2;              // el cron corre cada 15 min: el cupo se reparte en el día
const SEND_GAP_MS = 45 * 1000;         // separación entre envíos dentro de un mismo tick
const QUALITY_CACHE_MS = 30 * 60 * 1000;

// Estados que todavía no recibieron mensaje — cuentan como "cola".
const QUEUE_STATUSES = ['pendiente', 'aprobado'];
export const PROSPECT_STATUSES = [
  'pendiente', 'aprobado', 'enviado', 'error', 'respondio', 'interesado',
  'no_interesa', 'reunion', 'cliente', 'descartado',
];

const DEFAULT_CONFIG = {
  enabled: false,
  autoApprove: false,
  dailyCap: 25,
  paused: false,
  pausedReason: null,
  pausedAt: null,
  searches: [],
  lastQuality: null,
};

const NOT_INTERESTED_RE = /^\s*(no,?\s*gracias|no me interesa|no nos interesa|no gracias)\b/i;
const INTERESTED_RE = /^\s*me interesa\b/i;

const NOT_INTERESTED_REPLY = '¡Gracias por avisarnos! No te vamos a volver a escribir. Si algún día lo necesitan, acá estamos. 🙌';

function tsToMs(ts) {
  if (!ts) return 0;
  if (ts._seconds) return ts._seconds * 1000;
  if (ts.toDate) return ts.toDate().getTime();
  const d = new Date(ts);
  return isNaN(d) ? 0 : d.getTime();
}

// ─────────────────────────── Configuración ─────────────────────────────────

function configRef() {
  return getDb().collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
}

export async function getProspectConfig() {
  const doc = await configRef().get();
  return { ...DEFAULT_CONFIG, ...(doc.exists ? doc.data() : {}) };
}

function cleanSearch(s) {
  return {
    id: s.id || crypto.randomBytes(4).toString('hex'),
    rubro: String(s.rubro ?? '').trim(),
    zona: String(s.zona ?? '').trim(),
    offer: String(s.offer ?? '').trim(),
    templateName: String(s.templateName ?? '').trim(),
    language: String(s.language ?? 'es_AR').trim() || 'es_AR',
    paramsTemplate: Array.isArray(s.paramsTemplate) ? s.paramsTemplate.map(p => String(p ?? '')) : [],
    active: s.active !== false,
    lastRunAt: s.lastRunAt ?? null,
    lastNewCount: s.lastNewCount ?? null,
  };
}

export async function updateProspectConfig(patch) {
  const current = await getProspectConfig();
  const update = {};
  if (patch.enabled !== undefined) update.enabled = !!patch.enabled;
  if (patch.autoApprove !== undefined) update.autoApprove = !!patch.autoApprove;
  if (patch.dailyCap !== undefined) {
    update.dailyCap = Math.max(1, Math.min(100, parseInt(patch.dailyCap, 10) || DEFAULT_CONFIG.dailyCap));
  }
  if (Array.isArray(patch.searches)) {
    // Conservar lastRunAt/lastNewCount de las búsquedas que ya existían — el
    // panel no los manda de vuelta y se perdería la rotación entre búsquedas.
    update.searches = patch.searches
      .map(s => cleanSearch({ ...current.searches.find(c => c.id === s.id), ...s }))
      .filter(s => s.rubro && s.zona);
  }
  await configRef().set(update, { merge: true });
  return getProspectConfig();
}

export async function pauseProspecting(reason) {
  const config = await getProspectConfig();
  if (config.paused) return;
  await configRef().set({ paused: true, pausedReason: reason, pausedAt: new Date() }, { merge: true });
  console.warn(`[prospect] Prospección PAUSADA: ${reason}`);
}

export async function resumeProspecting() {
  await configRef().set({ paused: false, pausedReason: null, pausedAt: null }, { merge: true });
  return getProspectConfig();
}

// ─────────────────────────── Calidad del número ────────────────────────────

/** Devuelve el cupo efectivo de hoy según la calidad del número (y pausa si
    es RED). Cachea la consulta a Meta 30 min en la config. */
async function effectiveDailyCap(config) {
  let lastQuality = config.lastQuality;
  if (!lastQuality || Date.now() - tsToMs(lastQuality.checkedAt) > QUALITY_CACHE_MS) {
    try {
      const q = await fetchPhoneQuality();
      if (q) {
        lastQuality = { ...q, checkedAt: new Date() };
        await configRef().set({ lastQuality }, { merge: true });
      }
    } catch (err) {
      console.error('[prospect] No se pudo leer la calidad del número:', err.response?.data?.error?.message ?? err.message);
    }
  }
  const quality = lastQuality?.quality ?? 'UNKNOWN';
  if (quality === 'RED') {
    await pauseProspecting('Meta bajó la calidad del número a ROJO. Revisá los envíos antes de reanudar.');
    return 0;
  }
  if (quality === 'YELLOW') return Math.ceil(config.dailyCap / 2);
  return config.dailyCap;
}

/** Webhook `phone_number_quality_update`: Meta avisa que marcó el número o
    le bajó el límite de mensajería. */
export async function handlePhoneQualityWebhook(value = {}) {
  const event = value.event;
  console.warn(`[prospect] Aviso de calidad de Meta: ${event} (límite: ${value.current_limit ?? '?'})`);
  // Forzar una relectura de la calidad en el próximo tick.
  await configRef().set({ lastQuality: null }, { merge: true });
  if (event === 'FLAGGED' || event === 'DOWNGRADE') {
    await pauseProspecting(`Meta ${event === 'FLAGGED' ? 'marcó el número por baja calidad' : 'bajó el límite de mensajes del número'}.`);
  }
}

/** Webhook `message_template_status_update`: si Meta pausa o desactiva una
    plantilla que usa la prospección, se pausa todo (una plantilla pausada es
    señal de que la están bloqueando/reportando). */
export async function handleTemplateStatusWebhook(value = {}) {
  const event = value.event;
  const name = value.message_template_name;
  if (!['PAUSED', 'DISABLED', 'FLAGGED'].includes(event) || !name) return;
  const config = await getProspectConfig();
  if (config.searches.some(s => s.templateName === name)) {
    await pauseProspecting(`Meta puso la plantilla "${name}" en estado ${event}.`);
  }
}

// ─────────────────────────── Búsqueda (Google Places) ──────────────────────

async function searchPlaces(textQuery, pageToken = null) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    const e = new Error('Falta la variable GOOGLE_PLACES_API_KEY');
    e.status = 400;
    throw e;
  }
  const { data } = await axios.post(
    PLACES_URL,
    { textQuery, languageCode: 'es', regionCode: 'AR', pageSize: 20, ...(pageToken && { pageToken }) },
    { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELDS, 'Content-Type': 'application/json' } }
  );
  return { places: data.places ?? [], nextPageToken: data.nextPageToken ?? null };
}

function mapPlace(p) {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? 0,
    primaryType: p.primaryTypeDisplayName?.text ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    businessStatus: p.businessStatus ?? null,
  };
}

function interpolateParams(paramsTemplate, ctx) {
  return paramsTemplate.map(tpl => (tpl ?? '')
    .replace(/\{\{\s*negocio\s*\}\}/gi, ctx.negocio)
    .replace(/\{\{\s*rubro\s*\}\}/gi, ctx.rubro)
    .replace(/\{\{\s*zona\s*\}\}/gi, ctx.zona)
    // Meta rechaza parámetros con saltos de línea o tabs.
    .replace(/[\n\t]+/g, ' ')
    .trim());
}

function renderTemplate(bodyText, params) {
  return (bodyText ?? '').replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] ?? m);
}

/**
 * Corre UNA búsqueda guardada: trae hasta 3 páginas de Places, descarta lo
 * que no sirve (cerrados, fijos, ya contactados, ya clientes), califica con
 * Claude y guarda los nuevos prospectos. Devuelve cuántos agregó.
 */
async function runSearch(search, { maxNew, autoApprove, templates }) {
  const db = getDb();
  const template = templates.find(t => t.name === search.templateName);
  const textQuery = `${search.rubro} en ${search.zona}`;

  const candidates = [];
  const seen = new Set();
  let pageToken = null;
  let found = 0;
  for (let page = 0; page < PLACES_MAX_PAGES && candidates.length < maxNew; page++) {
    const res = await searchPlaces(textQuery, pageToken);
    found += res.places.length;
    const mapped = res.places.map(mapPlace)
      .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY' && p.businessStatus !== 'CLOSED_TEMPORARILY')
      .filter(p => isArgentineMobile(p.phone))
      .map(p => ({ ...p, contactId: toWaContactId(p.phone) }))
      .filter(p => p.contactId && !seen.has(p.contactId));
    mapped.forEach(p => seen.add(p.contactId));

    if (mapped.length > 0) {
      // Un solo getAll por colección: ya prospectado (cualquier estado,
      // incluido "no le interesa") o ya es un contacto del CRM → afuera.
      const [prospectDocs, customerDocs] = await Promise.all([
        db.getAll(...mapped.map(p => db.collection(PROSPECTS).doc(p.contactId))),
        db.getAll(...mapped.map(p => db.collection(CUSTOMERS).doc(p.contactId))),
      ]);
      mapped.forEach((p, i) => {
        if (!prospectDocs[i].exists && !customerDocs[i].exists) candidates.push(p);
      });
    }
    pageToken = res.nextPageToken;
    if (!pageToken) break;
  }

  const batch = candidates.slice(0, maxNew);
  let added = 0;
  if (batch.length > 0) {
    const results = await qualifyProspects(batch, { rubro: search.rubro, zona: search.zona, offer: search.offer });
    const writes = db.batch();
    batch.forEach((p, i) => {
      const q = results[i];
      const params = interpolateParams(search.paramsTemplate, { negocio: q.shortName, rubro: search.rubro, zona: search.zona });
      const status = !q.fit ? 'descartado' : (autoApprove && template?.metaStatus === 'APPROVED') ? 'aprobado' : 'pendiente';
      if (q.fit) added++;
      writes.set(db.collection(PROSPECTS).doc(p.contactId), {
        ...p,
        shortName: q.shortName,
        score: q.score,
        scoreReason: q.reason,
        searchId: search.id,
        rubro: search.rubro,
        zona: search.zona,
        offer: search.offer,
        templateName: search.templateName,
        language: search.language,
        params,
        renderedText: template ? renderTemplate(template.bodyText, params) : null,
        status,
        statusChangedAt: new Date(),
        approvedAt: status === 'aprobado' ? new Date() : null,
        approvedBy: status === 'aprobado' ? 'auto' : null,
        waMsgId: null, msgStatus: null, sentAt: null, deliveredAt: null, readAt: null,
        respondedAt: null, error: null,
        createdAt: new Date(),
      });
    });
    await writes.commit();
  }
  console.log(`[prospect] "${textQuery}": ${found} en Maps, ${batch.length} candidatos nuevos, ${added} calificados`);
  return { found, candidates: batch.length, added };
}

async function countByStatus(statuses) {
  const snap = await getDb().collection(PROSPECTS).where('status', 'in', statuses).count().get();
  return snap.data().count;
}

/**
 * Búsqueda diaria: llena la cola hasta ~1,5 días de cupo, rotando entre las
 * búsquedas activas (la que hace más que no corre, primero). `force` la corre
 * aunque la prospección esté apagada o pausada (botón "Buscar ahora").
 */
export async function runDailySearch({ force = false } = {}) {
  const config = await getProspectConfig();
  if (!force && (!config.enabled || config.paused)) return { skipped: true, reason: 'apagada o pausada' };

  const active = config.searches.filter(s => s.active);
  if (active.length === 0) return { skipped: true, reason: 'no hay búsquedas activas' };

  const backlog = await countByStatus(QUEUE_STATUSES);
  let needed = Math.ceil(config.dailyCap * 1.5) - backlog;
  if (needed <= 0) return { skipped: true, reason: `ya hay ${backlog} en la cola` };

  const templates = await getAllTemplates();
  const ordered = [...active].sort((a, b) => tsToMs(a.lastRunAt) - tsToMs(b.lastRunAt));
  const summary = [];
  const runs = {};
  for (const search of ordered) {
    if (needed <= 0) break;
    try {
      const r = await runSearch(search, { maxNew: needed, autoApprove: config.autoApprove, templates });
      needed -= r.added;
      runs[search.id] = { lastRunAt: new Date(), lastNewCount: r.added };
      summary.push({ search: `${search.rubro} en ${search.zona}`, ...r });
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? err.message;
      console.error(`[prospect] Error en la búsqueda "${search.rubro} en ${search.zona}":`, msg);
      summary.push({ search: `${search.rubro} en ${search.zona}`, error: msg });
      if (err.status === 400) break; // falta la API key: no tiene sentido seguir
    }
  }
  // Releer antes de escribir para no pisar cambios hechos desde el panel
  // mientras corría la búsqueda (puede tardar varios segundos).
  const fresh = await getProspectConfig();
  await configRef().set({
    searches: fresh.searches.map(s => runs[s.id] ? { ...s, ...runs[s.id] } : s),
  }, { merge: true });
  return { skipped: false, summary };
}

// ─────────────────────────── Envío ─────────────────────────────────────────

async function sentTodayCount() {
  const snap = await getDb().collection(PROSPECTS).where('sentAt', '>=', arMidnight(new Date())).count().get();
  return snap.data().count;
}

async function sendProspect(prospect) {
  const db = getDb();
  const ref = db.collection(PROSPECTS).doc(prospect.contactId);
  const { contactId } = prospect;
  const text = prospect.renderedText || `[Prospección: ${prospect.templateName}] ${prospect.params.join(' | ')}`;

  await getOrCreateConversation(contactId, 'whatsapp', prospect.shortName);
  const msgId = crypto.randomUUID();
  await appendMessage(contactId, { role: 'admin', content: text, msgId, msgStatus: 'sending', sentBy: 'prospeccion' });

  let waMsgId = null;
  let sendError = null;
  try {
    waMsgId = await sendWhatsAppTemplate(contactId, prospect.templateName, prospect.language, prospect.params);
  } catch (err) {
    sendError = err.response?.data?.error?.message ?? err.message;
  }
  await updateMessageStatus(contactId, msgId, sendError ? 'error' : 'sent', waMsgId).catch(() => {});
  // Archivada hasta que responda: si no, 25 chats por día sin respuesta
  // llenarían la bandeja. Cuando contesta, el bot la reabre solo.
  await updateConversationStatus(contactId, 'bot_archived').catch(() => {});

  await ref.update(sendError
    ? { status: 'error', error: sendError, statusChangedAt: new Date() }
    : { status: 'enviado', waMsgId, msgStatus: 'sent', sentAt: new Date(), error: null, statusChangedAt: new Date() });
  if (sendError) console.error(`[prospect] Error mandándole a ${contactId}:`, sendError);
  return !sendError;
}

/** Tick del cron (cada 15 min): manda hasta SENDS_PER_TICK aprobados si
    estamos en horario y no se llegó al cupo del día. */
export async function sendTick() {
  const config = await getProspectConfig();
  if (!config.enabled || config.paused) return { skipped: true };

  const botConfigDoc = await getDb().collection(CONFIG_COLLECTION).doc('bot_config').get().catch(() => null);
  const botConfig = botConfigDoc?.exists ? botConfigDoc.data() : {};
  if (!isWithinBusinessHoursAt(new Date(), botConfig)) return { skipped: true, reason: 'fuera de horario' };

  const cap = await effectiveDailyCap(config);
  const remaining = cap - await sentTodayCount();
  if (remaining <= 0) return { skipped: true, reason: 'cupo del día completo' };

  const templates = await getAllTemplates();
  const snap = await getDb().collection(PROSPECTS).where('status', '==', 'aprobado').limit(50).get();
  const queue = snap.docs.map(d => d.data())
    .filter(p => templates.find(t => t.name === p.templateName)?.metaStatus === 'APPROVED')
    .sort((a, b) => tsToMs(a.approvedAt) - tsToMs(b.approvedAt))
    .slice(0, Math.min(SENDS_PER_TICK, remaining));

  let sent = 0;
  for (let i = 0; i < queue.length; i++) {
    // Releer la config entre envíos: si un webhook de Meta la pausó en el
    // medio, no seguir mandando.
    if (i > 0) {
      await new Promise(r => setTimeout(r, SEND_GAP_MS));
      if ((await getProspectConfig()).paused) break;
    }
    try {
      if (await sendProspect(queue[i])) sent++;
    } catch (err) {
      console.error(`[prospect] Error inesperado mandándole a ${queue[i].contactId}:`, err.message);
    }
  }
  return { skipped: false, sent };
}

/** Webhook de estado (delivered/read/failed) de un mensaje: si era una
    plantilla de prospección, actualiza el prospecto. */
export async function updateProspectStatusByWaMsgId(waMsgId, status, msgError = null) {
  const snap = await getDb().collection(PROSPECTS).where('waMsgId', '==', waMsgId).limit(1).get();
  if (snap.empty) return;
  const ref = snap.docs[0].ref;
  const current = snap.docs[0].data();
  const RANK = { sent: 1, delivered: 2, read: 3 };
  if (status === 'error') {
    // Falla informada después por Meta (ej. el número no tiene WhatsApp).
    // No cuenta para el cupo: se libera el sentAt.
    if (current.status === 'enviado') {
      await ref.update({ status: 'error', msgStatus: 'error', error: msgError ?? 'Meta no pudo entregar el mensaje', sentAt: null, statusChangedAt: new Date() });
    }
    return;
  }
  if ((RANK[status] ?? 0) <= (RANK[current.msgStatus] ?? 0)) return;
  const update = { msgStatus: status };
  if (status === 'delivered' && !current.deliveredAt) update.deliveredAt = new Date();
  if (status === 'read' && !current.readAt) update.readAt = new Date();
  await ref.update(update);
}

// ─────────────────────────── Respuestas ────────────────────────────────────

function prospectNote(p) {
  return [
    `Prospecto de Google Maps: ${p.shortName || p.name} (${p.rubro}, ${p.zona}).`,
    p.address && `Dirección: ${p.address}.`,
    p.website && `Web: ${p.website}.`,
    `Le escribimos nosotros primero (en frío) ofreciendo: ${p.offer || 'nuestros servicios'}.`,
    'Objetivo: contarle en pocas palabras cómo le serviría a su negocio, responder sus dudas y proponer una demo o una llamada corta con el equipo. Si quiere avanzar o pide hablar con alguien, derivalo. No insistas si no le interesa.',
  ].filter(Boolean).join('\n');
}

/**
 * Llamado desde el webhook ANTES de que el bot procese el mensaje. Si el
 * contacto es un prospecto al que le mandamos la plantilla:
 *  - "No, gracias" → queda como no interesado (no se lo vuelve a contactar),
 *    se le responde una sola vez y el bot NO sigue (devuelve true).
 *  - cualquier otra respuesta → se marca, se crea el contacto con las notas
 *    del prospecto (las lee TeDI como contexto) y sigue el bot normal.
 */
export async function handleProspectReply(msg) {
  if (msg.channel !== 'whatsapp') return false;
  const contactId = toWaContactId(msg.from) ?? msg.from;
  const ref = getDb().collection(PROSPECTS).doc(contactId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const p = doc.data();
  if (p.status !== 'enviado') return false; // solo la primera respuesta cambia el estado

  const text = msg.text ?? '';
  if (NOT_INTERESTED_RE.test(text)) {
    await ref.update({ status: 'no_interesa', respondedAt: new Date(), statusChangedAt: new Date() });
    await appendMessage(contactId, { role: 'user', content: text, contactName: msg.contactName, messageId: msg.messageId });
    await appendMessage(contactId, { role: 'assistant', content: NOT_INTERESTED_REPLY });
    await sendWhatsAppMessage(contactId, NOT_INTERESTED_REPLY).catch(err =>
      console.error('[prospect] Error mandando la respuesta de "no interesa":', err.message));
    await updateConversationStatus(contactId, 'resolved').catch(() => {});
    console.log(`[prospect] ${contactId} respondió que no le interesa`);
    return true;
  }

  const status = INTERESTED_RE.test(text) ? 'interesado' : 'respondio';
  await ref.update({ status, respondedAt: new Date(), statusChangedAt: new Date() });
  const customer = await getOrCreateCustomer(contactId, 'whatsapp', p.shortName || msg.contactName);
  const tags = [...new Set([...(customer.tags ?? []), 'Prospección', p.rubro].filter(Boolean))];
  await updateCustomer(contactId, {
    tags,
    ...(!customer.agentNotes && { agentNotes: prospectNote(p) }),
  });
  console.log(`[prospect] ${contactId} respondió (${status})`);
  return false;
}

// ─────────────────────────── Panel ─────────────────────────────────────────

export async function listProspects() {
  const snap = await getDb().collection(PROSPECTS).orderBy('createdAt', 'desc').limit(500).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setProspectsStatus(ids, status, agentEmail) {
  if (!PROSPECT_STATUSES.includes(status)) {
    const e = new Error('Estado inválido');
    e.status = 400;
    throw e;
  }
  const db = getDb();
  const docs = await db.getAll(...ids.map(id => db.collection(PROSPECTS).doc(id)));
  const batch = db.batch();
  let changed = 0;
  for (const doc of docs) {
    if (!doc.exists) continue;
    const current = doc.data().status;
    // Aprobar solo tiene sentido para lo que todavía no se mandó.
    if (status === 'aprobado' && !['pendiente', 'descartado', 'error'].includes(current)) continue;
    batch.update(doc.ref, {
      status,
      statusChangedAt: new Date(),
      ...(status === 'aprobado' && { approvedAt: new Date(), approvedBy: agentEmail ?? null, error: null }),
    });
    changed++;
  }
  if (changed > 0) await batch.commit();
  return { changed };
}

export async function getProspectSummary() {
  const [config, sentToday] = await Promise.all([getProspectConfig(), sentTodayCount()]);
  const quality = config.lastQuality?.quality ?? 'UNKNOWN';
  const cap = config.paused ? 0 : quality === 'YELLOW' ? Math.ceil(config.dailyCap / 2) : quality === 'RED' ? 0 : config.dailyCap;
  return { sentToday, effectiveCap: cap, quality, tier: config.lastQuality?.tier ?? null };
}
