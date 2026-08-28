import { Router } from 'express';
import { getResolvedByBotTotals } from '../services/publicStats.service.js';

const router = Router();

// GET /api/public-stats/resolved-count — número cacheado (se recalcula por
// cron una vez al día), pensado para consumirse desde la landing pública.
router.get('/resolved-count', async (req, res) => {
  try {
    const data = await getResolvedByBotTotals();
    res.json(data);
  } catch (err) {
    console.error('[public-stats] Error leyendo contador:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el contador' });
  }
});

export default router;
