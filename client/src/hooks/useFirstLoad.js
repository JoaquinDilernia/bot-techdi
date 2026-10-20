import { useRef } from 'react';

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// true desde el primer paso de loading -> false de este montaje (la entrada se anima una sola vez).
export function useFirstLoad(loading) {
  const prev = useRef(loading);
  const fired = useRef(false);
  if (prev.current && !loading && !fired.current && !prefersReducedMotion()) {
    fired.current = true;
  }
  prev.current = loading;
  return fired.current;
}
