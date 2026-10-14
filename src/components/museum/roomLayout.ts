import {
  CAM_Y,
  HALF_WIDTH,
  ROOM_H,
  roomCenter,
  roomSize,
  type DoorSpec,
} from "./corridorLayout";
import { exhibitsByRoom } from "./exhibitData";

/**
 * Where everything in a room stands, in one place.
 *
 * The exhibits, the spotlights over them, the beams of haze those lights
 * throw and the camera that frames them all need the same positions. They
 * used to be worked out separately in each component, which is how a light
 * ends up aimed at where a case used to be. Every one of them now asks
 * here.
 *
 * Positions are world space. `sgn` is -1 for a room off the left of the
 * hall and +1 for one off the right; the back wall - the one the exhibits
 * stand against - is the far side of the room from its door.
 */

type Vec3 = [number, number, number];

function sideOf(door: DoorSpec) {
  return door.side === "left" ? -1 : 1;
}

/** The plane of the back wall, along x. */
export function backWallX(door: DoorSpec) {
  const [cx] = roomCenter(door);
  return cx + sideOf(door) * (roomSize(door).depth / 2);
}

/* ------------------------------------------------------------------ */
/* Exhibits                                                            */
/* ------------------------------------------------------------------ */

/**
 * Vitrines, fanned along the back wall at one pitch, a short run finishing
 * early rather than being spread to fill the wall.
 */
export const CASE_PITCH = 5.8;
/** A case's plinth is this far forward of the back wall. */
export const CASE_INSET = 1.9;
/** Every room's cases, and their labels, drawn at this size against the size they were built at. */
export const CASE_SCALE = 1.25;

export function caseSlots(door: DoorSpec, count: number): Vec3[] {
  const [, cz] = roomCenter(door);
  const x = backWallX(door) - sideOf(door) * CASE_INSET;
  /*
    The Experience room is the widest, but its cases are not spread to the
    walls: six at this pitch fill the view from the door edge to edge,
    and any wider would push the end ones out of frame.
  */
  const pitch = door.id === "experience" ? 5.2 : CASE_PITCH;
  const span = Math.min((count - 1) * pitch, roomSize(door).width - 3.5);
  return Array.from({ length: count }, (_, i) => {
    const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * span;
    return [x, 0, cz + spread] as Vec3;
  });
}

/** The About wall: three photographs, and reading stands in the gaps between them. */
export const PORTRAIT_PITCH = 6.4;
export const PORTRAIT_HANG_Y = 4.7;
export const PORTRAIT_SIZE: [number, number] = [2.3, 2.9];

export function portraitSlots(door: DoorSpec, pictures: number, stands: number) {
  const [, cz] = roomCenter(door);
  const wall = backWallX(door) - sideOf(door) * 0.3;
  const frames = Array.from({ length: pictures }, (_, i) => {
    const spread = pictures === 1 ? 0 : (i - (pictures - 1) / 2) * PORTRAIT_PITCH;
    return [wall, PORTRAIT_HANG_Y, cz + spread] as Vec3;
  });
  const lecterns = Array.from({ length: stands }, (_, i) => {
    const gap = (i - (stands - 1) / 2) * PORTRAIT_PITCH;
    return [wall - sideOf(door) * 1.1, 0, cz + gap] as Vec3;
  });
  return { frames, lecterns };
}

/**
 * The Art wall: a salon hang. Posters in rows of four and three, and a
 * row of video thumbnails along the bottom, which are landscape and so
 * hang wider and closer together.
 */
export const ART_ROWS = [4, 3];
export const ART_SIZE: [number, number] = [2.08, 2.6];
const ART_COL = 5.4;
const ART_ROW = 3.15;
/** The middle row's height. */
const ART_MID_Y = 5.4;
export const THUMB_SIZE: [number, number] = [3.45, 2.0];
const THUMB_PITCH = 4.3;

export function artSlots(door: DoorSpec) {
  const [, cz] = roomCenter(door);
  const wall = backWallX(door) - sideOf(door) * 0.3;
  const out: { key: number; position: Vec3 }[] = [];
  let n = 0;
  ART_ROWS.forEach((count, r) => {
    // the top row a row above the middle one
    const y = ART_MID_Y + (ART_ROWS.length - 1 - r) * ART_ROW;
    for (let c = 0; c < count; c += 1) {
      out.push({ key: n, position: [wall, y, cz + (c - (count - 1) / 2) * ART_COL] });
      n += 1;
    }
  });
  return out;
}

/** The thumbnails' row, a row below the middle one, centred on the wall. */
export function thumbSlots(door: DoorSpec, count: number) {
  const [, cz] = roomCenter(door);
  const wall = backWallX(door) - sideOf(door) * 0.3;
  return Array.from({ length: count }, (_, i) => [wall, ART_MID_Y - ART_ROW, cz + (i - (count - 1) / 2) * THUMB_PITCH] as Vec3);
}

/* ------------------------------------------------------------------ */
/* Light                                                               */
/* ------------------------------------------------------------------ */

/**
 * The ceiling slot the exhibit spotlights hang in: a line parallel to the
 * back wall, a little in front of the exhibits, so each beam falls almost
 * straight down onto its piece and pools on the floor in front of it.
 */
