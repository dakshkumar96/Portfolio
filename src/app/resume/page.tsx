import {
  achievements,
  certifications,
  education,
  experience,
  projects,
  site,
  skills,
} from "@/content/site";

export const metadata = {
  title: "Resume | Daksh Kumar",
};

export default function ResumePage() {
  return (
    <article className="about-copy">
      <header style={{ textAlign: "center", marginBottom: 48 }}>
        <h1 className="serif" style={{ fontSize: 56, letterSpacing: "-0.05em" }}>
          {site.name}
        </h1>
        <p style={{ marginTop: 10, color: "var(--muted)" }}>
          {site.role} · {site.location}
        </p>
        <p style={{ marginTop: 8 }}>
          <a href={`mailto:${site.email}`}>{site.email}</a>
          {" · "}
          <a href={site.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        </p>
      </header>

      <section>
        <h2 className="spaced" style={{ fontSize: 14, marginBottom: 16 }}>
          Profile
        </h2>
        <p>{site.bio}</p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="spaced" style={{ fontSize: 14, marginBottom: 16 }}>
          Selected Work
        </h2>
        {projects.map((project) => (
          <div key={project.slug} style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 20 }}>{project.title}</h3>
            <p style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
              {project.stack.join(", ")}
            </p>
            <p>{project.oneLiner}</p>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="spaced" style={{ fontSize: 14, marginBottom: 16 }}>
          Experience
        </h2>
        {experience.map((job) => (
          <div key={`${job.org}-${job.role}`} style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 20 }}>{job.org}</h3>
            <p style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
              {job.role} · {job.dates}
            </p>
            <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {job.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="spaced" style={{ fontSize: 14, marginBottom: 16 }}>
          Skills
        </h2>
        {skills.map((group) => (
          <p key={group.title} style={{ marginBottom: 8 }}>
            <strong>{group.title}:</strong> {group.items.join(", ")}
          </p>
        ))}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="spaced" style={{ fontSize: 14, marginBottom: 16 }}>
          Education
        </h2>
        {education.map((entry) => (
          <div key={entry.title} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 20 }}>{entry.title}</h3>
            <p style={{ color: "var(--muted)", margin: "4px 0 8px" }}>
              {entry.place} · {entry.dates}
            </p>
            {entry.note ? <p>{entry.note}</p> : null}
          </div>
        ))}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="spaced" style={{ fontSize: 14, marginBottom: 16 }}>
          Achievements / Certifications
        </h2>
        <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {achievements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p style={{ marginTop: 12 }}>
          Certifications:{" "}
          {certifications
            .map((cert) => `${cert.name}, issued ${cert.issued}`)
            .join("; ")}
        </p>
      </section>
    </article>
  );
}
