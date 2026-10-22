"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBox } from "./roundedBox";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MID } from "./palette";
import { buildFigure } from "./figure";
import { gildedLettering } from "./inscriptions";
import { brushedMetalFor } from "./textures";
import { useThree } from "@react-three/fiber";
import { track } from "./preload";
import { bakeStatueShadow, receiveStatueShadow, shadowOnTop } from "./statueShadow";

/**
 * The statue at the end of the hall, on its plinth.
 *
 * The figure is carved from the shape of a man as he appears in his
 * photographs (see figure.ts), at about twice life size, in one block of
 * pale marble, with his name cut in the plinth under him.
 *
 * A likeness of a face cannot be made by hand from a few numbers, so the
 * figure that stands is /museum/statue.glb, a model made from his
 * photographs: the body from the London Tech Week photo, the head from a
 * close crop of the same photo, its proportions corrected toward his face
 * as measured across ten photographs, and joined at the collar. The model
 * is baked one unit tall with its origin between the feet. It takes the
 * same marble, so it reads as stone. If the file is missing, the carved
 * figure stands instead.
 *
 * In the photo his hand rests on a letter. The statue is re-posed to stand
 * on its own, the way the brief for it asks: a relaxed stance with both
 * arms hanging at his sides, one elbow a little bent, the torso turned
 * about ten degrees and the head inclined a few degrees back toward the
 * visitor. Each joint was turned about a pivot placed from the photo's
 * pose landmarks. Nothing in his hands, nothing to lean on.
 */

export const PLINTH_H = 1.45;
/** How tall the figure stands on the plinth: about twice life size. */
const FIGURE_H = 3.3;
const SCAN = "/museum/statue.glb";

/** Statuary marble, cooler than cream, so the warm lamp is what warms it. */
const MARBLE = "#d9d2c4";

/*
  The stone's surface, worked out from where each point is in the room -
  the scan carries no texture coordinates - so it needs no image at all:
  value noise at a few scales gives the polish its variation (rougher and
  glossier patches, about 2.5cm across), a faint vein drawn through it,
  and a fine grain in the normal that catches the light at a glance.

  Two touches of light that a lamp alone would not give real marble:
    - the edges lit from behind - ears, fingers, the rim of the sleeves -
      let a little warm light through, as thin stone does;
    - the lit plinth throws a little light back up under the chin, the
      arms and the trousers, never more than about six percent of the key.
*/
const MARBLE_FRAG_HEAD = /* glsl */ `
uniform vec3 uRimDir;
uniform vec3 uWarm;
uniform float uGlow;
uniform float uBounce;
uniform float uCeil;
varying vec3 vMarbleWorld;
float mHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float mNoise( vec3 x ) {
	vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( mHash( i ), mHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( mHash( i + vec3( 0, 1, 0 ) ), mHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( mHash( i + vec3( 0, 0, 1 ) ), mHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( mHash( i + vec3( 0, 1, 1 ) ), mHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float mFbm( vec3 p ) { return 0.5 * mNoise( p ) + 0.25 * mNoise( p * 2.03 ) + 0.125 * mNoise( p * 4.01 ); }
`;

/** The marble's brightest light before tone mapping: kept so no pixel of the statue goes past 0.95 on screen. */
const MARBLE_CEIL = { value: 0.82 };

