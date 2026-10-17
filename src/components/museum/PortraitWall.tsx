"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { ExhibitText } from "./ExhibitText";
import { roomCenter, type DoorSpec } from "./corridorLayout";
import { PORTRAIT_SCALE, artHang, backWallX, portraitSlots } from "./roomLayout";
import { artPieces } from "./exhibitData";
import type { ExhibitDatum } from "./exhibitData";
import { consumedDrag } from "./lookControls";
import { GOLD, MID } from "./palette";
import { exactPrint, gradedPhoto, type PhotoCrop } from "./photoGrade";
import { getGilt, giltMoulding, ROSETTE } from "./giltFrame";
import { rosetteGeometry } from "./architecture";
import { usePulse } from "./breath";

/* Drawn once and shared by every frame. */
let wallShadowTex: THREE.Texture | null = null;

/** The soft shadow a frame casts on the wall: a blurred rectangle, darkest under the frame. */
function wallShadowTexture() {
  if (wallShadowTex) return wallShadowTex;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.filter = "blur(9px)";
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(S * 0.18, S * 0.18, S * 0.64, S * 0.64);
  wallShadowTex = new THREE.CanvasTexture(c);
  return wallShadowTex;
}

/**
 * A photograph for the About wall. Shown whole and in its own colours;
 * give it a `crop` to have it cropped and graded instead (see photoGrade).
 */
type PhotoSpec = { src: string; crop?: PhotoCrop };

/**
 * Photographs to hang in the About room, in frame order.
 *
 * Each is printed whole - nothing cut away, at its own proportions and
 * full sharpness - and graded into the museum's palette (see photoGrade),
 * and its frame is made to it. Until a file exists its frame shows a
 * neutral mount, so the room is never broken by a missing picture.
 */
const WHOLE: PhotoCrop = { focus: [0.5, 0.5], zoom: 1, whole: true };
export const PHOTO_FILES: PhotoSpec[] = [
  // London Tech Week
  { src: "/museum/portrait-1.jpg", crop: WHOLE },
  // Canary Wharf
  { src: "/museum/portrait-2.jpg", crop: WHOLE },
  // the laptop and the notebook, at the café
  { src: "/museum/portrait-3.jpg", crop: WHOLE },
];

/*
  The prints are made while the visitor is still in the hall, in idle
  time, so they are on the wall the moment the About door opens.
*/
if (typeof window !== "undefined") {
  const make = () =>
    PHOTO_FILES.forEach((p) => (p.crop ? gradedPhoto(p.src, p.crop) : exactPrint(p.src)).catch(() => {}));
  if ("requestIdleCallback" in window) window.requestIdleCallback(make, { timeout: 10000 });
  else setTimeout(make, 5000);
}

/** A rectangle traced onto `path` from corner (x0, y0) round to (x1, y1). Three sorts out the winding. */
function rect<P extends THREE.Path>(path: P, x0: number, y0: number, x1: number, y1: number) {
  path.moveTo(x0, y0);
  path.lineTo(x1, y0);
  path.lineTo(x1, y1);
  path.lineTo(x0, y1);
  path.lineTo(x0, y0);
  return path;
}

