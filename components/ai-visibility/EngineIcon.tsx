/**
 * Engine logo loader — uses SVG assets from /public/ai-engines/
 *
 * Premium recognizable glyphs for each AI engine, stored as standalone SVG files
 * for easy swapping with official brand assets when available.
 */

import { SVGProps } from 'react'

type IconProps = { size?: number; className?: string }

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
})

/**
 * Generic image-based engine icon — loads premium SVG from /public/ai-engines/.
 * Renders consistent size + accessibility.
 */
function EngineImageIcon({
  src,
  alt,
  size = 24,
  className,
}: {
  src: string
  alt: string
  size?: number
  className?: string
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className || ''}`}
      style={{ width: size, height: size }}
    />
  )
}

export function ChatGPTIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/chatgpt.svg" alt="ChatGPT" size={size} className={`dark:invert ${className || ''}`} />
}

export function ClaudeIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/claude.svg" alt="Claude" size={size} className={className} />
}

export function GeminiIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/gemini.svg" alt="Gemini" size={size} className={className} />
}

export function PerplexityIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/perplexity.svg" alt="Perplexity" size={size} className={className} />
}

export function CopilotIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/copilot.svg" alt="Copilot" size={size} className={className} />
}

export function GrokIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/grok.svg" alt="Grok" size={size} className={`dark:invert ${className || ''}`} />
}

export function GoogleAIIcon({ size = 24, className }: IconProps) {
  return <EngineImageIcon src="/ai-engines/google-ai.svg" alt="Google AI" size={size} className={className} />
}

/** External link icon for citation cards */
export function ExternalLinkIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M15 3h6v6M10 14L21 3M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Sparkle/AI accent icon for headers */
export function SparkleIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M12 3 13.5 9 19.5 10.5 13.5 12 12 18 10.5 12 4.5 10.5 10.5 9z"
        fill="currentColor"
      />
      <circle cx="19" cy="5" r="1.2" fill="currentColor" />
      <circle cx="5" cy="19" r="1" fill="currentColor" opacity="0.7" />
    </svg>
  )
}

/** Trash icon for delete action */
export function TrashIcon({ size = 18, className }: IconProps) {
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
  { name: string; Icon: React.ComponentType<IconProps>; accent: string; bg: string }
> = {
  chatgpt: {
    name: 'ChatGPT',
    Icon: ChatGPTIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  claude: {
    name: 'Claude',
    Icon: ClaudeIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  perplexity: {
    name: 'Perplexity',
    Icon: PerplexityIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  gemini: {
    name: 'Gemini',
    Icon: GeminiIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  copilot: {
    name: 'Copilot',
    Icon: CopilotIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  grok: {
    name: 'Grok',
    Icon: GrokIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  google_ai_mode: {
    name: 'Google AI',
    Icon: GoogleAIIcon,
    accent: '',
    bg: 'bg-sunk',
  },
  // The retired engine code of older answers (Google's AI overview, now
  // google_ai_mode). Named here so its code never reaches the screen.
  google_ai_overview: {
    name: 'Google AI',
    Icon: GoogleAIIcon,
    accent: '',
    bg: 'bg-sunk',
  },
}
