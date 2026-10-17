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
  const span = Math.min((count - 1) * CASE_PITCH, roomSize(door).width - 3.5);
  return Array.from({ length: count }, (_, i) => {
    const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * span;
    return [x, 0, cz + spread] as Vec3;
  });
}

/**
 * The two cases in the About room, one against each side wall near the
 * back, facing into the room, so the back wall is left to the photographs
 * and the boards between them.
 */
const aboutSideZ = (door: DoorSpec) => roomSize(door).width / 2 - 3;
/** From the back wall to the middle of the side walls: the centre of the room's depth. */
const aboutCaseBack = (door: DoorSpec) => roomSize(door).depth / 2;
export function aboutCaseSlots(door: DoorSpec): { position: Vec3; yaw: number }[] {
  const [, cz] = roomCenter(door);
  const x = backWallX(door) - sideOf(door) * aboutCaseBack(door);
  // the case on the -z wall faces +z, the one on the +z wall faces -z
  return [-1, 1].map((s) => ({ position: [x, 0, cz + s * aboutSideZ(door)] as Vec3, yaw: s < 0 ? 0 : Math.PI }));
}

/**
 * The Experience room: three cases across the back wall with a reading
 * board in each gap between them, and three cases against each side wall,
 * facing in. Nine cases, then, and the two boards.
 */
const EXP_PITCH = 11;
const expSideZ = (door: DoorSpec) => roomSize(door).width / 2 - 3;
/** How far from the back wall the three cases on a side wall stand: evenly spaced, the middle one at the middle of the wall. */
const expSideBack = (door: DoorSpec) => [roomSize(door).depth / 2 - 7.5, roomSize(door).depth / 2, roomSize(door).depth / 2 + 7.5];
export function experienceSlots(door: DoorSpec) {
  const [, cz] = roomCenter(door);
  const dir = sideOf(door);
  const back = backWallX(door);
  const cases: { position: Vec3; yaw: number }[] = [
    ...[-1, 0, 1].map((k) => ({ position: [back - dir * CASE_INSET, 0, cz + k * EXP_PITCH] as Vec3, yaw: -dir * Math.PI * 0.5 })),
    // the -z wall's cases face +z, the +z wall's face -z
    ...expSideBack(door).map((d) => ({ position: [back - dir * d, 0, cz - expSideZ(door)] as Vec3, yaw: 0 })),
    ...expSideBack(door).map((d) => ({ position: [back - dir * d, 0, cz + expSideZ(door)] as Vec3, yaw: Math.PI })),
  ];
  // the boards stand a little out from the wall in the gaps between the three cases
  const boards: Vec3[] = [-0.5, 0.5].map((k) => [back - dir * 1.4, 0, cz + k * EXP_PITCH] as Vec3);
  return { cases, boards };
}

/** The About wall: three photographs, and reading stands in the gaps between them. */
export const PORTRAIT_PITCH = 10;
/** The frames and the boards are hung at this size: the room is deep, so everything on its back wall is larger. */
export const PORTRAIT_SCALE = 1.35;
export const PORTRAIT_HANG_Y = 4.7;
export function portraitSlots(door: DoorSpec, pictures: number, stands: number) {
  const [, cz] = roomCenter(door);
  const wall = backWallX(door) - sideOf(door) * 0.3;
  const frames = Array.from({ length: pictures }, (_, i) => {
    const spread = pictures === 1 ? 0 : (i - (pictures - 1) / 2) * PORTRAIT_PITCH;
    return [wall, PORTRAIT_HANG_Y, cz + spread] as Vec3;
  });
  const lecterns = Array.from({ length: stands }, (_, i) => {
    const gap = (i - (stands - 1) / 2) * PORTRAIT_PITCH;
    return [wall - sideOf(door) * 1.3, 0, cz + gap] as Vec3;
  });
  return { frames, lecterns };
}

/**
 * The Art wall, hung as a curated exhibition on one axis.
 *
 * Two rows of one width, centred on the wall. Above, seven posters: the
 * Cultural Fashion Show, the strongest piece, larger and in the middle as
 * the anchor, with three smaller posters either side, their weight spread
 * so no side is heavier - the bright and light pieces are set against the
 * dark. Below, the five video thumbnails, evenly spaced, with the same
 * width as the row above, so the whole is a single block with clear air
 * round it rather than a scatter of frames.
 *
 * The same gap runs between every frame, and the same gap between the two
 * rows; each row shares one centre line. All the numbers are here.
 */
export type ArtPiece = {
  /** The image, which is also the key to its words in exhibitData. */
  src: string;
  /** The room the frame may take on the wall, its moulding included. */
  size: [number, number];
  /** Across the wall, as the visitor sees it: negative is left. */
  x: number;
  y: number;
  hero?: boolean;
};

const GAP = 0.6;
const POSTER: [number, number] = [3, 3.6];
const HERO: [number, number] = [4.2, 5.2];
const ROW_W = 6 * POSTER[0] + HERO[0] + 6 * GAP;
const THUMB_GAP = 0.675;
const THUMB: [number, number] = [(ROW_W - 4 * THUMB_GAP) / 5, 2.7];
const TOP_Y = 8.1;
const BOTTOM_Y = 3.0;

/** Left to right: weight alternates so neither side of the anchor is heavier. */
const POSTERS_LTR = ["/museum/art-7.webp", "/museum/art-3.webp", "/museum/art-6.webp", "/museum/art-1.webp", "/museum/art-5.webp", "/museum/art-4.webp", "/museum/art-2.webp"];
const THUMBS_LTR = ["/museum/thumb-5.webp", "/museum/thumb-4.webp", "/museum/thumb-3.webp", "/museum/thumb-2.webp", "/museum/thumb-1.webp"];

