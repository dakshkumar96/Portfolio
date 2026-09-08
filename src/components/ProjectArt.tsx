import type { ReactNode } from "react";

export function ProjectArt({ slug }: { slug: string }) {
  const art = ART[slug] ?? ART.fallback;

  return (
    <svg className="project-art" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice">
      {art}
    </svg>
  );
}

const ART: Record<string, ReactNode> = {
  threshold: (
    <>
      <rect width="400" height="180" fill="#1a120f" />
      <circle cx="320" cy="20" r="90" fill="#f16a4b" opacity="0.9" />
      <rect x="28" y="36" width="210" height="14" rx="7" fill="#f5f5f5" />
      <rect x="28" y="62" width="168" height="10" rx="5" fill="#f16a4b" opacity="0.7" />
      <rect x="28" y="86" width="190" height="10" rx="5" fill="#3a2a26" />
      <rect x="28" y="108" width="140" height="10" rx="5" fill="#3a2a26" />
      <circle cx="54" cy="148" r="10" fill="#f16a4b" />
      <circle cx="82" cy="148" r="10" fill="#f5f5f5" opacity="0.3" />
      <circle cx="110" cy="148" r="10" fill="#f5f5f5" opacity="0.15" />
    </>
  ),
  "rv-ml": (
    <>
      <rect width="400" height="180" fill="#101014" />
      <path d="M0 120 C 60 40, 120 160, 180 80 S 300 20, 400 90 L400 180 L0 180 Z" fill="#f16a4b" opacity="0.85" />
      <circle cx="86" cy="54" r="4" fill="#fff" />
      <circle cx="210" cy="32" r="2.5" fill="#fff" />
      <circle cx="340" cy="48" r="3" fill="#fff" />
      <circle cx="168" cy="70" r="7" fill="#0c0c0c" />
      <circle cx="168" cy="70" r="3" fill="#f5f5f5" />
    </>
  ),
  sakha: (
    <>
      <rect width="400" height="180" fill="#16110d" />
      <circle cx="200" cy="92" r="58" fill="none" stroke="#f16a4b" strokeWidth="3" />
      <circle cx="200" cy="92" r="18" fill="#f16a4b" />
      <path d="M200 34 v20 M200 130 v16 M132 92 h20 M248 92 h20" stroke="#f5f5f5" strokeWidth="2" opacity="0.5" />
      <text x="200" y="168" textAnchor="middle" fill="#f5f5f5" fontSize="11" opacity="0.6">
        Grounded, not guessed
      </text>
    </>
  ),
  sentinel: (
    <>
      <rect width="400" height="180" fill="#121212" />
      <rect x="40" y="40" width="320" height="100" rx="16" fill="#1c1c1c" />
      <rect x="58" y="62" width="180" height="8" rx="4" fill="#f16a4b" />
      <rect x="58" y="82" width="240" height="8" rx="4" fill="#333" />
      <rect x="58" y="102" width="120" height="8" rx="4" fill="#333" />
      <circle cx="330" cy="90" r="22" fill="#f16a4b" />
    </>
  ),
  reclaim: (
    <>
      <rect width="400" height="180" fill="#14110f" />
      <rect x="36" y="36" width="90" height="108" rx="16" fill="#f16a4b" />
      <rect x="142" y="36" width="90" height="108" rx="16" fill="#2a211e" />
      <rect x="248" y="36" width="90" height="108" rx="16" fill="#2a211e" />
      <text x="81" y="98" textAnchor="middle" fill="#0c0c0c" fontSize="22">
        XP
      </text>
    </>
  ),
  "visual-work": (
    <>
      <rect width="400" height="180" fill="#1a1410" />
      <rect x="40" y="28" width="100" height="124" rx="8" fill="#f16a4b" />
      <rect x="160" y="28" width="100" height="124" rx="8" fill="#2b211c" />
      <rect x="280" y="28" width="80" height="124" rx="8" fill="#f5f5f5" />
      <circle cx="90" cy="70" r="18" fill="#0c0c0c" />
      <rect x="176" y="50" width="68" height="8" rx="4" fill="#f16a4b" />
      <rect x="176" y="70" width="50" height="8" rx="4" fill="#555" />
    </>
  ),
  fallback: (
    <>
      <rect width="400" height="180" fill="#161616" />
      <circle cx="200" cy="90" r="40" fill="#f16a4b" />
    </>
  ),
};
