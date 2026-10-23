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
import { bakeSelfShadow, bakeStatueShadow, receiveStatueShadow, selfShadow, shadowOnTop } from "./statueShadow";
import { hasDebugFlag } from "./debug";
import { FACE_LINES, FACE_POINTS } from "./faceLines";

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
  The stone's surface, worked out from where each point is - the scan
  carries no texture coordinates - so it needs no image at all: value
  noise at a few scales gives the polish its variation, a faint vein runs
  through it, and a fine grain in the normal catches the light at a glance.

  The face, which is what a visitor looks at, is carved finer than the
  rest. The scan marks which points are the head (its _head attribute),
  and the places on it were found on a render of the model by face
  landmarks, in the model's own units (one unit tall, origin between the
  feet):
    - the hair, above a hairline that runs low at the back, cut in fine
      ridges that run front to back, as a carver chisels strands
    - stubble on the jaw and chin below the mouth, a stipple of tiny pits
    - each eye's iris cut as a fine ring and its pupil drilled, the way a
      classical carver gives a marble eye its gaze
    - the face a little glossier than the cloth
  Over the whole figure, tiny chips where the stone stands proudest (its
  convexity, carried in the vertex colour's alpha) and the faintest dust
  settled in the deepest hollows.

  How it is lit, beyond the lamps in the room:
    - its own shadow from the key light, under the brow, the nose, the
      lower lip and the chin, from a one-off bake (bakeSelfShadow); soft,
      and wider where it falls further from what casts it
    - a cool fill from the visitor's right, so the shadow side keeps a
      tone and is never black
    - a very soft light into the eye sockets from near the visitor's eye,
      a little low, so they are never empty pits
    - warm light along the edge of the shadow, where light passing into
      thin stone comes back out, and through the edges lit from behind
    - the lit plinth throwing a little light back up under the chin
*/
/** Where each line of the face starts in its texture and how many points it has, for the shader. */
const FACE_DEFINES = Object.entries(FACE_LINES)
  .map(([k, v]) => `#define F_${k.toUpperCase()} ${v.at}, ${v.n}`)
  .join("\n");

const MARBLE_FRAG_HEAD = /* glsl */ `
${FACE_DEFINES}
uniform vec3 uRimDir;
uniform vec3 uWarm;
uniform float uGlow;
uniform float uBounce;
uniform float uCeil;
uniform sampler2D uSelfShadowMap;
uniform mat4 uSelfShadowMatrix;
uniform vec2 uSelfShadowRange;
uniform float uSelfShadowTexel;
uniform float uSelfShadowWorldTexel;
uniform float uShowShadow;
uniform float uIndirect;
uniform float uKeyGain;
uniform float uExposure;
uniform float uSelfShadowOn;
uniform vec3 uKeyWorld;
uniform vec3 uRimWorld;
uniform float uOther;
uniform vec3 uKeyTint;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform float uFill;
uniform vec3 uEyeDir;
uniform float uEyeLight;
uniform float uWrap;
uniform vec3 uIrisR;
uniform vec3 uIrisL;
uniform vec3 uEyeAxis;
uniform vec3 uMouth;
uniform vec3 uChin;
uniform vec3 uDust;
uniform sampler2D uFace;
varying vec3 vMarbleWorld;
varying vec3 vMarbleLocal;
varying float vHead;
float mHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float mNoise( vec3 x ) {
	vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( mHash( i ), mHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( mHash( i + vec3( 0, 1, 0 ) ), mHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( mHash( i + vec3( 0, 0, 1 ) ), mHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( mHash( i + vec3( 0, 1, 1 ) ), mHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float mFbm( vec3 p ) { return 0.5 * mNoise( p ) + 0.25 * mNoise( p * 2.03 ) + 0.125 * mNoise( p * 4.01 ); }

const vec2 DISK[ 16 ] = vec2[ 16 ](
	vec2( -0.942, -0.399 ), vec2( 0.946, -0.769 ), vec2( -0.094, -0.929 ), vec2( 0.345, 0.294 ),
	vec2( -0.916, 0.458 ), vec2( -0.815, -0.879 ), vec2( -0.383, 0.277 ), vec2( 0.975, 0.756 ),
	vec2( 0.443, -0.975 ), vec2( 0.537, -0.474 ), vec2( -0.265, -0.419 ), vec2( 0.792, 0.191 ),
	vec2( -0.242, 0.997 ), vec2( -0.814, 0.914 ), vec2( 0.200, 0.786 ), vec2( 0.144, -0.141 )
);

/*
  How much of the key light reaches a point, from the bake: the point is
  moved a little off the surface along its normal (more where the light
  grazes it) so the stone never shadows itself in specks, then a search
  round it finds what lies between it and the lamp, and how far above:
  the further the caster, the wider the soft edge, from three texels where
  they touch to seven. Each sample further out is allowed
  to sit that much nearer the lamp before it counts, by the slope of the
  surface to the light: on a face turned steeply from a lamp overhead, the
  stone a few texels away really is nearer the lamp, and is not a shadow.
*/
float keyLight( vec3 p, vec3 n ) {
	if ( uSelfShadowOn < 0.5 ) return 1.0;
	vec3 L = normalize( uKeyWorld - p );
	float ndl = max( dot( n, L ), 0.08 );
	float slope = min( sqrt( 1.0 - ndl * ndl ) / ndl, 6.0 ) * uSelfShadowWorldTexel;
	vec3 q = p + n * 0.02 * ( 1.5 - ndl );
	vec4 c = uSelfShadowMatrix * vec4( q, 1.0 );
	if ( c.w <= 0.0 ) return 1.0;
	vec2 uv = c.xy / c.w * 0.5 + 0.5;
	if ( uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0 ) return 1.0;
	float range = uSelfShadowRange.y - uSelfShadowRange.x;
	float here = ( distance( q, uKeyWorld ) - uSelfShadowRange.x - 0.006 ) / range;
	float blockers = 0.0;
	float found = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		float d = texture2D( uSelfShadowMap, uv + DISK[ i ] * 7.0 * uSelfShadowTexel ).r;
		if ( d < here - slope * 6.0 * length( DISK[ i ] ) / range ) { blockers += d; found += 1.0; }
	}
	if ( found < 0.5 ) return 1.0;
	float gap = ( here - blockers / found ) * range;
	// never narrower than three texels: the scan's surface is bumpy at about one texel, and a narrower edge broke into specks there
	float texels = clamp( 3.0 + gap * 25.0, 3.0, 7.0 );
	float lit = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		float allow = slope * texels * length( DISK[ i ] ) / range;
		lit += texture2D( uSelfShadowMap, uv + DISK[ i ] * texels * uSelfShadowTexel ).r < here - allow ? 0.0 : 1.0;
	}
	return lit / 16.0;
}

vec3 facePt( int i ) { return texelFetch( uFace, ivec2( i, 0 ), 0 ).xyz; }

/* how far p is from a line of the face (n points from a), and which way, along the surface, is away from it */
float faceLine( vec3 p, int a, int n, out vec3 away ) {
	float best = 1e9;
	away = vec3( 0.0 );
	vec3 prev = facePt( a );
	for ( int i = 1; i < 16; i ++ ) {
		if ( i >= n ) break;
		vec3 cur = facePt( a + i );
		vec3 ab = cur - prev;
		float t = clamp( dot( p - prev, ab ) / max( dot( ab, ab ), 1e-12 ), 0.0, 1.0 );
		vec3 q = prev + t * ab;
		float d = length( p - q );
		if ( d < best ) { best = d; away = ( p - q ) / max( d, 1e-6 ); }
		prev = cur;
	}
	return best;
}

/*
  A carved line: a groove (depth above nought) or a ridge (below), of a
  given width, with the stone in a groove a little shaded, as carving holds
  shadow. Its slope tilts the surface's normal, so the light reads it.
*/
void carveLine( vec3 p, vec3 n, int a, int cnt, float depth, float width, float dark, inout vec3 carve, inout float shade ) {
	vec3 away;
	float d = faceLine( p, a, cnt, away );
	if ( d > width * 3.0 ) return;
	float x = d / width;
	float e = exp( - x * x );
	carve -= ( away - dot( away, n ) * n ) * ( 2.0 * depth / width ) * x * e;
	shade *= 1.0 - dark * e;
}

/* the slope a ring cut and a drilled pupil give the surface of an eye, along the eye's own face */
vec3 carveEye( vec3 p, vec3 centre, inout float shade ) {
	vec3 r = p - centre;
	vec3 across = r - dot( r, uEyeAxis ) * uEyeAxis;
	float d = length( across );
	if ( d > 0.007 ) return vec3( 0.0 );
	vec3 outward = across / max( d, 1e-5 );
	// a narrow groove round the iris
	float x = d - 0.0040;
	float tilt = - 2.0 * 0.32 * ( x / 0.0006 ) * exp( - x * x / ( 0.0006 * 0.0006 ) );
	// the pupil, a shallow bowl, shadowed in its depth
	if ( d < 0.0015 ) {
		tilt -= 0.4 * d / 0.0015;
		shade *= 0.74 + 0.26 * d / 0.0015;
	}
	return outward * tilt;
}
`;

/** The marble's brightest light before tone mapping: kept so no pixel of the statue goes past 0.95 on screen. */
const MARBLE_CEIL = { value: 0.8 };

/** The places on the face, in the model's own units, found on a render by face landmarks. */
const facePoint = (line: keyof typeof FACE_LINES, i = 0) => new THREE.Vector3(...FACE_POINTS[FACE_LINES[line].at + i]);
const FACE = {
  irisR: facePoint("irises", 0),
  irisL: facePoint("irises", 1),
  // the middle of the mouth's line
  mouth: facePoint("mouth", 5),
  chin: new THREE.Vector3(0.01109, 0.82978, 0.01658),
  // the head is bowed, so the face looks a little down
  eyeAxis: new THREE.Vector3(0, -0.283, 0.959).normalize(),
};

/** Every point of the face's lines, one texel each. */
const faceTexture = (() => {
  const width = 128;
  const data = new Float32Array(width * 4);
  FACE_POINTS.forEach((p, i) => data.set([p[0], p[1], p[2], 1], i * 4));
  const t = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
})();

/** The statue's lighting and carving, shared by every program the marble compiles into. */
const MARBLE_UNIFORMS = {
  uRimDir: { value: new THREE.Vector3(0, 0.6, -1).normalize() },
  uWarm: { value: new THREE.Color("#e8c882") },
  uGlow: { value: 0.05 },
  // the plinth's light under the chin: well under five percent of the key
  uBounce: { value: 0.03 },
  uCeil: MARBLE_CEIL,
  uKeyTint: { value: new THREE.Color("#ffcc78") },
  // the cool fill, from the visitor's right and a little above
  uFillDir: { value: new THREE.Vector3(1, 0.3, 1.1).normalize() },
  uFillColor: { value: new THREE.Color("#334455") },
  uFill: { value: 0.08 },
  // the light near the visitor's eye, a little below the statue's, into the eye sockets only: about 8% of the key there
  uEyeDir: { value: new THREE.Vector3(0, -0.2, 1).normalize() },
  uEyeLight: { value: 0.18 },
  uWrap: { value: 0.12 },
  uIrisR: { value: FACE.irisR },
  uIrisL: { value: FACE.irisL },
  uEyeAxis: { value: FACE.eyeAxis },
  uMouth: { value: FACE.mouth },
  uChin: { value: FACE.chin },
  uDust: { value: new THREE.Color("#6b5d4a") },
  uFace: { value: faceTexture },
  uShowShadow: { value: 0 },
  /*
    How much of the room's general light (its ambient, sky and floor
    bounce, and reflections) the statue takes. All of it filled every
    shadow on the face to within a stop and a half of the lit side; the
    statue's own fill does that job instead, in a cool tone, at about a
    quarter of the key.
  */
  uIndirect: { value: 0.14 },
  // the key on the stone, a little stronger than on the plinth and floor, so the face carries the light
  uKeyGain: { value: 1.7 },
  /*
    The hall's other lamps - the alcove's side lights, the nearest door's -
    reach the face too, from directions the key's shadow knows nothing
    about, and lit every shadow on it back up. The statue takes only a
    part of them; its key and its rim are its own.
  */
  uOther: { value: 0.04 },
  // the statue as a whole, brighter or darker, lit and shadowed sides together so its shading keeps
  uExposure: { value: 1.55 },
  ...selfShadow,
};
if (typeof window !== "undefined" && hasDebugFlag()) (window as unknown as { __marble?: typeof MARBLE_UNIFORMS }).__marble = MARBLE_UNIFORMS;

/* the key light's own term, picked out of the spotlight loop by where the light hangs, takes the statue's shadow */
const KEY_IN_LOOP = "\t\tgetSpotLightInfo( spotLight, geometryPosition, directLight );";

function shadeMarble(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, MARBLE_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `attribute float _head;
varying vec3 vMarbleWorld;
varying vec3 vMarbleLocal;
varying float vHead;
void main() {`)
    .replace("#include <project_vertex>", `#include <project_vertex>
	vMarbleWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vMarbleLocal = transformed;
	vHead = _head;`);
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
    KEY_IN_LOOP,
    `${KEY_IN_LOOP}\n\t\tif ( distance( spotLight.position, marbleKeyView ) < 0.05 ) directLight.color *= marbleKeyLit * uKeyGain;
		else if ( distance( spotLight.position, marbleRimView ) > 0.05 ) directLight.color *= uOther;`,
  );
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `${MARBLE_FRAG_HEAD}
void main() {`)
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
	vec3 lp = vMarbleLocal;
	// a faint vein, wandering through the block
	float veinWarp = mFbm( vMarbleWorld * 1.6 );
	float vein = 1.0 - smoothstep( 0.0, 0.07, abs( sin( ( vMarbleWorld.x * 0.9 + vMarbleWorld.y * 0.55 + veinWarp * 3.5 ) * 3.1 ) ) );
	diffuseColor.rgb *= 1.0 - 0.05 * vein;
	// the hair, above a hairline that runs low at the back of the head
	float hairLine = mix( 0.875, 0.936, smoothstep( -0.04, 0.03, lp.z ) );
	float hair = vHead * smoothstep( hairLine, hairLine + 0.006, lp.y );
	// the stubble: below the mouth to the chin, across the jaw, and never on the lips
	vec3 fromMouth = lp - uMouth;
	float stubble = vHead
		* smoothstep( - 0.003, - 0.007, fromMouth.y )
		* smoothstep( uChin.y - 0.005, uChin.y - 0.0005, lp.y )
		* ( 1.0 - smoothstep( 0.03, 0.046, abs( fromMouth.x ) ) )
		* smoothstep( - 0.07, - 0.04, fromMouth.z )
		* smoothstep( 0.006, 0.010, length( fromMouth.xy ) );
	// chips where the stone stands proudest, dust where it is deepest
	#ifdef USE_COLOR_ALPHA
	float proud = 1.0 - vColor.a;
	#else
	float proud = 0.0;
	#endif
	float chip = step( 0.86, mNoise( lp * 700.0 ) ) * smoothstep( 0.35, 0.75, proud );
	diffuseColor.rgb *= 1.0 - 0.1 * chip;
	float hollow = 1.0 - vColor.r;
	diffuseColor.rgb = mix( diffuseColor.rgb, uDust, 0.05 * smoothstep( 0.08, 0.3, hollow ) );
	// the eyes: the iris ring and the drilled pupil, and the pupil's shade
	float eyeShade = 1.0;
	vec3 eyeCut = vHead * ( carveEye( lp, uIrisR, eyeShade ) + carveEye( lp, uIrisL, eyeShade ) );
	diffuseColor.rgb *= mix( 1.0, eyeShade, vHead );`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
	float polish = mFbm( vMarbleWorld * 40.0 );
	// the face a little glossier than the cloth; the hair matte, as chiselled stone is
	roughnessFactor = mix( mix( 0.32, 0.5, polish ), mix( 0.28, 0.42, polish ), vHead );
	roughnessFactor = mix( roughnessFactor, 0.55, hair );
	roughnessFactor = min( 1.0, roughnessFactor + 0.15 * chip );`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
	vec3 grainAt = vMarbleWorld * 240.0;
	vec3 grain = vec3( mNoise( grainAt ), mNoise( grainAt + 17.3 ), mNoise( grainAt + 41.7 ) ) - 0.5;
	vec3 carve = grain * 0.022;
	// strands: fine ridges across the head, long from front to back
	vec3 strandAt = lp * vec3( 900.0, 900.0, 60.0 );
	carve += vec3( mNoise( strandAt ) - 0.5, mNoise( strandAt + 13.1 ) - 0.5, 0.0 ) * 0.3 * hair;
	// stubble: a stipple of tiny pits
	vec3 pitAt = floor( lp * 4200.0 );
	carve += ( vec3( mHash( pitAt ), mHash( pitAt + 7.7 ), mHash( pitAt + 3.3 ) ) - 0.5 ) * 0.07 * stubble * step( 0.55, mHash( pitAt + 1.9 ) );
	carve += ( grain * 0.6 ) * chip;
	carve += eyeCut;
	/*
	  The face, carved along its landmarks:
	    the line between the lips, deep and shadowed; the lips' edge a fine ridge;
	    the lid's edge and the crease above it; the line under the eye;
	    the folds from the nose past the mouth; the philtrum's two ridges;
	    the dimples; the nostrils, drilled and dark;
	    the brows a raised band of hair; the moustache and chin beard in strokes.
	*/
	float faceShade = 1.0;
	if ( vHead > 0.5 && distance( lp, uMouth ) < 0.09 ) {
		vec3 nL = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		carveLine( lp, nL, F_MOUTH, 0.00055, 0.00055, 0.45, carve, faceShade );
		carveLine( lp, nL, F_LIPUP, - 0.00018, 0.00045, 0.0, carve, faceShade );
		carveLine( lp, nL, F_LIPLO, - 0.00012, 0.0005, 0.0, carve, faceShade );
		// one soft line for each upper lid and a fainter one under the eye: more, this close together, read as scribble
		carveLine( lp, nL, F_LIDR, 0.00016, 0.0007, 0.22, carve, faceShade );
		carveLine( lp, nL, F_LIDL, 0.00016, 0.0007, 0.22, carve, faceShade );
		carveLine( lp, nL, F_LIDRLO, 0.00006, 0.0008, 0.08, carve, faceShade );
		carveLine( lp, nL, F_LIDLLO, 0.00006, 0.0008, 0.08, carve, faceShade );
		carveLine( lp, nL, F_NASOR, 0.0006, 0.0017, 0.14, carve, faceShade );
		carveLine( lp, nL, F_NASOL, 0.0006, 0.0017, 0.14, carve, faceShade );
		carveLine( lp, nL, F_PHILR, - 0.00025, 0.0009, 0.0, carve, faceShade );
		carveLine( lp, nL, F_PHILL, - 0.00025, 0.0009, 0.0, carve, faceShade );
		// dimples and nostrils are points: shallow pits, the nostrils drilled deeper and dark
		vec3 away;
		for ( int k = 0; k < 2; k ++ ) {
			vec3 dp = facePt( ${FACE_LINES.dimples.at} + k );
			float dd = length( lp - dp );
			float ed = exp( - dd * dd / ( 0.0016 * 0.0016 ) );
			vec3 out1 = ( lp - dp ) / max( dd, 1e-6 );
			carve -= ( out1 - dot( out1, nL ) * nL ) * ( 2.0 * 0.0005 / 0.0016 ) * ( dd / 0.0016 ) * ed;
			faceShade *= 1.0 - 0.16 * ed;
			vec3 np_ = facePt( ${FACE_LINES.nostrils.at} + k );
			float dn = length( lp - np_ );
			float en = exp( - dn * dn / ( 0.0019 * 0.0019 ) );
			vec3 out2 = ( lp - np_ ) / max( dn, 1e-6 );
			carve -= ( out2 - dot( out2, nL ) * nL ) * ( 2.0 * 0.0008 / 0.0019 ) * ( dn / 0.0019 ) * en;
			faceShade *= 1.0 - 0.45 * en;
		}
		// the brows: a raised band, its edge soft, and hair in fine strokes along it
		float browR = faceLine( lp, F_BROWR, away );
		float browL = faceLine( lp, F_BROWL, away );
		float browHalfR = facePt( ${FACE_LINES.browWR.at} ).x;
		float browHalfL = facePt( ${FACE_LINES.browWL.at} ).x;
		float brow = max( 1.0 - smoothstep( browHalfR * 0.75, browHalfR * 1.25, browR ), 1.0 - smoothstep( browHalfL * 0.75, browHalfL * 1.25, browL ) );
		carveLine( lp, nL, F_BROWR, - 0.00045, browHalfR, 0.0, carve, faceShade );
		carveLine( lp, nL, F_BROWL, - 0.00045, browHalfL, 0.0, carve, faceShade );
		vec3 hairAt = vec3( lp.x * 650.0, lp.y * 2600.0 + lp.x * 300.0 * sign( lp.x - uMouth.x ), lp.z * 2600.0 );
		carve += vec3( 0.0, mNoise( hairAt ) - 0.5, mNoise( hairAt + 5.3 ) - 0.5 ) * 0.5 * brow;
		// carved hair holds a little more shadow than smooth stone
		faceShade *= 1.0 - 0.14 * brow;
		// the moustache: between the nose and the upper lip, in short strokes falling outward
		float dLip = faceLine( lp, F_LIPUP, away );
		float dNose = faceLine( lp, F_NOSEBASE, away );
		float above = dot( lp - uMouth, vec3( 0.0, 0.959, 0.283 ) );
		float stache = ( 1.0 - smoothstep( 0.004, 0.007, dLip ) ) * ( 1.0 - smoothstep( 0.006, 0.011, dNose ) ) * smoothstep( 0.001, 0.003, above );
		vec3 stacheAt = vec3( lp.x * 2400.0, lp.y * 520.0 + abs( lp.x - uMouth.x ) * 900.0, lp.z * 2400.0 );
		carve += vec3( mNoise( stacheAt ) - 0.5, 0.0, mNoise( stacheAt + 2.7 ) - 0.5 ) * 0.4 * stache;
		faceShade *= 1.0 - 0.05 * stache;
		// the chin beard, thicker in the middle of the chin than along the jaw
		float goatee = stubble * ( 1.0 - smoothstep( 0.006, 0.016, abs( lp.x - uMouth.x ) ) );
		carve += ( grain * 0.6 ) * goatee;
		faceShade *= 1.0 - 0.03 * goatee;
	}
	diffuseColor.rgb *= faceShade;
	normal = normalize( normal + ( viewMatrix * vec4( carve, 0.0 ) ).xyz );`,
    )
    .replace(
      "#include <lights_fragment_begin>",
      `vec3 marbleNW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
	float marbleKeyLit = keyLight( vMarbleWorld, marbleNW );
	vec3 marbleKeyView = ( viewMatrix * vec4( uKeyWorld, 1.0 ) ).xyz;
	// the forehead just under the hair: the scan's hair stands out over it in a shelf whose shadow read as a
	// dark band, so most of the shadow there is lifted
	float browFill = vHead * smoothstep( 0.9, 0.922, lp.y ) * ( 1.0 - smoothstep( 0.952, 0.962, lp.y ) ) * smoothstep( 0.0, 0.03, lp.z );
	marbleKeyLit = mix( marbleKeyLit, 1.0, 0.6 * browFill );
	vec3 marbleRimView = ( viewMatrix * vec4( uRimWorld, 1.0 ) ).xyz;
