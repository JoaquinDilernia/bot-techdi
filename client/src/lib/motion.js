export function easeOutCubic(p) {
  const x = Math.min(1, Math.max(0, p));
  return 1 - Math.pow(1 - x, 3);
}

export function countValue(to, elapsedMs, durationMs = 1100) {
  const v = Math.round(to * easeOutCubic(elapsedMs / durationMs));
  return Math.min(Math.max(v, 0), Math.max(to, 0));
}

/** Ventana (ms) en la que rigen las animaciones de entrada: la más larga dura ~1.4 s + delays. */
export const ENTRY_WINDOW_MS = 1600;

/** La entrada arranca en el primer paso loading -> false, una sola vez y sin reduced-motion. */
export function shouldStartEntry(wasLoading, loading, alreadyStarted, reducedMotion) {
  return !!wasLoading && !loading && !alreadyStarted && !reducedMotion;
}
