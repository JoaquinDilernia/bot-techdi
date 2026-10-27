import crypto from 'crypto';
import axios from 'axios';
import admin from 'firebase-admin';
import { getDb } from './firebase.service.js';
import { qualifyProspects, summarizeProspectOnboarding } from './claude.service.js';
import { sendWhatsAppTemplate, sendWhatsAppMessage, fetchPhoneQuality } from './meta.service.js';
import {
  getOrCreateConversation, getConversationHistory, appendMessage, updateMessageStatus, updateConversationStatus,
  dispatchConversation, addLabelToConversation,
} from './conversation.service.js';
import { createLabel } from './label.service.js';
import { getActiveAreas } from './area.service.js';
import { getOrCreateCustomer, updateCustomer } from './customer.service.js';
import { getAllTemplates } from './template.service.js';
import { toWaContactId, isArgentineMobile } from './phone.js';
import { isWithinBusinessHoursAt } from './businessHours.js';
import { arMidnight } from './statsAggregate.js';
import { GROUPS, RUBROS, PROVINCES, WEB_OFFER, getRubro, getZone, hasOwnWebsite } from '../data/prospectCatalog.js';

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
// Una fila por combinación rubro × zona ya buscada: cuándo, cuántos trajo y
// si se agotó (Maps ya no devuelve nada nuevo → se saltea por un tiempo).
const RUNS = 'bot-techdi_prospect_runs';

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
const MAX_COMBOS_PER_RUN = 8;          // tope de búsquedas en Maps por corrida (costo y tiempo)
const EXHAUSTED_DAYS = 90;             // una combinación agotada se vuelve a probar a los 3 meses
const AUTO_APPROVE_MIN_SCORE = 3;      // debajo de esto, aunque la IA diga que sirve, queda para aprobar a mano

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
  rubroIds: [],
  zoneIds: [],
  // Plantilla por grupo de rubros (gastronomía, turnos, comercios, servicios),
  // más "web": la de los negocios sin web propia.
  templates: {
    ...Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.template])),
    web: WEB_OFFER.template,
  },
  // Negocios sin web propia: 'mix' les ofrece landing/tienda y al resto lo de
  // su rubro; 'only' busca solo a los que no tienen web; 'off' no distingue.
  webOffer: 'mix',
  lastQuality: null,
};
const WEB_OFFER_MODES = ['mix', 'only', 'off'];

const NOT_INTERESTED_RE = /^\s*(no,?\s*gracias|no me interesa|no nos interesa|no gracias)\b/i;
const INTERESTED_RE = /^\s*me interesa\b/i;

const NOT_INTERESTED_REPLY = '¡Gracias por avisarnos! No te vamos a volver a escribir. Si algún día lo necesitan, acá estamos. 🙌';

// Etiqueta de las conversaciones de prospección (filtro "Prospección" en
// Conversaciones) y área a la que se derivan cuando el negocio responde:
// Preventa / Leads, donde están Agustín y Sofía.
export const PROSPECT_LABEL = 'Prospección';
const LEADS_AREA_ID = 'leads';

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
  const data = doc.exists ? doc.data() : {};
  return { ...DEFAULT_CONFIG, ...data, templates: { ...DEFAULT_CONFIG.templates, ...(data.templates ?? {}) } };
}

export async function updateProspectConfig(patch) {
  const update = {};
  if (patch.enabled !== undefined) update.enabled = !!patch.enabled;
  if (patch.autoApprove !== undefined) update.autoApprove = !!patch.autoApprove;
  if (patch.dailyCap !== undefined) {
    update.dailyCap = Math.max(1, Math.min(100, parseInt(patch.dailyCap, 10) || DEFAULT_CONFIG.dailyCap));
  }
  if (Array.isArray(patch.rubroIds)) update.rubroIds = [...new Set(patch.rubroIds)].filter(id => getRubro(id));
  if (Array.isArray(patch.zoneIds)) update.zoneIds = [...new Set(patch.zoneIds)].filter(id => getZone(id));
  if (patch.templates && typeof patch.templates === 'object') {
    update.templates = Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.templates).map(([k, def]) => [k, String(patch.templates[k] ?? '').trim() || def])
    );
  }
  if (WEB_OFFER_MODES.includes(patch.webOffer)) update.webOffer = patch.webOffer;
  await configRef().set(update, { merge: true });
  return getProspectConfig();
}

