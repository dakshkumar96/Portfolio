export const site = {
  name: "Daksh Kumar",
  firstName: "Daksh",
  handle: "daksh",
  role: "AI Engineer in Training at Royal Holloway",
  location: "Egham, UK",
  headline: "Daksh Kumar, AI Engineer in Training",
  description:
    "Final year computer science student at Royal Holloway, focused on AI. I build RAG systems, agent harnesses and fine-tuned models.",
  email: "dakshkumar2k2@gmail.com",
  linkedin: "https://linkedin.com/in/dakshkumar96",
  instagram: "https://www.instagram.com/_daksh.mov_",
  github: "https://github.com/dakshkumar96",
  command: "whoami",
  commandCopy: `Daksh Kumar
AI Engineer in Training at Royal Holloway
RAG systems, agent harnesses and fine-tuned models
dakshkumar2k2@gmail.com
https://linkedin.com/in/dakshkumar96`,
  bio: "Final year computer science student at Royal Holloway, focused on AI. I left a small town in Pakistan to study in the UK, and now spend most of my time building RAG systems, agent harnesses and fine-tuned models. I'm good with people too, and I genuinely enjoy writing SQL.",
};

export const homeAbout = {
  heading: "About Me",
  paragraph:
    "I'm a computer science student focused on AI. I came to the UK alone from Pano Aqil, a small town in Sindh, Pakistan. I enjoy building RAG systems, agent harnesses and fine-tuned models, and I care just as much about communication and working well with people. SQL is honestly one of my favourite things to write.",
};

export const categories = [
  { slug: "dev", label: "Dev" },
  { slug: "design", label: "Design" },
  { slug: "blogs", label: "Blogs" },
] as const;

export type Project = {
  slug: string;
  title: string;
  oneLiner: string;
  summary: string;
  // free-form chips shown on project cards — not limited to nav categories
  tags: string[];
  stack: string[];
  highlights: string[];
  featured: boolean;
  year: string;
  status: string;
  /** The live product, where there is one to click. */
  live?: string;
  /** The public repository, where the code is open. */
  repo?: string;
};

