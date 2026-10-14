import { TOOL_LOGOS } from "./toolLogos";

/**
 * One tool, as a small box with its mark above its name.
 *
 * The name is real text in the list item, so a screen reader and a
 * crawler get a list of tools exactly as before; the mark is decoration.
 * Gold at rest keeps the whole card one colour, and the box takes the
 * brand's own colour on hover - set through a custom property so the
 * stylesheet, not the markup, decides how the change looks.
 *
 * A tool with no mark still gets a box, with a plain initial, so the grid
 * never has a hole in it.
 */
export function ToolBox({ name }: { name: string }) {
  const logo = TOOL_LOGOS[name];
  return (
    <li className="tool-box" style={logo ? ({ "--brand": logo.hover } as React.CSSProperties) : undefined}>
      <svg className="tool-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {logo?.path ? <path d={logo.path} fill="currentColor" /> : null}
        {logo?.strokes ? (
          <g fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            {logo.strokes.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        ) : null}
        {logo?.dots?.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="currentColor" />
        ))}
        {logo?.letters ? (
          <>
            <rect x={2} y={2} width={20} height={20} rx={3.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
            <text
              x={12}
              y={15.6}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              fill="currentColor"
              fontFamily="var(--font-inter), system-ui, sans-serif"
            >
              {logo.letters}
            </text>
          </>
        ) : null}
        {!logo ? (
          <text x={12} y={16.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="currentColor">
            {name.slice(0, 1)}
          </text>
        ) : null}
      </svg>
      <span className="tool-name">{name}</span>
    </li>
  );
}
