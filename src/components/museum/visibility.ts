import type * as THREE from "three";

/**
 * True when an object would actually be drawn this frame.
 *
 * `Object3D.visible` is strictly per-object: a mesh inside a hidden
 * group still reports `true`, because hiding a group only stops the
 * renderer descending into it. So the rooms' proximity culling never
 * reached the animations running inside them — every turntable in the
 * museum kept turning, and every vitrine kept computing its float, from
 * the far end of the corridor with the room hidden.
 *
 * Walking the parents is a handful of boolean checks against a tree
 * only a few levels deep, which is nothing next to the trigonometry and
 * material writes it lets an off-screen exhibit skip.
 */
export function isShown<T extends THREE.Object3D>(
  object: T | null | undefined,
): object is T {
  let node: THREE.Object3D | null = object ?? null;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return Boolean(object);
}