export const projects: Project[] = [
  {
    slug: "threshold",
    title: "Threshold",
    oneLiner: "Job search for international students that checks every employer can sponsor a visa.",
    summary:
      "Finding out whether a UK employer can sponsor a Skilled Worker visa is slow and mostly guesswork. Threshold pulls live job ads from Reed, Adzuna and company careers pages, checks each employer against the Home Office sponsor register, and ranks them by how long they have held their licence. If you upload a CV, you also get a skill match and an AI review that is checked against what the CV actually says.",
    tags: ["Product", "Dev", "AI"],
    stack: ["FastAPI", "Next.js", "SQLite", "Groq", "Survival Analysis"],
    highlights: [
      "Every ad checked against 121,199 licensed sponsors",
      "Kaplan-Meier and Cox models over ten register snapshots since 2023",
      "AI CV review that only counts a claim if the quote is really in the CV",
      "72 recorded API scenarios replayed on every change",
    ],
    featured: true,
    year: "2026",
    status: "Live",
    live: "https://threshold-omega-jet.vercel.app",
    repo: "https://github.com/dakshkumar96/Threshold",
  },
  {
    slug: "rv-ml",
    title: "RV-ML",
    oneLiner: "Conformal prediction for exoplanet orbits, calibrated on simulated stars.",
    summary:
      "RV-ML estimates a planet's orbit from its star's radial velocity curve. Its prediction intervals are calibrated on simulated data and still hold on real stars, because the calibration is reweighted for the gap between simulated and real curves.",
    tags: ["Research", "AI", "Dev"],
    stack: ["Python", "PyTorch", "scikit-learn", "Conformal Prediction"],
    highlights: [
      "Built on 1,071 RV curves from the NASA Exoplanet Archive",
      "90% intervals cover 93% of held-out simulated stars",
      "Covered all 34 held-out real host stars, with no unbounded intervals",
      "Noise model fitted to real residuals with a sparse variational GP",
    ],
    featured: true,
    year: "2026",
    status: "Research",
  },
  {
    slug: "sakha",
    title: "Sakha",
    oneLiner: "A voice first companion grounded in the Bhagavad Gita, with safety built in.",
    summary:
      "Sakha is a voice first companion with crisis detection and retrieval over an approved set of verses. It never presents itself as Krishna or as a therapist, and every answer cites the verse it comes from.",
    tags: ["AI", "Product", "Dev"],
    stack: ["FastAPI", "Gemini", "FAISS", "Web Speech API"],
    highlights: [
      "Crisis detection across four levels with a hard safety gate",
      "Retrieval that weighs emotion tags and filters to approved verses",
      "Every verse is cited, so none can be made up",
      "Safety rules enforced in code rather than in the prompt",
    ],
    featured: true,
    year: "2026",
    status: "Shipped",
    live: "https://sakha-hazel.vercel.app",
    repo: "https://github.com/dakshkumar96/Sakha",
  },
  {
    slug: "agents-of-deception",
    title: "Agents of Deception",
    oneLiner: "Eight language model agents in a Traitors style house, and whether trust and betrayal show up inside the model.",
    summary:
      "My BSc final year project at Royal Holloway. It has two layers. The first is an Iterated Prisoner's Dilemma tournament in Python, where classic strategies and a local language model agent play each other through one shared interface. The second is Agents of Deception, a house of eight language model agents in the style of The Traitors. Two are secretly told to deceive, and every trust decision between two housemates is a round of the same game. The project asks whether repeated events like betrayal, insults and gossip leave patterns inside the model as well as in what it says. It studies patterns only and makes no claim that the agents have real feelings.",
    tags: ["Research", "AI"],
    stack: ["Python", "Ollama", "HuggingFace", "TransformerLens", "FastAPI", "Docker"],
    highlights: [
      "A round robin tournament with Tit for Tat, Grim Trigger, Pavlov and a Zero Determinant strategy, plus noise that can flip a move",
      "Eight agents, two Traitors and six Faithful, who play, talk in public and private and vote someone out each cycle",
      "Two personas, one prosocial and one Machiavellian, matched in length, plus a no persona baseline",
      "Probes the model's internal activations to see whether they predict its next move better than its history and messages alone",
      "Builds on Curvo (2025) and Sobotka et al. (2026)",
    ],
    featured: true,
    year: "2026 to 2027",
    status: "Final year project",
  },
  {
    slug: "reclaim",
    title: "Reclaim",
    oneLiner: "Gamified habit tracking with XP, levels, streaks and leaderboards.",
    summary:
      "A full stack habit platform. I designed the database, wrote the API, and rebuilt the login system after the first version failed.",
    tags: ["Product", "Dev"],
    stack: ["React", "Flask", "PostgreSQL", "Tailwind"],
    highlights: [
      "Owned the database, REST API and frontend",
      "XP, levels, streaks, and leaderboards",
      "Rebuilt the login flow after the first version broke under real use",
    ],
    featured: false,
    year: "2025",
    status: "Shipped",
    repo: "https://github.com/dakshkumar96/Reclaim",
  },
  {
    slug: "visual-work",
    title: "Visual Work",
    oneLiner: "Posters, thumbnails and one consistent look for a student society.",
    summary:
      "I treated the society's comms and Palmy AI like products, with one visual system across posters, reels, podcast thumbnails and SEO. Instagram grew from 400 to 850 followers and video reach went up 30%.",
    tags: ["Design"],
    stack: ["Photoshop", "Canva", "Premiere Pro"],
    highlights: [
      "International Society visual identity and event campaigns",
      "Palmy AI podcast packaging, trailers and thumbnails",
      "Instagram grew from 400 to 850 followers, up 112%",
      "Video reach up 30% after full SEO setup",
    ],
    featured: false,
    year: "2025 to 2026",
    status: "Past work",
  },
];

