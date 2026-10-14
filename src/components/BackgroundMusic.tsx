"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The hall's background music, with a button to turn it off and on.
 *
 * Browsers will not let a page make sound until the visitor has done
 * something to it - a click, a key, a tap - so the music cannot begin on
 * load, however it is asked. It begins on the first of those, which in
 * practice is the click on a door. Until then the button reads "off",
 * because that is true.
 *
 * Whether the visitor has switched it off is remembered, so a choice to
 * have quiet is not undone by the next visit.
 *
 * It lives in the root layout rather than in the museum, so that leaving
 * the hall for the ordinary pages does not cut the track.
 *
 * The track itself is not part of the repository, so a copy of the site
 * without it has no music to offer. In that case the button is not shown at
 * all, rather than being a button that does nothing.
 */

const SRC = "/audio/the-world-we-knew.mp3";
const KEY = "dk-music";
/* background, not foreground: well under what the file could play at */
const LEVEL = 0.5;

/* storage is refused in some private windows; never let that matter */
function wasSwitchedOff() {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

function remember(off: boolean) {
  try {
    if (off) localStorage.setItem(KEY, "off");
    else localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

export function BackgroundMusic() {
  const audio = useRef<HTMLAudioElement>(null);
  const frame = useRef(0);
  /* set once the visitor has chosen, or the music has begun on its own:
     after that, clicking somewhere else must never change it */
  const settled = useRef(false);
  const [on, setOn] = useState(false);
  /* false once the track is known to be missing */
  const [available, setAvailable] = useState(true);
  const museum = usePathname() === "/";

  /* ask once, cheaply, whether there is a track: a HEAD request moves no audio */
  useEffect(() => {
    let alive = true;
    fetch(SRC, { method: "HEAD" })
      .then((res) => {
        if (alive && !res.ok) setAvailable(false);
      })
      .catch(() => {
        /* offline or blocked: say nothing, and let play() find out */
      });
    return () => {
      alive = false;
    };
  }, []);

  /* a volume ramp, so nothing starts or stops with a click */
  const fadeTo = useCallback((target: number, ms: number, done?: () => void) => {
    const el = audio.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    const from = el.volume;
    const t0 = performance.now();
    const step = (now: number) => {
      /* a frame's timestamp can be a hair earlier than t0; volume may not go below 0 */
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      el.volume = from + (target - from) * k;
      if (k < 1) frame.current = requestAnimationFrame(step);
      else done?.();
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  const start = useCallback(() => {
    const el = audio.current;
    if (!el) return Promise.resolve(false);
    if (el.paused) el.volume = 0;
    return el.play().then(
      () => {
        setOn(true);
        fadeTo(LEVEL, 2200);
        return true;
      },
      () => false,
    );
  }, [fadeTo]);

  const stop = useCallback(() => {
    setOn(false);
    fadeTo(0, 600, () => audio.current?.pause());
  }, [fadeTo]);

  const toggle = useCallback(() => {
    settled.current = true;
    if (on) {
      remember(true);
      stop();
    } else {
      remember(false);
      void start();
    }
  }, [on, start, stop]);

  /* begin on the visitor's first gesture, unless they turned it off last time */
  useEffect(() => {
    if (wasSwitchedOff()) return;
    const events = ["pointerdown", "pointerup", "keydown"] as const;
    const detach = () => events.forEach((name) => window.removeEventListener(name, begin, true));
    function begin(e: Event) {
      if (settled.current) return;
      /* the button's own click is a choice, not a first gesture */
      if (e.target instanceof Element && e.target.closest(".sound-toggle")) return;
      settled.current = true;
      void start().then((ok) => {
        if (ok) detach();
        else settled.current = false;
      });
    }
    /* capture: the 3D canvas is free to swallow its own events */
    events.forEach((name) => window.addEventListener(name, begin, true));
    return detach;
  }, [start]);

  /* a hidden tab should be silent; bring it back when the tab returns */
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    let paused = false;
    const onVisibility = () => {
      if (document.hidden) {
        if (!el.paused) {
          paused = true;
          el.pause();
        }
      } else if (paused) {
        paused = false;
        void el.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  if (!available) return null;

  return (
    <>
      {/* preload none: the 3D scene has the connection until the music is wanted */}
      <audio ref={audio} src={SRC} loop preload="none" onError={() => setAvailable(false)} />
      <button
        type="button"
        className={`sound-toggle${museum ? "" : " is-page"}${on ? " is-on" : ""}`}
        aria-label="Background music"
        aria-pressed={on}
        onClick={toggle}
      >
        Sound {on ? "on" : "off"}
      </button>
    </>
  );
}
