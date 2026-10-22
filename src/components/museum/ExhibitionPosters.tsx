"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { roomCenter, roomSize, type DoorSpec } from "./corridorLayout";
import { artPieces, type ExhibitDatum } from "./exhibitData";
import { track } from "./preload";
import { HungPicture } from "./PortraitWall";

/**
 * The Art room's side walls: a series of exhibition posters, the kind a
 * gallery prints for a show and hangs at its entrance - a detail of one
 * piece, the show's name, one line under it. Six of them, three to a
 * wall, one in each bay between the pilasters, each under a brass picture
 * light.
 *
 * They are one series: the same grid, the same two faces (the site's
 * Garamond for the names, its mono for everything else), the same margins
 * and footer, and a different ground for each, so the series reads as
 * designed together and each poster still holds its bay on its own. Two
 * are type alone, so the series is not six pictures in a row.
 *
 * Every word on them comes from the site's own record of the work.
 */

type PosterSpec = {
  title: string[];
  line: string;
  /** A detail of one piece, drawn into the poster's picture panel; type alone if absent. */
  image?: string;
  /** Where in the piece the detail is cut from, 0..1 across and down. */
  focus?: [number, number];
  ground: string;
  ink: string;
  accent: string;
  /** A typographic poster's large figure. */
  figure?: string;
};

const SERIES: PosterSpec[] = [
  {
    title: ["Visual", "Work"],
    line: "Posters, thumbnails and a visual identity",
    image: "/museum/art-1.webp",
    focus: [0.5, 0.42],
    ground: "#ece3d2",
    ink: "#1b1511",
    accent: "#7a2a1c",
  },
  {
    title: ["The International", "Society"],
    line: "Visual identity and event campaigns",
    image: "/museum/art-6.webp",
    focus: [0.5, 0.45],
    ground: "#16110d",
    ink: "#ece3d2",
    accent: "#c9a24e",
  },
  {
    title: ["One Visual", "System"],
    line: "Instagram grew from 400 to 850 followers",
    image: "/museum/art-3.webp",
    focus: [0.5, 0.62],
    ground: "#5b2018",
    ink: "#f1e4cc",
    accent: "#e2b866",
  },
  {
    title: ["Palmy AI"],
    line: "Podcast packaging, trailers and thumbnails",
    figure: "▶",
    ground: "#c8963c",
    ink: "#1b1511",
    accent: "#1b1511",
  },
  {
    title: ["Video", "Reach"],
    line: "Up after a full SEO setup",
    figure: "+30%",
    ground: "#16110d",
    ink: "#ece3d2",
    accent: "#c9a24e",
  },
  {
    title: ["Since", "Thirteen"],
    line: "Editing since thirteen, freelancing by fifteen",
    image: "/museum/thumb-4.webp",
    focus: [0.5, 0.5],
    ground: "#ece3d2",
    ink: "#1b1511",
    accent: "#7a2a1c",
  },
];

/*
  The figures from the marketing portfolio, one to a poster: the number as
  large as the panel will hold it, and what it counts under it. Only
  numbers that portfolio states are used.
*/
const stat = (figure: string, title: string[], line: string): PosterSpec => ({
  title,
  line,
  figure,
  ground: "#241008",
  ink: "#f1e4cc",
  accent: "#e0b070",
});

const STATS = {
  channels: stat("4+", ["Pages and", "Channels"], "Run in past roles"),
  followers: stat("5,000+", ["Followers"], "On a page I ran for Palmy AI"),
  videos: stat("150+", ["Videos", "Edited"], "End to end, across two YouTube channels"),
  weekly: stat("50+", ["Students", "Weekly"], "Reached as a Higherin campus ambassador"),
};

/**
 * Three a wall, two figures and a poster each, from the back of the room
 * to the door: the left wall first, then the right. Each opens its own
 * piece (artPieces, by key).
 */
const POSTERS: { spec: PosterSpec; key: string }[] = [
  { spec: STATS.channels, key: "stat-channels" },
  { spec: STATS.followers, key: "stat-followers" },
  { spec: SERIES[2], key: "series-system" },
  { spec: STATS.videos, key: "stat-videos" },
  { spec: STATS.weekly, key: "stat-weekly" },
  { spec: SERIES[1], key: "series-society" },
];