/** Plain mount used when a photograph has not been added yet. */
function useMountTexture() {
  return useMemo(() => {
    const w = 512;
    const h = 640;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#241c15");
    g.addColorStop(1, "#14100c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,182,63,0.32)";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = "rgba(255,198,112,0.5)";
    ctx.font = "500 24px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PHOTOGRAPH", w / 2, h / 2);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/**
 * The cream mat inside an About frame: the print set back behind the
 * mat's window, and the white core of the mat's bevelled cut showing as a
 * fine line round it. The window is 4:5, even at the sides, with a little
 * more mat at the foot than the head, as a framer weights it.
 */
function MattedPicture({
  W,
  H,
  photo,
  fallback,
}: {
  W: number;
  H: number;
  photo: THREE.Texture | null;
  fallback: THREE.Texture | null;
}) {
  const MAT = 0.2;
  const pw = W - MAT * 2;
  const ph = Math.min(pw * 1.25, H - MAT * 2);
  const lift = Math.min(0.03, (H - ph) / 2 - 0.05);

  const shapes = useMemo(() => {
    const win = [-pw / 2, lift - ph / 2, pw / 2, lift + ph / 2] as const;
    const mat = rect(new THREE.Shape(), -W / 2, -H / 2, W / 2, H / 2);
    mat.holes.push(rect(new THREE.Path(), win[0], win[3], win[2], win[1]));
    const B = 0.016;
    const bevel = rect(new THREE.Shape(), win[0] - B, win[1] - B, win[2] + B, win[3] + B);
    bevel.holes.push(rect(new THREE.Path(), win[0], win[3], win[2], win[1]));
    return { mat, bevel };
  }, [W, H, pw, ph, lift]);

  return (
    <>
      {/*
        The mat's own colour is a pale blue-grey. The spot over each frame
        is warm, and under it that reads as cream - where a true cream came
        out camel.
      */}
      <mesh position={[0, 0, PICTURE_Z]}>
        <shapeGeometry args={[shapes.mat]} />
        <meshStandardMaterial color="#d2dff5" roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[0, 0, PICTURE_Z + 0.001]}>
        <shapeGeometry args={[shapes.bevel]} />
        <meshStandardMaterial color="#e6eefa" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, lift, PICTURE_Z - 0.008]}>
        <planeGeometry args={[pw, ph]} />
        {/*
          The print itself takes no light from the room. Lit, the spot above
          it came off its surface as a sheen straight back at the visitor
          below - the glare every gallery fights - and lifted its blacks to
          grey. Matte and unlit, it shows the print as graded; the grade's
          own vignette gives it the fall-off the light would have.
        */}
        {photo ? (
          <meshBasicMaterial map={photo} color={GRADED_TONE} />
        ) : (
          <meshStandardMaterial map={fallback ?? undefined} roughness={0.82} metalness={0} />
        )}
      </mesh>
    </>
  );
}

/**
 * How bright a graded print is drawn. A print graded into the museum's
 * palette is held a little below full, as a photograph under gallery light
 * reads, rather than glowing like a screen.
 */
const GRADED_TONE = "#9e9e9e";

/** The picture's plane, and the mat's, in front of the frame's back. */
const PICTURE_Z = 0.03;

/** The velvet slip between a frame's moulding and its picture. */
const SLIP = 0.05;

let frameRosette: THREE.BufferGeometry | null = null;
/** The carved rosette for the frames' corners and the middles of their sides, facing out of the wall. */
function getFrameRosette() {
  if (frameRosette) return frameRosette;
  const g = rosetteGeometry();
  g.rotateX(-Math.PI / 2);
  frameRosette = g;
  return g;
}

let slipTex: THREE.Texture | null = null;
/** Velvet: a deep pile that drinks the light, a little lighter where it is brushed. */
function velvet() {
  if (slipTex) return slipTex;
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(S, S);
  let seed = 917;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < S * S; i += 1) {
    const v = 200 + rand() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  slipTex = new THREE.CanvasTexture(c);
  slipTex.wrapS = slipTex.wrapT = THREE.RepeatWrapping;
  slipTex.repeat.set(12, 12);
  return slipTex;
}

/**
 * A carved and gilded frame, mitred at the corners - the frame every
 * museum hangs its pictures in. Built round the picture, so it always fits
 * the picture exactly: a velvet slip next to the work with a fine gilt
 * fillet at its edge, then the carved moulding, with a rosette at each
 * corner and a smaller one at the middle of each side.
 */
