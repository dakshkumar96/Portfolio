import {
  experience,
  projects,
  education,
  skills,
  site,
  contact,
  about,
} from "@/content/site";

/** The five doors off the corridor. */
export type RoomId = "about" | "projects" | "skills" | "art" | "contact" | "resume";

export type ExhibitDatum = {
  id: string;
  room: RoomId;
  title: string;
  meta?: string;
  body?: string;
  bullets?: string[];
  links?: { label: string; href: string; external?: boolean }[];
};

const isDesign = (tags: string[]) => tags.includes("Design");

/**
 * About Me also carries experience and education — there is no separate
 * Experience door, so those exhibits live in this room rather than being
 * dropped.
 */
/**
 * The first three entries hang in the About room's frames, so they are
 * the personal ones — the record of jobs and degrees follows behind them
 * rather than taking a frame.
 */
export const aboutExhibits: ExhibitDatum[] = [
  {
    id: "about-bio",
    room: "about",
    title: "About Me",
    meta: site.role,
    body: about.intro,
    links: [{ label: "Read the full story", href: "/about" }],
  },
  {
    id: "about-story",
    room: "about",
    title: "How I Got Here",
    meta: "The short version",
    body: about.whoIAm[0],
    bullets: [about.whoIAm[2]],
    links: [{ label: "Read the full story", href: "/about" }],
  },
  {
    id: "about-work",
    room: "about",
    title: "What I Build",
    meta: about.lookingFor,
    body: about.whoIAm[3],
    bullets: [about.whoIAm[1]],
    links: [{ label: "See the projects", href: "/dev" }],
  },
  ...experience.map((job) => ({
    id: `exp-${job.slug}`,
    room: "about" as RoomId,
    title: job.org,
    meta: [job.role, job.dates, job.location].filter(Boolean).join(" · "),
    bullets: job.bullets,
    links: [{ label: "View this role", href: `/experience/${job.slug}` }],
  })),
  ...education.map((entry) => ({
    id: `edu-${entry.title}`,
    room: "about" as RoomId,
    title: entry.title,
    meta: `${entry.place} · ${entry.dates}`,
    body: entry.note,
  })),
];

export const projectExhibits: ExhibitDatum[] = projects
  .filter((project) => !isDesign(project.tags))
  .map((project) => ({
    id: `proj-${project.slug}`,
    room: "projects",
    title: project.title,
    meta: `${project.stack.join(" · ")} · ${project.year}`,
    body: project.summary,
    bullets: project.highlights,
    links: [{ label: "Open case study", href: `/work/${project.slug}` }],
  }));

export const skillExhibits: ExhibitDatum[] = skills.map((group) => ({
  id: `skill-${group.title}`,
  room: "skills",
  title: group.title,
  meta: `${group.items.length} tools`,
  bullets: group.items,
}));

export const artExhibits: ExhibitDatum[] = projects
  .filter((project) => isDesign(project.tags))
  .map((project) => ({
    id: `art-${project.slug}`,
    room: "art",
    title: project.title,
    meta: project.stack.join(" · "),
    body: project.summary,
    bullets: project.highlights,
    links: [{ label: "See the work", href: `/work/${project.slug}` }],
  }));

export const contactExhibits: ExhibitDatum[] = [
  {
    id: "contact-main",
    room: "contact",
    title: "Contact",
    body: contact.blurb,
    links: [
      { label: site.email, href: `mailto:${site.email}` },
      { label: "LinkedIn", href: site.linkedin, external: true },
      { label: "Instagram", href: site.instagram, external: true },
      { label: "GitHub", href: site.github, external: true },
    ],
  },
];

export const resumeExhibits: ExhibitDatum[] = [
  {
    id: "resume-main",
    room: "resume",
    title: "Resume",
    meta: `${site.role} · ${site.location}`,
    body: site.bio,
    links: [
      { label: "Open the full resume", href: "/resume" },
      { label: site.email, href: `mailto:${site.email}` },
    ],
  },
];

/**
 * The six cases standing in the corridor itself.
 *
 * Each one is a thing this person actually works on, so the walk past
 * them reads as a survey of the work rather than decoration. The order
 * matches CASE_POSITIONS, and the index picks which hologram is shown.
 */
export const caseExhibits: ExhibitDatum[] = [
  {
    id: "case-first-phone",
    room: "about",
    title: "Samsung Galaxy J2",
    meta: "First phone",
    body:
      "Daksh's first mobile phone, which he got in second standard. Everything since started somewhere, and for him it started here.",
    links: [{ label: "Model credits", href: "/credits" }],
  },
  {
    id: "case-first-laptop",
    room: "about",
    title: "HP 14",
    meta: "First laptop",
    body:
      "His first laptop, at thirteen. This is the machine he started coding and video editing on, and the point where making things stopped being something other people did.",
    links: [{ label: "Model credits", href: "/credits" }],
  },
  {
    id: "case-quantum",
    room: "skills",
    title: "Quantum Computing",
    meta: "Superconducting qubits",
    body:
      "Daksh loves studying quantum computers and the technology behind them. The chandelier everyone pictures is the dilution refrigerator, not the processor: each stage takes the qubits closer to absolute zero, because a coherent state only survives once thermal noise is almost entirely gone.",
  },
  {
    id: "case-brain",
    room: "about",
    title: "Brain and Neurons",
    meta: "AI and the mind",
    body:
      "Daksh loves reading about how AI is transforming us at the neuron level, and what it is doing to our brains. The overlap between how these models learn and how we do is the part he keeps coming back to.",
    links: [{ label: "Model credits", href: "/credits" }],
  },
  {
    id: "case-cinema",
    room: "art",
    title: "Cinema",
    meta: "Escapism",
    body:
      "He loves watching films. Cinema is escapism for him, and the one thing that is reliably not work.",
  },
  {
    id: "case-claude",
    room: "skills",
    title: "Claude",
    meta: "Most-used AI tool",
    body:
      "The AI tool he uses more than any other, and has done since not long after it launched, well before most people were paying attention.",
  },
];

export const exhibitsByRoom: Record<RoomId, ExhibitDatum[]> = {
  about: aboutExhibits,
  projects: projectExhibits,
  skills: skillExhibits,
  art: artExhibits,
  contact: contactExhibits,
  resume: resumeExhibits,
};

export const allExhibits: ExhibitDatum[] = [
  ...caseExhibits,
  ...aboutExhibits,
  ...projectExhibits,
  ...skillExhibits,
  ...artExhibits,
  ...contactExhibits,
  ...resumeExhibits,
];
