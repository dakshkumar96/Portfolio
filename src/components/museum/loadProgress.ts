/**
 * How far the hall's shaders are compiled, shared between the canvas that
 * does the compiling and the loading screen that shows it.
 *
 * It exists because the files arriving is the short part of the wait. The
 * rooms are built over a few seconds and every material's shader is then
 * compiled a slice at a time, and three.js's loading manager - which is
 * what drei's `useProgress` reports - knows nothing about that. A ring
 * that followed the assets alone would stand full for seconds while the
 * screen carried on waiting, which is a lie told in a circle.
 *
 * Plain numbers, no subscription: the loading screen reads them on its own
 * animation frames, so nothing here needs to notify anyone or re-render.
 */
let queued = 0;
let compiled = 0;

export const compileProgress = {
  /** Materials found that still need a program. */
  queued(n: number) {
    queued += n;
  },
  /** Materials whose program has finished compiling. */
  compiled(n: number) {
    compiled += n;
  },
  /** 0 until the first rooms have been scanned. May dip as more rooms arrive. */
  fraction() {
    return queued === 0 ? 0 : Math.min(1, compiled / queued);
  },
};