export type Experience = {
  slug: string;
  org: string;
  role: string;
  dates: string;
  location?: string;
  bullets: string[];
};

export const experience: Experience[] = [
  {
    slug: "nextround-founding-product-engineer",
    org: "NextRound",
    role: "Founding Product Engineer",
    dates: "Oct 2026 to present",
    bullets: [
      "One of the first engineers at an early stage startup building evidence based hiring, working directly with the CEO on the core product.",
      "Improving the portal and the candidate assessment experience, using feedback from early users to decide what to build first.",
      "Helping shape the product roadmap as the platform takes on more clients.",
    ],
  },
  {
    slug: "insanity-radio-host",
    org: "Insanity Radio 103.2FM",
    role: "Host",
    dates: "Oct 2026 to present",
    bullets: [
      "Host Artificial Insanity, a live weekly show every Monday from 11am to 12pm on how AI already shapes everyday life, for people who think it has nothing to do with them.",
      "Bring on Royal Holloway academics and people from industry as guests to talk about where AI is heading.",
    ],
  },
  {
    slug: "royal-holloway-hall-life-assistant",
    org: "Royal Holloway",
    role: "Hall Life Assistant",
    dates: "Sep 2026 to present",
    bullets: [
      "Support residents across halls, running kitchen and flat meetings to check in on wellbeing and catch problems early.",
      "Mediate between flatmates and point residents to the right university support when something serious happens.",
    ],
  },
  {
    slug: "royal-holloway-student-ambassador",
    org: "Royal Holloway",
    role: "Student Ambassador",
    dates: "Sep 2026 to present",
    bullets: [
      "Talk with prospective students and their families at open days and campus tours, and adapt how I present the university to each visitor.",
    ],
  },
  {
    slug: "royal-holloway-research-assistant",
    org: "Royal Holloway",
    role: "Research Assistant",
    dates: "May 2026 to Aug 2026",
    location: "Remote",
    bullets: [
      "Built an ML model that estimates exoplanet orbits in milliseconds, where Bayesian methods take hours.",
      "Built the synthetic data pipeline behind it, simulating planet signals from Kepler's equations with real noise taken from NASA telescope observations.",
    ],
  },
  {
    slug: "international-society-president",
    org: "International Society, RHUL",
    role: "President",
    dates: "May 2026 to present",
    bullets: [
      "I run the society now. The year before, I was social media manager. I grew the Instagram by 112%, planned events, designed the posters and reels, and kept the content calendar going.",
    ],
  },
  {
    slug: "higherin-campus-ambassador",
    org: "Higherin",
    role: "Campus Ambassador",
    dates: "Feb 2026 to May 2026",
    bullets: [
      "Represented Higherin, the UK's leading student careers platform, at Royal Holloway as part of a national network of more than 1,500 ambassadors.",
      "Ran campus campaigns, in person and online, that reached 50+ students every week.",
    ],
  },
  {
    slug: "wetherspoon-bar-associate",
    org: "J D Wetherspoon",
    role: "Bar Associate",
    dates: "Feb 2026 to present",
    bullets: [
      "Work bar and floor service at a large three floor pub in Windsor with a team of around 80, handling complaints calmly under pressure.",
    ],
  },
  {
    slug: "palmy-marketing-coordinator",
    org: "Palmy",
    role: "Marketing Coordinator",
    dates: "Aug 2025 to Oct 2025",
    bullets: [
      "Edited podcast episodes and cut trailers and shorts for YouTube, Instagram and TikTok.",
      "Ran SEO across platforms and designed the branding and thumbnails.",
    ],
  },
];

export function getExperience(slug: string) {
  return experience.find((job) => job.slug === slug);
}