${lights}`,
    )
    .replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
	reflectedLight.indirectDiffuse *= uIndirect;
	reflectedLight.indirectSpecular *= mix( 1.0, uIndirect, 0.5 );`,
    )
    .replace(
      "#include <opaque_fragment>",
      `{
		vec3 nW = marbleNW;
		vec3 toEye = normalize( cameraPosition - vMarbleWorld );
		float through = pow( clamp( dot( toEye, - normalize( uRimDir + nW * 0.35 ) ), 0.0, 1.0 ), 4.0 );
		float edge = pow( 1.0 - abs( dot( nW, toEye ) ), 2.0 );
		outgoingLight += uWarm * uGlow * through * ( 0.4 + 0.6 * edge );
		outgoingLight += uWarm * uBounce * clamp( - nW.y, 0.0, 1.0 ) * diffuseColor.rgb;
		// the fill keeps the shadow side in tone; the eye light reaches only the eye sockets
		outgoingLight += uFillColor * uFill * ( 0.5 + 0.5 * dot( nW, uFillDir ) ) * diffuseColor.rgb;
		float socket = vHead * ( 1.0 - smoothstep( 0.012, 0.026, min( distance( lp, uIrisR ), distance( lp, uIrisL ) ) ) );
		outgoingLight += uKeyTint * uEyeLight * socket * max( dot( nW, uEyeDir ), 0.0 ) * diffuseColor.rgb;
		// light coming back out of the stone just past the shadow's edge
		float nl = dot( nW, normalize( uKeyWorld - vMarbleWorld ) );
		float wrapBand = clamp( ( nl + 0.25 ) / 1.25, 0.0, 1.0 ) - clamp( nl, 0.0, 1.0 ) + ( 1.0 - marbleKeyLit ) * clamp( nl, 0.0, 1.0 ) * 0.25;
		outgoingLight += uKeyTint * uWrap * wrapBand * diffuseColor.rgb;
		outgoingLight *= uExposure;
		// a soft shoulder under the ceiling, so the brightest glint rolls off instead of clipping to white
		float peak = max( max( outgoingLight.r, outgoingLight.g ), outgoingLight.b );
		float knee = uCeil * 0.6;
		if ( peak > knee ) {
			float room = uCeil - knee;
			outgoingLight *= ( knee + room * ( 1.0 - exp( - ( peak - knee ) / room ) ) ) / peak;
		}
		// checking only (?debug): the key light's shadow on its own, white lit, black shadowed
		if ( uShowShadow > 0.5 ) outgoingLight = vec3( marbleKeyLit * 0.8 );
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
      clearcoat: 0.1,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.55,
      emissive: new THREE.Color("#ffd9a0"),
      /*
        The faintest light of its own, so the shadowed side is never dead
        black. It used to be several times this, which lit him evenly from
        within and flattened every fold; the key light (StatueLight in
        Corridor) is what carves him now.
      */
      emissiveIntensity: 0.03,
      // the open overshirt is a single sheet of stone, seen from both sides
      side: THREE.DoubleSide,
    });
    marbleMaterial.onBeforeCompile = shadeMarble;
    marbleMaterial.customProgramCacheKey = () => "marble2";
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
          // and its shadow on itself, under the brow, the nose and the chin
          bakeSelfShadow(gl, group);
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
