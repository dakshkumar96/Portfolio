import * as THREE from "three";
import { WALL_H, Z_FAR } from "./corridorLayout";

/*
  The statue's shadow, baked once.

  A real shadow map would mean switching shadows on for the renderer, and
  three then writes every lit material in the museum with shadow code in
  its light loop - the long form of it, which is what made the shaders so
  slow to compile (see lightPool). But the statue and the lamp on it never
  move, so its shadow never changes. It is drawn once, as the lamp sees
  the figure, when the figure has loaded: how far from the lamp the figure
  is at each point of that view, and the figure's outline blurred twice -
  a little and a lot. A surface behind the figure looks itself up in that
  view, and the further behind it is, the softer the shadow it takes, the
  way a real shadow's edge widens with distance. It costs one lookup on
  the few surfaces that can receive it, and nothing per frame.
*/

/** Where the statue stands down the hall. */
export const STATUE_Z = Z_FAR + 4.2;
/**
 * Its key light: in the ceiling over him, a little in front, the way the
 * rooms light their exhibits (see StatueLight in Corridor). Straight down
 * would leave his eyes in shadow, so it hangs a few steps toward the hall
 * and the light falls on his face at a gallery angle. His shadow drops
 * round his feet on the plinth top and a little behind him.
 */
export const STATUE_KEY: [number, number, number] = [0, WALL_H - 0.4, STATUE_Z + 2.8];
/** The gold rim light, high in the niche behind him (the plinth is 1.45 tall). */
export const STATUE_RIM: [number, number, number] = [0, 1.45 + 4.2, Z_FAR + 0.9];

const SIZE = 512;

const none = new THREE.DataTexture(new Uint8Array([0, 0, 255, 255]), 1, 1);
none.needsUpdate = true;

/** Shared by every surface that receives the shadow; filled in when the bake is done. */
const shared = {
  uStatueShadowMap: { value: none as THREE.Texture },
  uStatueShadowMatrix: { value: new THREE.Matrix4() },
  /** near and far of the depth range stored in the map's blue channel */
  uStatueShadowRange: { value: new THREE.Vector2(0, 1) },
  uStatueLight: { value: new THREE.Vector3(...STATUE_KEY) },
};

const VERT = /* glsl */ `
	vStatueShadowWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;

const FRAG = /* glsl */ `
	{
		vec4 sp = uStatueShadowMatrix * vec4( vStatueShadowWorld, 1.0 );
		if ( sp.w > 0.0 ) {
			vec2 suv = sp.xy / sp.w * 0.5 + 0.5;
			if ( suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0 ) {
				vec3 s = texture2D( uStatueShadowMap, suv ).rgb;
				float occluder = uStatueShadowRange.x + s.b * ( uStatueShadowRange.y - uStatueShadowRange.x );
				float behind = distance( vStatueShadowWorld, uStatueLight ) - occluder;
				if ( behind > 0.12 ) {
					// close behind the figure (the plinth under his feet) the edge is crisp; far behind (the wall) it is wide and faint
					float spread = smoothstep( 0.15, 3.2, behind );
					float dark = mix( s.r, s.g * 0.8, spread );
					outgoingLight *= 1.0 - uStatueShadowStrength * dark;
				}
			}
		}
	}