function shadeMarble(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, {
    uRimDir: { value: new THREE.Vector3(0, 0.6, -1).normalize() },
    uWarm: { value: new THREE.Color("#e8c882") },
    uGlow: { value: 0.05 },
    uBounce: { value: 0.035 },
    uCeil: MARBLE_CEIL,
  });
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `varying vec3 vMarbleWorld;
void main() {`)
    .replace("#include <project_vertex>", `#include <project_vertex>
	vMarbleWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `${MARBLE_FRAG_HEAD}
void main() {`)
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
	// a faint vein, wandering through the block
	float veinWarp = mFbm( vMarbleWorld * 1.6 );
	float vein = 1.0 - smoothstep( 0.0, 0.07, abs( sin( ( vMarbleWorld.x * 0.9 + vMarbleWorld.y * 0.55 + veinWarp * 3.5 ) * 3.1 ) ) );
	diffuseColor.rgb *= 1.0 - 0.06 * vein;`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
	roughnessFactor = mix( 0.32, 0.5, mFbm( vMarbleWorld * 40.0 ) );`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
	vec3 grainAt = vMarbleWorld * 240.0;
	vec3 grain = vec3( mNoise( grainAt ), mNoise( grainAt + 17.3 ), mNoise( grainAt + 41.7 ) ) - 0.5;
	normal = normalize( normal + ( viewMatrix * vec4( grain, 0.0 ) ).xyz * 0.022 );`,
    )
    .replace(
      "#include <opaque_fragment>",
      `{
		vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		vec3 toEye = normalize( cameraPosition - vMarbleWorld );
		float through = pow( clamp( dot( toEye, - normalize( uRimDir + nW * 0.35 ) ), 0.0, 1.0 ), 4.0 );
		float edge = pow( 1.0 - abs( dot( nW, toEye ) ), 2.0 );
		outgoingLight += uWarm * uGlow * through * ( 0.4 + 0.6 * edge );
		outgoingLight += uWarm * uBounce * clamp( - nW.y, 0.0, 1.0 ) * diffuseColor.rgb;
		// a soft shoulder under the ceiling, so the brightest glint rolls off instead of clipping to white
		float peak = max( max( outgoingLight.r, outgoingLight.g ), outgoingLight.b );
		float knee = uCeil * 0.6;
		if ( peak > knee ) {
			float room = uCeil - knee;
			outgoingLight *= ( knee + room * ( 1.0 - exp( - ( peak - knee ) / room ) ) ) / peak;
		}
	}
	#include <opaque_fragment>`,
    );
}

let marbleMaterial: THREE.MeshPhysicalMaterial | null = null;
/** Statuary marble: pale and a little cool, honed rather than polished, with a whisper of clearcoat. */
export function marble() {
  if (!marbleMaterial) {
    marbleMaterial = new THREE.MeshPhysicalMaterial({
      color: MARBLE,
      // the folds' occlusion, baked into the scan as vertex colour
      vertexColors: true,
      roughness: 0.4,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.55,
      emissive: new THREE.Color("#ffd9a0"),
      /*
        The faintest light of its own, so the shadowed side is never dead
        black. It used to be several times this, which lit him evenly from
        within and flattened every fold; the key light from the side
        (StatueLight in Corridor) is what carves him now.
      */
      emissiveIntensity: 0.03,
      // the open overshirt is a single sheet of stone, seen from both sides
      side: THREE.DoubleSide,
    });
    marbleMaterial.onBeforeCompile = shadeMarble;
    marbleMaterial.customProgramCacheKey = () => "marble";
  }
  return marbleMaterial;
}

