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
/*
  Six doors at 18 apart put the last one at z=-106. The hall ends eight
  units past it: at four, the last door's stepped surround - two and a half
  units either side of its centre - all but touched the end wall, and the
  door and the wall read as one thing. Eight leaves the wall room to be a
  wall, and the statue room to stand in front of it.
*/
export const LENGTH = 134;
export const Z_FAR = Z_NEAR - LENGTH;

/** One case sits in each gap between doors, alternating sides, close in to the wall so the middle of the hall is clear. */
export const CASE_X = 6.1;

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
    ["experience", "Experience"],
    ["projects", "Projects"],
    ["skills", "Skills"],
    ["art", "Art"],
    ["contact", "Contact"],
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
  /*
    The first case stands a bay back from where the camera starts, and
    the rest in the bay between each pair of doors, alternating sides, so
    the walk zigzags past them the length of the hall; none stands in
    front of a door.
  */
  const zs: number[] = [-7];
  for (let i = 0; i < doors.length - 1; i += 1) {
    zs.push((doors[i].z + doors[i + 1].z) / 2);
  }
  // six cases is what there are to show
  zs.length = Math.min(zs.length, 6);
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
 * two rooms on the same wall are DOOR_GAP * 2 = 36 apart and 30 clears
 * that with a wall's thickness to spare. They are built large, as the
 * rooms of a real gallery are: big enough to stand back from the work.
 */
export const ROOM_DEPTH = 32;
export const ROOM_WIDTH = 34;
export const ROOM_H = WALL_H;

/**
 * How far into the hall's side each room runs, and how wide it is along it.
 *
 * Most rooms are the standard size above. The Experience room has more to
 * show than any other, so it is larger: as wide as the doors' spacing
 * allows. Rooms on one side of the hall are 36 apart, so 32 wide leaves
 * a clear 8 between neighbouring walls; and nothing stands beyond a room's
 * back wall, so it can be as deep as it likes.
 */
export function roomSize(door: DoorSpec) {
  // the Art room is more than twice what it was: as wide as the doors' spacing allows, and twice as deep
  if (door.id === "art") return { depth: 50, width: 34 };
  // the About room has four photographs, three boards and a case on each side wall: as wide as the spacing allows, and deep
  if (door.id === "about") return { depth: 50, width: 34 };
  /*
    The Experience room has the most in it, and is twice the floor of any
    other: as wide as the doors' spacing allows (rooms on one side are 36
    apart, so 34 leaves a wall between them) and twice as deep, since
    nothing stands beyond its back wall. Three cases across the far end,
    two against the middle of each long wall, and boards between.
  */
  return door.id === "experience" ? { depth: 68, width: 34 } : { depth: ROOM_DEPTH, width: ROOM_WIDTH };
}

export function roomCenter(door: DoorSpec): [number, number] {
  const dir = door.side === "left" ? -1 : 1;
  return [dir * (HALF_WIDTH + roomSize(door).depth / 2), door.z];
}

/* roomView and roomPath live in roomLayout.ts, next to the exhibits they frame. */

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

/** The camera's vertical field of view, in degrees. */
export const CAM_FOV = 50;

export function doorX(side: "left" | "right") {
  return side === "left" ? -HALF_WIDTH : HALF_WIDTH;
}
