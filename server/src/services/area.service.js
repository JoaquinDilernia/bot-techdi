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