/** The page's own face for a CSS variable. */
function face(variable: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

const W = 900;
const H = 1350;
const M = 64;

function drawPoster(ctx: CanvasRenderingContext2D, spec: PosterSpec, n: number, img: HTMLImageElement | null) {
  const serif = face("--font-cormorant", "Georgia, serif");
  const mono = face("--font-plex-mono", "monospace");
  ctx.fillStyle = spec.ground;
  ctx.fillRect(0, 0, W, H);

  // the head: the room on the left, the poster's place in the series on the right
  ctx.fillStyle = spec.ink;
  ctx.font = `400 22px ${mono}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("THE ART ROOM", M, M + 16);
  const count = `${String(n + 1).padStart(2, "0")} / ${String(POSTERS.length).padStart(2, "0")}`;
  ctx.fillText(count, W - M - ctx.measureText(count).width, M + 16);
  ctx.fillRect(M, M + 34, W - M * 2, 2);

  // the picture panel, or the figure on a type-only poster
  const top = M + 64;
  const side = W - M * 2;
  if (spec.image) {
    if (img && img.width) {
      // cover the square, cut round the focus
      const [fx, fy] = spec.focus ?? [0.5, 0.5];
      const s = Math.min(img.width, img.height) * 0.86;
      const sx = Math.max(0, Math.min(img.width - s, img.width * fx - s / 2));
      const sy = Math.max(0, Math.min(img.height - s, img.height * fy - s / 2));
      ctx.drawImage(img, sx, sy, s, s, M, top, side, side);
    } else {
      ctx.fillStyle = spec.accent;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(M, top, side, side);
      ctx.globalAlpha = 1;
    }
  } else if (spec.figure) {
    ctx.fillStyle = spec.accent;
    // as large as the panel will hold it, and centred in it
    let size = 720;
    ctx.font = `600 ${size}px ${serif}`;
    while (ctx.measureText(spec.figure).width > side - 24 && size > 120) {
      size -= 16;
      ctx.font = `600 ${size}px ${serif}`;
    }
    ctx.textAlign = "center";
    ctx.fillText(spec.figure, W / 2, top + side / 2 + size * 0.22);
    ctx.textAlign = "left";
    // a hairline frame round the field, so the type poster keeps the series' grid
    ctx.strokeStyle = spec.ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(M + 1, top + 1, side - 2, side - 2);
    ctx.globalAlpha = 1;
  }

  // the name, large, set close
  ctx.fillStyle = spec.ink;
  let size = 132;
  ctx.font = `600 ${size}px ${serif}`;
  while (Math.max(...spec.title.map((t) => ctx.measureText(t.toUpperCase()).width)) > side && size > 60) {
    size -= 6;
    ctx.font = `600 ${size}px ${serif}`;
  }
  let y = top + side + 40 + size * 0.78;
  for (const t of spec.title) {
    ctx.fillText(t.toUpperCase(), M - size * 0.04, y);
    y += size * 0.86;
  }

  // a short rule in the accent, and the line under it
  y += 6 - size * 0.86 + 34;
  ctx.fillStyle = spec.accent;
  ctx.fillRect(M, y, 120, 6);
  ctx.fillStyle = spec.ink;
  ctx.font = `400 26px ${mono}`;
  ctx.fillText(spec.line.toUpperCase(), M, y + 52);

  // the foot: who, and when
  ctx.font = `400 20px ${mono}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText("DAKSH KUMAR", M, H - M);
  const when = "2025–2026";
  ctx.fillText(when, W - M - ctx.measureText(when).width, H - M);
  ctx.globalAlpha = 1;
  ctx.fillRect(M, H - M - 34, W - M * 2, 2);
}

const posters = new Map<number, THREE.CanvasTexture>();

/**
 * One poster as a texture: drawn at once, and again when its picture and
 * the page's faces have loaded. The texture object never changes, so the
 * frame round it never has to; each is made once and kept, as the rooms
 * are.
 */
function posterTexture(n: number) {
  const hit = posters.get(n);
  if (hit) return hit;
  const spec = POSTERS[n].spec;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  posters.set(n, tex);
  const ctx = canvas.getContext("2d");
  if (!ctx) return tex;
  let img: HTMLImageElement | null = null;
  const redraw = () => {
    drawPoster(ctx, spec, n, img);
    tex.needsUpdate = true;
  };
  redraw();
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load(`600 120px ${face("--font-cormorant", "Georgia, serif")}`),
        document.fonts.load(`400 24px ${face("--font-plex-mono", "monospace")}`),
      ]).catch(() => undefined)
    : Promise.resolve(undefined);
  const picture = spec.image
    ? new Promise<void>((resolve) => {
        const el = new Image();
        el.onload = () => {
          img = el;
          resolve();
        };
        el.onerror = () => resolve();
        el.src = spec.image as string;
      })
    : Promise.resolve();
  // the loading screen waits for the poster to be drawn in its own face, with its picture
  void track(Promise.all([fonts, picture]).then(redraw));
  return tex;
}

