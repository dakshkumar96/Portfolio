import * as THREE from "three";

/*
  No pixel may leave a material as something that is not a number.

  A shader that divides by zero - a normal of zero length is the usual
  way, and the statue had a few, where its jacket is a single sheet of
  stone seen from both sides and the two sides' normals cancel - writes
  NaN, "not a number", into that pixel. On its own that is one wrong
  pixel. But the bloom blurs the frame by halving it again and again,
  averaging as it goes, and an average with NaN in it is NaN: one such
  pixel survives every halving down to a single pixel, and is then
  spread back over the whole screen. The whole museum went white, for as
  long as that pixel was in view.

  So every material checks its own result as the very last thing it
  does: a pixel that is not a number, or is absurdly bright, is written
  black instead. A real colour is never touched - nothing in the museum
  comes within a hundred times of the limit - so this changes no
  picture; it only stops a broken pixel from taking the screen with it.
*/

/** The brightest a pixel may be. The brightest real one, a lamp's highlight, is under ten. */
const LIMIT = "1024.0";

/** GLSL for the end of a fragment shader that writes gl_FragColor. */
export const SAFE_FRAGMENT = `
	{
		// SAFE_FRAGMENT: a pixel that is not a number never reaches the bloom
		vec4 safeIn = gl_FragColor;
		bvec4 safeOk = lessThanEqual( abs( safeIn ), vec4( ${LIMIT} ) );
		gl_FragColor = vec4(
			( safeOk.r && safeOk.g && safeOk.b ) ? clamp( safeIn.rgb, 0.0, ${LIMIT} ) : vec3( 0.0 ),
			safeOk.a ? clamp( safeIn.a, 0.0, 1.0 ) : 1.0
		);
	}
`;

/*
  The fog chunk is the one every built-in material includes near its end,
  lit or not, after its colour is final; what follows it (premultiplied
  alpha, dithering) cannot turn a number into NaN.
*/
if (!THREE.ShaderChunk.fog_fragment.includes("SAFE_FRAGMENT")) {
  THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment + SAFE_FRAGMENT;
}

/*
  And no normal of zero length is ever normalised. Where the normals at a
  triangle's corners point opposite ways - a fold in a scanned surface,
  the statue's single sheet of jacket - the normal blended between them
  passes through zero somewhere inside it, and normalising that divides
  by zero: a black speck, now that such pixels are caught above. There,
  and only there, the surface's own facing (from the screen-space slope
  of its position) is used instead. Everywhere else the line is the same
  as three's.
*/
const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);
/** A line of GLSL at a given depth of indentation. */
const at = (depth: number, line: string) => TAB.repeat(depth) + line;
const SMOOTH_NORMAL = [at(1, "vec3 normal = normalize( vNormal );"), at(1, "#ifdef DOUBLE_SIDED"), at(2, "normal *= faceDirection;"), at(1, "#endif")].join(NL);
const SAFE_NORMAL = [
  at(1, "vec3 safeFacing = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );"),
  at(1, "vec3 normal = vNormal;"),
  at(1, "// SAFE_NORMAL: a blended normal of no length takes the surface's own facing"),
  at(1, "if ( dot( normal, normal ) > 1e-12 ) {"),
  at(2, "normal = normalize( normal );"),
  at(2, "#ifdef DOUBLE_SIDED"),
  at(3, "normal *= faceDirection;"),
  at(2, "#endif"),
  at(1, "} else {"),
  at(2, "normal = safeFacing;"),
  at(1, "}"),
].join(NL);
if (THREE.ShaderChunk.normal_fragment_begin.includes(SMOOTH_NORMAL)) {
  THREE.ShaderChunk.normal_fragment_begin = THREE.ShaderChunk.normal_fragment_begin.replace(SMOOTH_NORMAL, SAFE_NORMAL);
}
