import { Router } from 'express';
import {
  getProspectConfig,
  updateProspectConfig,
  resumeProspecting,
  runDailySearch,
  listProspects,
  setProspectsStatus,
  getProspectSummary,
  getProspectCatalog,
} from '../services/prospect.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [prospects, config, summary] = await Promise.all([listProspects(), getProspectConfig(), getProspectSummary()]);
    res.json({ prospects, config, summary, catalog: getProspectCatalog() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    res.json({ config: await updateProspectConfig(req.body ?? {}) });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

router.post('/resume', async (req, res) => {
  try {
    res.json({ config: await resumeProspecting() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Buscar ahora": corre la búsqueda en el momento, aunque la prospección
// esté apagada — sirve para probar las búsquedas antes de activar los envíos.
// Solo busca y califica; no manda nada.
router.post('/search-now', async (req, res) => {
  try {
    res.json(await runDailySearch({ force: true }));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.response?.data?.error?.message ?? err.message });
  }
});

router.post('/status', async (req, res) => {
  const { ids, status } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids requeridos' });
  try {
    res.json(await setProspectsStatus(ids.slice(0, 500), status, req.agent?.email));
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export default router;