export const ART_HANG: ArtPiece[] = (() => {
  const out: ArtPiece[] = [];
  let x = -ROW_W / 2;
  for (const src of POSTERS_LTR) {
    const hero = src === "/museum/art-1.webp";
    const size = hero ? HERO : POSTER;
    out.push({ src, size, x: x + size[0] / 2, y: TOP_Y, hero });
    x += size[0] + GAP;
  }
  x = -ROW_W / 2;
  for (const src of THUMBS_LTR) {
    out.push({ src, size: THUMB, x: x + THUMB[0] / 2, y: BOTTOM_Y });
    x += THUMB[0] + THUMB_GAP;
  }
  return out;
})();

/** Where a position across the wall, as the visitor sees it, falls in the room's z. */
const acrossWall = (door: DoorSpec, cz: number, x: number) => cz + sideOf(door) * x;

export function artHang(door: DoorSpec) {
  const [, cz] = roomCenter(door);
  const wall = backWallX(door) - sideOf(door) * 0.3;
  return ART_HANG.map((p) => ({ ...p, position: [wall, p.y, acrossWall(door, cz, p.x)] as Vec3 }));
}

/** The two boards stand on the floor either side of the block, a little out from the wall. */
export function artBoardSlots(door: DoorSpec) {
  const [, cz] = roomCenter(door);
  const wall = backWallX(door) - sideOf(door) * 1.3;
  return [-1, 1].map((s) => [wall, 0, acrossWall(door, cz, s * 15) ] as Vec3);
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
export const SPOT_COUNT = 5;

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
    return [-9.8, -3.3, 3.3, 9.8].map((x) => ({
      from: [track, ROOM_H - 0.4, acrossWall(door, cz, x)] as Vec3,
      to: [wall, 6.4, acrossWall(door, cz, x)] as Vec3,
      angle: 0.6,
      intensity: 170,
    }));
  }

  if (door.id === "experience") {
    /*
      Three lights on the three cases across the back, and one wide light
      over each pair of cases on the side walls, between the two; all the
      cases carry a light of their own besides.
    */
    const [, cz] = roomCenter(door);
    const back = backWallX(door);
    const dir = sideOf(door);
    const mid = back - dir * roomSize(door).depth / 2;
    return [
      ...[-1, 0, 1].map((k) => ({
        from: from(cz + k * EXP_PITCH),
        to: [back - dir * CASE_INSET, 3.3, cz + k * EXP_PITCH] as Vec3,
        angle: 0.36,
        intensity: 340,
      })),
      ...[-1, 1].map((s) => ({
        from: [mid, ROOM_H + 0.25, cz + s * expSideZ(door)] as Vec3,
        to: [mid, 3.3, cz + s * expSideZ(door)] as Vec3,
        angle: 0.95,
        intensity: 520,
      })),
    ];
  }

  if (door.id === "about") {
    /*
      A spot on each photograph, and the fourth light over the middle of
      the wall, wide, so its edges reach the cases at either end; the
      cases carry light of their own as well.
    */
    const { frames } = portraitSlots(door, Math.min(3, items.length), 0);
    const [, cz] = roomCenter(door);
    return [
      ...frames.map((p) => ({
        from: from(p[2]),
        to: [p[0], p[1] - 0.4, p[2]] as Vec3,
        angle: 0.36,
        intensity: 280,
      })),
      ...[-1, 1].slice(0, Math.max(0, SPOT_COUNT - frames.length)).map((s) => ({
        from: [backWallX(door) - sideOf(door) * aboutCaseBack(door), ROOM_H + 0.25, cz + s * aboutSideZ(door)] as Vec3,
        to: [backWallX(door) - sideOf(door) * aboutCaseBack(door), 3.3, cz + s * aboutSideZ(door)] as Vec3,
        angle: 0.3,
        intensity: 300,
      })),
    ].slice(0, SPOT_COUNT);
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

/**
 * How far from the back wall a visitor stands to take in a room: far
 * enough for the whole wall of work, near enough to read it. The rooms are
 * deeper than this; the space behind is the room you walked in through.
 */
export function viewDistance(door: DoorSpec) {
  // the About room's visitor stands back further, so the cases on its side walls are in the frame
  return door.id === "about" ? 30 : door.id === "experience" ? 42 : door.id === "art" ? 26 : 18;
}

/** Where the camera parks inside a room, and what it faces. */
export function roomView(door: DoorSpec): { position: Vec3; look: Vec3 } {
  const dir = sideOf(door);
  const [cx, cz] = roomCenter(door);
  /*
    A good way in, at the same eye height as the corridor, at the distance
    above from the back wall. Standing there rather than at the room's
    centre is what a visitor actually does: it keeps the back wall and
    both side walls in frame at once, so the room reads as a volume you
    have stepped into rather than a flat wall you are facing.

    Raised a little, and looking level rather than down. At eye height
    looking slightly below it, most of the frame was floor: you stepped
    into a room and saw tiling. Lifting the stance and aiming the view a
    touch above the horizon puts the back wall and whatever stands
    against it in the middle of the shot.
  */
  return {
    position: [cx + dir * (roomSize(door).depth / 2 - viewDistance(door)), CAM_Y + 1.1, cz],
    // a few degrees up, so the frieze with the room's name is in the frame over the work
    look: [cx + dir * roomSize(door).depth, CAM_Y + 2.6, cz],
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
