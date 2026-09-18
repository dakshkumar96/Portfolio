/**
 * Cheap one-off probe for WebGL support. Without this the Canvas throws
 * an uncaught error and blanks the page on machines with WebGL disabled,
 * blocked by policy, or unavailable in a sandbox.
 */
let supported: boolean | null = null;

export function hasWebGL(): boolean {
  if (supported !== null) return supported;
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    supported = Boolean(gl);
  } catch {
    supported = false;
  }
  return supported;
}