function GiltFrame({
  w,
  h,
  width,
  aged = false,
  invite = false,
}: {
  w: number;
  h: number;
  width: number;
  aged?: boolean;
  /** The gilt takes on a warm light of its own and lets it go, slowly: this frame opens a card. */
  invite?: boolean;
}) {
  const gilt = useMemo(() => getGilt(), []);
  const breathe = usePulse(0.04, 0.34, invite);
  const rosette = useMemo(() => getFrameRosette(), []);
  const pile = useMemo(() => velvet(), []);
  const iw = w + SLIP * 2;
  const ih = h + SLIP * 2;
  const geometry = useMemo(() => giltMoulding(iw, ih, width, FRAME_DEPTH), [iw, ih, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  /* the slip, and the gilt fillet round its inner edge */
  const slip = useMemo(() => {
    const ring = (w0: number, h0: number, w1: number, h1: number) => {
      const s = new THREE.Shape();
      rect(s, -w1 / 2, -h1 / 2, w1 / 2, h1 / 2);
      const hole = new THREE.Path();
      rect(hole, -w0 / 2, -h0 / 2, w0 / 2, h0 / 2);
      s.holes.push(hole);
      return new THREE.ShapeGeometry(s);
    };
    return { cloth: ring(w + 0.02, h + 0.02, iw + 0.01, ih + 0.01), fillet: ring(w, h, w + 0.022, h + 0.022) };
  }, [w, h, iw, ih]);
  useEffect(
    () => () => {
      slip.cloth.dispose();
      slip.fillet.dispose();
    },
    [slip],
  );
  const outerW = iw + width * 2;
  const outerH = ih + width * 2;
  const corner = (sx: number, sy: number): [number, number, number] => [
    sx * (outerW / 2 - ROSETTE.inset * width),
    sy * (outerH / 2 - ROSETTE.inset * width),
    ROSETTE.z * width * FRAME_DEPTH,
  ];
  // the rosette is about 0.66 across at scale 1; at the corners it fills most of the moulding's breadth
  const big = (width * 0.9) / 0.66;
  /*
    Aged gilt, for the hall: the gold worn back and darkened by a century of
    air and hands, so it glows rather than shines, with the carving reading
    more strongly in its hollows.
  */
  const leaf = (
    <meshStandardMaterial
      ref={breathe}
      emissive="#b07a2c"
      emissiveMap={gilt?.map ?? null}
      emissiveIntensity={0.04}
      color={aged ? "#8c7350" : "#ffffff"}
      map={gilt?.map ?? null}
      normalMap={gilt?.normalMap ?? null}
      normalScale={new THREE.Vector2(aged ? 1.2 : 0.9, aged ? 1.2 : 0.9)}
      roughness={aged ? 0.5 : 0.36}
      metalness={1}
      envMapIntensity={aged ? 0.9 : 1.1}
    />
  );
  return (
    <group position={[0, 0, PICTURE_Z - 0.006]}>
      <mesh geometry={geometry}>{leaf}</mesh>
      {/* the frame's depth behind its face, so it is a solid thing from the side - kept behind the print */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[outerW - 0.01, outerH - 0.01, 0.08]} />
        <meshStandardMaterial color="#3d2a14" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh geometry={slip.cloth} position={[0, 0, 0.004]}>
        <meshStandardMaterial color="#2a1812" map={pile} roughness={1} metalness={0} envMapIntensity={0.2} />
      </mesh>
      <mesh geometry={slip.fillet} position={[0, 0, 0.007]}>
        <meshStandardMaterial color="#d9b66c" roughness={0.3} metalness={1} envMapIntensity={1.2} />
      </mesh>
      {[
        [-1, -1, big],
        [1, -1, big],
        [1, 1, big],
        [-1, 1, big],
        [0, -1, big * 0.72],
        [0, 1, big * 0.72],
        [-1, 0, big * 0.72],
        [1, 0, big * 0.72],
      ].map(([sx, sy, k]) => (
        <mesh key={`${sx}${sy}`} geometry={rosette} position={corner(sx, sy)} scale={[k, k, k * 0.8]}>
          <meshStandardMaterial
            color={aged ? "#9a7d4c" : "#e2c07a"}
            roughness={aged ? 0.48 : 0.34}
            metalness={1}
            envMapIntensity={1.1}
          />
        </mesh>
      ))}
    </group>
  );
}

/** How far the moulding stands off the picture, as a multiple of its profile. */
const FRAME_DEPTH = 1.5;

/**
 * A picture hung in a gilt frame: an Art poster, an About photograph on
 * its mat, or the photograph in the hall. Clicking it opens its exhibit.
 */
export function HungPicture({
  position,
  rotation,
  exhibit,
  active,
  onSelect,
  src,
  texture = null,
  fallback,
  size,
  matted = false,
  crop,
  caption = true,
  tone = GRADED_TONE,
  aged = false,
  glow = false,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  exhibit: ExhibitDatum | null;
  active: boolean;
  onSelect: () => void;
  src: string | null;
  /** A picture drawn in the scene rather than loaded from a file, shown as it is. */
  texture?: THREE.Texture | null;
  fallback: THREE.Texture | null;
  /** The room the frame may take on the wall, its moulding included. */
  size?: [number, number];
  /** An About photograph: cropped and graded, behind a cream mat. */
  matted?: boolean;
  /** Crop the photograph to this and grade it into the museum's palette. */
  crop?: PhotoCrop;
  /** Letter the exhibit's title under the frame. */
  caption?: boolean;
  /** How bright a graded print is drawn, where it is not the About wall's. */
  tone?: string;
  /** An old, darker gilt, for the hall. */
  aged?: boolean;
  /** A soft light breathing round the frame, to say it opens. */
  glow?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  /*
    Every picture reaches the screen in its own colours unless it is
    given a crop to grade it (see exactPrint and gradedPhoto).
  */
  const loaded = usePhoto(texture ? null : src, crop, !crop);
  const photo = texture ?? loaded;
  /*
    Hung large. These are fixed to the back wall, so unlike the vitrines
    in the other rooms they cannot be moved forward to meet the visitor.
  */
  const [W, H] = size ?? [2.3, 2.9];
  /** The moulding's width. */
  const F = matted ? 0.2 : 0.19;
  /*
    The picture inside the moulding. An About frame holds its mat. An Art
    frame is made to the poster - the poster's own proportions, as large
    as the frame's room on the wall allows - so frame and work always
    meet exactly, as they do when a framer makes a frame for a piece.
  */
  const pic = useMemo<[number, number]>(() => {
    if (matted) return [W, H];
    const bw = W + 0.14 - F * 2;
    const bh = H + 0.14 - F * 2;
    const img = photo?.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img?.height) return [bw, bh];
    const aspect = img.width / img.height;
    return aspect > bw / bh ? [bw, bw / aspect] : [bh * aspect, bh];
  }, [photo, matted, W, H, F]);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <group position={position} rotation={rotation}>
      {/* a soft shadow on the wall behind the frame, a little below it */}
      <mesh position={[0, -0.1, -0.295]} renderOrder={1}>
        <planeGeometry args={[pic[0] + F * 2 + 0.6, pic[1] + F * 2 + 0.6]} />
        <meshBasicMaterial color="#000000" map={wallShadowTexture()} transparent opacity={0.55} depthWrite={false} />
      </mesh>

      <GiltFrame w={pic[0]} h={pic[1]} width={F} aged={aged} invite={glow && Boolean(exhibit)} />

      {matted ? (
        <MattedPicture W={W} H={H} photo={photo} fallback={fallback} />
      ) : (
        <mesh position={[0, 0, PICTURE_Z]}>
          <planeGeometry args={pic} />
          {/*
            Unlit: the poster shows its own colours, not the room's light
            on them. A lit print took the warm spots' colour and their
            falloff, which is exactly what it should not do here.
          */}
          {photo ? (
            <meshBasicMaterial map={photo} color={crop ? tone : "#ffffff"} />
          ) : (
            <meshStandardMaterial map={fallback ?? undefined} roughness={0.82} metalness={0} />
          )}
        </mesh>
      )}

      {/* title under the frame, and the click target */}
      <group position={[0, -(pic[1] / 2 + F + 0.26), 0.05]}>
        {exhibit && caption ? (
          <ExhibitText text={exhibit.title} position={[0, 0, 0]} height={0.36} maxWidth={pic[0] + F * 2} active={active} />
        ) : null}
      </group>

      <mesh
        position={[0, 0, 0.12]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          // only something that opens a card earns the pointer
          if (exhibit) setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (consumedDrag()) return;
          onSelect();
        }}
      >
        <planeGeometry args={[pic[0] + F * 2 + 0.2, pic[1] + F * 2 + 0.6]} />
      </mesh>
    </group>
  );
}

