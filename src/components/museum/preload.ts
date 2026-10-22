/**
 * Work the loading screen waits for, besides files and shaders.
 *
 * The photographs and posters are prepared in the browser before they
 * are shown - cropped, graded, printed to cancel the screen's grade - and
 * that work used to finish after the veil had lifted, so pictures filled
 * in on the walls while the visitor was already walking. Each such job
 * is registered here; the canvas waits for all of them (up to a limit,
 * so one slow or missing file can never hold the museum shut) before it
 * says the museum is ready.
 */
const pending = new Set<Promise<unknown>>();

/** Register a job the museum should finish before it is shown. Returns the same promise. */
export function track<T>(job: Promise<T>): Promise<T> {
  pending.add(job);
  const drop = () => pending.delete(job);
  job.then(drop, drop);
  return job;
}

/**
 * Resolves once every registered job has settled, including any that
 * were registered while waiting, or after `limitMs`, whichever is first.
 */
export function settled(limitMs = 20000): Promise<void> {
  const until = performance.now() + limitMs;
  return new Promise((resolve) => {
    const check = () => {
      if (pending.size === 0 || performance.now() > until) {
        resolve();
        return;
      }
      Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, 250))]).then(check);
    };
    check();
  });
}

/**
 * Set for a couple of frames at the very end of loading, behind the
 * veil: every room and everything in it is drawn once, wherever the
 * camera is. The graphics driver finishes preparing a shader only when
 * something is first drawn with it, and that cost - about a fifth of a
 * second a shader on a laptop - used to land on the step through a
 * room's door. Whatever hides itself by distance shows itself while
 * this is on.
 */
export const drawEverything = { on: false };

/** How many registered jobs are still running: the loading screen says so while the pictures are being prepared. */
export function pendingJobs() {
  return pending.size;
}
