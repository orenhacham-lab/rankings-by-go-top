/**
 * Engine icon components — brand-inspired SVG marks (recognizable, not copies).
 * Premium SaaS aesthetic, unified design system: 24×24 viewBox, gradients allowed,
 * accent color via Tailwind currentColor (set by parent className).
 *
 * No emojis, no external images, no copyrighted assets.
 */

import { SVGProps } from 'react'

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
})

/** ChatGPT — OpenAI-style six-leaf knot (interlocking petals around center) */
export function ChatGPTIcon({ size = 24, className }: { size?: number; className?: string }) {
  const id = 'chatgpt-grad-' + Math.random().toString(36).slice(2, 8)
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
          <stop offset="100%" stopColor="currentColor" />
        </linearGradient>
      </defs>
      {/* Outer rounded knot — 6 looping arcs */}
      <path
        d="M12 3.2 c2.5 0 4.6 1.3 5.8 3.3 1.2 2 1.2 4.6 0 6.6 -1 1.7 -2.5 2.8 -4.3 3.3"
        stroke={`url(#${id})`}
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M17.8 6.5 c1.2 2 1.5 4 .8 6 -.7 2 -2.3 3.5 -4.3 4.2 -2 .7 -4 .4 -5.7 -.7"
        stroke={`url(#${id})`}
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14.3 16.7 c-1.7 1.1 -3.7 1.4 -5.6 .7 -2 -.7 -3.5 -2.2 -4.3 -4.2 -.7 -2 -.5 -4 .7 -5.8"
        stroke={`url(#${id})`}
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M5.1 7.4 c1.2 -2 3.3 -3.3 5.7 -3.4 1.2 0 2.3 .3 3.3 .9"
        stroke={`url(#${id})`}
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

/** Perplexity — stylized P / pivot inside a soft squircle */
export function PerplexityIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* P stroke */}
      <path
        d="M9 7 V17 M9 7 H13.5 C15.4 7 16.8 8.3 16.8 10.2 C16.8 12 15.4 13.4 13.5 13.4 H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Pivot dot — Perplexity signature accent */}
      <circle cx="16.5" cy="16.5" r="1.3" fill="currentColor" />
    </svg>
  )
}

/** Gemini — four-pointed sparkle star (Google Gemini signature) */
export function GeminiIcon({ size = 24, className }: { size?: number; className?: string }) {
  const id = 'gemini-grad-' + Math.random().toString(36).slice(2, 8)
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {/* Big 4-point star */}
      <path
        d="M12 2 C12 7 13.5 10.5 18 12 C13.5 13.5 12 17 12 22 C12 17 10.5 13.5 6 12 C10.5 10.5 12 7 12 2 Z"
        fill={`url(#${id})`}
      />
      {/* Small accent sparkle */}
      <path
        d="M19 4 C19 6 19.5 6.5 21 7 C19.5 7.5 19 8 19 10 C19 8 18.5 7.5 17 7 C18.5 6.5 19 6 19 4 Z"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  )
}

/** Copilot — overlapping ribbon swoosh (Microsoft Copilot vibe) */
export function CopilotIcon({ size = 24, className }: { size?: number; className?: string }) {
  const id = 'copilot-grad-' + Math.random().toString(36).slice(2, 8)
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" />
        </linearGradient>
      </defs>
      {/* Lower ribbon */}
      <path
        d="M3.5 17 C5 12.5 8 10 12 10 C16 10 19 12.5 20.5 17 C19 15.5 16.5 14.5 12 14.5 C7.5 14.5 5 15.5 3.5 17 Z"
        fill={`url(#${id})`}
      />
      {/* Upper ribbon */}
      <path
        d="M3.5 7 C5 11.5 8 14 12 14 C16 14 19 11.5 20.5 7 C19 8.5 16.5 9.5 12 9.5 C7.5 9.5 5 8.5 3.5 7 Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  )
}

/** Grok — heavy condensed X (xAI vibe) */
export function GrokIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M4.5 4 L10.5 11 L4 20 L7.5 20 L12.3 13.2 L17.5 20 L20 20 L13.5 11.3 L19 4 L15.5 4 L11.6 9.3 L7.5 4 Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Google AI — colored G ring + sparkle (Search Generative Experience vibe) */
export function GoogleAIIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...base(size)} className={className}>
      {/* G ring */}
      <path
        d="M19 12 C19 16 16 19 12 19 C8 19 5 16 5 12 C5 8 8 5 12 5 C14 5 15.7 5.7 17 7"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        fill="none"
      />
      {/* Inner bar */}
      <path d="M12 12 H19" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      {/* AI sparkle accent */}
      <path
        d="M20 4 L20.7 5.3 L22 6 L20.7 6.7 L20 8 L19.3 6.7 L18 6 L19.3 5.3 Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  )
}

/** External link icon */
export function ExternalLinkIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M4 4h6v6M10 4 l-6 6M10 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Sparkle icon for section header */
export function SparkleIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M12 3 C12 7 13 9 16 10 C13 11 12 13 12 17 C12 13 11 11 8 10 C11 9 12 7 12 3 Z"
        fill="currentColor"
      />
      <path
        d="M18 14 C18 16 18.5 16.5 20 17 C18.5 17.5 18 18 18 20 C18 18 17.5 17.5 16 17 C17.5 16.5 18 16 18 14 Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  )
}

/** Trash icon for delete action */
export function TrashIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M3 6h18M8 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6h14Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 9v6M14 9v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export const ENGINE_META: Record<
  string,
  { name: string; Icon: React.ComponentType<{ size?: number; className?: string }>; accent: string; bg: string }
> = {
  chatgpt: {
    name: 'ChatGPT',
    Icon: ChatGPTIcon,
    accent: 'text-emerald-600',
    bg: 'from-emerald-50 to-teal-50/40',
  },
  perplexity: {
    name: 'Perplexity',
    Icon: PerplexityIcon,
    accent: 'text-cyan-600',
    bg: 'from-cyan-50 to-sky-50/40',
  },
  gemini: {
    name: 'Gemini',
    Icon: GeminiIcon,
    accent: 'text-blue-600',
    bg: 'from-blue-50 to-violet-50/40',
  },
  copilot: {
    name: 'Copilot',
    Icon: CopilotIcon,
    accent: 'text-sky-600',
    bg: 'from-sky-50 to-blue-50/40',
  },
  grok: {
    name: 'Grok',
    Icon: GrokIcon,
    accent: 'text-slate-900',
    bg: 'from-slate-50 to-slate-100/40',
  },
  google_ai_mode: {
    name: 'Google AI',
    Icon: GoogleAIIcon,
    accent: 'text-indigo-600',
    bg: 'from-indigo-50 to-purple-50/40',
  },
}
