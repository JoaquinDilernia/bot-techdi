import { getDb } from './firebase.service.js';

// Contador para la landing: cuántas conversaciones resolvió el bot SIN
// escalar a un humano, sumado entre los 4 bots. Los 4 comparten el mismo
// proyecto de Firebase (pedidos-lett-2), así que una sola conexión puede
// leer las colecciones de todos.
const RESULT_COLLECTION = 'bot-techdi_public_stats';
const RESULT_DOC = 'resolved_counter';

// ALTORANCHO / TECHDI / PMCSALUD comparten schema: resolvedAt se setea al
// cerrar (por el bot o por un agente), escalatedAt solo si en algún momento
// pasó por un humano. resolvedAt seteado + escalatedAt ausente = lo resolvió
// el bot solo, de punta a punta (mismo criterio que sus stats.routes.js).
async function countResolvedByBotStandard(collection) {
  const db = getDb();
  const snap = await db.collection(collection)
    .where('resolvedAt', '>', new Date(0))
    .select('escalatedAt')
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    if (!doc.get('escalatedAt')) count++;
  }
  return count;
}

// GINEZA tiene un schema más viejo: no tiene resolvedAt/escalatedAt, solo
// status + humanMode. Proxy: conversación cerrada (resolved/bot_archived)
// y humanMode nunca quedó en true → nunca pasó por un agente.
async function countResolvedByBotGineza() {
  const db = getDb();
  const snap = await db.collection('conversations')
    .where('status', 'in', ['resolved', 'bot_archived'])
    .select('humanMode')
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    if (doc.get('humanMode') !== true) count++;
  }
  return count;
}

export async function computeResolvedByBotTotals() {
  const [altorancho, techdi, pmcsalud, gineza] = await Promise.all([
    countResolvedByBotStandard('bot-altorancho_conversations'),
    countResolvedByBotStandard('bot-techdi_conversations'),
    countResolvedByBotStandard('bot-pmcsalud_conversations'),
    countResolvedByBotGineza(),
  ]);

  const byBot = { altorancho, gineza, techdi, pmcsalud };
  const total = altorancho + gineza + techdi + pmcsalud;

  const db = getDb();
  await db.collection(RESULT_COLLECTION).doc(RESULT_DOC).set({
    total,
    byBot,
    updatedAt: new Date(),
  });

  console.log('[public-stats] contador recalculado:', { total, ...byBot });
  return { total, byBot };
}

export async function getResolvedByBotTotals() {
  const db = getDb();
  const doc = await db.collection(RESULT_COLLECTION).doc(RESULT_DOC).get();
  if (!doc.exists) return { total: 0, byBot: {}, updatedAt: null };
  const data = doc.data();
  return {
    total: data.total ?? 0,
    byBot: data.byBot ?? {},
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
  };
}
