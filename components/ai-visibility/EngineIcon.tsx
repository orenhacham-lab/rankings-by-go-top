/**
 * Engine icon components — brand-inspired SVG marks with premium SaaS aesthetic.
 * Recognizable but original: no copyrighted logos, no emojis.
 * Thin modern stroke style, subtle gradients, cohesive design system.
 * ~24×24 by default, color accent via Tailwind className.
 */

import { SVGProps } from 'react'

const baseProps = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
})

/** ChatGPT: turquoise spiral / DNA double helix inspired */
export function ChatGPTIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <defs>
        <linearGradient id="chatgpt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        d="M12 2 C16 6, 16 18, 12 22 C8 18, 8 6, 12 2"
        stroke="url(#chatgpt-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12 C6 8, 18 8, 22 12 C18 16, 6 16, 2 12"
        stroke="url(#chatgpt-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  )
}

/** Perplexity: purple hexagon / geometric innovation */
export function PerplexityIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <path
        d="M12 3 L20.2 7.6 L17.8 17.4 L6.2 17.4 L3.8 7.6 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 3 L12 12 M3.8 7.6 L12 12 M20.2 7.6 L12 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

/** Gemini: colorful faceted gem with 4 colored nodes */
export function GeminiIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <defs>
        <linearGradient id="gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
          <stop offset="100%" stopColor="currentColor" />
        </linearGradient>
      </defs>
      <path
        d="M12 2 L19 9 L16 16 L8 16 L5 9 Z"
        stroke="url(#gemini-grad)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 2 L12 16 M5 9 L19 9" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <circle cx="12" cy="4" r="1.5" fill="currentColor" opacity="0.8" />
      <circle cx="17" cy="12" r="1.5" fill="currentColor" opacity="0.6" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

/** Copilot: azure blue circular with directional accent */
export function CopilotIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 4 L14.5 10 L12 12 L9.5 10 Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M12 20 L14.5 14 L12 12 L9.5 14 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.4"
      />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

/** Grok: bold dynamic X with angular energy */
export function GrokIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <defs>
        <linearGradient id="grok-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path
        d="M4 4 L20 20"
        stroke="url(#grok-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 4 L4 20"
        stroke="url(#grok-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

/** Google AI Mode: search ring + colorful accent nodes */
export function GoogleAIIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="11" cy="11" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <circle cx="8.5" cy="8.5" r="0.8" fill="currentColor" opacity="0.8" />
      <circle cx="13.5" cy="8.5" r="0.8" fill="currentColor" opacity="0.6" />
      <circle cx="11" cy="13.5" r="0.8" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

/** External link icon */
export function ExternalLinkIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
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
    <svg {...baseProps(size)} className={className}>
      <path
        d="M12 2v3M12 19v3M2 11h3M19 11h3M4.4 4.4l2.1 2.1M15.6 15.6l2.1 2.1M4.4 17.6l2.1-2.1M15.6 6.4l2.1-2.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  )
}

/** Trash icon for delete action */
export function TrashIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg {...baseProps(size)} className={className}>
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
  { name: string; Icon: React.ComponentType<{ size?: number; className?: string }>; accent: string }
> = {
  chatgpt: { name: 'ChatGPT', Icon: ChatGPTIcon, accent: 'text-emerald-600' },
  perplexity: { name: 'Perplexity', Icon: PerplexityIcon, accent: 'text-violet-600' },
  gemini: { name: 'Gemini', Icon: GeminiIcon, accent: 'text-blue-600' },
  copilot: { name: 'Copilot', Icon: CopilotIcon, accent: 'text-sky-600' },
  grok: { name: 'Grok', Icon: GrokIcon, accent: 'text-slate-700' },
  google_ai_mode: { name: 'Google AI', Icon: GoogleAIIcon, accent: 'text-indigo-600' },
}
