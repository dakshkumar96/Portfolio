"use client";

import { useEffect, useRef, useState } from "react";
/*
  The one file, not the package index. This is the first thing on screen,
  and importing from the index would make it wait for all of drei.
*/
import { useProgress } from "@react-three/drei/core/Progress";
import { site } from "@/content/site";
import { compileProgress } from "./loadProgress";
import { pendingJobs } from "./preload";

/**
 * The loading screen: the first door.
 *
 * The museum is built around doors, so it opens with one. Two thick dark
 * leaves meet at a crack, the first name on the left and the last on the
 * right, and warm light is leaking through. Heritage is the architecture,
 * not decoration: a recessed panel in each leaf, a band of ajrak lattice
 * along the outer edge, a pointed arch across both, brass pulls with a
 * single cyan indicator. All of it is faint, so the name stays the hero. As the hall really loads,
 * light climbs the crack from the floor to the top of the doors, and a
 * plate at their foot says what is being done; when the light reaches the
 * top it flares, the panels part, and the hall's light comes up behind them.
 *
 * Plain DOM, in the first HTML. It must be on screen before anything else
 * is, and stay on screen while the main thread is at its busiest.
 *
 * What the crack measures, in order of how long each takes:
 *
 *  - the models and textures, as three.js's loading manager reports them
 *    (drei's `useProgress`) - the first half
 *  - the shader programs for every material, compiled a slice at a time -
 *    nearly all of the second half, and the part `useProgress` cannot see
 *  - then "ready": the hall is drawn, and the door opens
 *
 * Nothing here is a timer pretending. The light only climbs when something
 * has actually finished, and never falls back. The plate's words come from
 * the same signals: what it says is still loading is what is still loading.
 *
 * The light and the words are written straight to the DOM on animation
 * frames rather than through React state, so that showing progress never
 * costs a render on the busiest thread in the page.
 */

/** How much of the crack each stage is worth. */
const ASSETS = 0.5;
const COMPILE = 0.49;

/*
  Never shown for less than this, so a fast load cannot make it flash. Long
  enough for the whole entrance - the lines draw, the name rises, the plaque
  appears - to finish before the door opens on it.
*/
const MIN_SHOWN_MS = 2600;

/*
  What the plate at the foot of the doors says, in the order the work is
  done. Each is held for at least STAGE_MS, so a stage that is over in a
  moment does not flicker past unread.
*/
const STAGES = {
  assets: "Carrying in the exhibits",
  pictures: "Hanging the pictures",
  shaders: "Lighting the hall",
  ready: "Opening the doors",
} as const;
const STAGE_MS = 1100;
/** How long the words take to fade out before the next ones fade in (the stylesheet's transition). */
const STAGE_FADE_MS = 240;

/** The line under the name, on a plaque across the crack. */
const ROLE = "AI ENGINEER";

const [FIRST, ...REST] = site.name.split(" ");
const LAST = REST.join(" ");

/*
  The arch, drawn as one half in each leaf so that it splits and travels
  with the doors. The drawing is a unit box stretched over the leaf (x as a
  share of its width, y of its height), which is why the strokes are
  non-scaling in the stylesheet: they stay one pixel at any shape of screen.

  Each half is a jamb rising from near the foot to the springing line, then
  an elliptical arc whose centre is the opposite springing point - the
  construction of a two-centred pointed arch - to the apex on the crack. On
  a wide screen it is a shallow point; on a phone, a tall one.
*/
const ARCH_LEFT = "M16 88V56A168 50.8 0 0 1 100 12";
const ARCH_RIGHT = "M0 12A168 50.8 0 0 1 84 56V88";

/**
 * One tile of ajrak-style line work: a diamond with a smaller diamond in it,
 * crossed by the diagonals of the lattice. 14px, so a column of them makes
 * the band; it is only ever a border, never a fill.
 */
function Band({ id }: { id: string }) {
  return (
    <svg className="veil-band" focusable="false">
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M7 .5L13.5 7L7 13.5L.5 7Z" />
          <path d="M7 4.2L9.8 7L7 9.8L4.2 7Z" />
          <path d="M0 0L14 14M14 0L0 14" className="veil-lattice" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} stroke="none" />
    </svg>
  );
}

/** Four 1px lines that draw round a rectangle one after another, so it is drawn, not switched on. */
function Hairs() {
  return (
    <>
      <i className="veil-hair veil-hair-t" />
      <i className="veil-hair veil-hair-r" />
      <i className="veil-hair veil-hair-b" />
      <i className="veil-hair veil-hair-l" />
    </>
  );
}

/** The recessed panel of a leaf, and the second line inside it, like carved molding. */
function Molding() {
  return (
    <div className="veil-frame">
      <Hairs />
      <div className="veil-frame-in">
        <Hairs />
      </div>
    </div>
  );
}

/** A brass pull with a single cyan indicator down its inner edge. */
function Pull() {
  return (
    <i className="veil-pull">
      <i className="veil-led" />
    </i>
  );
}

type Phase = "load" | "exit" | "gone";

