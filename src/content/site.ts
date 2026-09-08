export const site = {
  name: "Daksh Kumar",
  firstName: "Daksh",
  handle: "daksh",
  role: "AI Engineer, in Training @ Royal Holloway",
  location: "Egham, UK",
  headline: "AI Engineer, In Training | Daksh",
  description:
    "Final year CS student specialised in AI: RAG systems, harness engineering, fine-tuned models.",
  email: "dakshkumar2k2@gmail.com",
  linkedin: "https://linkedin.com/in/dakshkumar96",
  instagram: "https://www.instagram.com/_daksh.mov_",
  github: "https://github.com/dakshkumar96",
  command: "whoami",
  commandCopy: `Daksh Kumar
AI Engineer, in Training @ Royal Holloway
RAG systems, harness engineering, fine-tuned models
dakshkumar2k2@gmail.com
https://linkedin.com/in/dakshkumar96`,
  bio: "Final year CS student, specialised in AI. Left a small town in Pakistan at 17 to study in the UK, and now spend most of my time on things that don't fully exist yet: RAG systems, harness engineering, fine-tuned models. Also decent with people, somehow, and weirdly attached to SQL.",
};

export const homeAbout = {
  heading: "About Me",
  paragraph:
    "CS student, AI focused, came to the UK alone at 17 from Pano Aqil, a small town in Sindh, Pakistan. I like working on RAG systems, harness engineering and fine-tuning models more than most people like their hobbies. Good with people too, comms and soft skills aren't an afterthought for me. And yes, SQL is genuinely one of my favourite things to write.",
};

export const categories = [
  { slug: "dev", label: "Dev" },
  { slug: "design", label: "Design" },
  { slug: "blogs", label: "Blogs" },
] as const;

export type CategorySlug = (typeof categories)[number]["slug"];

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
};

export const projects: Project[] = [
  {
    slug: "threshold",
    title: "Threshold",
    oneLiner: "Live SaaS matching international students to visa-sponsoring employers.",
    summary:
      "A product I shipped because the UK sponsor list is a spreadsheet and students deserve better. It ingests live jobs, scores them against 47,000+ Home Office sponsors, and uses survival analysis plus an LLM to tell you who is actually likely to keep their licence.",
    tags: ["Product", "Dev", "AI"],
    stack: ["FastAPI", "Next.js", "PostgreSQL", "Groq", "Survival Analysis"],
    highlights: [
      "100+ users on a live product",
      "Job ingest from Reed and Adzuna against 47,000+ sponsors",
      "Kaplan-Meier and Cox models for licence retention",
      "LLM CV feedback with recruiter persona and gap analysis",
    ],
    featured: true,
    year: "2026",
    status: "Live",
  },
  {
    slug: "rv-ml",
    title: "RV-ML",
    oneLiner: "Conformal prediction for exoplanet orbits. AAAI submission.",
    summary:
      "A novel pipeline that estimates exoplanet orbital parameters from radial velocity data, with uncertainty that actually means something. Trained on synthetic Kepler signals, calibrated conformal boxes, then validated on NASA archive stars.",
    tags: ["Research", "AI", "Dev"],
    stack: ["Python", "PyTorch", "scikit-learn", "Conformal Prediction"],
    highlights: [
      "Submitted to AAAI",
      "Validated on 34 independent NASA host stars",
      "Coverage at nominal levels, no unbounded intervals",
      "Median half-widths at 0.90: 1.100, 0.621, 0.585 dex",
    ],
    featured: true,
    year: "2026",
    status: "Research",
  },
  {
    slug: "sakha",
    title: "Sakha",
    oneLiner: "Voice-first companion grounded in the Bhagavad Gita, with real safety rails.",
    summary:
      "Not a chatbot wearing a costume. Sakha is a voice-first companion with crisis detection, RAG over an allowlisted verse set, and a hard rule: it never pretends to be Krishna or a therapist. Citations only. Always.",
    tags: ["AI", "Product", "Dev"],
    stack: ["FastAPI", "Gemini", "FAISS", "Web Speech API"],
    highlights: [
      "Crisis detection L1–L4 with a hard safety gate",
      "RAG with emotion-tag boosts and allowlist filtering",
      "Citation wall: no hallucinated verses",
      "Ethical guardrails baked into the product, not the prompt",
    ],
    featured: true,
    year: "2026",
    status: "Shipped",
  },
  {
    slug: "sentinel",
    title: "Sentinel",
    oneLiner: "Agentic spend guardian. Built in 24 hours.",
    summary:
      "A hackathon product from the Cursor AdTech Hackathon in London. Real-time budget monitoring, anomaly detection, brand safety, and human-in-the-loop gates, streaming from Claude with tool use.",
    tags: ["AI", "Dev", "Product"],
    stack: ["Next.js", "TypeScript", "Claude API", "SSE"],
    highlights: [
      "End-to-end in 24 hours",
      "Streaming tool use with Claude",
      "Anomaly detection and brand safety checks",
      "Built alongside engineers from Meta",
    ],
    featured: false,
    year: "2026",
    status: "Hackathon",
  },
  {
    slug: "reclaim",
    title: "Reclaim",
    oneLiner: "Gamified habit tracking. XP, levels, streaks, leaderboards.",
    summary:
      "Full-stack habit platform I designed the schema for, wrote the API for, and then rebuilt the auth for after v1 failed. That failure taught me more than the features did.",
    tags: ["Product", "Dev"],
    stack: ["React", "Flask", "PostgreSQL", "Tailwind"],
    highlights: [
      "Owned schema, REST API, and frontend",
      "XP, levels, streaks, and leaderboards",
      "Rebuilt auth after the first flow failed in production-shaped ways",
    ],
    featured: false,
    year: "2025",
    status: "Shipped",
  },
  {
    slug: "visual-work",
    title: "Visual Work",
    oneLiner: "Posters, thumbnails, and a student org that finally looked like a brand.",
    summary:
      "I treated society comms and Palmy AI like products: one visual system, not a folder of random Canva files. Posters, reels, podcast thumbnails, SEO packaging. Instagram 400 → 750. Video reach +30%.",
    tags: ["Design"],
    stack: ["Photoshop", "Canva", "Premiere Pro"],
    highlights: [
      "International Society visual identity and event campaigns",
      "Palmy AI podcast packaging, trailers, and thumbnails",
      "Instagram 400 → 750 followers (85%)",
      "Video reach up 30% after full SEO setup",
    ],
    featured: false,
    year: "2025–2026",
    status: "Ongoing",
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
    slug: "royal-holloway-research-assistant",
    org: "Royal Holloway",
    role: "Research Assistant",
    dates: "May 2026 – Aug 2026",
    location: "Remote",
    bullets: [
      "Built an ML model that estimates exoplanet orbital parameters in milliseconds instead of the hours Bayesian methods take.",
      "Built the synthetic data pipeline behind it, simulating planetary signals from Kepler equations with real noise injected from NASA telescope observations.",
    ],
  },
  {
    slug: "international-society-president",
    org: "International Society, RHUL",
    role: "President",
    dates: "May 2026 – Present",
    bullets: [
      "Running the society now. Spent the year before as social media manager, grew the Instagram by 85%, planned events, designed the posters and reels, kept the content calendar alive.",
    ],
  },
  {
    slug: "palmy-marketing-coordinator",
    org: "Palmy",
    role: "Marketing Coordinator",
    dates: "Aug 2025 – Oct 2025",
    bullets: [
      "Edited podcast episodes, cut trailers and shorts for YouTube, Instagram and TikTok.",
      "Ran SEO across platforms, did the branding and thumbnails.",
    ],
  },
];