`;

/**
 * Makes a material take the statue's shadow, at `strength` (0 none, 1 black).
 * Keeps any onBeforeCompile the material already has. Safe to call again.
 */
export function receiveStatueShadow(material: THREE.Material, strength: number) {
  const m = material as THREE.Material & { userData: { statueShadow?: { value: number } } };
  if (m.userData.statueShadow) {
    m.userData.statueShadow.value = strength;
    return;
  }
  const own = { value: strength };
  m.userData.statueShadow = own;
  const before = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, shared, { uStatueShadowStrength: own });
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vStatueShadowWorld;\nvoid main() {")
      .replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform sampler2D uStatueShadowMap;\nuniform mat4 uStatueShadowMatrix;\nuniform vec2 uStatueShadowRange;\nuniform vec3 uStatueLight;\nuniform float uStatueShadowStrength;\nvarying vec3 vStatueShadowWorld;\nvoid main() {",
      )
      .replace("#include <opaque_fragment>", FRAG + "\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => key() + "|statueShadow";
  m.needsUpdate = true;
}

/** A blur along one axis, `r` pixels each side, repeated for a gaussian-like fall-off. */
function blur(src: Float32Array, r: number, passes: number) {
  let a = src;
  for (let p = 0; p < passes; p += 1) {
    for (const horizontal of [true, false]) {
      const out = new Float32Array(SIZE * SIZE);
      for (let line = 0; line < SIZE; line += 1) {
        let sum = 0;
        const at = (i: number) => (horizontal ? a[line * SIZE + i] : a[i * SIZE + line]);
        for (let i = -r; i <= r; i += 1) sum += at(Math.min(SIZE - 1, Math.max(0, i)));
        for (let i = 0; i < SIZE; i += 1) {
          out[horizontal ? line * SIZE + i : i * SIZE + line] = sum / (2 * r + 1);
          sum += at(Math.min(SIZE - 1, i + r + 1)) - at(Math.max(0, i - r));
        }
      }
      a = out;
    }
  }
  return a;
}

/** The nearest depth within `r` pixels: the soft edge of a shadow still knows how far its figure is. */
function spreadNearest(src: Float32Array, r: number) {
  let a = src;
  for (const horizontal of [true, false]) {
    const out = new Float32Array(SIZE * SIZE);
    for (let line = 0; line < SIZE; line += 1) {
      for (let i = 0; i < SIZE; i += 1) {
        let best = 1;
        for (let k = Math.max(0, i - r); k <= Math.min(SIZE - 1, i + r); k += 1) {
          const v = horizontal ? a[line * SIZE + k] : a[k * SIZE + line];
          if (v < best) best = v;
        }
        out[horizontal ? line * SIZE + i : i * SIZE + line] = best;
      }
    }
    a = out;
  }
  return a;
}

/**
 * Draws the figure as its key light sees it and stores the shadow. Call
 * once the figure is in the scene with its world matrices up to date.
 */
export function bakeStatueShadow(gl: THREE.WebGLRenderer, figure: THREE.Object3D) {
  figure.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(figure);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const light = new THREE.Vector3(...STATUE_KEY);
  const d = light.distanceTo(sphere.center);
  const cam = new THREE.PerspectiveCamera((2 * Math.atan((sphere.radius * 1.15) / d) * 180) / Math.PI, 1, Math.max(0.1, d - sphere.radius * 1.5), d + sphere.radius * 1.5);
  cam.position.copy(light);
  cam.lookAt(sphere.center);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();

  const near = d - sphere.radius * 1.2;
  const far = d + sphere.radius * 1.2;
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uLight: { value: light }, uNear: { value: near }, uFar: { value: far } },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: "uniform vec3 uLight; uniform float uNear; uniform float uFar; varying vec3 vW; void main() { gl_FragColor = vec4(clamp((distance(vW, uLight) - uNear) / (uFar - uNear), 0.0, 1.0), 1.0, 0.0, 1.0); }",
  });
  const stage = new THREE.Scene();
  figure.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const copy = new THREE.Mesh(mesh.geometry, material);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    copy.matrixWorld.copy(mesh.matrixWorld);
    stage.add(copy);
  });

  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.FloatType, depthBuffer: true });
  const previous = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();
  gl.setRenderTarget(target);
  gl.setClearColor(0x000000, 0);
  gl.clear();
  gl.render(stage, cam);
  const px = new Float32Array(SIZE * SIZE * 4);
  gl.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
  gl.setRenderTarget(previous);
  gl.setClearColor(clear, clearAlpha);
  target.dispose();
  material.dispose();

  const mask = new Float32Array(SIZE * SIZE);
  const depth = new Float32Array(SIZE * SIZE).fill(1);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    if (px[i * 4 + 1] > 0.5) {
      mask[i] = 1;
      depth[i] = px[i * 4];
    }
  }
  const crisp = blur(mask, 1, 2);
  const soft = blur(mask, 7, 3);
  const reach = spreadNearest(depth, 24);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    data[i * 4] = Math.round(crisp[i] * 255);
    data[i * 4 + 1] = Math.round(soft[i] * 255);
    data[i * 4 + 2] = Math.round(reach[i] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  shared.uStatueShadowMap.value = tex;
  shared.uStatueShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  shared.uStatueShadowRange.value.set(near, far);

  /** How dark the shadow is at a point in the room, read from the bake exactly as the receiving shaders read it. */
  const at = (p: THREE.Vector3) => {
    const q = p.clone().applyMatrix4(shared.uStatueShadowMatrix.value);
    if (q.x <= -1 || q.x >= 1 || q.y <= -1 || q.y >= 1) return 0;
    const i = (Math.floor((q.y * 0.5 + 0.5) * SIZE) * SIZE + Math.floor((q.x * 0.5 + 0.5) * SIZE)) * 4;
    const occluder = near + (data[i + 2] / 255) * (far - near);
    const behind = p.distanceTo(light) - occluder;
    if (behind <= 0.04) return 0;
    const spread = THREE.MathUtils.smoothstep(behind, 0.15, 3.2);
    return THREE.MathUtils.lerp(data[i] / 255, (data[i + 1] / 255) * 0.8, spread);
  };
  return { at };
}

/**
 * The shadow on a horizontal square of `span` metres each way round
 * `centre`, as a texture for a dark decal laid on it: the plinth's top,
 * where the figure's own shadow falls close behind its feet.
 */
export function shadowOnTop(bake: { at: (p: THREE.Vector3) => number }, centre: THREE.Vector3, span: number) {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const p = new THREE.Vector3();
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      // the decal lies flat, rotated -90 degrees about x: its texture's v runs toward -z
      p.set(centre.x + ((i + 0.5) / N - 0.5) * span * 2, centre.y, centre.z - ((j + 0.5) / N - 0.5) * span * 2);
      const v = Math.round(bake.at(p) * 255);
      data[(j * N + i) * 4] = data[(j * N + i) * 4 + 1] = data[(j * N + i) * 4 + 2] = v;
      data[(j * N + i) * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/*
  The statue's shadow on itself: under the brow, the nose, the lower lip
  and the chin, the arm across the chest.

  The same light, the same one-off bake, but kept sharp and detailed: the
  key light's view is fitted to the figure's bounds with a tenth to spare,
  drawn at 2048 (1024 on a phone), and the distance from the lamp stored
  as it is, unblurred. The marble's shader reads it itself and softens it
  there, wider where the shadow falls further from what casts it, the way
  a lamp of real size casts (see shadeMarble in Statue). Nothing is drawn
  again after the bake.
*/
const unlit = new THREE.DataTexture(new Float32Array([1, 1, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
unlit.needsUpdate = true;

/** Read by the marble; filled in by bakeSelfShadow. `on` stays 0 if the device cannot draw the bake. */
export const selfShadow = {
  uSelfShadowMap: { value: unlit as THREE.Texture },
  uSelfShadowMatrix: { value: new THREE.Matrix4() },
  uSelfShadowRange: { value: new THREE.Vector2(0, 1) },
  uSelfShadowTexel: { value: 1 / 2048 },
  /** how wide one of the bake's pixels is on the figure, in metres */
  uSelfShadowWorldTexel: { value: 0.002 },
  uSelfShadowOn: { value: 0 },
  uKeyWorld: { value: new THREE.Vector3(...STATUE_KEY) },
  uRimWorld: { value: new THREE.Vector3(...STATUE_RIM) },
};

let selfTarget: THREE.WebGLRenderTarget | null = null;

export function bakeSelfShadow(gl: THREE.WebGLRenderer, figure: THREE.Object3D) {
  if (!gl.capabilities.isWebGL2 || !gl.extensions.has("EXT_color_buffer_float")) return;
  const small = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const size = small ? 1024 : 2048;
  figure.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(figure);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const light = new THREE.Vector3(...STATUE_KEY);
  const d = light.distanceTo(sphere.center);
  // the figure's bounds and a tenth more, so the map's pixels are spent on the stone and nothing else
  const reach = sphere.radius * 1.1;
  const cam = new THREE.PerspectiveCamera((2 * Math.asin(Math.min(0.99, reach / d)) * 180) / Math.PI, 1, Math.max(0.1, d - reach), d + reach);
  cam.position.copy(light);
  cam.lookAt(sphere.center);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const near = d - reach;
  const far = d + reach;

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uLight: { value: light }, uNear: { value: near }, uFar: { value: far } },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: "uniform vec3 uLight; uniform float uNear; uniform float uFar; varying vec3 vW; void main() { gl_FragColor = vec4((distance(vW, uLight) - uNear) / (uFar - uNear), 0.0, 0.0, 1.0); }",
  });
  const stage = new THREE.Scene();
  figure.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const copy = new THREE.Mesh(mesh.geometry, material);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    copy.matrixWorld.copy(mesh.matrixWorld);
    stage.add(copy);
  });

  selfTarget?.dispose();
  selfTarget = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    format: THREE.RedFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const previous = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();
  gl.setRenderTarget(selfTarget);
  // nothing in the way reads as far beyond the figure
  gl.setClearColor(0xffffff, 1);
  gl.clear();
  gl.render(stage, cam);
  gl.setRenderTarget(previous);
  gl.setClearColor(clear, clearAlpha);
  material.dispose();

  selfShadow.uSelfShadowMap.value = selfTarget.texture;
  selfShadow.uSelfShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  selfShadow.uSelfShadowRange.value.set(near, far);
  selfShadow.uSelfShadowTexel.value = 1 / size;
  selfShadow.uSelfShadowWorldTexel.value = (2 * reach) / size;
  selfShadow.uSelfShadowOn.value = 1;
}
