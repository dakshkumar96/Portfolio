"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CAM_Z_END, CAM_Z_START, doors, type DoorSpec, type RoomId } from "./corridorLayout";
import { allExhibits, type ExhibitDatum } from "./exhibitData";
import { hasWebGL } from "./webgl";
import { markDoorClick } from "./clickTrace";
import { hasDebugFlag } from "./debug";
import { ToolBox } from "./ToolBox";
import { CatalogueStamp, HeritageDefs, WaxSeal } from "./Heritage";
import { LoadingVeil } from "./LoadingVeil";
import { site } from "@/content/site";
import { SiteLink } from "@/components/ExternalLink";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const MuseumCanvas = dynamic(
  () => import("./MuseumCanvas").then((mod) => mod.MuseumCanvas),
  { ssr: false },
);

/** Scroll track for the corridor walk. */
const STAGES = [
  { id: "entrance", vh: 130 },
  { id: "hall-1", vh: 240 },
  { id: "hall-2", vh: 240 },
  { id: "hall-3", vh: 240 },
  { id: "hall-4", vh: 240 },
  { id: "hall-5", vh: 240 },
];

/** The card the loading screen draws unseen: one with every part a card can have, if there is one. */
const primerExhibit = allExhibits.find((e) => e.bullets?.length && e.meta) ?? allExhibits[0];

