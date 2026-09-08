type CurveTitleProps = {
  text: string;
  fontSize?: number;
};

export function CurveTitle({ text, fontSize = 44 }: CurveTitleProps) {
  return (
    <div className="hero-name-curve">
      <svg width="280" height="150" viewBox="0 0 280 150" aria-hidden>
        <path
          id="name-curve"
          d="M 40,140 A 100,100 0 0,1 240,140"
          fill="transparent"
        />
        <text
          fill="var(--text)"
          className="serif"
          fontSize={fontSize}
          textAnchor="middle"
          letterSpacing="-0.07em"
        >
          <textPath href="#name-curve" startOffset="50%">
            {text}
          </textPath>
        </text>
      </svg>
      <span className="sr-only">{text}</span>
    </div>
  );
}
