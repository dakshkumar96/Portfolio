import Link from "next/link";
import { notFound } from "next/navigation";
import { experience, getExperience } from "@/content/site";

export function generateStaticParams() {
  return experience.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({ params }: PageProps<"/experience/[slug]">) {
  const { slug } = await params;
  const job = getExperience(slug);
  return {
    title: job ? `${job.role} | Daksh Kumar` : "Daksh Kumar",
    description: job ? `${job.role} at ${job.org}, ${job.dates}.` : undefined,
  };
}

export default async function ExperienceDetailPage({ params }: PageProps<"/experience/[slug]">) {
  const { slug } = await params;
  const job = getExperience(slug);

  if (!job) notFound();

  return (
    <article>
      <Link
        href="/profile"
        className="nav-link"
        style={{ display: "inline-block", marginBottom: 24 }}
      >
        ← Back
      </Link>

      <section className="work-hero">
        <p className="tag" style={{ display: "inline-block", marginBottom: 12 }}>
          {job.dates}
          {job.location ? ` · ${job.location}` : ""}
        </p>
        <h1 className="serif">{job.org}</h1>
        <p>{job.role}</p>
      </section>

      <div className="work-body">
        <ul>
          {job.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
