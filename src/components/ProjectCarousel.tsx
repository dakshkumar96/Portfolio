"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Project } from "@/content/site";
import { ProjectArt } from "./ProjectArt";

export function ProjectCarousel({ projects }: { projects: Project[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (projects.length === 0) {
    return <p className="empty-note">Nothing here yet. Check back soon.</p>;
  }

  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".carousel-slide");
    const step = card ? card.getBoundingClientRect().width + 16 : 300;
    track.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  return (
    <div className="carousel-container">
      <button
        type="button"
        className="carousel-nav prev"
        aria-label="Previous"
        onClick={() => scrollBy(-1)}
      >
        <ChevronIcon direction="left" />
      </button>

      <div className="carousel-track-container">
        <div className="carousel-track" ref={trackRef}>
          {projects.map((project) => (
            <Link
              key={project.slug}
              href={`/work/${project.slug}`}
              className="carousel-slide project-card"
            >
              <ProjectArt slug={project.slug} />
              <div className="project-meta">
                <h3>{project.title}</h3>
                <p>{project.oneLiner}</p>
                <div className="tag-row">
                  {project.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="carousel-nav next"
        aria-label="Next"
        onClick={() => scrollBy(1)}
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const d = direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