/**
 * Loads a photograph if one is present, and quietly keeps the neutral
 * mount if it is not.
 *
 * Deliberately not drei's useLoader: that throws to the nearest Suspense
 * boundary when a file is missing, which would blank the whole room until
 * the photographs are actually added.
 */
function usePhoto(src: string | null, crop?: PhotoCrop, exact = false): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const take = (t: THREE.Texture) => {
      if (!alive) {
        t.dispose();
        return;
      }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      loaded = t;
      setTex(t);
    };
    // no file yet: the mount stays, nothing breaks
    const missing = () => {};
    if (crop) {
      gradedPhoto(src, crop).then((canvas) => take(new THREE.CanvasTexture(canvas)), missing);
    } else if (exact) {
      exactPrint(src).then((canvas) => take(new THREE.CanvasTexture(canvas)), missing);
    } else {
      new THREE.TextureLoader().load(src, take, undefined, missing);
    }
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [src, crop, exact]);

  return tex;
}

/**
 * The About room is a picture gallery rather than a vitrine hall: plain
 * walls hung with framed photographs, each opening its own text when
 * clicked. Cases would have said "artefact"; frames say "person".
 */
/**
 * Reads the families next/font registered for the page.
 *
 * next/font serves its faces under generated names, so the canvas has to
 * ask for the CSS variable's value rather than a family it can spell.
 * Falls back to Georgia, which every platform has, so a board drawn
 * before the fonts arrive is still a serif board and never a sans one.
 */
