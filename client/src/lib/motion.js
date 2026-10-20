export function easeOutCubic(p) {
  const x = Math.min(1, Math.max(0, p));
  return 1 - Math.pow(1 - x, 3);
}

export function countValue(to, elapsedMs, durationMs = 1100) {
  const v = Math.round(to * easeOutCubic(elapsedMs / durationMs));
  return Math.min(Math.max(v, 0), Math.max(to, 0));
}
