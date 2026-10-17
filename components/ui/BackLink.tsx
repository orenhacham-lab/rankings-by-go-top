import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one "back" link (design contract §9): a ghost small button whose arrow
 * points to the START of the line — right in Hebrew, left in English (the
 * lucide arrow is mirrored under rtl:, so no "←"/"→" glyph ever sits in a
 * label). The label comes from the caller's dictionary, without any arrow.
 *
 *   <BackLink href="/keywords">{t.backToKeywords}</BackLink>
 *
 * `href` must be an internal path; an external `next` never reaches here.
 */
export const BACK_LINK_CLASSES =
  'inline-flex h-8 items-center gap-1.5 rounded-control px-3 -ms-3 text-caption font-semibold text-body ' +
  'transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

export default function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const safe = /^\/(?![/\\])/.test(href) ? href : '/'
  return (
    <Link href={safe} className={cn(BACK_LINK_CLASSES, className)}>
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />
      <span>{children}</span>
    </Link>
  )
}