function pageFonts() {
  if (typeof document === "undefined") return { book: "Georgia, serif", display: "Georgia, serif" };
  const root = getComputedStyle(document.documentElement);
  return {
    book: root.getPropertyValue("--font-cormorant").trim() || "Georgia, serif",
    display: root.getPropertyValue("--font-instrument").trim() || "Georgia, serif",
  };
}

/** Lines that fit `max` pixels wide at the context's current font. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A small curl in one corner of the inner frame, drawn about (0,0). */
function cornerCurl(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.beginPath();
  ctx.moveTo(0, 46);
  ctx.lineTo(0, 10);
  ctx.quadraticCurveTo(0, 0, 10, 0);
  ctx.lineTo(46, 0);
  ctx.moveTo(14, 34);
  ctx.quadraticCurveTo(14, 14, 34, 14);
  ctx.moveTo(24, 26);
  ctx.quadraticCurveTo(24, 24, 26, 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(7, 7, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * An interpretive panel, drawn to a canvas.
 *
 * Laid out the way a heritage museum sets its wall text: a small
 * catalogue mark and a location line above the title, a fleuron rule
 * beneath it, then the text itself opening on a drop cap - inside a
 * frame ruled twice, with a curl at each inner corner. The one modern
 * thing on it is the lit edge along the foot, which is what ties it to
 * the glowing seams on the cases in the hall.
 *
 * The title wraps and steps its size down until it fits, rather than
 * being drawn on one line and cut off at the board's edge.
 */
function usePlaqueTexture(
  number: string,
  eyebrow: string,
  title: string,
  body: string,
  fontsReady: boolean,
) {
  const texture = useMemo(() => {
    const W = 768;
    const H = 972;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { book, display } = pageFonts();
    const track = (px: string) => {
      if ("letterSpacing" in ctx) ctx.letterSpacing = px;
    };

    // ground: warm near-black, lifted a little at the head
    const ground = ctx.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, "#1e150e");
    ground.addColorStop(0.55, "#140e09");
    ground.addColorStop(1, "#0d0906");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, W, H);

    // the grain of printed board, seeded so it never shifts between redraws
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,230,190,0.035)" : "rgba(0,0,0,0.12)";
      ctx.fillRect(rand() * W, rand() * H, 1.4, 1.4);
    }

    // the frame, ruled twice
    ctx.strokeStyle = "rgba(201,162,39,0.62)";
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.strokeStyle = "rgba(201,162,39,0.26)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(38, 38, W - 76, H - 76);

    ctx.strokeStyle = "rgba(201,162,39,0.7)";
    ctx.fillStyle = "rgba(201,162,39,0.7)";
    ctx.lineWidth = 1.6;
    cornerCurl(ctx, 48, 48, 1, 1);
    cornerCurl(ctx, W - 48, 48, -1, 1);
    cornerCurl(ctx, 48, H - 48, 1, -1);
    cornerCurl(ctx, W - 48, H - 48, -1, -1);

    const left = 96;
    const width = W - left * 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // catalogue mark
    ctx.fillStyle = "#b8924a";
    ctx.font = `500 21px ${book}`;
    track("7px");
    ctx.fillText(number.toUpperCase(), W / 2, 132);
    track("0px");

    // location line, in italic
    ctx.fillStyle = "#a98d5e";
    ctx.font = `italic 400 30px ${book}`;
    ctx.fillText(eyebrow, W / 2, 178);

    // title: the largest size at which it fits in two lines
    let size = 76;
    let titleLines: string[] = [];
    for (; size >= 40; size -= 4) {
      ctx.font = `400 ${size}px ${display}`;
      titleLines = wrapLines(ctx, title, width);
      if (titleLines.length <= 2) break;
    }
    ctx.fillStyle = "#efdfbd";
    ctx.shadowColor = "rgba(201,162,39,0.35)";
    ctx.shadowBlur = 14;
    let y = 178 + size * 1.15;
    for (const line of titleLines) {
      ctx.fillText(line, W / 2, y);
      y += size * 1.05;
    }
    ctx.shadowBlur = 0;

    // the fleuron rule
    y += 6;
    const rule = (x0: number, x1: number, fadeIn: boolean) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, fadeIn ? "rgba(201,162,39,0)" : "rgba(201,162,39,0.6)");
      g.addColorStop(1, fadeIn ? "rgba(201,162,39,0.6)" : "rgba(201,162,39,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x0, y - 9, x1 - x0, 1.6);
    };
    rule(left + 20, W / 2 - 36, true);
    rule(W / 2 + 36, W - left - 20, false);
    /*
      The ornament is drawn, not typed. A fleuron glyph depends on the
      face carrying it, and the Garamond served here is a Latin subset
      without one - it rendered as a missing-glyph box. A lozenge between
      two points is the printer's ornament it stood in for, and a shape
      cannot be missing.
    */
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.moveTo(W / 2, y - 21);
    ctx.lineTo(W / 2 + 11, y - 9);
    ctx.lineTo(W / 2, y + 3);
    ctx.lineTo(W / 2 - 11, y - 9);
    ctx.closePath();
    ctx.fill();
    for (const dx of [-22, 22]) {
      ctx.beginPath();
      ctx.arc(W / 2 + dx, y - 9, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // body, opening on a drop cap
    y += 60;
    ctx.textAlign = "left";
    const text = body.trim();
    if (text) {
      /*
        As large as it will go and still fit: the size is stepped down until
        every line is inside the frame, above the credit line, so the text
        is never cut short and never runs past its box.
      */
      const room = H - 150 - y;
      const capRoom = (size: number) => {
        ctx.font = `400 150px ${display}`;
        const cw = ctx.measureText(text[0]).width + 16;
        ctx.font = `400 ${size}px ${book}`;
        const words = text.slice(1).split(/\s+/).filter(Boolean);
        let n = 0;
        let line = "";
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (ctx.measureText(next).width > width - (n < 3 ? cw : 0) && line) {
            n += 1;
            line = word;
          } else {
            line = next;
          }
        }
        return (n + 1) * size * 1.42 <= room;
      };
      let bodySize = 44;
      while (bodySize > 28 && !capRoom(bodySize)) bodySize -= 2;
      const lead = bodySize * 1.42;
      /*
        Sized and set so its foot sits on the third line's baseline and
        its top meets the first line's cap height, which is how a drop
        cap is set in print. Placed any higher it floats in the margin.
      */
      const capSize = 150;
      ctx.font = `400 ${capSize}px ${display}`;
      const cap = text[0];
      const capW = ctx.measureText(cap).width + 16;
      ctx.fillStyle = "#c9a227";
      ctx.shadowColor = "rgba(201,162,39,0.4)";
      ctx.shadowBlur = 12;
      ctx.fillText(cap, left - 2, y + lead * 2 + 2);
      ctx.shadowBlur = 0;

      ctx.font = `400 ${bodySize}px ${book}`;
      ctx.fillStyle = "#d6c4a0";
      // the first three lines run beside the cap, the rest full width
      const words = text.slice(1).split(/\s+/).filter(Boolean);
      const limit = H - 150;
      let line = "";
      let n = 0;
      for (const word of words) {
        const indent = n < 3 ? capW : 0;
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > width - indent && line) {
          ctx.fillText(line, left + indent, y);
          y += lead;
          n += 1;
          line = word;
          if (y > limit) {
            line = "";
            break;
          }
        } else {
          line = next;
        }
      }
      if (line && y <= limit) ctx.fillText(line, left + (n < 3 ? capW : 0), y);
    }

    // the credit line a museum closes its panels with
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(169,141,94,0.85)";
    ctx.font = `italic 400 26px ${book}`;
    ctx.fillText("From the collection of Daksh Kumar", W / 2, H - 104);
    ctx.fillStyle = "rgba(201,162,39,0.45)";
    ctx.fillRect(W / 2 - 40, H - 90, 80, 1.4);

    // the one modern touch: a lit edge along the foot
    const edge = ctx.createLinearGradient(60, 0, W - 60, 0);
    edge.addColorStop(0, "rgba(255,214,140,0)");
    edge.addColorStop(0.5, "rgba(255,226,170,0.95)");
    edge.addColorStop(1, "rgba(255,214,140,0)");
    ctx.shadowColor = "rgba(255,182,63,0.9)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = edge;
    ctx.fillRect(60, H - 60, W - 120, 2.5);
    ctx.shadowBlur = 0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
    // fontsReady is listed on purpose: it redraws the board once the real
    // faces have arrived, replacing the Georgia fallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, eyebrow, title, body, fontsReady]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/** True once the page's web fonts have finished loading. */
function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/**
 * A free-standing reading board.
 *
 * The interpretive panel a museum stands on the floor between the
 * works, and built like one: a moulded cornice over the board, a
 * two-step surround, a slender bronze post with a collar where it meets
 * the board, and a plinth rather than a flat foot. The post carries a
 * lit seam, the same one the vitrine posts have, so the board belongs to
 * the same hall as the cases.
 *
 * Tilted back a little at the top, which is what a reading board does:
 * it squares the surface to someone standing in front of it.
 */
export function TextStand({
  position,
  rotation,
  scale = 1,
  exhibit,
  number,
  active,
  onSelect,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  /** Stood at a larger size in a deeper room, about its foot. */
  scale?: number;
  exhibit: ExhibitDatum;
  number: string;
  active: boolean;
  onSelect: () => void;
}) {
  const fontsReady = useFontsReady();
  const texture = usePlaqueTexture(
    number,
    exhibit.meta ?? "",
    exhibit.title,
    exhibit.body ?? "",
    fontsReady,
  );
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;
  /* the board's own light swells and settles: there is more to read */
  const breathe = usePulse(lit ? 0.62 : 0.42, 0.3);
  const breatheLip = usePulse(lit ? 4 : 2.2, 1.6);

  const W = 2.1;
  const H = 2.66;
  /** Where the bottom of the board sits above the floor. */
  const LIFT = 0.95;
  const TILT = -0.16;
  const POST = LIFT - 0.2;

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (consumedDrag()) return;
        onSelect();
      }}
    >
      {/* plinth: two steps, so the stand sits on something */}
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.82, 0.14, 0.56]} />
        <meshStandardMaterial color="#0d0b0a" roughness={0.62} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <boxGeometry args={[0.6, 0.07, 0.42]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.4}
          metalness={0.86}
          envMapIntensity={1.2}
        />
      </mesh>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 1.05]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* the post, with a lit seam up its face */}
      <mesh position={[0, 0.2 + POST / 2, 0]}>
        <boxGeometry args={[0.1, POST, 0.1]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.36}
          metalness={0.92}
          envMapIntensity={1.35}
        />
      </mesh>
      <mesh position={[0, 0.2 + POST / 2, 0.052]}>
        <boxGeometry args={[0.014, POST * 0.9, 0.006]} />
        <meshStandardMaterial
          color={GOLD.core}
          emissive={GOLD.core}
          emissiveIntensity={lit ? 3.2 : 1.8}
          toneMapped={false}
        />
      </mesh>
      {/* collar where the post meets the board */}
      <mesh position={[0, LIFT - 0.02, 0]}>
        <boxGeometry args={[0.26, 0.07, 0.16]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.34}
          metalness={0.92}
          envMapIntensity={1.4}
        />
      </mesh>

      <group position={[0, LIFT + H / 2, 0]} rotation={[TILT, 0, 0]}>
        {/* the surround, in two steps */}
        <mesh position={[0, 0, -0.05]}>
          <boxGeometry args={[W + 0.2, H + 0.2, 0.06]} />
          <meshStandardMaterial
            color={MID.bronze}
            roughness={0.4}
            metalness={0.86}
            envMapIntensity={1.25}
          />
        </mesh>
        <mesh position={[0, 0, -0.018]}>
          <boxGeometry args={[W + 0.08, H + 0.08, 0.03]} />
          <meshStandardMaterial color="#0f0b08" roughness={0.6} metalness={0.4} />
        </mesh>

        {/* the panel itself */}
        <mesh position={[0, 0, 0.001]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial
            ref={breathe}
            map={texture ?? undefined}
            emissiveMap={texture ?? undefined}
            emissive="#ffe9cc"
            emissiveIntensity={lit ? 0.62 : 0.42}
            roughness={0.72}
            toneMapped={false}
          />
        </mesh>

        {/* a moulded cornice over the board */}
        <mesh position={[0, H / 2 + 0.13, -0.02]}>
          <boxGeometry args={[W + 0.32, 0.07, 0.14]} />
          <meshStandardMaterial
            color={MID.bronze}
            roughness={0.36}
            metalness={0.9}
            envMapIntensity={1.4}
          />
        </mesh>
        <mesh position={[0, H / 2 + 0.185, -0.03]}>
          <boxGeometry args={[W + 0.42, 0.04, 0.18]} />
          <meshStandardMaterial
            color={MID.bronze}
            roughness={0.34}
            metalness={0.92}
            envMapIntensity={1.5}
          />
        </mesh>
        {/* the lip of the cornice, lit from beneath */}
        <mesh position={[0, H / 2 + 0.094, 0.05]}>
          <boxGeometry args={[W + 0.24, 0.014, 0.012]} />
          <meshStandardMaterial
            ref={breatheLip}
            color={GOLD.core}
            emissive={GOLD.core}
            emissiveIntensity={lit ? 4 : 2.2}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The art wall, hung as a salon: the posters in rows of four and three,
 * the narrower row centred under the wider the way a salon hang steps,
 * and the video thumbnails in a row of their own beneath them.
 *
 * Each frame is made to its piece (see HungPicture), so a poster of any
 * proportion is shown whole and the frame meets it exactly.
 */

export function ArtWall({
  door,
  items,
  activeId,
  onSelect,
}: {
  door: DoorSpec;
  items: ExhibitDatum[];
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const fallback = useMountTexture();
  const sgn = door.side === "left" ? -1 : 1;
  const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
  /* the project the work belongs to, for any piece that has no words of its own */
  const work = items[0] ?? null;

  /*
    Every frame opens its own piece. The positions, sizes and the order
    the pictures hang in are all set in roomLayout (ART_HANG), shared with
    the lights over the wall.
  */
  return (
    <group>
      {artHang(door).map((p) => {
        const exhibit = artPieces[p.src] ?? work;
        return (
          <HungPicture
            key={p.src}
            position={p.position}
            rotation={[0, yaw, 0]}
            exhibit={exhibit}
            active={Boolean(exhibit) && activeId === exhibit?.id}
            onSelect={() => exhibit && onSelect(exhibit)}
            src={p.src}
            fallback={fallback}
            size={p.size}
            caption={Boolean(p.hero)}
            glow={Boolean(p.hero)}
          />
        );
      })}
    </group>
  );
}

export function PortraitWall({
  door,
  items,
  activeId,
  onSelect,
  photos = PHOTO_FILES,
  bench = true,
}: {
  door: DoorSpec;
  items: ExhibitDatum[];
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
  /** Photographs to hang. Pass [] for frames waiting on their pictures. */
  photos?: (PhotoSpec | null)[];
  bench?: boolean;
}) {
  const fallback = useMountTexture();
  const sgn = door.side === "left" ? -1 : 1;
  const [, cz] = roomCenter(door);

  // three frames across the back wall, evenly spaced
  const picks = items.slice(0, 3);
  const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;

  // the plaques go in the gaps: whatever the room has after the pictures
  const plaques = items.slice(3, 5);

  /*
    Hung to the middle of the wall the camera is actually looking at, wide
    enough apart to put a reading stand between each pair. The positions
    come from roomLayout, shared with the lights and the camera.
  */
  const { frames, lecterns } = portraitSlots(door, picks.length, plaques.length);

  return (
    <group>
      {picks.map((exhibit, i) => {
        return (
          /* hung at the room's scale about the middle of the frame, so the light and the caption grow with it */
          <group key={exhibit.id} position={frames[i]} rotation={[0, yaw, 0]} scale={PORTRAIT_SCALE}>
            <HungPicture
              position={[0, 0, 0]}
              rotation={[0, 0, 0]}
              exhibit={exhibit}
              active={activeId === exhibit.id}
              onSelect={() => onSelect(exhibit)}
              src={photos[i]?.src ?? null}
              crop={photos[i]?.crop}
              fallback={fallback}
              tone="#c4c4c4"
              glow
            />
          </group>
        );
      })}

      {/*
        Reading boards on the floor, standing in the gaps between the
        pictures. Set a little out from the wall so they are objects in
        the room rather than more things stuck to it.
      */}
      {plaques.map((exhibit, i) => {
        return (
          <TextStand
            key={exhibit.id}
            number={`No. ${["I", "II", "III", "IV"][i] ?? i + 1}`}
            position={lecterns[i]}
            rotation={[0, yaw, 0]}
            scale={PORTRAIT_SCALE}
            exhibit={exhibit}
            active={activeId === exhibit.id}
            onSelect={() => onSelect(exhibit)}
          />
        );
      })}

      {/*
        A low bench, so the room reads as somewhere you stand and look.
        Set back far enough from the wall to be a real viewing distance
        now that the room has the depth for one.
      */}
      {bench ? (
        <mesh position={[backWallX(door) - sgn * 15, 0.26, cz]}>
          <boxGeometry args={[0.9, 0.52, 4.4]} />
          <meshStandardMaterial
            color={MID.plinth}
            roughness={0.5}
            metalness={0.3}
            envMapIntensity={0.9}
          />
        </mesh>
      ) : null}
    </group>
  );
}