export function getProspectCatalog() {
  return { groups: GROUPS, webOffer: WEB_OFFER, rubros: RUBROS, provinces: PROVINCES };
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
  if (Object.values(config.templates).includes(name)) {
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

function renderTemplate(bodyText, params) {
  return (bodyText ?? '').replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] ?? m);
}

/**
 * Corre UNA combinación rubro × zona: trae hasta 3 páginas de Places,
 * descarta lo que no sirve (cerrados, fijos, ya contactados, ya clientes),
 * califica con Claude y guarda los nuevos prospectos.
 */
async function runCombo({ id: comboId, rubro, zone }, { maxNew, autoApprove, templates, templateNames, webOffer }) {
  const db = getDb();
  const group = GROUPS[rubro.group];
  // Dos ofertas posibles por búsqueda: la del rubro, o la de web para los
  // negocios que no tienen una propia.
  const offers = {
    rubro: { offer: group.offer, templateName: templateNames[rubro.group] || group.template },
    web: { offer: WEB_OFFER.offer, criteria: WEB_OFFER.criteria, templateName: templateNames.web || WEB_OFFER.template },
  };
  for (const o of Object.values(offers)) o.template = templates.find(t => t.name === o.templateName);
  const offerKind = p => (webOffer !== 'off' && !p.hasWebsite ? 'web' : 'rubro');
  const textQuery = `${rubro.query} en ${zone.query}`;

  const candidates = [];
  const seen = new Set();
  let pageToken = null;
  let found = 0;
  // Nuevos que Maps devolvió, con y sin web: con webOffer 'only' los que
  // tienen web no se toman, pero siguen contando para saber si la búsqueda
  // se agotó de verdad (si se cambia de modo, todavía hay a quién escribirle).
  let newAll = 0;
  let newNoWeb = 0;
  for (let page = 0; page < PLACES_MAX_PAGES && candidates.length < maxNew; page++) {
    const res = await searchPlaces(textQuery, pageToken);
    found += res.places.length;
    const mapped = res.places.map(mapPlace)
      .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY' && p.businessStatus !== 'CLOSED_TEMPORARILY')
      .filter(p => isArgentineMobile(p.phone))
      .map(p => ({ ...p, contactId: toWaContactId(p.phone), hasWebsite: hasOwnWebsite(p.website) }))
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
        if (prospectDocs[i].exists || customerDocs[i].exists) return;
        newAll++;
        if (!p.hasWebsite) newNoWeb++;
        if (webOffer === 'only' && p.hasWebsite) return;
        candidates.push(p);
      });
    }
    pageToken = res.nextPageToken;
    if (!pageToken) break;
  }

  const batch = candidates.slice(0, maxNew);
  let added = 0;
  if (batch.length > 0) {
    // Se califica por separado cada oferta: si un negocio sirve depende de
    // qué le vamos a ofrecer (a uno sin web le sirve la landing aunque sea
    // chico para un bot).
    const results = new Map();
    for (const kind of Object.keys(offers)) {
      const items = batch.filter(p => offerKind(p) === kind);
      if (items.length === 0) continue;
      const qs = await qualifyProspects(items, { rubro: rubro.label, zona: `${zone.name} (${zone.province})`, offer: offers[kind].offer, criteria: offers[kind].criteria });
      items.forEach((p, i) => results.set(p.contactId, qs[i]));
    }
    const writes = db.batch();
    batch.forEach(p => {
      const q = results.get(p.contactId);
      const kind = offerKind(p);
      const { offer, templateName, template } = offers[kind];
      // Las plantillas de prospección tienen una sola variable: el nombre del
      // negocio. Meta rechaza parámetros con saltos de línea o tabs.
      const params = [q.shortName.replace(/[\n\t]+/g, ' ')];
      // La aprobación automática solo toma los de puntaje alto: Claude a veces
      // marca "sirve" negocios chicos con 2/5, y esos mejor que los mire alguien.
      const autoOk = autoApprove && template?.metaStatus === 'APPROVED' && q.score >= AUTO_APPROVE_MIN_SCORE;
      const status = !q.fit ? 'descartado' : autoOk ? 'aprobado' : 'pendiente';
      if (q.fit) added++;
      writes.set(db.collection(PROSPECTS).doc(p.contactId), {
        ...p,
        shortName: q.shortName,
        score: q.score,
        scoreReason: q.reason,
        comboId,
        rubroId: rubro.id,
        rubro: rubro.label,
        group: rubro.group,
        zoneId: zone.id,
        zona: zone.name,
        provinciaId: zone.provinceId,
        provincia: zone.province,
        offerKind: kind,
        offer,
        templateName,
        language: template?.language ?? 'es_AR',
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
  return { found, candidates: batch.length, newAll, newNoWeb, added };
}

async function countByStatus(statuses) {
  const snap = await getDb().collection(PROSPECTS).where('status', 'in', statuses).count().get();
  return snap.data().count;
}

// Mezcla determinística por día: dentro del mismo nivel de prioridad, cada
// día arranca por combinaciones distintas, así no se buscan siempre los
// mismos rubros primero.
function dayHash(str) {
  let h = 2166136261;
  const s = `${new Date().toISOString().slice(0, 10)}|${str}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Combinaciones rubro × zona elegidas, en el orden en que conviene buscarlas:
    primero las nunca buscadas (zonas más grandes antes), después las que hace
    más que no se buscan. Las agotadas recientemente quedan afuera. */
async function orderedCombos(config) {
  const rubros = config.rubroIds.map(getRubro).filter(Boolean);
  const zones = config.zoneIds.map(getZone).filter(Boolean);
  if (!rubros.length || !zones.length) return [];
  const runsSnap = await getDb().collection(RUNS).get();
  const runs = new Map(runsSnap.docs.map(d => [d.id, d.data()]));
  const now = Date.now();
  const combos = [];
  for (const rubro of rubros) {
    for (const zone of zones) {
      const id = `${rubro.id}__${zone.id}`;
      const run = runs.get(id);
      if (run?.exhaustedUntil && tsToMs(run.exhaustedUntil) > now) continue;
      if (config.webOffer === 'only' && run?.exhaustedNoWebUntil && tsToMs(run.exhaustedNoWebUntil) > now) continue;
      combos.push({ id, rubro, zone, lastRunMs: tsToMs(run?.lastRunAt), hash: dayHash(id) });
    }
  }
  return combos.sort((a, b) => a.lastRunMs - b.lastRunMs || a.zone.tier - b.zone.tier || a.hash - b.hash);
}

/**
 * Búsqueda diaria: llena la cola hasta ~1,5 días de cupo recorriendo las
 * combinaciones rubro × zona elegidas. `force` la corre aunque la
 * prospección esté apagada o pausada (botón "Buscar ahora").
 */
// Una sola búsqueda a la vez: dos corridas en paralelo (dos clics en "Buscar
// ahora", o el botón mientras corre el cron) leen la misma cola, califican los
// mismos negocios dos veces y la segunda pisa lo que guardó la primera.
let searchRunning = null;

export async function runDailySearch(opts = {}) {
  if (searchRunning) return { skipped: true, reason: 'ya hay una búsqueda en curso, esperá a que termine' };
  searchRunning = runDailySearchInternal(opts);
  try {
    return await searchRunning;
  } finally {
    searchRunning = null;
  }
}

async function runDailySearchInternal({ force = false } = {}) {
  const config = await getProspectConfig();
  if (!force && (!config.enabled || config.paused)) return { skipped: true, reason: 'apagada o pausada' };

  const combos = await orderedCombos(config);
  if (combos.length === 0) return { skipped: true, reason: 'no hay rubros y zonas elegidos (o ya están todos agotados)' };

  const backlog = await countByStatus(QUEUE_STATUSES);
  let needed = Math.ceil(config.dailyCap * 1.5) - backlog;
  if (needed <= 0) return { skipped: true, reason: `ya hay ${backlog} en la cola` };

  const templates = await getAllTemplates();
  const db = getDb();
  const summary = [];
  for (const combo of combos.slice(0, MAX_COMBOS_PER_RUN)) {
    if (needed <= 0) break;
    const label = `${combo.rubro.label} en ${combo.zone.name} (${combo.zone.province})`;
    try {
      const r = await runCombo(combo, {
        maxNew: needed, autoApprove: config.autoApprove, templates, templateNames: config.templates, webOffer: config.webOffer,
      });
      const exhaustedUntil = new Date(Date.now() + EXHAUSTED_DAYS * 86400000);
      needed -= r.added;
      await db.collection(RUNS).doc(combo.id).set({
        rubroId: combo.rubro.id,
        zoneId: combo.zone.id,
        lastRunAt: new Date(),
        lastFound: r.found,
        lastAdded: r.added,
        runs: admin.firestore.FieldValue.increment(1),
        totalAdded: admin.firestore.FieldValue.increment(r.added),
        // Sin candidatos nuevos = Maps ya no tiene nada que no hayamos visto.
        exhaustedUntil: r.newAll === 0 ? exhaustedUntil : null,
        // Ya no quedan negocios sin web: solo cuenta cuando se buscan solo esos.
        exhaustedNoWebUntil: r.newNoWeb === 0 ? exhaustedUntil : null,
      }, { merge: true });
      summary.push({ search: label, ...r });
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? err.message;
      console.error(`[prospect] Error en la búsqueda "${label}":`, msg);
      summary.push({ search: label, error: msg });
      // Falta la key o Google la rechaza: no tiene sentido seguir probando.
      if (err.status === 400 || [400, 401, 403].includes(err.response?.status)) break;
    }
  }
  return { skipped: false, summary };
}

// ─────────────────────────── Envío ─────────────────────────────────────────

async function sentTodayCount() {
  const snap = await getDb().collection(PROSPECTS).where('sentAt', '>=', arMidnight(new Date())).count().get();
  return snap.data().count;
}

let labelReady = false;
async function ensureProspectLabel() {
  if (labelReady) return;
  await createLabel(PROSPECT_LABEL, '#0E8CA3').catch(() => {});
  labelReady = true;
}

async function sendProspect(prospect) {
  const db = getDb();
  const ref = db.collection(PROSPECTS).doc(prospect.contactId);
  const { contactId } = prospect;
  const text = prospect.renderedText || `[Prospección: ${prospect.templateName}] ${prospect.params.join(' | ')}`;

  await getOrCreateConversation(contactId, 'whatsapp', prospect.shortName);
  await ensureProspectLabel();
  await addLabelToConversation(contactId, PROSPECT_LABEL).catch(() => {});
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
    `Prospecto de Google Maps: ${p.shortName || p.name} (${p.rubro}, ${p.zona}, ${p.provincia}).`,
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
 *    se le responde una sola vez y el bot NO sigue → devuelve 'handled'.
 *  - cualquier otra respuesta → se marca, se crea el contacto con las notas
 *    del prospecto y la conversación se deriva a Preventa / Leads (Agustín y
 *    Sofía), pero antes TeDI hace un onboarding corto (getProspectOnboarding)
 *    → devuelve 'onboarding' y el bot sigue normal.
 *  - no es un prospecto (o ya respondió antes) → null, sigue el flujo normal.
 */
export async function handleProspectReply(msg) {
  if (msg.channel !== 'whatsapp') return null;
  const contactId = toWaContactId(msg.from) ?? msg.from;
  const ref = getDb().collection(PROSPECTS).doc(contactId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const p = doc.data();
  if (p.status !== 'enviado') return null; // solo la primera respuesta cambia el estado

  const text = msg.text ?? '';
  if (NOT_INTERESTED_RE.test(text)) {
    await ref.update({ status: 'no_interesa', respondedAt: new Date(), statusChangedAt: new Date() });
    await appendMessage(contactId, { role: 'user', content: text, contactName: msg.contactName, messageId: msg.messageId });
    await appendMessage(contactId, { role: 'assistant', content: NOT_INTERESTED_REPLY });
    await sendWhatsAppMessage(contactId, NOT_INTERESTED_REPLY).catch(err =>
      console.error('[prospect] Error mandando la respuesta de "no interesa":', err.message));
    await updateConversationStatus(contactId, 'resolved').catch(() => {});
    console.log(`[prospect] ${contactId} respondió que no le interesa`);
    return 'handled';
  }

  const status = INTERESTED_RE.test(text) ? 'interesado' : 'respondio';
  await ref.update({ status, respondedAt: new Date(), statusChangedAt: new Date(), onboarding: true, onboardingTurns: 0 });
  const customer = await getOrCreateCustomer(contactId, 'whatsapp', p.shortName || msg.contactName);
  const tags = [...new Set([...(customer.tags ?? []), 'Prospección', p.rubro].filter(Boolean))];
  await updateCustomer(contactId, {
    tags,
    ...(!customer.agentNotes && { agentNotes: prospectNote(p) }),
  });
  console.log(`[prospect] ${contactId} respondió (${status}) → onboarding con el bot`);
  return 'onboarding';
}

// ─────────────────────────── Onboarding ────────────────────────────────────
// Cuando el negocio responde a la plantilla, antes de pasarlo a Preventa /
// Leads lo atiende TeDI con unas pocas preguntas, así Agustín y Sofía le
// escriben ya sabiendo qué necesita. Al derivar se guarda una ficha con lo
// que contó en las notas del contacto.

const ONBOARDING_MAX_TURNS = 6; // mensajes del negocio: a partir de acá se deriva igual

const ONBOARDING_QUESTIONS = {
  rubro: [
    'qué le gustaría resolver o mejorar (consultas, reservas, turnos, pedidos, ventas, pauta)',
    'cómo atienden hoy (WhatsApp, Instagram, teléfono; quién responde) y más o menos cuántas consultas o pedidos tienen por día',
    'con quién estás hablando (nombre y rol en el negocio)',
    'qué día y horario les queda cómodo para una llamada o demo de 15 minutos',
  ],
  web: [
    'para qué quieren la web: mostrar el negocio y recibir consultas, o vender online',
    'si ya tienen logo, fotos y, si venden, catálogo con precios (y si tienen dominio)',
    'con quién estás hablando (nombre y rol en el negocio)',
    'qué día y horario les queda cómodo para una llamada de 15 minutos para mostrarle ejemplos',
  ],
};

function onboardingInstructions(p, turns) {
  const questions = ONBOARDING_QUESTIONS[p.offerKind === 'web' ? 'web' : 'rubro'];
  const lines = [
    '--- ONBOARDING DE PROSPECTO ---',
    `Este contacto es un negocio al que TechDI le escribió primero (en frío) ofreciendo: ${p.offer || 'nuestros servicios'}. Respondió interesado.`,
    'Tu tarea ahora es un onboarding corto antes de pasarlo al equipo comercial (Agustín y Sofía). Agradecé la respuesta, contale en una o dos frases cómo le serviría a su negocio, y averiguá esto haciendo UNA sola pregunta por mensaje, en este orden:',
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    'Si ya contó algo, no lo vuelvas a preguntar. Mensajes cortos y cálidos, sin presionar.',
    'No des precios ni plazos: decile que eso lo ve con el equipo en la llamada.',
    'Si pide hablar con una persona, pregunta precios, se impacienta o no quiere contestar, derivá enseguida.',
    `Cuando tengas las respuestas, cerrá con una frase corta (sin repetirle todo lo que dijo) y derivá con el marcador [ESCALAR_${LEADS_AREA_ID.toUpperCase()}].`,
  ];
  if (turns >= ONBOARDING_MAX_TURNS - 1) {
    lines.push(`Ya hiciste suficientes preguntas: en este mensaje cerrá y derivá con [ESCALAR_${LEADS_AREA_ID.toUpperCase()}].`);
  }
  return lines.join('\n');
}

/**
 * Si el contacto es un prospecto en onboarding, suma un mensaje a la cuenta y
 * devuelve las instrucciones para el bot (y si ya hay que derivarlo sí o sí).
 * Si no, null.
 */
export async function getProspectOnboarding(contactId) {
  const ref = getDb().collection(PROSPECTS).doc(contactId);
  const doc = await ref.get();
  if (!doc.exists || !doc.data().onboarding) return null;
  const p = doc.data();
  const turns = (p.onboardingTurns ?? 0) + 1;
  await ref.update({ onboardingTurns: turns });
  return { instructions: onboardingInstructions(p, turns), forceEscalate: turns >= ONBOARDING_MAX_TURNS };
}

/** Cierra el onboarding al derivar: arma la ficha y la deja en las notas del
    contacto (arriba de lo que ya había) y en el prospecto. */
export async function finishProspectOnboarding(contactId) {
  const ref = getDb().collection(PROSPECTS).doc(contactId);
  const doc = await ref.get();
  if (!doc.exists || !doc.data().onboarding) return;
  const p = doc.data();
  await ref.update({ onboarding: false, onboardingEndedAt: new Date() });
  // La plantilla y todo lo que se habló desde entonces.
  const fromMs = tsToMs(p.sentAt) - 60 * 1000;
  const messages = (await getConversationHistory(contactId)).filter(m => !m.timestamp || tsToMs(m.timestamp) >= fromMs);
  let summary;
  try {
    summary = await summarizeProspectOnboarding(messages.slice(-30), { negocio: p.shortName || p.name, offer: p.offer });
  } catch (err) {
    console.error('[prospect] No se pudo resumir el onboarding de', contactId, err.message);
    return;
  }
  const customer = await getOrCreateCustomer(contactId, 'whatsapp', p.shortName || p.name);
  const day = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const notes = `Onboarding del bot (${day}):\n${summary}`;
  await Promise.all([
    ref.update({ onboardingSummary: summary }),
    updateCustomer(contactId, { agentNotes: [notes, customer.agentNotes].filter(Boolean).join('\n\n') }),
  ]);
  console.log(`[prospect] Onboarding de ${contactId} terminado, ficha guardada en las notas`);
}

/** Área a la que va un prospecto al terminar el onboarding. */
export const PROSPECT_LEADS_AREA_ID = LEADS_AREA_ID;

/** Aviso al negocio de que lo atiende una persona del equipo comercial (en
    lugar del mensaje genérico de derivación del bot). */
export function prospectHandoffText(botConfig = {}) {
  const intro = '¡Gracias por contarme! 🙌 Te paso con Agustín y Sofía, del equipo comercial de TechDI, que ya tienen todo lo que hablamos.';
  return isWithinBusinessHoursAt(new Date(), botConfig)
    ? `${intro} En un ratito te escriben por acá.`
    : `${intro} Ahora estamos fuera de horario, pero apenas retomemos (lunes a viernes de ${botConfig.businessHoursStart ?? 9} a ${botConfig.businessHoursEnd ?? 18} hs) te escriben por acá.`;
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
  const [config, sentToday, runsSnap] = await Promise.all([
    getProspectConfig(), sentTodayCount(), getDb().collection(RUNS).get(),
  ]);
  const quality = config.lastQuality?.quality ?? 'UNKNOWN';
  const cap = config.paused ? 0 : quality === 'YELLOW' ? Math.ceil(config.dailyCap / 2) : quality === 'RED' ? 0 : config.dailyCap;
  // Avance sobre las combinaciones rubro × zona elegidas.
  const selected = new Set(config.rubroIds.flatMap(r => config.zoneIds.map(z => `${r}__${z}`)));
  const now = Date.now();
  let searched = 0;
  let exhausted = 0;
  runsSnap.docs.forEach(d => {
    if (!selected.has(d.id)) return;
    searched++;
    if (tsToMs(d.data().exhaustedUntil) > now) exhausted++;
  });
  return {
    sentToday,
    effectiveCap: cap,
    quality,
    tier: config.lastQuality?.tier ?? null,
    combos: { total: selected.size, searched, exhausted },
  };
}
