import Link from "next/link";
import type { Project } from "@/content/site";
import { ProjectArt } from "./ProjectArt";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/work/${project.slug}`} className="project-card">
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
  );
}

export function ProjectGrid({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return <p className="empty-note">Nothing here yet. Check back soon.</p>;
  }

  return (
    <div className="project-grid">
      {projects.map((project) => (
        <ProjectCard key={project.slug} project={project} />
      ))}
    </div>
  );
}
