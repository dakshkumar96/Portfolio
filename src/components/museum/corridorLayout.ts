import type { RoomId } from "./exhibitData";

export type { RoomId };

/**
 * A long sandstone hall. Wide and tall enough to read as a museum rather
 * than a passage, and long enough that doors arrive one at a time with
 * real distance between them.
 */
export const HALF_WIDTH = 8;
export const WALL_H = 13;
export const Z_NEAR = 20;
export const LENGTH = 130;
export const Z_FAR = Z_NEAR - LENGTH;

/** Two long ceiling slots that drop angled shafts onto the floor. */
export const SLOT_X = 2.7;
export const SLOT_WIDTH = 0.55;

/** One case sits in each gap between doors, alternating sides. */
export const CASE_X = 4.8;

export const DOOR_W = 3.4;
export const DOOR_H = 5.6;
export const DOOR_RECESS = 0.5;

export type DoorSpec = {
  id: RoomId;
  label: string;
  side: "left" | "right";
  z: number;
};

/**
 * Doors alternate sides with a long gap between each, so you pass one,
 * walk a while, then meet the next.
 */
const FIRST_DOOR_Z = -16;
const DOOR_GAP = 18;

export const doors: DoorSpec[] = (
  [
    ["about", "About Me"],
    ["projects", "Projects"],
    ["skills", "Skills"],
    ["art", "Art"],
    ["contact", "Contact"],
    ["resume", "Resume"],
  ] as [RoomId, string][]
).map(([id, label], i) => ({
  id,
  label,
  side: i % 2 === 0 ? "left" : "right",
  z: FIRST_DOOR_Z - i * DOOR_GAP,
}));

/**
 * One case between each pair of doors, set against a side wall and
 * alternating left/right so the walk zigzags.
 *
 * They sit off the centreline deliberately: the camera walks straight
 * down x=0, so anything centred would be walked through.
 *
 * The leading entry sits ahead of the first door — the camera starts at
 * z=+17 and the first door is at z=-16, so without it the opening
 * stretch of the walk has no light source in it at all.
 */
export const CASE_POSITIONS: [number, number][] = (() => {
  const zs: number[] = [2];
  for (let i = 0; i < doors.length - 1; i += 1) {
    zs.push((doors[i].z + doors[i + 1].z) / 2);
  }
  return zs.map((z, i) => [i % 2 === 0 ? -CASE_X : CASE_X, z] as [number, number]);
})();

/**
 * Each door opens into a real chamber cut back into the wall.
 *
 * These are full rooms, not alcoves. The ceiling is the corridor's own
 * height rather than a lower one: a room that drops its head height the
 * moment you step through the door reads as a cupboard behind a grand
 * portal, however well it is detailed. Matching WALL_H means the slab
 * runs level from the hall into the chamber, which is the single
 * strongest signal that the two are the same building.
 *
 * Width is checked against the door spacing: doors alternate sides, so
 * two rooms on the same wall are DOOR_GAP * 2 = 36 apart and 24 clears
 * that comfortably.
 */
export const ROOM_DEPTH = 20;
export const ROOM_WIDTH = 24;
export const ROOM_H = WALL_H;

export function roomCenter(door: DoorSpec): [number, number] {
  const dir = door.side === "left" ? -1 : 1;
  return [dir * (HALF_WIDTH + ROOM_DEPTH / 2), door.z];
}

/** Where the camera parks inside a room, and what it faces. */
export function roomView(door: DoorSpec): {
  position: [number, number, number];
  look: [number, number, number];
} {
  const dir = door.side === "left" ? -1 : 1;
  const [cx, cz] = roomCenter(door);
  /*
    Just inside the threshold, at the same eye height as the corridor.
    Standing a few paces in rather than at the room's centre is what a
    visitor actually does: it keeps the back wall and both side walls in
    frame at once, so the room reads as a volume you have stepped into
    rather than a flat wall you are facing.
  */
  return {
    position: [cx - dir * (ROOM_DEPTH / 2 - 3.5), CAM_Y, cz],
    look: [cx + dir * ROOM_DEPTH, CAM_Y - 0.2, cz],
  };
}

export const CAM_Z_START = 17;
export const CAM_Z_END = Z_FAR + 12;
/**
 * Eye height: a little above standing, and nothing more.
 *
 * 1.7 sat too low — an eighth of the way up a 13-unit hall, so every
 * shot looked up from the floor. The centreline at 6.5 overcorrected the
 * other way and read as hovering near the ceiling. This is the middle
 * ground: raised just enough to look along the hall rather than up at
 * it, while the exhibits still sit at or above the eyeline the way they
 * would if you were walking past them.
 */
export const CAM_Y = 2.8;

export function doorX(side: "left" | "right") {
  return side === "left" ? -HALF_WIDTH : HALF_WIDTH;
}
