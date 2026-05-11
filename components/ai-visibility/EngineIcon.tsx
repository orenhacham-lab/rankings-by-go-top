/**
 * Engine icon components — minimal abstract SVG marks (not brand logos).
 * Monochrome with optional accent color, sized 24×24 by default.
 * No emojis, no external assets, no copyrighted artwork.
 */

import { SVGProps } from 'react'

const baseProps = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
})

/** ChatGPT: abstract knot/star — six interlocked petals around a center */
export function ChatGPTIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <path
        d="M12 3.2 7.3 5.9v5.4l4.7 2.7 4.7-2.7V5.9L12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 13.1v5.4l-4.7 2.7M12 13.1l4.7 2.7M12 13.1l-4.7 2.7M12 13.1v5.4l4.7 2.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Perplexity: stacked layered lines suggesting search results */
export function PerplexityIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <rect x="4" y="5" width="16" height="3" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="10.5" width="11" height="3" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="16" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/** Gemini: faceted gem/diamond outline */
export function GeminiIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <path
        d="M12 3 4 10.5 12 21l8-10.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 10.5h16M12 3v18M8 10.5 12 21l4-10.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** Copilot: split window panels suggesting Microsoft window motif */
export function CopilotIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="3.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="12.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/** Grok: bold X-style strokes */
export function GrokIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <path
        d="M5 4 19 20M19 4 5 20"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Google AI Mode: circular search ring with internal accent */
export function GoogleAIIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11" cy="11" r="2" fill="currentColor" />
    </svg>
  )
}

/** External link icon */
export function ExternalLinkIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <path
        d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Sparkle icon for section header */
export function SparkleIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  )
}

export const ENGINE_META: Record<
  string,
  { name: string; Icon: React.ComponentType<{ size?: number; className?: string }>; accent: string }
> = {
  chatgpt: { name: 'ChatGPT', Icon: ChatGPTIcon, accent: 'text-emerald-600' },
  perplexity: { name: 'Perplexity', Icon: PerplexityIcon, accent: 'text-cyan-600' },
  gemini: { name: 'Gemini', Icon: GeminiIcon, accent: 'text-blue-600' },
  copilot: { name: 'Copilot', Icon: CopilotIcon, accent: 'text-sky-600' },
  grok: { name: 'Grok', Icon: GrokIcon, accent: 'text-slate-700' },
  google_ai_mode: { name: 'Google AI Mode', Icon: GoogleAIIcon, accent: 'text-indigo-600' },
}