let glowTex: THREE.Texture | null = null;
/**
 * The light a picture lamp throws: brightest just under the lamp, spread
 * down the frame and fading off the wall to either side.
 */
function lampGlow() {
  if (glowTex) return glowTex;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y += 1) {
    const v = y / (S - 1); // 0 at the lamp
    for (let x = 0; x < S; x += 1) {
      const u = (x / (S - 1)) * 2 - 1;
      const spread = 0.35 + 0.65 * v;
      const b = Math.exp(-((u / spread) ** 2) * 2.2) * Math.exp(-v * 2.1) * Math.min(1, v * 12);
      const i = (y * S + x) * 4;
      img.data[i] = 255 * b;
      img.data[i + 1] = 214 * b;
      img.data[i + 2] = 160 * b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** The poster's room on the wall, its moulding included. */
const SIZE: [number, number] = [3, 4.4];
const HANG_Y = 5.7;

/**
 * A brass picture light over a frame: a hood on a curved arm from the
 * wall, its lamp a warm line along the underside, and the light it throws
 * down the wall behind the frame.
 */
function PictureLight({ width }: { width: number }) {
  const glow = useMemo(() => lampGlow(), []);
  const brass = <meshStandardMaterial color="#b8924c" roughness={0.3} metalness={1} envMapIntensity={1.3} />;
  const top = SIZE[1] / 2 + 0.32;
  return (
    <group>
      {/* the light on the wall, behind the frame */}
      {glow ? (
        <mesh position={[0, top - 1.7, -0.27]} renderOrder={1}>
          <planeGeometry args={[width + 2.2, 3.6]} />
          <meshBasicMaterial map={glow} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
      {/* the arm, from a round plate on the wall */}
      <mesh position={[0, top + 0.06, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.02, 20]} />
        {brass}
      </mesh>
      <mesh position={[0, top + 0.12, -0.05]} rotation={[Math.PI / 2 - 0.35, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.5, 8]} />
        {brass}
      </mesh>
      {/* the hood */}
      <group position={[0, top + 0.2, 0.2]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, width * 0.42, 20, 1, false, Math.PI * 0.15, Math.PI * 1.7]} />
          <meshStandardMaterial color="#b8924c" roughness={0.3} metalness={1} envMapIntensity={1.3} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.03, 0.01]}>
          <boxGeometry args={[width * 0.4, 0.008, 0.03]} />
          <meshBasicMaterial color="#ffe3b0" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Poster({
  n,
  position,
  yaw,
  exhibit,
  active,
  onSelect,
}: {
  n: number;
  position: [number, number, number];
  yaw: number;
  exhibit: ExhibitDatum | null;
  active: boolean;
  onSelect: () => void;
}) {
  const tex = useMemo(() => posterTexture(n), [n]);
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <HungPicture
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        exhibit={exhibit}
        active={active}
        onSelect={onSelect}
        src={null}
        texture={tex}
        fallback={null}
        size={SIZE}
        caption={false}
        tone="#dcdcdc"
      />
      <PictureLight width={SIZE[0]} />
    </group>
  );
}

/** Three frames a wall, seven metres apart, the first seven from the back wall: all of them in front of where the visitor stands. */
const BAYS = 3;
export const BAY_FIRST = 7;
export const BAY_PITCH = 7;

export function SidePosters({
  door,
  activeId,
  onSelect,
}: {
  door: DoorSpec;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const [cx, cz] = roomCenter(door);
  const { depth, width } = roomSize(door);
  const dir = door.side === "left" ? -1 : 1;
  // the frames stand a little off the silk, as the hall's own pictures do
  const off = width / 2 - 0.32;
  // from the back of the room toward the door, so the series reads in the order you meet it walking in
  const back = cx + dir * (depth / 2);
  const bays = Array.from({ length: BAYS }, (_, k) => back - dir * (BAY_FIRST + k * BAY_PITCH));
  return (
    <group>
      {[-1, 1].map((side) =>
        bays.map((x, i) => {
          const n = (side < 0 ? 0 : BAYS) + i;
          const exhibit = artPieces[POSTERS[n].key] ?? null;
          return (
            <Poster
              key={`${side}${i}`}
              n={n}
              position={[x, HANG_Y, cz + side * off]}
              yaw={side < 0 ? 0 : Math.PI}
              exhibit={exhibit}
              active={Boolean(exhibit) && activeId === exhibit?.id}
              onSelect={() => exhibit && onSelect(exhibit)}
            />
          );
        }),
      )}
    </group>
  );
}
