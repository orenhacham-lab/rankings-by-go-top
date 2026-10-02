import { MARK_SOLID, MARK_TRANSFORM, markCells } from './mark-geometry'

/**
 * The Go Top mark as inline SVG: sharp at any size, no image request, and no
 * "DIGITAL MARKETING" lettering (the old 500px PNG shrank it to noise). Filled
 * with `--color-brand`, the light blue sampled from the logo. The geometry is
 * shared with the favicon and app icons (mark-geometry.ts).
 */
export default function GoTopMark({
  size = 28,
  label,
  className,
}: {
  size?: number
  /** The accessible name. Without one the mark is decorative (aria-hidden). */
  label?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g transform={MARK_TRANSFORM} className="fill-brand">
        <path d={MARK_SOLID} />
        {markCells().map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={c.size} height={c.size} />
        ))}
      </g>
    </svg>
  )
}
