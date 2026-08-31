/**
 * OpenCV.js (WASM) loader.
 *
 * `@techstark/opencv-js` exports an Emscripten module that is a *perpetual
 * thenable*: it exposes a `then(cb)` used as a one-shot "runtime ready" hook,
 * but resolving any native Promise with the module re-adopts that thenable
 * indefinitely. That means a naive `const cv = await require(...)` — or
 * returning the module from any `async` function — deadlocks and never settles.
 *
 * To avoid that trap we:
 *   1. use the `then` hook purely as an init callback, then
 *   2. strip `then` off the module so it is a plain (non-thenable) object, and
 *   3. only resolve our Promise *after* `then` is removed,
 * so the module can be safely awaited, cached and returned like any value.
 *
 * The WASM runtime keeps the Node event loop alive, so long-running entrypoints
 * (CLI/tests) should exit explicitly or terminate their workers when finished.
 */

// The upstream package ships its own (loose) types; we treat the resolved
// module as `any` internally and expose typed wrappers from callers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CvModule = any;

let cachedCv: CvModule | null = null;
let readyPromise: Promise<CvModule> | null = null;

/**
 * Resolve and cache the OpenCV.js module. Safe to call concurrently and
 * repeatedly; the WASM runtime is initialized exactly once.
 */
export function getCv(): Promise<CvModule> {
  if (cachedCv) {
    return Promise.resolve(cachedCv);
  }
  if (!readyPromise) {
    readyPromise = new Promise<CvModule>((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('@techstark/opencv-js');

        const finalize = (): void => {
          // Remove the thenable hook BEFORE resolving so the Promise does not
          // re-adopt the module (the deadlock described in the file header).
          try {
            delete mod.then;
          } catch {
            mod.then = undefined;
          }
          cachedCv = mod;
          resolve(mod);
        };

        if (typeof mod.then === 'function') {
          // `then` fires once the WASM runtime has initialized.
          mod.then(() => finalize());
        } else {
          // Already initialized (or no hook) — usable immediately.
          finalize();
        }
      } catch (err) {
        reject(err);
      }
    });
  }
  return readyPromise;
}
