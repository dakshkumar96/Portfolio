"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { doors, type RoomId } from "./corridorLayout";
import { allExhibits, type ExhibitDatum } from "./exhibitData";
import { hasWebGL } from "./webgl";
import { LoadingVeil } from "./LoadingVeil";
import { site } from "@/content/site";

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
];

export function MuseumWorld() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState<RoomId | null>(null);
  const [active, setActive] = useState<ExhibitDatum | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setReady(true);
      setWebgl(hasWebGL());
    });
    return () => cancelAnimationFrame(id);
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

  const enterRoom = useCallback((id: RoomId) => {
    setActive(null);
    setRoom(id);
  }, []);

  const leaveRoom = useCallback(() => {
    setActive(null);
    setRoom(null);
  }, []);

  const handleSelect = useCallback((exhibit: ExhibitDatum) => {
    setActive((current) => (current?.id === exhibit.id ? null : exhibit));
  }, []);

  const roomLabel = doors.find((d) => d.id === room)?.label ?? "";

  return (
    <div ref={rootRef} className={`museum-root${ready ? " ready" : ""}`}>
      <LoadingVeil ready={loaded} />

      <div className="museum-canvas-fixed">
        {webgl ? (
          <MuseumCanvas
            progressRef={progressRef}
            roomId={room}
            onEnterRoom={enterRoom}
            activeId={active?.id ?? null}
            onSelect={handleSelect}
          />
        ) : null}
      </div>

      {webgl === false ? (
        <div className="museum-nowebgl">
          <p>This browser can&rsquo;t run the 3D museum (WebGL is unavailable).</p>
          <Link href="/profile">View the full portfolio instead →</Link>
        </div>
      ) : null}

      <Link href="/profile" className="museum-skip">
        Skip 3D →
      </Link>

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
      ) : (
        <p className={`museum-tip${active ? " hidden" : ""}`}>Click a door to enter a room</p>
      )}

      {/*
        Placards stay in the DOM so they remain crawlable and
        screen-reader reachable; only the selected one is presented.
      */}
      <div className="museum-placards">
        {allExhibits.map((exhibit) => {
          const isActive = active?.id === exhibit.id;
          return (
            <article
              key={exhibit.id}
              className={`museum-exhibit-card${isActive ? " is-active" : ""}`}
              aria-hidden={isActive ? undefined : "true"}
            >
              <h2>{exhibit.title}</h2>
              {exhibit.meta ? <p className="museum-placard-meta">{exhibit.meta}</p> : null}
              {exhibit.body ? <p className="museum-placard-copy">{exhibit.body}</p> : null}
              {exhibit.bullets?.length ? (
                <ul className="museum-placard-list">
                  {exhibit.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {exhibit.links?.length ? (
                <div className="museum-contact-links">
                  {exhibit.links.map((link) =>
                    link.external ? (
                      <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <Link key={link.href} href={link.href}>
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>
              ) : null}
              {isActive ? (
                <button type="button" className="museum-close" onClick={() => setActive(null)}>
                  Close
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