/** The carved figure, scaled to its height on the plinth. */
function Carved() {
  const geometry = useMemo(() => {
    const g = buildFigure();
    g.computeBoundingBox();
    const h = g.boundingBox ? g.boundingBox.max.y - g.boundingBox.min.y : 1.8;
    const k = FIGURE_H / h;
    g.scale(k, k, k);
    g.translate(0, -(g.boundingBox?.min.y ?? 0) * k, 0);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={marble()} castShadow receiveShadow dispose={null} />;
}

/**
 * Gives every vertex a normal that has a direction.
 *
 * Where the jacket is a single sheet of stone seen from both sides, a
 * vertex is shared by faces pointing opposite ways, their normals cancel
 * and it is left with one of zero length. A triangle made only of such
 * vertices lights as NaN - a division by zero - and one such pixel was
 * enough for the bloom to turn the whole screen white whenever the statue
 * was in view (see shaderGuard). Each takes the normal of a face it
 * belongs to instead. Returns how many were mended.
 */
function mendNormals(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  if (!pos || !nor) return 0;
  const broken = new Set<number>();
  for (let i = 0; i < nor.count; i += 1) {
    const x = nor.getX(i);
    const y = nor.getY(i);
    const z = nor.getZ(i);
    const len = x * x + y * y + z * z;
    if (!(len > 1e-12) || !Number.isFinite(len)) broken.add(i);
  }
  if (broken.size === 0) return 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = new THREE.Vector3();
  const mended = new Set<number>();
  const fix = (i0: number, i1: number, i2: number) => {
    if (!broken.has(i0) && !broken.has(i1) && !broken.has(i2)) return;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    face.subVectors(c, b).cross(a.sub(b));
    if (face.lengthSq() < 1e-20) return;
    face.normalize();
    for (const i of [i0, i1, i2]) {
      if (broken.has(i) && !mended.has(i)) {
        nor.setXYZ(i, face.x, face.y, face.z);
        mended.add(i);
      }
    }
  };
  const index = geometry.getIndex();
  if (index) for (let t = 0; t + 2 < index.count; t += 3) fix(index.getX(t), index.getX(t + 1), index.getX(t + 2));
  else for (let t = 0; t + 2 < pos.count; t += 3) fix(t, t + 1, t + 2);
  // a vertex on no real face at all is never drawn; it still gets a direction
  broken.forEach((i) => {
    if (!mended.has(i)) nor.setXYZ(i, 0, 1, 0);
  });
  nor.needsUpdate = true;
  return broken.size;
}


/**
 * A scan, if one has been saved: looked for once, and loaded only if it
 * is there, so a missing file costs one small request and nothing else.
 * The loading screen waits for it (preload.ts), so the statue, its shadow
 * and its contact with the plinth are all there when the doors open.
 */
function useScan() {
  const [scan, setScan] = useState<{ root: THREE.Object3D; feet: THREE.Texture | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const job = fetch(SCAN, { method: "HEAD" }).then(
      (r) =>
        new Promise<void>((resolve) => {
          if (!r.ok || !alive) return resolve();
          new GLTFLoader().load(
            SCAN,
            (gltf) => {
              if (!alive) return resolve();
              const root = gltf.scene;
              // the model is baked with its origin between the feet: scale it to the figure's height and stand its soles on the plinth
              const box = new THREE.Box3().setFromObject(root);
              const size = box.getSize(new THREE.Vector3());
              const k = size.y > 0 ? FIGURE_H / size.y : 1;
              root.scale.setScalar(k);
              root.position.set(0, -box.min.y * k, 0);
              let feet: THREE.Texture | null = null;
              root.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh) {
                  mendNormals(m.geometry);
                  m.material = marble();
                  feet ??= footprint(m.geometry, box.min.y, k);
                }
              });
              setScan({ root, feet });
              resolve();
            },
            undefined,
            () => resolve(),
          );
        }),
    );
    void track(job.catch(() => {}));
    return () => {
      alive = false;
    };
  }, []);
  return scan;
}

/** How much of the plinth's cap the contact shadow covers, each way from the middle (m). */
const FOOT_SPAN = 1.0;

/**
 * Where the soles meet the stone, as a soft dark mark: every point of the
 * figure within a hand's breadth of the plinth, seen from above, blurred.
 * It sits on the cap under the feet, where a real figure crowds out the
 * light that reaches the stone, so the statue stands on it and not over it.
 */
