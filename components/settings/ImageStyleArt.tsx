import { useId } from 'react'
import type { ImageStyle } from '@/lib/content/article-style/types'
import { mix } from '@/lib/content/article-style/colors'

/**
 * A small drawn scene (sky, sun, hills, a tree) in each image style, so the
 * owner sees the difference between the styles before choosing one, and the
 * preview's image slots show the chosen look. Drawn, not generated: no image
 * call is made to show a swatch. Illustrated styles use the brand colours,
 * exactly as the image prompt does.
 *
 * The scene is drawn 16:9 and cropped to a square (slice) for a 1:1 hero.
 */
export default function ImageStyleArt({
  style,
  colors,
  className,
}: {
  style: ImageStyle
  colors: readonly string[]
  className?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (name: string) => `${name}-${uid}`
  const brand = colors[0] ?? '#2f5bd3'
  const second = colors[1] ?? mix(brand, '#f59e0b', 0.65)

  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false">
      {style === 'realistic' && (
        <>
          <defs>
            <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8fb5dc" />
              <stop offset="0.7" stopColor="#f2d9bd" />
            </linearGradient>
            <radialGradient id={id('sun')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff6dc" />
              <stop offset="0.45" stopColor="#ffe1a0" />
              <stop offset="1" stopColor="#ffe1a0" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={id('hill')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6f8f5a" />
              <stop offset="1" stopColor="#3f5a36" />
            </linearGradient>
            <filter id={id('blur')}><feGaussianBlur stdDeviation="1.4" /></filter>
          </defs>
          <rect width="160" height="90" fill={`url(#${id('sky')})`} />
          <circle cx="112" cy="36" r="22" fill={`url(#${id('sun')})`} />
          <path d="M0 62 Q40 44 80 58 T160 52 V90 H0Z" fill="#8aa37a" filter={`url(#${id('blur')})`} opacity="0.85" />
          <path d="M0 72 Q50 58 100 70 T160 66 V90 H0Z" fill={`url(#${id('hill')})`} />
          <rect x="37" y="56" width="3" height="12" fill="#5b4332" />
          <ellipse cx="38.5" cy="52" rx="9" ry="11" fill="#355233" />
          <ellipse cx="36" cy="49" rx="4" ry="5" fill="#4d6d45" opacity="0.7" />
        </>
      )}

      {style === 'illustration' && (
        <>
          <rect width="160" height="90" fill={mix(brand, '#ffffff', 0.86)} />
          <circle cx="114" cy="32" r="14" fill={second} />
          <path d="M0 64 L36 44 L70 62 L104 40 L160 60 V90 H0Z" fill={mix(brand, '#ffffff', 0.45)} />
          <path d="M0 74 Q40 60 84 72 T160 70 V90 H0Z" fill={brand} />
          <rect x="37" y="54" width="4" height="14" fill={mix(brand, '#000000', 0.45)} />
          <path d="M39 34 L50 56 H28Z" fill={mix(brand, '#000000', 0.25)} />
        </>
      )}

      {style === 'watercolor' && (
        <>
          <defs>
            <filter id={id('wash')} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="7" />
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          <rect width="160" height="90" fill="#fbf7ef" />
          <g filter={`url(#${id('wash')})`}>
            <rect x="4" y="4" width="152" height="52" rx="8" fill="#a9c9e6" opacity="0.45" />
            <circle cx="112" cy="32" r="14" fill="#f4a8a0" opacity="0.6" />
            <path d="M0 62 Q40 44 80 58 T160 52 V90 H0Z" fill="#9cc3a4" opacity="0.55" />
            <path d="M0 72 Q50 58 100 70 T160 66 V90 H0Z" fill="#5f9a7a" opacity="0.55" />
            <ellipse cx="38" cy="50" rx="9" ry="12" fill="#4f8a68" opacity="0.6" />
          </g>
          <path d="M38 58 V70" stroke="#8b6b52" strokeWidth="2" opacity="0.6" />
        </>
      )}

      {style === 'sketch' && (
        <>
          <defs>
            <pattern id={id('hatch')} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="#4a4a4a" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect width="160" height="90" fill="#fbfaf6" />
          <g fill="none" stroke="#3a3a3a" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="112" cy="32" r="11" />
            <path d="M112 15 V11 M112 53 V49 M95 32 H91 M133 32 H129 M100 20 L97 17 M124 20 L127 17 M100 44 L97 47 M124 44 L127 47" />
            <path d="M0 62 Q40 44 80 58 T160 52" />
            <path d="M0 72 Q50 58 100 70 T160 66" />
            <path d="M38 58 V71 M36 71 H41" />
            <path d="M38 38 C28 42 28 56 38 58 C48 56 48 42 38 38Z" />
          </g>
          <path d="M0 72 Q50 58 100 70 T160 66 V90 H0Z" fill={`url(#${id('hatch')})`} opacity="0.55" />
          <path d="M38 38 C28 42 28 56 38 58 C48 56 48 42 38 38Z" fill={`url(#${id('hatch')})`} opacity="0.4" />
          <path d="M104 74 Q120 70 136 74" fill="none" stroke={brand} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}

      {style === 'render3d' && (
        <>
          <defs>
            <linearGradient id={id('bg')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={mix(brand, '#ffffff', 0.82)} />
              <stop offset="1" stopColor={mix(brand, '#ffffff', 0.94)} />
            </linearGradient>
            <radialGradient id={id('ball')} cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#fff7e0" />
              <stop offset="0.5" stopColor="#ffc861" />
              <stop offset="1" stopColor="#e08a1e" />
            </radialGradient>
            <radialGradient id={id('mound')} cx="0.4" cy="0.2" r="0.9">
              <stop offset="0" stopColor={mix(brand, '#ffffff', 0.35)} />
              <stop offset="1" stopColor={mix(brand, '#000000', 0.25)} />
            </radialGradient>
            <radialGradient id={id('tree')} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#9be3b1" />
              <stop offset="1" stopColor="#2f8a55" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" fill={`url(#${id('bg')})`} />
          <ellipse cx="80" cy="84" rx="70" ry="6" fill="#000000" opacity="0.08" />
          <ellipse cx="80" cy="78" rx="72" ry="20" fill={`url(#${id('mound')})`} />
          <circle cx="114" cy="32" r="13" fill={`url(#${id('ball')})`} />
          <rect x="37" y="54" width="4" height="12" rx="2" fill="#b07a4f" />
          <circle cx="39" cy="46" r="11" fill={`url(#${id('tree')})`} />
        </>
      )}

      {style === 'clay' && (
        <>
          <defs>
            <filter id={id('grain')}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
              <feColorMatrix in="n" type="saturate" values="0" />
              <feComponentTransfer><feFuncA type="linear" slope="0.12" /></feComponentTransfer>
              <feComposite in2="SourceGraphic" operator="in" />
              <feBlend in="SourceGraphic" mode="multiply" />
            </filter>
          </defs>
          <rect width="160" height="90" fill="#f3e2cc" />
          <g filter={`url(#${id('grain')})`} strokeLinejoin="round">
            <circle cx="114" cy="30" r="13" fill="#ffb347" stroke="#e08f2a" strokeWidth="2.5" />
            <path d="M-4 66 Q30 46 70 60 Q110 72 164 56 V94 H-4Z" fill={mix(brand, '#ffffff', 0.25)} stroke={mix(brand, '#000000', 0.2)} strokeWidth="3" />
            <path d="M-4 76 Q44 62 96 74 Q130 80 164 70 V94 H-4Z" fill={second} stroke={mix(second, '#000000', 0.2)} strokeWidth="3" />
            <rect x="36" y="52" width="6" height="16" rx="3" fill="#a86b3c" stroke="#7d4d29" strokeWidth="2" />
            <circle cx="39" cy="44" r="12" fill="#6cc27a" stroke="#3f9352" strokeWidth="3" />
          </g>
          <ellipse cx="35" cy="39" rx="4" ry="2.5" fill="#ffffff" opacity="0.45" />
          <ellipse cx="109" cy="25" rx="4" ry="2.5" fill="#ffffff" opacity="0.5" />
        </>
      )}
    </svg>
  )
}
