/**
 * The mark of each network beside its profile field: drawn here, in the network's own colours, so
 * it never depends on loading a favicon (which fell back to a letter, and to two different "W"s
 * for Wikidata and Wikipedia; review P2-3). Decorative: the field's label names the network.
 */
import type { ProfileNetwork } from '@/lib/content/article-style/profiles'
import { cn } from '@/lib/utils'

const TILE = 'size-6 shrink-0 rounded-control'

export default function ProfileGlyph({ network, className }: { network: ProfileNetwork; className?: string }) {
  const common = { 'aria-hidden': true, focusable: false, viewBox: '0 0 24 24', className: cn(TILE, className), 'data-profile-glyph': network } as const
  switch (network) {
    case 'google_business':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#fff" stroke="#e3e5e8" />
          <path d="M18.2 12.2c0-.5 0-.9-.1-1.3H12v2.5h3.5a3 3 0 0 1-1.3 2" fill="none" stroke="#4285F4" strokeWidth="2.4" />
          <path d="M14.2 15.4A3.9 3.9 0 0 1 8.3 13.3" fill="none" stroke="#34A853" strokeWidth="2.4" />
          <path d="M8.3 13.3a4 4 0 0 1 0-2.6" fill="none" stroke="#FBBC05" strokeWidth="2.4" />
          <path d="M8.3 10.7a3.9 3.9 0 0 1 6.1-2" fill="none" stroke="#EA4335" strokeWidth="2.4" />
        </svg>
      )
    case 'facebook':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#1877F2" />
          <path d="M13.3 20v-6.2h2.1l.3-2.5h-2.4V9.8c0-.7.2-1.2 1.2-1.2h1.3V6.4a17 17 0 0 0-1.9-.1c-1.9 0-3.1 1.1-3.1 3.2v1.8H8.7v2.5h2.1V20z" fill="#fff" />
        </svg>
      )
    case 'instagram':
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="gt-ig" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset=".35" stopColor="#FA7E1E" />
              <stop offset=".6" stopColor="#D62976" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="7" fill="url(#gt-ig)" />
          <rect x="6" y="6" width="12" height="12" rx="3.6" fill="none" stroke="#fff" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" strokeWidth="1.7" />
          <circle cx="15.6" cy="8.4" r=".9" fill="#fff" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#0A66C2" />
          <rect x="6.4" y="10" width="2.4" height="7.6" fill="#fff" />
          <circle cx="7.6" cy="7.4" r="1.45" fill="#fff" />
          <path d="M10.8 10h2.3v1.1c.4-.7 1.3-1.3 2.6-1.3 2 0 2.7 1.3 2.7 3.3v4.5H16v-4c0-1-.2-1.8-1.2-1.8s-1.5.8-1.5 1.8v4h-2.5z" fill="#fff" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#0F1419" />
          <path d="M7 6.5h3.2l7 11h-3.2z" fill="#fff" />
          <path d="M16.6 6.5 7.4 17.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#FF0000" />
          <path d="M10 8.6v6.8l5.8-3.4z" fill="#fff" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#010101" />
          <path d="M13.3 5.8v8.6a2.4 2.4 0 1 1-2.4-2.4" fill="none" stroke="#25F4EE" strokeWidth="2" strokeLinecap="round" transform="translate(-.6 -.4)" />
          <path d="M13.3 5.8v8.6a2.4 2.4 0 1 1-2.4-2.4" fill="none" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" transform="translate(.6 .4)" />
          <path d="M13.3 5.8v8.6a2.4 2.4 0 1 1-2.4-2.4M13.3 5.8c.3 1.7 1.5 2.8 3.2 3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'wikidata':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#fff" stroke="#e3e5e8" />
          <rect x="5" y="7" width="1.6" height="10" fill="#990000" />
          <rect x="7.6" y="7" width="3" height="10" fill="#990000" />
          <rect x="11.6" y="7" width="3" height="10" fill="#339966" />
          <rect x="15.6" y="7" width="1.2" height="10" fill="#006699" />
          <rect x="17.8" y="7" width="1.2" height="10" fill="#006699" />
        </svg>
      )
    case 'wikipedia':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#fff" stroke="#e3e5e8" />
          <path d="M4.6 7.5h3M16.4 7.5h3M5.9 7.5l3.4 9 2.7-6.2 2.7 6.2 3.4-9" fill="none" stroke="#202122" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
  }
}
