/**
 * Trailing-edge throttle. Calls `fn` at most once per `wait` ms, ensuring
 * the final call wins so slider release values aren't dropped.
 */
export function throttle(fn, wait = 150) {
  let timer = null;
  let lastArgs = null;
  return function throttled(...args) {
    lastArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const a = lastArgs; lastArgs = null;
      fn.apply(this, a);
    }, wait);
  };
}