export const skills = [
  {
    title: "AI and ML",
    items: [
      "Claude API",
      "Gemini API",
      "LangChain",
      "Hugging Face",
      "PyTorch",
      "TensorFlow",
      "Fine-tuning",
      "Conformal Prediction",
      "pandas",
      "NumPy",
      "Matplotlib",
    ],
  },
  {
    title: "Dev",
    items: [
      "Python",
      "SQL",
      "FastAPI",
      "React",
      "Spring Boot",
      "PostgreSQL",
      "Docker",
      "Git",
      "HTML",
      "CSS",
      "WordPress",
    ],
  },
  {
    title: "Design",
    items: [
      "Adobe Illustrator",
      "Photoshop",
      "Premiere Pro",
      "After Effects",
      "Canva",
      "CapCut",
      "Mailchimp",
      "Hootsuite",
      "Google Analytics",
      "Notion",
      "Microsoft Office",
    ],
  },
];

export type EducationEntry = {
  title: string;
  place: string;
  dates: string;
  note?: string;
};

export const education: EducationEntry[] = [
  {
    title: "BSc Computer Science",
    place: "Royal Holloway, University of London",
    dates: "Jan 2025 to Jun 2027",
    note: "69.5% in second year. Predicted First Class.",
  },
  {
    title: "City School and College",
    place: "Pano Aqil, Pakistan",
    dates: "2011 to 2024",
  },
];

export const achievements = [
  "Runner up, Maths District Olympiad, 2024",
  "150 LeetCode questions solved",
  "50 Project Euler problems solved",
];

export const certifications = [
  {
    name: "Deloitte Australia, Technology Job Simulation (Forage)",
    issued: "Sep 2026",
  },
];

export const about = {
  curve: "Who Am I?",
  kicker: "About Me",
  intro:
    "I'm a final year computer science student at Royal Holloway, focused on AI. Most of my time goes into RAG systems, agent engineering and fine-tuning models. I came to the UK on my own from a small town. I'm good with people, and probably better at SQL than I need to be.",
  lookingFor:
    "Currently looking for roles in AI engineering, machine learning engineering or AI software engineering.",
  whoIAm: [
    "I first used a computer at 6 and got my own laptop at 12. I started editing videos at 13 and was freelancing by 15, the same year I started coding. The feeling has stayed the same ever since. One small line does something, and then it grows into a whole system built from what is basically plain English.",
    "I started using AI chatbots the day they launched and kept going deeper, into machine learning and how models behave. It has become the thing I care about most, and it led me to research on estimating exoplanet orbits with ML.",
    "I flew to the UK alone from a small town in Pakistan, without knowing a single person here. That has been my pattern ever since. Do the thing that scares you, and learn from whatever breaks.",
    "I've done a lot since then, from design and bartending to social media and student ambassador work. What I love most is building tools that fix a problem I've had myself or seen someone close to me struggle with. Sakha, a voice first AI companion built on the Bhagavad Gita, and Threshold, a visa sponsorship job matcher for international students, both started that way.",
    "I meditate every day and journal every night, mostly to stay honest with myself about where I really am. Outside of code and AI I work behind a bar, run the International Society as president, and do student ambassador and hall life work. The rest of my time goes on films and on whatever music I'm into that week.",
  ],
};

export const facts = [
  "Speaks four languages",
  "Runs on tea, not coffee",
  "Never without a notebook and pen",
  "Thinks taste, knowing what good AI output looks like, is the real skill right now",
  "Geeks out on fine-tuning models specifically",
  "Loves the research side of AI for its own sake",
  "Music taste has no consistent genre",
];

export const contact = {
  curve: "Wanna Talk?",
  kicker: "Get in Touch",
  blurb:
    "If you'd like to get in touch, email me or message me on LinkedIn. I always reply.",
};

export function getProject(slug: string) {
  return projects.find((project) => project.slug === slug);
}

export function getProjectsByCategory(slug: string) {
  return projects.filter((project) =>
    project.tags.some((tag) => tag.toLowerCase() === slug.toLowerCase()),
  );
}
