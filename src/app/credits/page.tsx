import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink } from "@/components/ExternalLink";

export const metadata: Metadata = {
  title: "Model credits",
  description: "Attribution for the 3D models used in the museum.",
};

/**
 * Every model in the museum is CC-BY-4.0, which permits commercial use
 * but requires the author to be credited. This page is that credit.
 */
const MODELS = [
  {
    title: "Samsung A3",
    author: "The Latest Shit",
    authorUrl: "https://sketchfab.com/thelatestshit",
    source:
      "https://sketchfab.com/3d-models/samsung-a3-50386f953cdb4b4d86060c146d8683b7",
    used: "Stands in for the first phone",
  },
  {
    title: "Laptop",
    author: "Aullwen",
    authorUrl: "https://sketchfab.com/Aullwen",
    source:
      "https://sketchfab.com/3d-models/laptop-7d870e900889481395b4a575b9fa8c3e",
    used: "The first laptop",
  },
  {
    title: "Human Brain",
    author: "3DRT STUDIOS",
    authorUrl: "https://sketchfab.com/Hanako.com",
    source:
      "https://sketchfab.com/3d-models/human-brain-7a27c17fd6c0488bb31ab093236a47fb",
    used: "Brain and neurons",
  },
];

export default function CreditsPage() {
  return (
    <article className="credits">
      <p className="museum-eyebrow">Credits</p>
      <h1 className="serif credits-title">Model credits</h1>
      <p className="credits-intro">
        The 3D models in the museum are licensed under{" "}
        <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>
        . Credit to their authors below.
      </p>

      <ul className="credits-list">
        {MODELS.map((model) => (
          <li key={model.source}>
            <h2>{model.title}</h2>
            <p>
              by{" "}
              <ExternalLink href={model.authorUrl}>{model.author}</ExternalLink>{" "}
              · <ExternalLink href={model.source}>source</ExternalLink>
            </p>
            <p className="credits-used">{model.used}</p>
          </li>
        ))}
      </ul>

      <p className="credits-back">
        <Link href="/">← Back to the museum</Link>
      </p>
    </article>
  );
}
