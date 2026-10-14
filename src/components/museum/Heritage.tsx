import { SEAL } from "./heritagePaths";

/**
 * The museum's handmade marks, used on the catalogue cards.
 *
 * A wax seal and an ink stamp. Neither is clever:
 * each is a single familiar object from a world of paper and ink, and the
 * point of having them is that nothing in an app looks like them.
 *
 * No state and no hooks, so all of it is in the first HTML.
 */

/**
 * Things the marks share, defined once for the whole page.
 *
 * The seal's wax gradient, the rubber-stamp ink filter and the circle the
 * stamp's lettering runs round. SVG lets one element refer to another
 * anywhere in the document, so each seal and stamp is only a reference,
 * not a copy - there are dozens of cards and this would otherwise be
 * repeated in every one.
 */
export function HeritageDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <radialGradient id="h-wax" cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor="#c0583f" />
          <stop offset="0.5" stopColor="#80301f" />
          <stop offset="1" stopColor="#4a170d" />
        </radialGradient>

        {/*
          Rubber stamp ink.

          Two things make a stamp look stamped rather than printed: the
          edges wander a little because the rubber is soft, and the ink
          never covers evenly, so there are tiny pale specks. The first
          is a displacement by low-frequency noise; the second knocks
          small holes out of the shape with high-frequency noise. The
          holes were first too many - the stamp came out as a ghost - so
          the threshold is set so that most of the ink prints and only the
          odd speck is missing.
        */}
        <filter id="h-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="2" seed="2" result="wander" />
          <feDisplacementMap in="SourceGraphic" in2="wander" scale="2.2" result="soft" />
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="6" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.3 1.75"
            result="specks"
          />
          <feComposite in="soft" in2="specks" operator="in" />
        </filter>

        <path id="h-stamp-ring" d="M50,50 m-34,0 a34,34 0 1,1 68,0 a34,34 0 1,1 -68,0" />
      </defs>
    </svg>
  );
}

/**
 * A wax seal with a monogram pressed into it.
 *
 * The letters are drawn three times - a dark one down and right, a light
 * one up and left, and the wax colour between - which is what an
 * impression in a soft material looks like: a lip of shadow on one side
 * and a catch of light on the other. Without that they would read as
 * letters painted on a red blob.
 */
export function WaxSeal({ className }: { className?: string }) {
  const mark = (dx: number, dy: number, fill: string, key: string) => (
    <text
      key={key}
      x={32 + dx}
      y={39.5 + dy}
      textAnchor="middle"
      fontSize="21"
      fontFamily="var(--font-pica), Georgia, serif"
      fill={fill}
    >
      DK
    </text>
  );
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={SEAL.outer} fill="url(#h-wax)" />
      <path d={SEAL.ring} fill="none" stroke="#2f0d07" strokeOpacity="0.55" strokeWidth="1.3" transform="translate(0.7 0.8)" />
      <path d={SEAL.ring} fill="none" stroke="#d4806a" strokeOpacity="0.55" strokeWidth="1.2" />
      {mark(0.9, 1, "#3a110a", "s")}
      {mark(-0.7, -0.8, "#d9917a", "l")}
      {mark(0, 0, "#8d3523", "m")}
    </svg>
  );
}

/** The catalogue number, as a rubber stamp pressed in the corner. */
export function CatalogueStamp({ numeral }: { numeral: string }) {
  return (
    <svg className="cat-stamp" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g filter="url(#h-ink)" fill="currentColor" stroke="currentColor">
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.6" />
        <circle cx="50" cy="50" r="41" fill="none" strokeWidth="0.9" />
        <text fontSize="8.6" letterSpacing="2.3" fontFamily="var(--font-fell-sc), Georgia, serif" stroke="none">
          <textPath href="#h-stamp-ring" startOffset="2">
            CATALOGUED · DAKSH KUMAR ·
          </textPath>
        </text>
        <text
          x="50"
          y="47"
          textAnchor="middle"
          fontSize="11"
          fontFamily="var(--font-fell), Georgia, serif"
          stroke="none"
          fontStyle="italic"
        >
          No.
        </text>
        <text
          x="50"
          y="68"
          textAnchor="middle"
          fontSize={numeral.length > 5 ? 17 : numeral.length > 3 ? 21 : 26}
          fontFamily="var(--font-pica), Georgia, serif"
          stroke="none"
        >
          {numeral}
        </text>
      </g>
    </svg>
  );
}