export function getExperience(slug: string) {
  return experience.find((job) => job.slug === slug);
}

export const skills = [
  {
    title: "AI / ML",
    items: [
      "LangChain",
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
    items: ["Python", "SQL", "React", "Spring Boot", "PostgreSQL"],
  },
  {
    title: "Design",
    items: ["Adobe Illustrator", "Photoshop", "Premiere Pro", "After Effects"],
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
    dates: "Jan 2025 – Jun 2027",
    note: "69.5% in second year. Predicted First Class.",
  },
  {
    title: "City School and College",
    place: "Pano Aqil, Pakistan",
    dates: "2011 – 2024",
  },
];

export const achievements = [
  "Maths District Olympiad, runner-up, 2024",
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
    "Final year computer science student at Royal Holloway, specialised in AI. I spend most of my time on RAG systems, agentic engineering and fine-tuning models. Came to the UK at seventeen, left a small town behind. Good with people, better with SQL than I probably should be.",
  lookingFor:
    "Currently looking for AI engineering, machine learning engineering, or AI software engineering roles.",
  whoIAm: [
    "First touched a computer at 6, got my first personal laptop at 12. Started video editing at 13, and was freelancing and earning off it by 15, same year I started coding, and it's been the same feeling ever since: watching one small line do something, then watching that line turn into a whole system, built out of what's basically just English.",
    "Started using AI chatbots the day it launched. Kept going deeper from there, into machine learning, model behaviour, all of it, and it's turned into the thing I care about most now. That pull led to a research paper on estimating exoplanet orbital parameters with ML, which we submitted to AAAI.",
    "At 17 I got on a flight to the UK alone, didn't know a single person here, coming from a small town in Pakistan. That's more or less been the pattern since: do the thing that scares you, learn from what breaks.",
    "I've done a lot of things since: design, bartending, social media, student ambassador work. But the thing my heart actually loves is building tools that solve a problem I've hit myself, or watched someone around me hit. That's the thread running through everything I build. Sakha, a voice-first AI companion built on the Bhagavad Gita, and Threshold, a visa-sponsorship job matcher for international students, both came out of problems people around me were actually facing.",
    "I meditate daily and journal every night, mostly to keep myself honest about where I actually am versus where I think I am. Outside of coding and AI I'm bartending, running the International Society as president, occasionally doing student ambassador and hall life work, and watching movies or listening to whatever music I'm into that week, which changes constantly.",
  ],
};

export const facts = [
  "Speaks four languages",
  "Runs on tea, not coffee",
  "Never without a notebook and pen",
  "Thinks taste, your judgement of what's actually good AI output, is the real skill right now",
  "Geeks out on fine-tuning models specifically",
  "Just genuinely loves the research side of AI, no single person or lab he's chasing",
  "Music taste has no consistent genre",
];

export const contact = {
  curve: "Wanna Talk?",
  kicker: "Touch Me",
  blurb:
    "If you wanna get in touch, email me or find me on LinkedIn. I actually reply :)",
};

export function getProject(slug: string) {
  return projects.find((project) => project.slug === slug);
}

export function getProjectsByCategory(slug: string) {
  return projects.filter((project) =>
    project.tags.some((tag) => tag.toLowerCase() === slug.toLowerCase()),
  );
}