export function LoadingVeil({
  ready,
  assetsDone,
  onOpen,
}: {
  ready: boolean;
  assetsDone: boolean;
  /** Called as the doors begin to part, so the hall can bring its light up. */
  onOpen?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("load");
  const { progress } = useProgress();

  const gap = useRef<HTMLElement>(null);
  const glow = useRef<HTMLElement>(null);
  const head = useRef<HTMLElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  /* what the frame loop reads: the latest of each signal, without re-running it */
  const signals = useRef({ ready: false, assets: 0 });
  /* set once the doors begin to part, whichever path got there: the frame loop must stop writing */
  const closing = useRef(false);

  useEffect(() => {
    signals.current.ready = ready;
    signals.current.assets = assetsDone ? 1 : Math.min(1, progress / 100);
  }, [ready, assetsDone, progress]);

  useEffect(() => {
    const crack = gap.current;
    const light = glow.current;
    const tip = head.current;
    const label = words.current;
    if (!crack || !light || !tip || !label) return;

    let shown = 0;
    let shownPercent = -1;
    let shownStep = -1;
    let raf = 0;
    let previous = performance.now();
    const mounted = previous;

    /* the words on the plate: what they say now, when they last changed, and whether they are fading out */
    let saying: string = STAGES.assets;
    let changedAt = mounted;
    let fadingSince = 0;
    label.textContent = saying;

    const paint = () => {
      const percent = Math.round(shown * 100);
      if (percent !== shownPercent) {
        shownPercent = percent;
        // the name catches more of the seam's light as it climbs
        root.current?.style.setProperty("--seam", (percent / 100).toFixed(2));
      }
      const step = Math.round(shown * 1000);
      if (step !== shownStep) {
        shownStep = step;
        /* the light climbs from the floor; its glow and its bright tip go with it */
        crack.style.transform = `scaleY(${shown})`;
        light.style.transform = `scaleY(${shown})`;
        light.style.opacity = String(0.5 + 0.5 * shown);
        tip.style.bottom = `${(shown * 100).toFixed(2)}%`;
      }
    };

    const say = (now: number, done: boolean, assets: number) => {
      const wanted = done
        ? STAGES.ready
        : assets < 1
          ? STAGES.assets
          : pendingJobs() > 0
            ? STAGES.pictures
            : STAGES.shaders;
      if (fadingSince) {
        if (now - fadingSince >= STAGE_FADE_MS) {
          saying = wanted;
          label.textContent = wanted;
          label.style.opacity = "1";
          fadingSince = 0;
          changedAt = now;
        }
      } else if (wanted !== saying && now - changedAt >= STAGE_MS) {
        label.style.opacity = "0";
        fadingSince = now;
      }
    };

    const frame = (now: number) => {
      if (closing.current) return;
      /* a frame that stalled on a shader compile must not become a jump */
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;

      const { ready: done, assets } = signals.current;
      const goal = done ? 1 : Math.min(0.99, ASSETS * assets + COMPILE * compileProgress.fraction());

      /* eased toward the real figure, never back from it; quicker once the hall is ready */
      if (goal > shown) shown += (goal - shown) * (1 - Math.exp(-(done ? 8 : 2.6) * dt));

      paint();
      say(now, done, assets);
      if (done && shown > 0.995 && now - mounted >= MIN_SHOWN_MS) {
        shown = 1;
        paint();
        setPhase("exit");
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /*
    Frames do not run in a background tab, so a hall that finished while
    the window was behind another would otherwise keep this on screen
    until someone came back. The timers are the guarantee; the frame loop
    above is what normally gets there first.
  */
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setPhase((p) => (p === "load" ? "exit" : p)), MIN_SHOWN_MS + 2500);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (phase !== "exit") return;
    /*
      However the door came to open - the frame loop reaching the end, or
      the timer above because frames were not coming - the light reaches
      the top as it goes.
    */
    closing.current = true;
    if (words.current) {
      words.current.textContent = STAGES.ready;
      words.current.style.opacity = "1";
    }
    if (gap.current) gap.current.style.transform = "none";
    if (head.current) head.current.style.bottom = "100%";
    if (glow.current) {
      glow.current.style.transform = "none";
      glow.current.style.opacity = "1";
    }
    root.current?.style.setProperty("--seam", "1");
    onOpen?.();
    /* the flare, then the 1.4s slide */
    const timer = window.setTimeout(() => setPhase("gone"), 2800);
    return () => window.clearTimeout(timer);
  }, [phase, onOpen]);

  if (phase === "gone") return null;

  return (
    <div
      ref={root}
      className={`veil${phase === "exit" ? " veil-open" : ""}`}
      aria-hidden="true"
      onTransitionEnd={(e) => {
        const target = e.target as HTMLElement;
        /* the panels finishing their slide, or - with reduced motion - the whole screen finishing its fade */
        const slid = e.propertyName === "transform" && target.classList.contains("veil-panel-left");
        const faded = e.propertyName === "opacity" && target === e.currentTarget;
        if (slid || faded) setPhase("gone");
      }}
    >
      <div className="veil-panel veil-panel-left">
        <svg className="veil-arch" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
          <path d={ARCH_LEFT} />
        </svg>
        <Molding />
        <Band id="veil-ajrak-left" />
        <Pull />
        <span className="veil-hud">Hall 00 / Entrance</span>
        <div className="veil-col">
          <span className="veil-mask">
            <span className="veil-word">{FIRST}</span>
          </span>
        </div>
      </div>
      <div className="veil-panel veil-panel-right">
        <svg className="veil-arch" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
          <path d={ARCH_RIGHT} />
        </svg>
        <Molding />
        <Band id="veil-ajrak-right" />
        <Pull />
        <span className="veil-hud">Est. 2026</span>
        <div className="veil-col">
          <span className="veil-mask">
            <span className="veil-word veil-word-last">{LAST}</span>
          </span>
        </div>
      </div>

      {/* the crack the light climbs: the wrapper draws in; the light, its glow and its tip follow the real progress */}
      <div className="veil-seam">
        <i ref={glow} className="veil-glow" />
        <i ref={gap} className="veil-gap" />
        <i ref={head} className="veil-head" />
      </div>

      {/* a lintel plaque across the crack: the plate hides the seam behind it, so the line reads whole */}
      <p className="veil-plate">{ROLE}</p>

      {/* a second plate, at the foot of the doors: what is being done */}
      <p className="veil-status">
        <span ref={words} className="veil-words" />
      </p>
    </div>
  );
}
