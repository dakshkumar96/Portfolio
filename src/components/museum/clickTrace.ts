/**
 * Development-only timeline of a door click.
 *
 * Records when a door was clicked so that every slow frame after it can
 * say how long after the click it landed, and so the camera can report
 * when it actually arrived. Together they turn "it takes twenty seconds"
 * into a list of exactly which frames took the time and what was built
 * or compiled in each of them.
 *
 * Does nothing in production.
 */
const DEV = process.env.NODE_ENV !== "production";

let clickedAt = 0;
let target = "";

export function markDoorClick(room: string) {
  if (!DEV) return;
  clickedAt = performance.now();
  target = room;
  console.warn(`[click] door "${room}" clicked`);
}

/** Milliseconds since the last door click, or null if none is in flight. */
export function sinceClick(): number | null {
  if (!DEV || clickedAt === 0) return null;
  const ms = performance.now() - clickedAt;
  return ms < 60000 ? ms : null;
}

export function markArrived() {
  if (!DEV || clickedAt === 0) return;
  const ms = performance.now() - clickedAt;
  console.warn(`[click] arrived in "${target}" ${Math.round(ms)}ms after the click`);
  clickedAt = 0;
}
