/**
 * Whether the address carries `?debug`.
 *
 * Kept in a file of its own with no imports, so the page can ask without
 * pulling in the 3D libraries the stats panel depends on.
 */
export function hasDebugFlag() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
}
