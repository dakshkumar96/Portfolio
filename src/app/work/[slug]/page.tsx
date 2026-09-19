import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectArt } from "@/components/ProjectArt";
import { getProject, projects } from "@/content/site";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: PageProps<"/work/[slug]">) {
  const { slug } = await params;
  const project = getProject(slug);
  return {
    title: project ? `${project.title} | Daksh Kumar` : "Daksh Kumar",
    description: project?.oneLiner,
  };
}

export default async function WorkPage({ params }: PageProps<"/work/[slug]">) {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) notFound();

  return (
    <article>
      <Link href="/" className="nav-link" style={{ display: "inline-block", marginBottom: 24 }}>
        ← Home
      </Link>
      <div className="project-card" style={{ pointerEvents: "none", marginBottom: 28 }}>
        <ProjectArt slug={project.slug} />
      </div>
      <section className="work-hero">
        <p className="tag" style={{ display: "inline-block", marginBottom: 12 }}>
          {project.status} · {project.year}
        </p>
        <h1 className="serif">{project.title}</h1>
        <p>{project.oneLiner}</p>
      </section>
      <div className="work-body">
        <p>{project.summary}</p>
        <ul>
          {project.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {project.live || project.repo ? (
          <div className="tag-row" style={{ marginTop: 28 }}>
            {project.live ? (
              <a className="tag" href={project.live} target="_blank" rel="noreferrer">
                Visit the live site ↗
              </a>
            ) : null}
            {project.repo ? (
              <a className="tag" href={project.repo} target="_blank" rel="noreferrer">
                View the code ↗
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="tag-row" style={{ marginTop: 28 }}>
          {project.stack.map((item) => (
            <span key={item} className="tag">
              {item}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
