import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { AiCrawlerChecker } from '@/components/ai-crawlers/AiCrawlerChecker'
import { aiCrawlerCopy } from '@/lib/ai-crawlers/copy'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const copy = aiCrawlerCopy('he')

export const metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  openGraph: {
    title: copy.page.title,
    description: copy.meta.description,
    url: 'https://www.gotopseo.com/ai-crawlers',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ai-crawlers',
    languages: buildHreflangAlternates('/ai-crawlers', '/en/ai-crawlers', '/es/ai-crawlers'),
  },
}

/**
 * The AI crawler access checker — a free, linkable asset, not a lead magnet.
 *
 * Nothing on it is gated: the reference table of AI user-agents renders before
 * anyone types, the verdicts arrive without an email address, and the call to
 * action sits at the bottom after the answer. That is the whole premise — a
 * page another site can cite on its merits.
 *
 * `?url=` lets a link or a blog post hand the domain over. It reaches the
 * client as a plain string and is admitted server-side by the API's own URL
 * guard (lib/free-check/url-guard.ts), never trusted here.
 */
export default async function HebrewAiCrawlersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="he" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        <AiCrawlerChecker locale="he" initialUrl={initialUrl} />
      </main>
      <Footer locale="he" />
    </div>
  )
}