function footprint(geometry: THREE.BufferGeometry, baseY: number, k: number) {
  const pos = geometry.getAttribute("position");
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  const scale = S / (FOOT_SPAN * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const lift = (pos.getY(i) - baseY) * k;
    if (lift > 0.09) continue;
    const x = (pos.getX(i) * k + FOOT_SPAN) * scale;
    const y = (pos.getZ(i) * k + FOOT_SPAN) * scale;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // blurred into a soft pool round the soles
  const soft = document.createElement("canvas");
  soft.width = soft.height = S;
  const sctx = soft.getContext("2d");
  if (!sctx) return null;
  sctx.filter = "blur(5px)";
  sctx.drawImage(canvas, 0, 0);
  const tex = new THREE.CanvasTexture(soft);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** The plaque on the face of the plinth, as wide as it can be within the die's margins. */
const PLAQUE_W = 1.5;
const PLAQUE_H = 0.4;
const PLAQUE_Y = 0.18 + (PLINTH_H - 0.5) / 2;
/** The die's front face. */
const FACE_Z = 0.85;
/** How far the cast plate stands proud of the stone. */
const PLATE_D = 0.018;

/**
 * His name on the plinth: a cast bronze plaque screwed to the stone.
 *
 * A dark, brushed plate with a raised border, the letters standing up out
 * of it in polished bronze, and a screw at each corner. The letters are
 * lit by the room, not by themselves: each one carries a fine shadow below
 * and to the right, cast on the plate, which is what makes raised lettering
 * read as raised. They keep only a trace of glow, enough to be read from
 * down the hall in a dim alcove.
 */
function Name() {
  const tex = useMemo(() => gildedLettering("DAKSH KUMAR", { width: 1024, height: 256, cap: 112, tracking: 0.3 }), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const brushed = useMemo(() => brushedMetalFor(2.5, 0.7), []);
  const front = PLATE_D / 2;
  const border = 0.024;
  const inset = 0.03;
  const trim = (
    <meshStandardMaterial color={MID.bronze} roughness={0.3} metalness={0.95} envMapIntensity={1.2} />
  );
  return (
    <group position={[0, PLAQUE_Y, FACE_Z + front]}>
      {/* the plate: patinated bronze, brushed along its length, its edges eased */}
      <RoundedBox args={[PLAQUE_W, PLAQUE_H, PLATE_D]} radius={0.006} smoothness={2}>
        <meshStandardMaterial
          color="#5a4330"
          map={brushed?.map ?? null}
          roughnessMap={brushed?.roughnessMap ?? null}
          normalMap={brushed?.normalMap ?? null}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          roughness={0.55}
          metalness={0.85}
          envMapIntensity={0.9}
        />
      </RoundedBox>
      {/* the raised border, cast with the plate */}
      {[
        [0, PLAQUE_H / 2 - inset, PLAQUE_W - inset * 2 + border, border],
        [0, -PLAQUE_H / 2 + inset, PLAQUE_W - inset * 2 + border, border],
        [-PLAQUE_W / 2 + inset, 0, border, PLAQUE_H - inset * 2 + border],
        [PLAQUE_W / 2 - inset, 0, border, PLAQUE_H - inset * 2 + border],
      ].map(([x, y, w, h], i) => (
        <RoundedBox key={i} args={[w, h, 0.008]} radius={0.003} smoothness={2} position={[x, y, front + 0.003]}>
          {trim}
        </RoundedBox>
      ))}
      {/* a screw in each corner */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <mesh
            key={`${sx}${sy}`}
            position={[sx * (PLAQUE_W / 2 - inset / 2 + 0.002), sy * (PLAQUE_H / 2 - inset / 2 + 0.002), front]}
            scale={[1, 1, 0.45]}
          >
            <sphereGeometry args={[0.0085, 12, 8]} />
            {trim}
          </mesh>
        )),
      )}
      {/* the letters' shadow on the plate, just below and to the right */}
      <mesh position={[0.004, -0.005, front + 0.001]}>
        <planeGeometry args={[PLAQUE_W * 0.86, PLAQUE_H * 0.86]} />
        <meshBasicMaterial color="#000000" alphaMap={tex} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {/* the letters, standing up out of the plate */}
      <mesh position={[0, 0, front + 0.004]}>
        <planeGeometry args={[PLAQUE_W * 0.86, PLAQUE_H * 0.86]} />
        <meshStandardMaterial
          map={tex}
          alphaTest={0.35}
          roughness={0.26}
          metalness={0.9}
          envMapIntensity={1.5}
          emissive="#c8944a"
          emissiveMap={tex}
          emissiveIntensity={0.28}
        />
      </mesh>
    </group>
  );
}

