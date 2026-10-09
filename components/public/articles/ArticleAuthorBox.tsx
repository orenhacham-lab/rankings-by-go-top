import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { articleAuthor, authorInitial } from '@/lib/articles/authors'
import { ARTICLES_COPY } from '@/lib/articles/i18n'
import type { PublicLocale } from '@/lib/i18n/locales'

/**
 * WHO WROTE THIS, AT THE END OF THE ARTICLE.
 *
 * The article carried a name in a row of metadata and nothing else. For a
 * reader deciding whether to believe a claim about their own site, and for a
 * search engine weighing the same thing, a name is not experience: the box
 * says who the person is, what they do, and links to the page that backs it.
 *
 * It renders only for an author with a profile in lib/articles/authors.ts. An
 * unknown byline keeps its name in the header and gets no box, because an
 * invented biography is worse than none.
 *
 * The avatar is the person's own photograph where there is one; the initial in
 * a circle is what a profile without a photo falls back to, never a stock face.
 */
export function ArticleAuthorBox({ locale, author }: { locale: PublicLocale; author: string | null }) {
  const profile = articleAuthor(author)
  if (!profile) return null

  const copy = ARTICLES_COPY[locale].article
  const name = profile.name[locale]

  return (
    <aside className="my-12 rounded-card border border-line bg-surface p-6 shadow-card sm:my-14 sm:p-7">
      <p className="mb-4 text-caption font-semibold uppercase tracking-wide text-muted">{copy.aboutAuthor}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        {profile.photo ? (
          <Image
            src={profile.photo}
            alt={name}
            width={112}
            height={112}
            sizes="80px"
            className="size-20 shrink-0 rounded-pill border border-line object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-action/10 text-title font-bold text-action"
          >
            {authorInitial(name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-section font-semibold text-ink">{name}</p>
          <p className="mt-0.5 text-copy text-muted">{profile.role[locale]}</p>
          <p className="mt-3 text-copy text-body text-pretty">{profile.bio[locale]}</p>
          <Link
            href={profile.href[locale]}
            className="mt-4 inline-flex items-center gap-1.5 text-copy font-semibold text-action underline-offset-4 hover:underline"
          >
            {copy.aboutAuthorLink}
            <ArrowLeft className="size-4 ltr:-scale-x-100" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  )
}