export const SLOT_INSET = 2.7;
export function slotX(door: DoorSpec) {
  return backWallX(door) - sideOf(door) * SLOT_INSET;
}

/** How many exhibit spotlights exist. Fixed, so the scene's light count never changes. */
export const SPOT_COUNT = 4;

export type Spot = { from: Vec3; to: Vec3; angle: number; intensity: number };

/**
 * The exhibit spotlights for a room: where each hangs, what it is aimed
 * at, how wide and how bright. At most SPOT_COUNT; a room with more pieces
 * than that shares them out (the Art wall gets one per column).
 */
export function spotPlan(door: DoorSpec): Spot[] {
  const from = (z: number): Vec3 => [slotX(door), ROOM_H + 0.25, z];
  const items = exhibitsByRoom[door.id] ?? [];

  if (door.id === "art") {
    /*
      A gallery wash, not four spots. The lights hang on a track well out
      from the wall, so each comes at the wall at around thirty degrees,
      and their cones are wide enough that neighbouring pools run into one
      another - one even field across the whole wall, with no gaps or
      wedges between. The wall stays at about a third of the pictures'
      brightness; the pictures carry their own light.
    */
    const [, cz] = roomCenter(door);
    const wall = backWallX(door) - sideOf(door) * 0.3;
    const track = backWallX(door) - sideOf(door) * 4.4;
    return [-1.5, -0.5, 0.5, 1.5].map((c) => ({
      from: [track, ROOM_H - 0.4, cz + c * ART_COL] as Vec3,
      to: [wall, ART_MID_Y - 0.2, cz + c * ART_COL] as Vec3,
      angle: 0.6,
      intensity: 170,
    }));
  }

  if (door.id === "experience") {
    /*
      Six cases and four lights: each light is shared between neighbours,
      with a wider cone, so the pools overlap along the whole row and every
      case is lit, with no gap between them.
    */
    const [, cz] = roomCenter(door);
    const x = backWallX(door) - sideOf(door) * CASE_INSET;
    const pitch = 6.2;
    return [-1.5, -0.5, 0.5, 1.5].map((c) => ({
      from: from(cz + c * pitch),
      to: [x, 3.3, cz + c * pitch] as Vec3,
      angle: 0.42,
      intensity: 360,
    }));
  }

  if (door.id === "about") {
    const { frames } = portraitSlots(door, Math.min(3, items.length), 0);
    return frames.map((p) => ({
      from: from(p[2]),
      to: [p[0], p[1] - 0.4, p[2]] as Vec3,
      angle: 0.36,
      intensity: 280,
    }));
  }

  return caseSlots(door, items.length)
    .slice(0, SPOT_COUNT)
    .map((p) => ({
      from: from(p[2]),
      // the middle of a case at CASE_SCALE: plinth and glass together stand about 5.6 tall
      to: [p[0], 3.3, p[2]] as Vec3,
      angle: 0.3,
      intensity: 320,
    }));
}

/* ------------------------------------------------------------------ */
/* The camera                                                          */
/* ------------------------------------------------------------------ */

/** Where the camera parks inside a room, and what it faces. */
export function roomView(door: DoorSpec): { position: Vec3; look: Vec3 } {
  const dir = sideOf(door);
  const [cx, cz] = roomCenter(door);
  /*
    Just inside the threshold, at the same eye height as the corridor.
    Standing a few paces in rather than at the room's centre is what a
    visitor actually does: it keeps the back wall and both side walls in
    frame at once, so the room reads as a volume you have stepped into
    rather than a flat wall you are facing.

    Raised a little, and looking level rather than down. At eye height
    looking slightly below it, most of the frame was floor: you stepped
    into a room and saw tiling. Lifting the stance and aiming the view a
    touch above the horizon puts the back wall and whatever stands
    against it in the middle of the shot.
  */
  return {
    position: [cx - dir * (roomSize(door).depth / 2 - 3.5), CAM_Y + 0.8, cz],
    look: [cx + dir * roomSize(door).depth, CAM_Y + 1.5, cz],
  };
}

/**
 * The way in and out of a room, as a route rather than a destination.
 *
 * Flying the camera straight at the room's viewing position sends it
 * diagonally through a solid wall: a long move that passes through
 * stone, arrives from nowhere, and never once shows you the door you
 * clicked. These three waypoints make it walk the way a visitor would -
 * square up to the door, pass through the opening, then step into the
 * room - so the hall and the chamber read as one connected building.
 *
 * Listed outward; the camera follows them in reverse to leave.
 */
export function roomPath(door: DoorSpec): {
  points: Vec3[];
  looks: Vec3[];
} {
  const dir = sideOf(door);
  const [cx, cz] = roomCenter(door);
  const view = roomView(door);
  return {
    points: [
      // out in the hall, squared up in front of the doorway
      [dir * (HALF_WIDTH - 5.5), CAM_Y, door.z],
      // in the opening itself
      [dir * (HALF_WIDTH + 0.8), CAM_Y, door.z],
      view.position,
    ],
    looks: [
      [dir * HALF_WIDTH, CAM_Y - 0.1, door.z],
      [cx + dir * roomSize(door).depth * 0.5, CAM_Y + 0.6, cz],
      view.look,
    ],
  };
}