/*
  The plinth's stone: a honed limestone, warm cream, made in the shader
  from where each point is in the world, the way the statue's marble is,
  so every face has its own veins and grain with no tile or seam and no
  two faces alike.

    - colour that clouds slowly across a block, as quarried stone does
    - two families of veins, a few soft wide ones and finer thin ones,
      wandering rather than straight
    - a fine grain of lighter and darker specks, and the same grain as
      relief, so the surface catches the light instead of looking printed
    - on the cap, the faintest dust on its upper face, paler and less
      glossy where nothing has wiped it
*/
const STONE_HEAD = /* glsl */ `
varying vec3 vStoneWorld;
float sHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float sNoise( vec3 x ) {
	vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( sHash( i ), sHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( sHash( i + vec3( 0, 1, 0 ) ), sHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( sHash( i + vec3( 0, 0, 1 ) ), sHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( sHash( i + vec3( 0, 1, 1 ) ), sHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float sFbm( vec3 p ) { return 0.5 * sNoise( p ) + 0.25 * sNoise( p * 2.03 ) + 0.125 * sNoise( p * 4.01 ) + 0.0625 * sNoise( p * 8.03 ); }
`;

const CAP_DUST = /* glsl */ `
	vec3 capFacing = normalize( cross( dFdx( vStoneWorld ), dFdy( vStoneWorld ) ) );
	float dust = smoothstep( 0.85, 0.98, abs( capFacing.y ) ) * ( 0.6 + 0.4 * sHash( floor( vStoneWorld * 160.0 ) ) ) * 0.05;
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.72, 0.68, 0.6 ), dust );
	roughnessFactor = mix( roughnessFactor, 0.9, dust * 6.0 );`;

