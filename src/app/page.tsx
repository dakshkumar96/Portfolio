import { Avatar } from "@/components/Avatar";
import { CommandPill } from "@/components/CommandPill";
import { CurveTitle } from "@/components/CurveTitle";
import { ExperienceList } from "@/components/ExperienceList";
import { ProjectCarousel } from "@/components/ProjectCarousel";
import {
  achievements,
  certifications,
  education,
  homeAbout,
  projects,
  site,
  skills,
} from "@/content/site";

export default function Home() {
  const featured = projects.filter((project) => project.featured);

  return (
    <>
      <section className="hero-section">
        <CurveTitle text={site.name} />
        <Avatar />
        <p className="hero-subtitle">{site.role}</p>
        <CommandPill />
        <p className="bio">{site.bio}</p>
      </section>

      <section id="highlights">
        <div className="section-head">
          <h2>
            <span className="spaced">Highlights</span>
            <span className="accent-star" aria-hidden>
              ★
            </span>
          </h2>
          <p className="section-kicker">Some things I made because I could</p>
        </div>
        <ProjectCarousel projects={featured} />
      </section>

      <section>
        <div className="section-head">
          <h2>{homeAbout.heading}</h2>
        </div>
        <p className="bio">{homeAbout.paragraph}</p>
      </section>

      <section>
        <div className="section-head">
          <h2>My Experience</h2>
        </div>
        <ExperienceList />
      </section>

      <section>
        <div className="section-head">
          <h2>Skill Stack</h2>
        </div>
        <div className="skill-grid">
          {skills.map((group) => (
            <div key={group.title} className="skill-col">
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>My Education</h2>
        </div>
        <div className="experience-list">
          {education.map((entry) => (
            <article key={entry.title} className="experience-item">
              <div className="experience-content">
                <div className="experience-head">
                  <div>
                    <h3>{entry.title}</h3>
                    <p className="experience-role">
                      {entry.place}
                      <span> · {entry.dates}</span>
                    </p>
                    {entry.note ? (
                      <p className="experience-location">{entry.note}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Achievements / Certifications</h2>
        </div>
        <ul className="facts-list">
          {achievements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="cert-note">
          Certifications:{" "}
          {certifications
            .map((cert) => `${cert.name}, issued ${cert.issued}`)
            .join("; ")}
        </p>
      </section>
    </>
  );
}
