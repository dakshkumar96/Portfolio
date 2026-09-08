function initials(name: string) {
  const words = name.replace(/,.*/, "").trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyLogo({ name }: { name: string }) {
  return (
    <span className="experience-logo" aria-hidden>
      <svg viewBox="0 0 40 40" width="40" height="40">
        <rect width="40" height="40" rx="12" fill="var(--accent-soft)" />
        <text
          x="20"
          y="21"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--accent)"
          fontSize="14"
          fontWeight="600"
          fontFamily="var(--font-sans), Inter, system-ui, sans-serif"
        >
          {initials(name)}
        </text>
      </svg>
    </span>
  );
}