function stone(material: THREE.MeshStandardMaterial, cap: boolean) {
  if (material.userData.stone) return;
  material.userData.stone = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `varying vec3 vStoneWorld;
void main() {`)
      .replace("#include <project_vertex>", `#include <project_vertex>
	vStoneWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${STONE_HEAD}
void main() {`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
	vec3 sp = vStoneWorld;
	float cloud = sFbm( sp * 1.4 );
	float warp = sFbm( sp * 0.8 + 11.0 );
	float wide = 1.0 - smoothstep( 0.0, 0.16, abs( sin( ( sp.x * 0.9 + sp.y * 1.6 - sp.z * 0.5 + warp * 4.2 ) * 2.4 ) ) );
	float thin = 1.0 - smoothstep( 0.0, 0.07, abs( sin( ( - sp.x * 0.6 + sp.y * 2.1 + sp.z * 1.1 + warp * 3.1 ) * 4.3 ) ) );
	thin *= smoothstep( 0.35, 0.65, sNoise( sp * 2.2 + 3.0 ) );
	float speck = sHash( floor( sp * 260.0 ) );
	vec3 stoneColour = diffuseColor.rgb * ( 0.88 + 0.24 * cloud );
	stoneColour = mix( stoneColour, stoneColour * vec3( 0.8, 0.76, 0.72 ), wide * 0.35 + thin * 0.18 );
	stoneColour *= 0.965 + 0.07 * speck;
	diffuseColor.rgb = stoneColour;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
	roughnessFactor *= 0.9 + 0.2 * cloud + 0.15 * thin;${cap ? CAP_DUST : ""}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
	vec3 pitAt = vStoneWorld * 140.0;
	vec3 pit = vec3( sNoise( pitAt ), sNoise( pitAt + 19.1 ), sNoise( pitAt + 37.7 ) ) - 0.5;
	normal = normalize( normal + ( viewMatrix * vec4( pit, 0.0 ) ).xyz * ${cap ? "0.03" : "0.07"} );`,
      );
  };
  material.customProgramCacheKey = () => `plinthStone${cap ? "Cap" : ""}`;
}

/** Plinth stone: honed limestone, the cap a little more polished than the die, worn soft at its edges. */
function PlinthStone({ polish = false }: { polish?: boolean }) {
  return (
    <meshStandardMaterial
      ref={(m: THREE.MeshStandardMaterial | null) => {
        if (!m) return;
        stone(m, polish);
        // the cap's top takes the figure's shadow as a decal (see Statue); the faces below take it here
        if (!polish) receiveStatueShadow(m, 0.65);
      }}
      color="#b3a58b"
      roughness={polish ? 0.36 : 0.7}
      metalness={0}
      envMapIntensity={polish ? 0.75 : 0.45}
    />
  );
}

let streak: THREE.Texture | null = null;
/** The floor's faint reflection of the lit figure: a soft band, strongest at the plinth's foot. */
function reflectionStreak() {
  if (streak) return streak;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(64, 256);
  for (let y = 0; y < 256; y += 1) {
    // the canvas's top row is the plinth end
    const along = Math.pow(1 - y / 255, 1.6);
    for (let x = 0; x < 64; x += 1) {
      const u = (x / 63) * 2 - 1;
      const v = along * Math.exp(-u * u * 3.2);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  streak = new THREE.CanvasTexture(c);
  streak.colorSpace = THREE.NoColorSpace;
  return streak;
}

export function Statue({ position }: { position: [number, number, number] }) {
  const scan = useScan();
  const gl = useThree((s) => s.gl);
  const figure = useRef<THREE.Group>(null);
  const glint = useMemo(() => reflectionStreak(), []);
  const [topShadow, setTopShadow] = useState<THREE.Texture | null>(null);

  /*
    Once the figure stands in the scene, its shadow is drawn once, from the
    key light (statueShadow), behind the veil: the loading screen waits for
    this too.
  */
  useEffect(() => {
    if (!scan) return;
    let finish = () => {};
    void track(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const group = figure.current;
        if (group) {
          const bake = bakeStatueShadow(gl, group);
          const top = group.getWorldPosition(new THREE.Vector3());
          setTopShadow(shadowOnTop(bake, top, FOOT_SPAN));
        }
        finish();
      }),
    );
    return () => {
      cancelAnimationFrame(id);
      finish();
    };
  }, [scan, gl]);

  return (
    <group position={position}>
      {/* the plinth: a stepped base, a die, and a cap, their edges worn round */}
      <RoundedBox args={[2.1, 0.18, 2.1]} radius={0.04} smoothness={3} position={[0, 0.09, 0]}>
        <PlinthStone />
      </RoundedBox>
      <RoundedBox args={[1.7, PLINTH_H - 0.5, 1.7]} radius={0.04} smoothness={3} position={[0, 0.18 + (PLINTH_H - 0.5) / 2, 0]}>
        <PlinthStone />
      </RoundedBox>
      <RoundedBox args={[1.95, 0.22, 1.95]} radius={0.045} smoothness={3} position={[0, PLINTH_H - 0.11, 0]}>
        <PlinthStone polish />
      </RoundedBox>
      {/* a fine bronze band under the cap */}
      <mesh position={[0, PLINTH_H - 0.29, 0]}>
        <boxGeometry args={[1.76, 0.035, 1.76]} />
        <meshStandardMaterial color={MID.bronze} roughness={0.38} metalness={0.9} envMapIntensity={1.1} />
      </mesh>
      <Name />
      {scan?.feet ? (
        <mesh position={[0, PLINTH_H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[FOOT_SPAN * 2, FOOT_SPAN * 2]} />
          <meshBasicMaterial color="#000000" alphaMap={scan.feet} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      ) : null}
      {/* the figure's shadow across the cap behind its feet, read from the same bake */}
      {topShadow ? (
        <mesh position={[0, PLINTH_H + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[FOOT_SPAN * 2, FOOT_SPAN * 2]} />
          <meshBasicMaterial color="#000000" alphaMap={topShadow} transparent opacity={0.78} depthWrite={false} />
        </mesh>
      ) : null}
      {/* the floor's faint reflection of the figure and its pool, running toward the visitor from the plinth's foot */}
      <mesh position={[0, 0.012, 1.05 + 2.4]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1.7, 4.8]} />
        <meshBasicMaterial
          color="#e8d6b4"
          map={glint ?? undefined}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <group ref={figure} position={[0, PLINTH_H, 0]}>
        {scan ? <primitive object={scan.root} /> : <Carved />}
      </group>
    </group>
  );
}
