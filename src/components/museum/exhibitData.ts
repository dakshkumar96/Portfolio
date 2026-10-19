import {
  achievements,
  certifications,
  education,
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
  /** Shown under the title on the label: the company a role was held at. */
  company?: string;
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
  /*
    The two cases either side of the photographs: the record behind the
    portraits - where he studied, and what he has won and been certified
    in. Built from the site's own records, so a change there changes the
    case.
  */
  {
    id: "about-education",
    room: "about",
    title: "Education",
    meta: "Royal Holloway · City School and College",
    bullets: education.map((entry) =>
      [`${entry.title}, ${entry.place}, ${entry.dates}.`, entry.note].filter(Boolean).join(" "),
    ),
  },
  {
    id: "about-awards",
    room: "about",
    title: "Awards and Certificates",
    meta: "Competitions, practice and a job simulation",
    bullets: [
      ...achievements,
      ...certifications.map((cert) => `${cert.name}, issued ${cert.issued}.`),
    ],
  },
];

/**
 * The Experience room: every role, in seven cases and two boards. Each
 * case is named for the role, with the company under it. The first three
 * stand across the back wall, two more on each side wall, and the boards
 * stand in the middle between the cases at the back, as in the About room.
 */
const role = (
  id: string,
  title: string,
  company: string,
  meta: string,
  bullets: string[],
): ExhibitDatum => ({ id: `exp-${id}`, room: "experience", title, company, meta, bullets });

