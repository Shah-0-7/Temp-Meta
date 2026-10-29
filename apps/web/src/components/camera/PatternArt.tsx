/**
 * @module components/camera/PatternArt
 *
 * The first-screen drawing: a tailor's pattern for a tee laid over a dress form,
 * inside an arched fitting-room mirror, with a soft tape measure around the chest.
 * Decorative only. The outline draws itself once on load; reduced motion shows it
 * finished (see globals.css).
 */

export function PatternArt() {
  const chalk = 'var(--color-text-primary)';
  const tee =
    'M168 132 L196 142 Q210 156 224 142 L252 132 L316 168 L290 214 L270 200 L270 352 L150 352 L150 200 L130 214 L104 168 Z';

  return (
    <svg viewBox="0 0 420 540" role="presentation" aria-hidden="true" focusable="false" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Mirror: arch and an inner keyline */}
      <path
        pathLength={1}
        className="pattern-draw"
        d="M36 520V210A174 174 0 0 1 384 210V520Z"
        fill="rgba(255,255,255,0.035)"
        stroke={chalk}
        strokeOpacity={0.6}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d="M48 520V210A162 162 0 0 1 372 210V520" fill="none" stroke={chalk} strokeOpacity={0.2} strokeWidth={1} />

      {/* Dress form */}
      <g fill="none" stroke={chalk} strokeOpacity={0.34} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M186 118C186 138 150 146 124 164C112 172 118 200 130 238C140 270 150 300 150 340C150 400 138 440 132 500L288 500C282 440 270 400 270 340C270 300 280 270 290 238C302 200 308 172 296 164C270 146 234 138 234 118" />
        <path d="M186 118V98M234 118V98" />
        <path d="M186 98a24 8 0 0 1 48 0" />
        <path d="M132 500h156" />
      </g>

      {/* Seam allowance (dashed) */}
      <path
        d={tee}
        transform="translate(-10.5 -12) scale(1.05)"
        fill="none"
        stroke={chalk}
        strokeOpacity={0.5}
        strokeWidth={1}
        strokeDasharray="5 5"
        strokeLinejoin="round"
      />

      {/* Pattern piece */}
      <path
        pathLength={1}
        className="pattern-draw"
        d={tee}
        fill="rgba(255,255,255,0.05)"
        stroke={chalk}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />

      <g className="pattern-fade">
        {/* Grainline */}
        <g fill="none" stroke={chalk} strokeOpacity={0.75} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M210 214V336" />
          <path d="M205 222l5-8 5 8M205 328l5 8 5-8" />
        </g>
        {/* Notches on the side seams */}
        <path d="M150 296l-7 4 7 4ZM270 296l7 4-7 4Z" fill={chalk} fillOpacity={0.85} />

        {/* Dimensions */}
        <g fill="none" stroke={chalk} strokeOpacity={0.6} strokeWidth={1} strokeLinecap="round">
          <path d="M150 386H270M150 380v12M270 380v12" />
          <path d="M346 132V352M340 132h12M340 352h12" />
        </g>
        <g fill={chalk} fillOpacity={0.85} fontSize={13} fontWeight={600} textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <text x="210" y="378">46 cm</text>
          <text x="0" y="0" transform="translate(334 242) rotate(-90)">68 cm</text>
        </g>

        {/* The one accent: a soft tape measure around the chest */}
        <g fill="none" strokeLinecap="round">
          <path d="M122 248Q210 286 298 248" stroke="var(--color-tape)" strokeWidth={12} />
          <path d="M122 248Q210 286 298 248" stroke="var(--color-ink)" strokeOpacity={0.55} strokeWidth={12} strokeDasharray="1.2 7.4" strokeLinecap="butt" />
          <path d="M298 248q16 6 18 40" stroke="var(--color-tape)" strokeWidth={12} />
        </g>
      </g>
    </svg>
  );
}
