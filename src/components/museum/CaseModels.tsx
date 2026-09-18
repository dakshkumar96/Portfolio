"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GOLD, MID } from "./palette";

/**
 * What stands inside each corridor case.
 *
 * Most are scanned or authored glTF models under /public/models, kept in
 * their own materials so they read as the real object. Only the Claude
 * mark is built in code, because no model was supplied for it.
 */

/**
 * Presentation motion for a piece in a case.
 *
 * Full rotation suits a solid object, but a flat one — a phone, a tablet,
 * a laptop lid — turns edge-on twice a revolution and briefly reads as a
 * floating sliver. `sweep` keeps those to an oscillation either side of
 * front-facing, so the object is always legible, which is how a real
 * display turntable for a flat product is set up.
 */
function Turntable({
  children,
  speed = 0.22,
  sweep = 0,
}: {
  children: React.ReactNode;
  speed?: number;
  /** if set, oscillate +/- this many radians instead of rotating fully */
  sweep?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    if (sweep > 0) {
      g.rotation.y = Math.sin(state.clock.elapsedTime * speed) * sweep;
    } else {
      g.rotation.y += delta * speed;
    }
  });
  return <group ref={ref}>{children}</group>;
}

/* ------------------------------------------------------------------ */
/* holographic sheen                                                    */
/* ------------------------------------------------------------------ */

/**
 * A clean holographic overlay.
 *
 * Deliberately not a glitch effect: no flicker, no jitter, no tearing.
 * Those read as a malfunction, and a museum projection would be a
 * perfect one. What is left is the part that actually says "projected":
 *
 *  - a fresnel rim, brightest exactly where the surface turns away
 *  - fine scan lines fixed in object space, so they sit on the form
 *    rather than sliding across the screen
 *  - one slow, smooth band travelling up the object
 *
 * It renders ADDITIVELY over the real model rather than replacing it, so
 * the object keeps its own materials and detail and simply gains a
 * holographic cast.
 */
const holoVertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vPosL;

  void main() {
    vPosL = position;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const holoFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3  uTint;
  uniform vec3  uCore;
  uniform float uStrength;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vPosL;

  void main() {
    float facing = clamp(dot(normalize(vNormalV), normalize(vViewDir)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.6);

    // scan lines held in object space, so they belong to the object
    float lines = 0.5 + 0.5 * sin(vPosL.y * 240.0);
    lines = mix(0.55, 1.0, lines);

    // one smooth band, travelling slowly upward
    float band = smoothstep(0.06, 0.0, abs(fract(vPosL.y * 0.4 - uTime * 0.09) - 0.5));

    vec3 col = mix(uTint, uCore, min(1.0, rim * 0.7 + band * 0.8));
    float a = (rim * 0.85 + band * 0.32) * lines * uStrength;

    gl_FragColor = vec4(col, a);
  }
`;

/** Builds the sheen mesh set for an already-prepared model. */
function useHoloOverlay(root: THREE.Object3D | null, strength: number) {
  const matRef = useRef<THREE.ShaderMaterial | null>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: holoVertex,
        fragmentShader: holoFragment,
        uniforms: {
          uTime: { value: 0 },
          uTint: { value: new THREE.Color(GOLD.halo) },
          uCore: { value: new THREE.Color(GOLD.core) },
          uStrength: { value: strength },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      }),
    [strength],
  );

  const overlay = useMemo(() => {
    if (!root) return null;
    const clone = root.clone(true);
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // sits just after the solid pass, so the rim reads on top of it
      mesh.renderOrder = 2;
    });
    return clone;
  }, [root, material]);

  useEffect(() => {
    matRef.current = material;
    return () => {
      matRef.current = null;
      material.dispose();
    };
  }, [material]);

  useFrame((state) => {
    const m = matRef.current;
    if (m) m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return overlay;
}

/* ------------------------------------------------------------------ */
/* glTF models                                                         */
/* ------------------------------------------------------------------ */

/**
 * Loads a glTF, scales it to a target height and re-materialises it.
 *
 * `tint` recolours every mesh, which matters because these are stock
 * models with their own palettes — left alone they would each drag the
 * hall toward a different colour scheme.
 */
function GLBModel({
  url,
  height,
  tint,
  emissive,
  emissiveIntensity = 0.35,
  metalness = 0.85,
  roughness = 0.3,
  offsetY = 0,
  spin = 0.22,
  rotation,
  sweep = 0,
  tintBody,
  bodyRoughness = 0.3,
  bodyMetalness = 0.85,
  holoStrength = 0.75,
}: {
  url: string;
  height: number;
  tint?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  offsetY?: number;
  spin?: number;
  rotation?: [number, number, number];
  /** oscillate rather than rotate, for flat objects */
  sweep?: number;
  /** recolours the casing only, leaving emissive parts (screens) alone */
  tintBody?: string;
  bodyRoughness?: number;
  bodyMetalness?: number;
  /** how strongly the holographic sheen reads over the solid model */
  holoStrength?: number;
}) {
  const { scene } = useGLTF(url);

  const prepared = useMemo(() => {
    const root = scene.clone(true);

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // a piece that casts no shadow floats; these sit on a deck
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (tint) {
        // used where a stock palette would pull the hall off-scheme
        mesh.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(tint),
          emissive: new THREE.Color(emissive ?? tint),
          emissiveIntensity,
          metalness,
          roughness,
          envMapIntensity: 1.3,
        });
        return;
      }

      /*
        The model keeps its own authored materials, which is what makes it
        read as the real object.

        It used to get a dose of self-illumination from its own colour map
        so it stayed visible in a dim hall. That is not how anything real
        behaves: it flattens the form, because a surface lit from within
        has no shaded side. The case fixtures light it now instead, and
        the only adjustment left is environment response.
      */
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((mat) => {
        const std = (mat as THREE.MeshStandardMaterial).clone() as THREE.MeshStandardMaterial;
        std.envMapIntensity = 1.35;

        if (tintBody) {
          /*
            A screen is identifiable by carrying its own emissive map or
            an emissive colour. Those are left exactly as authored; only
            the casing takes the tint, so the device comes out gold with
            a working display rather than gold all over.
          */
          const isScreen =
            Boolean(std.emissiveMap) ||
            (std.emissive && std.emissive.getHex() > 0x111111);
          if (!isScreen) {
            std.color = new THREE.Color(tintBody);
            std.roughness = bodyRoughness;
            std.metalness = bodyMetalness;
            // keep the authored colour map as shading detail, not colour
            if (std.map) std.map = null;
          }
        }
        return std;
      });
      if (Array.isArray(mesh.material) && mesh.material.length === 1) {
        mesh.material = mesh.material[0];
      }
    });

    // normalise scale: stock models arrive at wildly different sizes
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const largest = Math.max(size.x, size.y, size.z) || 1;
    const s = height / largest;
    root.scale.setScalar(s);

    // recentre on its own bounding box, so it sits in the case
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    root.position.set(-centre.x * s, -centre.y * s + offsetY, -centre.z * s);

    return root;
  }, [scene, tint, emissive, emissiveIntensity, metalness, roughness, height, offsetY, tintBody, bodyRoughness, bodyMetalness]);

  const holo = useHoloOverlay(prepared, holoStrength);

  return (
    <Turntable speed={spin} sweep={sweep}>
      <group rotation={rotation}>
        <primitive object={prepared} />
        {holo ? <primitive object={holo} /> : null}
      </group>
    </Turntable>
  );
}

/**
 * The Galaxy J2, in the gold it actually was.
 *
 * `tintBody` recolours only the shell and leaves the screen alone —
 * blanket-tinting the whole model would turn the display gold too, which
 * is what kills the illusion on a phone.
 */
export function PhoneJ2() {
  return (
    <Suspense fallback={null}>
      <GLBModel
        url="/models/phone/scene.gltf"
        height={0.95}
        /* leaned back on a stand, sweeping rather than spinning */
        spin={0.42}
        sweep={0.7}
        rotation={[-0.22, 0, 0]}
        tintBody="#c9a86a"
        bodyRoughness={0.3}
        bodyMetalness={0.85}
      />
    </Suspense>
  );
}

export function LaptopHP14() {
  return (
    <Suspense fallback={null}>
      <GLBModel
        url="/models/laptop/scene.gltf"
        height={1.15}
        spin={0.34}
        sweep={0.6}
        tintBody="#c8ab72"
        bodyRoughness={0.26}
        bodyMetalness={0.9}
      />
    </Suspense>
  );
}

export function QuantumComputer() {
  return (
    <Suspense fallback={null}>
      <GLBModel url="/models/quantum.glb" height={1.7} spin={0.18} />
    </Suspense>
  );
}

/** The brain, wrapped in blue neurons. */
export function BrainAndNeurons() {
  return (
    <Suspense fallback={null}>
      {/* the brain keeps its own scanned materials, so it reads as tissue */}
      <GLBModel url="/models/brain/scene.gltf" height={1.1} spin={0.2} />
      {/* neurons orbiting it, in blue */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <group
            key={i}
            position={[Math.cos(a) * 0.62, 0.1 + Math.sin(i * 2.1) * 0.24, Math.sin(a) * 0.62]}
            rotation={[0.3, a, 0.2]}
          >
            <Suspense fallback={null}>
              <GLBModel
                url="/models/neuron.glb"
                height={0.5}
                tint="#2f6fd0"
                emissive="#3f7fd8"
                emissiveIntensity={0.42}
                metalness={0.25}
                roughness={0.45}
                spin={0.35}
              />
            </Suspense>
          </group>
        );
      })}
    </Suspense>
  );
}

export function FilmCamera() {
  return (
    <Suspense fallback={null}>
      <GLBModel
        url="/models/camera.glb"
        height={1.3}
        tint={MID.bronze}
        emissive={GOLD.halo}
        emissiveIntensity={0.18}
        metalness={0.75}
        roughness={0.35}
        spin={0.2}
      />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — Claude                                                          */
/* ------------------------------------------------------------------ */

/**
 * No model was supplied for this one, so it is built here: the Claude
 * mark is a radial burst of tapered spokes, which is straightforward to
 * describe in geometry.
 */
export function ClaudeMark() {
  const SPOKES = 11;
  return (
    <Turntable speed={0.26}>
      <group rotation={[0.2, 0, 0]}>
        {Array.from({ length: SPOKES }, (_, i) => {
          const a = (i / SPOKES) * Math.PI * 2;
          const len = 0.34 + (i % 2 === 0 ? 0.2 : 0.08);
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * (len / 2 + 0.1), Math.sin(a) * (len / 2 + 0.1), 0]}
              rotation={[0, 0, a + Math.PI / 2]}
            >
              <cylinderGeometry args={[0.012, 0.038, len, 10]} />
              <meshStandardMaterial
                color="#d97757"
                roughness={0.38}
                metalness={0.45}
                envMapIntensity={1.3}
              />
            </mesh>
          );
        })}
        <mesh>
          <sphereGeometry args={[0.1, 24, 24]} />
          <meshStandardMaterial
            color="#e08a66"
            roughness={0.3}
            metalness={0.45}
            envMapIntensity={1.4}
          />
        </mesh>
      </group>
    </Turntable>
  );
}

/** What stands in each case, in walk order. */
export function CaseContents({ index }: { index: number }) {
  switch (index % 6) {
    case 0:
      return <PhoneJ2 />;
    case 1:
      return <LaptopHP14 />;
    case 2:
      return <QuantumComputer />;
    case 3:
      return <BrainAndNeurons />;
    case 4:
      return <FilmCamera />;
    default:
      return <ClaudeMark />;
  }
}

useGLTF.preload("/models/phone/scene.gltf");
useGLTF.preload("/models/laptop/scene.gltf");
useGLTF.preload("/models/brain/scene.gltf");
useGLTF.preload("/models/neuron.glb");