export const experienceExhibits: ExhibitDatum[] = [
  // across the back
  role("president", "President", "International Society, Royal Holloway", "Part-time · May 2026 – Present", [
    "Launched a digital membership system with Apple Wallet cards, giving members discounts at local stores and guaranteed interviews with partner job agencies.",
    "Run the society like a startup, with events nobody on campus had done before: the Night of Nations, a Cultural Fashion Show and a go-karting Rush Rally, many of them with the International Community and the other cultural societies.",
    "Lead a committee of 10, coordinating day-to-day society operations.",
  ]),
  role("nextround", "Founding Product Engineer", "NextRound", "Part-time · Oct 2026 – Present · Hybrid", [
    "Joined as one of the first engineers at an early-stage startup building evidence-based hiring, helping companies judge candidates on what they can actually do rather than just their CV, and work directly with the CEO on the core product.",
    "Improving the NextRound portal and the candidate assessment experience, using feedback from early users to decide what to fix and build first.",
    "Run the platform locally to test changes properly before anything goes live.",
    "Help shape the product roadmap and think through how the platform should grow as we take on more clients.",
  ]),
  role("research", "Research Assistant", "Royal Holloway", "Internship · May 2026 – Aug 2026 · Remote", [
    "Co-authored research applying conformal prediction to exoplanet orbital parameter estimation from radial-velocity data, achieving 100% empirical coverage against a 90% nominal target on 34 held-out real stars, with no vacuous intervals.",
    "Designed and built the synthetic data generation pipeline, simulating planetary RV signals from Kepler orbital equations and injecting real noise sampled from NASA telescope observations.",
    "Implemented a likelihood-ratio reweighting scheme (Tibshirani et al., 2019) so uncertainty intervals calibrated entirely on synthetic data transfer validly to real, unseen observations under distribution shift.",
  ]),
  // the left wall
  role("host", "Host", "Insanity Radio 103.2FM", "Part-time · Oct 2026 – Present · Egham, on-site", [
    "Host Artificial Insanity, a weekly one-hour talk show on Insanity Radio, Royal Holloway's student and community station. It breaks down the latest AI news in plain English for everyone, not just tech students, with a focus on how AI is changing everyday life, work and study.",
    "Invite Royal Holloway academics and people working in industry as guests to share their perspective on where AI is heading.",
    "Some episodes also cover careers, student life and the real day-to-day challenges international students face.",
    "Came in with no radio experience and took this on to push myself, get better at speaking live, and have honest conversations with interesting people.",
  ]),
  role("marketing", "Marketing Coordinator", "Palmy", "Internship · Aug 2025 – Oct 2025 · Hybrid", [
    "Edited long-form podcast episodes in Premiere Pro and produced trailers and short-form clips for YouTube, Instagram and TikTok.",
    "Handled full SEO setup across platforms, including titles, descriptions, tags and thumbnails, to improve discoverability.",
    "Designed branding and thumbnail visuals in Photoshop, building a consistent look across all distributed content.",
  ]),
  role("video", "Video Editor", "Freelance", "Freelance · from the age of fifteen", [
    "Began editing at thirteen and was freelancing by fifteen.",
  ]),
  // the right wall
  role("ambassador", "Student Ambassador", "Royal Holloway", "Part-time · Sep 2026 – Present · Egham, on-site", [
    "Speak directly with prospective students and their families at open days and campus tours, building strong communication skills through regular public-facing interaction.",
    "Engage with a wide range of visitors, from sixth form students to parents and teachers, adjusting how I present the university depending on who I am talking to.",
  ]),
  role("hall-life", "Hall Life Assistant", "Royal Holloway", "Part-time · Sep 2026 – Present · Egham, on-site", [
    "Support residents across halls of residence, running kitchen meetings and flat meetings to check in on wellbeing and catch problems early.",
    "Mediate conflicts between flatmates and help resolve day-to-day living issues before they escalate.",
    "Handle critical incidents when they come up, and signpost residents to the right university support services: wellbeing, welfare, or wherever they need.",
  ]),
  role("bar", "Bar Associate", "J D Wetherspoon", "Part-time · Feb 2026 – Present · Windsor, on-site", [
    "Work across both bar and floor service at a large, three-level city-centre pub with a staff of around 80.",
    "Handle customer complaints and resolve issues directly, staying calm and solving problems under pressure.",
  ]),
  // the two boards between the cases at the back
  {
    id: "exp-alongside",
    room: "experience",
    title: "Alongside the Degree",
    meta: "Work that is not on the CV",
    body:
      "Behind a bar, as a student ambassador and in hall life, and cutting video: he began editing at thirteen and was freelancing by fifteen.",
  },
  {
    id: "exp-figures",
    room: "experience",
    title: "In Figures",
    meta: "The roles, read as numbers",
    body:
      "He leads a committee of ten and works a three-level pub with a staff of around eighty. His research reached 100% empirical coverage against a 90% target on 34 held-out real stars.",
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

/**
 * The Art room: what each frame is, so that clicking any of them opens
 * something about that piece. Every date, place and price below is read
 * off the poster itself.
 */
const piece = (id: string, title: string, meta: string, body: string, bullets?: string[]): ExhibitDatum => ({
  id: `art-${id}`,
  room: "art",
  title,
  meta,
  body,
  bullets,
});

export const artPieces: Record<string, ExhibitDatum> = {
  "/museum/art-1.webp": piece(
    "fashion",
    "Cultural Fashion Show",
    "Poster · International Society x International Community",
    "A runway night for the society's international community: wear your culture, show your style and celebrate the world together. Red curtains and a lit staircase set the stage.",
    ["8th October, SU Hall, 18:00 to 20:00"],
  ),
  "/museum/art-2.webp": piece(
    "wrap",
    "Term 1 Wrap",
    "Graphic · RHUL International Society",
    "The society's first term, closed out as a scrapbook: photographs from the stall, the stage and the go-karting day, pinned on a film-strip ground under a yellow folder.",
  ),
  "/museum/art-3.webp": piece(
    "potluck",
    "Potluck",
    "Poster · RHUL International Society x International Community",
    "A day of shared food, with everyone bringing something from home. Illustrated, warm and loud on purpose, to feel like the table it advertises.",
    ["8th October, 9am to 5pm, SU Hall"],
  ),
  "/museum/art-4.webp": piece(
    "movie",
    "Movie Night",
    "Poster · International Community x International Society",
    "A film evening in a lecture theatre. A script title over an empty screen and a dark house, so the poster reads as the room it is for.",
    ["10th October, 6 to 8pm, Bourne LT2"],
  ),
  "/museum/art-5.webp": piece(
    "events",
    "Upcoming Events",
    "Programme · September and October",
    "The society's calendar on one sheet, each event in its own colour so the week can be read at a glance.",
    [
      "22nd: Freshers Fair, 09:30 to 17:00, Founders Square",
      "24th: Taster Session, 19:00 to 19:50, Boilerhouse 007",
      "30th: A Letter to Future Me, 18:00 to 20:00",
      "6th: Sip and Paint, 19:00 to 21:00",
    ],
  ),
  "/museum/art-6.webp": piece(
    "nations",
    "Night of Nations",
    "Poster · International Community x International Society",
    "The society's biggest night: a globe ringed by the landmarks of the world, with the crest of each national and cultural society round the edge.",
    ["7th October 2025, 10pm, last entry 12am, SU", "Students £4, guests £6"],
  ),
  "/museum/art-7.webp": piece(
    "rally",
    "Rush Rally",
    "Poster · RHUL International Society",
    "A go-karting day built as a race poster: a chequered flag, a car at speed, and the schedule set like a timing sheet.",
    ["TeamSport Go-Karting Reading, 26th November 2025", "Only 28 spots available"],
  ),
  "/museum/thumb-1.webp": piece(
    "thumb-rich",
    "Get Rich with A.I",
    "Video thumbnail",
    "A thumbnail for a video on making money with AI: a robotic figure in a bowler hat, banknotes in the air and the title cut across the top in glowing blue.",
    ["One of the 150+ videos edited end to end across two YouTube channels"],
  ),
  "/museum/thumb-2.webp": piece(
    "thumb-escape",
    "Escape This",
    "Video thumbnail",
    "A thumbnail as a single diagram: a crowd of drawn figures piled under a bell curve and one red figure standing clear of it.",
    ["One of the 150+ videos edited end to end across two YouTube channels"],
  ),
  "/museum/thumb-3.webp": piece(
    "thumb-marlon",
    "Interviewing Brown Marlon",
    "Video thumbnail",
    "A thumbnail for an interview: two people at studio microphones, turned to face each other, with the guest's name on a yellow label.",
    ["One of the 150+ videos edited end to end across two YouTube channels"],
  ),
  "/museum/thumb-4.webp": piece(
    "thumb-untold",
    "The Untold Story",
    "Video thumbnail",
    "A thumbnail for a story told from the inside: one face broken into torn paper and colour, the title across the top.",
    ["One of the 150+ videos edited end to end across two YouTube channels"],
  ),
  "/museum/thumb-5.webp": piece(
    "thumb-insanity",
    "Insanity?",
    "Video thumbnail",
    "A thumbnail built to stop a scroll: three famous faces, coloured bars over their eyes and a one-word question in yellow.",
    ["One of the 150+ videos edited end to end across two YouTube channels"],
  ),
  // the side walls
  "stat-channels": piece(
    "stat-channels",
    "4+ Pages and Channels",
    "Managed · from the marketing portfolio",
    "Four or more pages and channels run at once, across a student society, a podcast company and two YouTube channels.",
  ),
  "stat-followers": piece(
    "stat-followers",
    "5,000+ Followers",
    "One managed page · Palmy AI",
    "A single managed page grown past five thousand followers.",
  ),
  "stat-videos": piece(
    "stat-videos",
    "150+ Videos",
    "Edited end to end · two YouTube channels",
    "More than a hundred and fifty videos edited from raw footage to upload across two YouTube channels, thumbnails and titles included.",
  ),
  "stat-weekly": piece(
    "stat-weekly",
    "50+ People Weekly",
    "Campus activations · Higherin",
    "On-campus campaigns that reach fifty or more people every week.",
  ),
  "series-system": piece(
    "system",
    "One Visual System",
    "Instagram, 400 to 850 followers",
    "The International Society's posters, reels and thumbnails were designed as one system, so everything it posted looked like the same society. Its Instagram grew from 400 to 850 followers over that time.",
  ),
  "series-society": piece(
    "identity",
    "The International Society",
    "Visual identity and event campaigns",
    "The look of a student society: one identity carried across every poster, event campaign and post, from the Night of Nations to the Rush Rally.",
  ),
};

/** The two boards that stand in front of the Art wall, in the manner of the About room's. */
export const artBoards: ExhibitDatum[] = [
  {
    id: "art-board-work",
    room: "art",
    title: "The Visual Work",
    meta: "Posters, thumbnails and an identity",
    body:
      "Society comms and Palmy AI were treated like products, with one visual system across everything: posters, reels, podcast thumbnails and the SEO packaging around them. The wall shows seven posters from the International Society and five thumbnails from the videos edited alongside them.",
  },
  {
    id: "art-board-numbers",
    room: "art",
    title: "By the Numbers",
    meta: "From the marketing portfolio",
    body:
      "Four or more pages and channels managed. One page grown past 5,000 followers. More than 150 videos edited end to end across two YouTube channels. Fifty people or more reached every week on campus. The International Society's Instagram went from 400 to 850 followers.",
  },
];

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
    meta: "Photograph. On the way to the United Kingdom",
    body:
      "Daksh on the flight to the UK. He made the journey alone, leaving a small town in Sindh, Pakistan, for a country where he did not know a single person. Most of what hangs in this museum came after this flight.",
  },
];

