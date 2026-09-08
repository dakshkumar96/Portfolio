"use client";

import { useState } from "react";
import Link from "next/link";
import { experience, type Experience } from "@/content/site";
import { CompanyLogo } from "./CompanyLogo";

export function ExperienceList({ limit }: { limit?: number }) {
  const items = limit ? experience.slice(0, limit) : experience;

  return (
    <div className="experience-list">
      {items.map((job) => (
        <ExperienceItem key={job.slug} job={job} />
      ))}
    </div>
  );
}

function ExperienceItem({ job }: { job: Experience }) {
  const [open, setOpen] = useState(false);
  const hasBullets = job.bullets.length > 0;

  const header = (
    <>
      <CompanyLogo name={job.org} />
      <div>
        <h3>{job.org}</h3>
        <p className="experience-role">
          {job.role}
          <span> · {job.dates}</span>
        </p>
        {job.location ? (
          <p className="experience-location">{job.location}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <article className="experience-item">
      <div className="experience-content">
        <Link href={`/experience/${job.slug}`} className="experience-head">
          {header}
        </Link>

        {hasBullets ? (
          <div className={`experience-details${open ? " open" : ""}`}>
            <button
              type="button"
              className="experience-summary"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <span className={`summary-icon${open ? " open" : ""}`} aria-hidden>
                ►
              </span>
              My Work
            </button>
            <div className="experience-dropdown">
              <ul>
                {job.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
