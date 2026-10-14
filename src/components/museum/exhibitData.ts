import {
  achievements,
  certifications,
  education,
  experience,
  projects,
  skills,
  site,
  contact,
  about,
} from "@/content/site";

/** The six doors off the corridor, and the resume, which has a card but no door. */
export type RoomId = "about" | "experience" | "projects" | "skills" | "art" | "contact" | "resume";


export type ExhibitDatum = {
  id: string;
  room: RoomId;
  title: string;
  meta?: string;
  body?: string;
  bullets?: string[];
  /** Tools, shown as a grid of boxes with their marks rather than as a list. */
  tools?: string[];
  /**
   * Buttons that close the card. A project always carries both of these;
   * an `href` that is missing means that destination is not public, and
   * the button is shown, dimmed, instead of vanishing.
   */
  actions?: { label: string; href?: string }[];
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
  },
  {
    id: "about-story",
    room: "about",
    title: "How I Got Here",
    meta: "The short version",
    body: about.whoIAm[0],
    bullets: [about.whoIAm[2]],
  },
  {
    id: "about-work",
    room: "about",
    title: "What I Build",
    meta: about.lookingFor,
    body: about.whoIAm[3],
    bullets: [about.whoIAm[1]],
  },
  /*
    The two reading boards that stand between the photographs.

    Written as interpretive panels - third person, plain, and built only
    from what the About page already says. A panel tells you what you
    are looking at; it does not try to move you.
  */
  {
    id: "about-crossing",
    room: "about",
    title: "The Crossing",
    meta: "Sindh to the United Kingdom",
    body:
      "At seventeen he took a flight to the United Kingdom alone, from a small town in Sindh, Pakistan, without knowing a single person on the other side. It became the pattern he has kept since: do the thing that frightens you, and learn from whatever breaks.",
  },
  {
    id: "about-off-the-clock",
    room: "about",
    title: "Off the Clock",
    meta: "Practice and pastime",
    body:
      "He meditates daily and keeps a journal every night, mostly to stay honest about where he actually is. Away from code he works behind a bar, runs the International Society as its president, and does student ambassador work. What time is left goes on films, and on whatever music has his attention that week.",
  },
];

/**
 * The Experience room: everything he has done, in six cases. The three
 * roles come first, most recent first, one case each; then education, the
 * awards and certificates together, and the work done alongside the
 * degree. Built from the site's own records, so a change there changes the
 * case.
 */
export const experienceExhibits: ExhibitDatum[] = [
  ...experience.map((job) => ({
    id: `exp-${job.slug}`,
    room: "experience" as RoomId,
    title: job.org,
    meta: [job.role, job.dates, job.location].filter(Boolean).join(" · "),
    bullets: job.bullets,
  })),
  {
    id: "exp-education",
    room: "experience",
    title: "Education",
    meta: "Royal Holloway · City School and College",
    bullets: education.map((entry) =>
      [`${entry.title}, ${entry.place}, ${entry.dates}.`, entry.note].filter(Boolean).join(" "),
    ),
  },
  {
    id: "exp-recognition",
    room: "experience",
    title: "Awards and certificates",
    meta: "Competitions, practice and a job simulation",
    bullets: [
      ...achievements,
      ...certifications.map((cert) => `${cert.name}, issued ${cert.issued}.`),
    ],
  },
  {
    id: "exp-alongside",
    room: "experience",
    title: "Alongside the degree",
    meta: "Work that is not on the CV",
    body:
      "Behind a bar, as a student ambassador and in hall life, and cutting video: he began editing at thirteen and was freelancing by fifteen.",
  },
];

/**
 * Projects that stand in the Projects room.
 *
 * `reclaim` is held back deliberately. Five cases filled the back wall
 * edge to edge with no air between them, and a room that is full is a
 * storeroom rather than a gallery. It is still on the 2D site at
 * /work/reclaim; only the vitrine is gone.
 */
const HELD_BACK = new Set(["reclaim"]);

export const projectExhibits: ExhibitDatum[] = projects
  .filter((project) => !isDesign(project.tags) && !HELD_BACK.has(project.slug))
  .map((project) => ({
    id: `proj-${project.slug}`,
    room: "projects",
    title: project.title,
    meta: `${project.stack.join(" · ")} · ${project.year}`,
    body: project.summary,
    bullets: project.highlights,
    actions: [
      { label: "Live website", href: project.live },
      { label: "Code", href: project.repo },
    ],
  }));

export const skillExhibits: ExhibitDatum[] = skills.map((group) => ({
  id: `skill-${group.title}`,
  room: "skills",
  title: group.title,
  meta: `${group.items.length} tools`,
  tools: [...group.items],
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
  /*
    Written as museum object labels: what the thing is, who made it and
    when where that is known, then a sentence or two of plain fact.
    Labels in a real museum are dry on purpose - the object carries the
    feeling, and the text only tells you what you are looking at.
  */
  {
    id: "case-first-phone",
    room: "about",
    title: "Samsung Galaxy J2",
    meta: "Mobile telephone. Samsung, 2015",
    body: "His first phone.",
    links: [{ label: "Model credits", href: "/credits" }],
  },
  {
    id: "case-first-laptop",
    room: "about",
    title: "HP 14",
    meta: "Laptop computer. Hewlett-Packard",
    body: "His first laptop, and the machine he learned to code and edit video on.",
    links: [{ label: "Model credits", href: "/credits" }],
  },
  {
    id: "case-quantum",
    room: "skills",
    title: "Quantum Computing",
    meta: "Model of a dilution refrigerator",
    body:
      "The gold chandelier usually pictured as a quantum computer is the refrigerator around it. Each stage is colder than the one above, until the qubits at the bottom sit a fraction of a degree above absolute zero, where their quantum states last long enough to compute with. A subject he reads about for its own sake.",
  },
  {
    id: "case-brain",
    room: "about",
    title: "Brain and Neurons",
    meta: "Anatomical model",
    body:
      "He reads about how working with AI changes the way people think, and about where the way these models learn resembles the way we do.",
    links: [{ label: "Model credits", href: "/credits" }],
  },
  {
    id: "case-cinema",
    room: "art",
    title: "Cinema",
    meta: "Film camera",
    body: "He watches a great deal of film. It is the one thing he does that is never work.",
  },
  {
    id: "case-claude",
    room: "skills",
    title: "Claude",
    meta: "Language model. Anthropic",
    body: "The AI tool he uses most, and has since shortly after it was released.",
  },
];

/** The photograph hung in the hall itself, on the right-hand wall before the first door. */
export const hallExhibits: ExhibitDatum[] = [
  {
    id: "hall-flight",
    room: "about",
    title: "The Flight Over",
    meta: "Photograph. On the way to the United Kingdom, aged 17",
    body:
      "Daksh at seventeen, on the flight to the UK. He made the journey alone, leaving a small town in Sindh, Pakistan, for a country where he did not know a single person. Most of what hangs in this museum came after this flight.",
  },
];

export const exhibitsByRoom: Record<RoomId, ExhibitDatum[]> = {
  about: aboutExhibits,
  experience: experienceExhibits,
  projects: projectExhibits,
  skills: skillExhibits,
  art: artExhibits,
  contact: contactExhibits,
  resume: resumeExhibits,
};

export const allExhibits: ExhibitDatum[] = [
  ...caseExhibits,
  ...hallExhibits,
  ...aboutExhibits,
  ...experienceExhibits,
  ...projectExhibits,
  ...skillExhibits,
  ...artExhibits,
  ...contactExhibits,
  ...resumeExhibits,
];