/** The photographs hung along the corridor, and what is written under them. */
export const hackathonExhibit: ExhibitDatum = {
  id: "hall-hackathon",
  room: "about",
  title: "Hackathons and London",
  meta: "Photograph. Where he goes to learn",
  body:
    "Most weekends he is at a hackathon or a tech event somewhere in London, building late and meeting people who are further along than he is. That is why he goes: to be the least experienced person at the table and learn from everyone else at it. He loves living in London for exactly that.",
};

export const societyExhibit: ExhibitDatum = {
  id: "hall-society",
  room: "about",
  title: "The Society",
  meta: "Photograph. President, International Society, Royal Holloway",
  body:
    "He is president of the International Society at Royal Holloway, and loves it more than anything else he does. He runs it like a startup: new kinds of events, things nobody on campus had tried, and ideas that had not been done before, like the Apple Wallet membership card, partnerships with local businesses and events people come back for.",
};

export const childhoodExhibit: ExhibitDatum = {
  id: "hall-childhood",
  room: "about",
  title: "Where It Started",
  meta: "Photograph. Childhood, at home",
  body:
    "Daksh as a boy, in a checked shirt and sunglasses a size too big, tilting his head for the camera. This was before the flight, the degree and the first line of code.",
};

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
  childhoodExhibit,
  hackathonExhibit,
  societyExhibit,
  ...aboutExhibits,
  ...experienceExhibits,
  ...projectExhibits,
  ...skillExhibits,
  ...artExhibits,
  ...Object.values(artPieces),
  ...artBoards,
  ...contactExhibits,
  ...resumeExhibits,
];