/** Catalogue numbers, the way a collection numbers its holdings. */
function toRoman(n: number) {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rest = n;
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/** What is printed on a catalogue card: everything inside the <article>. */
function CardContents({ exhibit, index, onClose }: { exhibit: ExhibitDatum; index: number; onClose?: () => void }) {
  return (
    <>
      {/*
        A page from a catalogue, made by someone.

        The number is a rubber stamp pressed in the corner and the
        divider is a flourish a nib would leave. The first letter
        of the text is illuminated. At the foot there is a
        signature in a margin hand and a seal in wax. Each of
        those is a mark of a person having done it, which is the
        one thing an interface card never has.
      */}
      <CatalogueStamp numeral={toRoman(index + 1)} />
      <h2>{exhibit.title}</h2>
      {exhibit.meta ? (
        <p className="museum-placard-meta">
          {/* each part stays whole, so a wrap falls after a dot and never starts a line with one */}
          {exhibit.meta.split(" · ").map((part, i, all) => (
            <Fragment key={i}>
              <span className="meta-part">{i < all.length - 1 ? `${part} ·` : part}</span>
              {i < all.length - 1 ? " " : null}
            </Fragment>
          ))}
        </p>
      ) : null}
      <div className="cat-rule" aria-hidden="true" />
      {exhibit.body ? (
        <p className={`museum-placard-copy${exhibit.body.length < 90 ? " is-short" : ""}`}>
          {exhibit.body}
        </p>
      ) : null}
      {exhibit.tools?.length ? (
        <ul className="tool-grid">
          {exhibit.tools.map((tool) => (
            <ToolBox key={tool} name={tool} />
          ))}
        </ul>
      ) : null}
      {exhibit.bullets?.length ? (
        <ol className="museum-placard-list">
          {exhibit.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : null}
      {exhibit.links?.length ? (
        <div className="museum-contact-links">
          {/* each goes where its address says: away from the site in a new tab, the credits and mail in this one */}
          {exhibit.links.map((link) => (
            <SiteLink key={link.href} href={link.href}>
              {link.label}
            </SiteLink>
          ))}
        </div>
      ) : null}
      {/* only links that go somewhere: a project with no live site and no public code shows none */}
      {exhibit.actions?.some((action) => action.href) ? (
        <div className="cat-actions">
          {/* a note in the margin, with an arrow drawn by hand */}
          <span className="cat-note" aria-hidden="true">
            have a look
            <svg viewBox="0 0 44 30" focusable="false">
              <path
                d="M3 4 C 12 2, 24 6, 30 18 M 22 17 L 31 20 L 33 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          {exhibit.actions
            .filter((action) => action.href)
            .map((action) => (
              <SiteLink key={action.label} className="cat-action" href={action.href as string}>
                {action.label}
                <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                  <path
                    d="M3 9L9 3M4.5 3H9v4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </SiteLink>
            ))}
        </div>
      ) : null}
      <div className="cat-end">
        <WaxSeal className="cat-seal" />
        {onClose ? (
          <button type="button" className="museum-close" onClick={onClose}>
            Return
          </button>
        ) : null}
      </div>
    </>
  );
}

export function MuseumWorld() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState<RoomId | null>(null);
  const [active, setActive] = useState<ExhibitDatum | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  /* the doors have started to part: the hall's light comes up behind them */
  const [lit, setLit] = useState(false);
  /*
    Set by the canvas once the hall is built, compiled and drawn. The
    files being downloaded is not the same thing: the rooms are built
    over a few seconds and their shaders compiled a slice at a time, so
    lifting the veil on the loading manager alone showed a half-built
    hall — a blank screen with nothing in it yet.
  */
  const [painted, setPainted] = useState(false);

  /*
    Mount the canvas after the first paint — but never later than that.

    This used to wait on requestAnimationFrame alone, which does not fire
    at all while the tab is in the background. Load the page with the
    window behind another one, or switch away while it loads, and the
    probe never ran: the veil finished, and you came back to an empty
    stage with no canvas in it, permanently. The timer is the guarantee;
    the frame is still there because when the page IS visible it lands
    first and keeps the heavy mount off the very first paint.
  */
  useEffect(() => {
    let done = false;
    const start = () => {
      if (done) return;
      done = true;
      setReady(true);
      setWebgl(hasWebGL());
    };
    const frame = requestAnimationFrame(start);
    const timer = window.setTimeout(start, 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  /*
    The veil lifts on three.js's own loading manager rather than a timer,
    so it lasts exactly as long as the models and textures actually take.
    onLoad does not fire when nothing is queued, hence the fallback — and
    the cap is there because a single failed asset should not trap a
    visitor behind a loading screen forever.
  */
  useEffect(() => {
    let alive = true;
    const finish = () => {
      if (alive) setLoaded(true);
    };

    const previousOnLoad = THREE.DefaultLoadingManager.onLoad;
    THREE.DefaultLoadingManager.onLoad = () => {
      previousOnLoad?.();
      finish();
    };

    // nothing queued, or a slow asset: never hold longer than this
    const idle = window.setTimeout(finish, 1400);
    const cap = window.setTimeout(finish, 9000);

    return () => {
      alive = false;
      THREE.DefaultLoadingManager.onLoad = previousOnLoad;
      window.clearTimeout(idle);
      window.clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const trigger = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        progressRef.current = self.progress;
      },
    });
    return () => trigger.kill();
  }, []);

  // Inside a room the corridor scroll would fight the camera, so freeze it.
  useEffect(() => {
    if (!room) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [room]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (active) setActive(null);
      else if (room) setRoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, room]);

  /*
    A click anywhere off the open card puts it away, the same as Return.
    Clicks on the 3D scene are left to the canvas: one that lands on
    another exhibit opens that one instead, and one that lands on nothing
    comes back through onMissed below.
  */
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || target.closest(".museum-exhibit-card.is-active, canvas")) return;
      setActive(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [active]);

  const handleMissed = useCallback(() => setActive(null), []);

  const handleReady = useCallback(() => setPainted(true), []);
  const handleOpen = useCallback(() => setLit(true), []);

  /*
    A cap on the whole thing. Whatever goes wrong — a driver that never
    reports a compile finished, a machine slow enough that the queue
    never drains — nobody is left behind a loading screen forever. It
    sits just past the canvas's own cap on holding the hall back
    (HOLD_CAP_MS in MuseumCanvas), so the hall is always there to see.
  */
  useEffect(() => {
    if (painted || webgl === false) return;
    const bail = window.setTimeout(() => setPainted(true), 28000);
    return () => window.clearTimeout(bail);
  }, [painted, webgl]);

  const enterRoom = useCallback((id: RoomId) => {
    markDoorClick(id);
    setActive(null);
    setRoom(id);
  }, []);

  /*
    With ?debug on the address, rooms can be entered from the console
    (window.__enterRoom("projects")). Checking a room's look in a headless
    browser otherwise means hitting a door in a WebGL scene by pixel.
    Visitors never have it.
  */
  const leaveRoom = useCallback(() => {
    setActive(null);
    setRoom(null);
  }, []);

  useEffect(() => {
    if (!hasDebugFlag()) return;
    const w = window as unknown as { __enterRoom?: (id: RoomId) => void; __leaveRoom?: () => void };
    w.__enterRoom = enterRoom;
    w.__leaveRoom = leaveRoom;
    return () => {
      delete w.__enterRoom;
      delete w.__leaveRoom;
    };
  }, [enterRoom, leaveRoom]);

  const handleSelect = useCallback((exhibit: ExhibitDatum) => {
    setActive((current) => (current?.id === exhibit.id ? null : exhibit));
  }, []);

  const roomLabel = doors.find((d) => d.id === room)?.label ?? "";

  /*
    The door you are walking up to, for the button that takes you in.

    On a phone held upright the hall is seen down its length through a
    narrow screen, so the doors on its side walls have slid out of view by
    the time you reach them, and there is nothing left to tap. Walking up to
    one brings up a button that goes in through it. Read from the scroll a
    few times a second, which is all a walk needs.
  */
  const [nearDoor, setNearDoor] = useState<DoorSpec | null>(null);
  useEffect(() => {
    // in a room it is not shown (see the button below), and the hall's position is not read
    if (room) return;
    const check = () => {
      const t = Math.min(1, Math.max(0, progressRef.current));
      const z = CAM_Z_START + (CAM_Z_END - CAM_Z_START) * t;
      // from eleven metres short of a door until just past it
      const next = doors.find((d) => z - d.z < 11 && z - d.z > -2.5) ?? null;
      setNearDoor((prev) => (prev?.id === next?.id ? prev : next));
    };
    const id = window.setInterval(check, 200);
    return () => window.clearInterval(id);
  }, [room]);

  return (
    <>
      {/*
        Outside .museum-root on purpose. That element is invisible until the page has
        hydrated, and a loading screen that waits for the scripts it is covering for
        shows nothing at all on exactly the connections that need it.
      */}
      <LoadingVeil
        ready={loaded && (painted || webgl === false)}
        assetsDone={loaded}
        onOpen={handleOpen}
      />

      {/*
        The way out of the 3D, to the ordinary site. Above the loading screen
        as well as the hall, so nobody has to wait for the doors to open to
        leave, and outside .museum-root for the same reason the veil is.
      */}
      <Link href="/profile" className="museum-skip">
        Skip 3D
        <span aria-hidden="true"> →</span>
      </Link>

      {/*
        One card, drawn while the museum loads and never seen.

        The first card anyone opened stalled the page for most of a second:
        the browser had never drawn one, so it had to decode the vine
        corners and the paper's grain and fibre, set the type, and prepare
        the blur and the shadows, all on that click. Drawn once here first -
        above the loading screen, so it is really drawn, at half a percent
        opacity, so it is not seen - all of that is ready before the doors
        open, and it is taken away as they do.
      */}
      {loaded && !lit ? (
        <div className="museum-placards museum-card-primer" aria-hidden="true" inert>
          <article className="museum-exhibit-card is-active">
            <CardContents exhibit={primerExhibit} index={0} />
          </article>
        </div>
      ) : null}

      <div ref={rootRef} className={`museum-root${ready ? " ready" : ""}${room ? " in-room" : ""}`}>
        <HeritageDefs />

        <div className={`museum-canvas-fixed${lit ? " is-lit" : ""}`}>
          {webgl ? (
            <MuseumCanvas
              onReady={handleReady}
              progressRef={progressRef}
              roomId={room}
              onEnterRoom={enterRoom}
              activeId={active?.id ?? null}
              onSelect={handleSelect}
              onMissed={handleMissed}
            />
          ) : null}
        </div>

        {webgl === false ? (
          <div className="museum-nowebgl">
            <p>This browser can&rsquo;t run the 3D museum because WebGL isn&rsquo;t available.</p>
            <Link href="/profile">View the full portfolio instead →</Link>
          </div>
        ) : null}

        {/*
          The entrance card is gone, but this section stays: it is the first
          leg of the scroll track that drives the camera, and it carries the
          page's only <h1>. The heading is kept for screen readers and
          crawlers rather than deleted outright.
        */}
        <section id="entrance" className="museum-stop" style={{ minHeight: `${STAGES[0].vh}vh` }}>
          <h1 className="sr-only">{site.name}</h1>
          <p className="sr-only">{site.role}</p>
        </section>

        {STAGES.slice(1).map((stage) => (
          <section
            key={stage.id}
            id={stage.id}
            aria-hidden="true"
            className="museum-spacer"
            style={{ minHeight: `${stage.vh}vh` }}
          />
        ))}

        {room ? (
          <div className="museum-hud">
            <span className="museum-hud-room">{roomLabel}</span>
            <button type="button" className="museum-back" onClick={leaveRoom}>
              ← Back to corridor
            </button>
          </div>
        ) : null}
        {/*
          How to get about, in two lines: moving first, since nothing on
          screen says the hall can be walked, then what can be clicked -
          every case, frame, board and logo opens a card, not only the
          doors. A phone has no wheel and a room has no swipe to walk, so
          a touch screen is told what it can actually do there.
        */}
        {nearDoor && !room ? (
          <button
            type="button"
            key={nearDoor.id}
            className={`museum-door-cta${active ? " hidden" : ""}`}
            onClick={() => enterRoom(nearDoor.id)}
          >
            <span>Enter {nearDoor.label}</span>
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M4 2.5L7.5 6L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        <p className={`museum-tip${active ? " hidden" : ""}`}>
          <span className="museum-tip-main">
            <span className="tip-mouse">{room ? "Scroll to walk through the room" : "Scroll to walk down the hall"}</span>
            <span className="tip-touch">{room ? "Drag to look around the room" : "Swipe up to walk down the hall"}</span>
          </span>
          <span className="museum-tip-sub">
            <span className="tip-mouse">
              {room ? "Click anything to read about it" : "Click a door to go in, or anything else to read about it"}
            </span>
            <span className="tip-touch">
              {room ? "Tap anything to read about it" : "Tap a door to go in, or anything else to read about it"}
            </span>
          </span>
        </p>

        {/*
          Placards stay in the DOM so they remain crawlable and
          screen-reader reachable; only the selected one is presented.
        */}
        <div className="museum-placards">
          {allExhibits.map((exhibit, i) => {
            const isActive = active?.id === exhibit.id;
            return (
              <article
                key={exhibit.id}
                className={`museum-exhibit-card${isActive ? " is-active" : ""}`}
                aria-hidden={isActive ? undefined : "true"}
              >
                <CardContents exhibit={exhibit} index={i} onClose={isActive ? () => setActive(null) : undefined} />
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
