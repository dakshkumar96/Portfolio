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
  };
}

export default async function ExperienceDetailPage({ params }: PageProps<"/experience/[slug]">) {
  const { slug } = await params;
  const job = getExperience(slug);

  if (!job) notFound();

  return null;
}
