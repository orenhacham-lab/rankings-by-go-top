/**
 * The public Data Deletion page of the Facebook and Instagram posting feature
 * (lib/legal/data-deletion.ts). One renderer for all eleven languages; each
 * route is three lines. The page is public and holds no personal data: with a
 * ?code= it looks the code up and says only whether a request exists.
 */
import { LegalDoc, LEGAL_FOOTNOTE } from '@/components/public/LegalDoc'
import { DATA_DELETION_TEXT } from '@/lib/legal/data-deletion'
import { LOCALE_PREFIX, LOCALE_CONFIG, type PublicLocale } from '@/lib/i18n/locales'
import { META_APP_NAME } from '@/lib/meta-posts/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { readDeletionRequest } from '@/lib/meta-posts/store'

const EMAIL = 'contact@gotopseo.com'

export function dataDeletionMetadata(locale: PublicLocale) {
  const t = DATA_DELETION_TEXT[locale]
  const title = t.title.replace('{app}', META_APP_NAME)
  return {
    title: `${title} | Go Top SEO`,
    description: t.subtitle,
    robots: 'noindex, nofollow',
    openGraph: { title, description: t.subtitle, url: `https://www.gotopseo.com${LOCALE_PREFIX[locale]}/data-deletion`, locale: LOCALE_CONFIG[locale].ogLocale },
  }
}

async function lookup(code: string | undefined): Promise<'none' | 'done' | 'unknown'> {
  if (!code) return 'none'
  try {
    const row = await readDeletionRequest(createAdminClient(), code)
    return row && row.status === 'completed' ? 'done' : 'unknown'
  } catch {
    return 'unknown'
  }
}

function withEmail(text: string) {
  const [before, after] = text.split('{email}')
  if (after === undefined) return <>{text}</>
  return <>{before}<a href={`mailto:${EMAIL}`}>{EMAIL}</a>{after}</>
}

export async function DataDeletionPage({ locale, code }: { locale: PublicLocale; code?: string }) {
  const t = DATA_DELETION_TEXT[locale]
  const state = await lookup(code)
  const title = t.title.replace('{app}', META_APP_NAME)
  return (
    <LegalDoc
      locale={locale}
      breadcrumbs={[{ label: t.breadcrumb, href: `${LOCALE_PREFIX[locale]}/data-deletion` }]}
      title={title}
      subtitle={t.subtitle}
    >
      <section><p>{t.intro.replace('{app}', META_APP_NAME)}</p></section>
      <section>
        <h2>{t.deletedTitle}</h2>
        <ul>{t.deleted.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      <section>
        <h2>{t.keptTitle}</h2>
        <ul>{t.kept.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      <section>
        <h2>{t.howTitle}</h2>
        <ol>{t.how.map((x) => <li key={x}>{withEmail(x)}</li>)}</ol>
      </section>
      <section>
        <h2>{t.statusTitle}</h2>
        {state === 'none'
          ? <p>{t.statusCodeLabel}: —</p>
          : <p><strong>{t.statusCodeLabel}:</strong> {code}<br />{state === 'done' ? t.statusDone : t.statusUnknown}</p>}
      </section>
      <section><p className={LEGAL_FOOTNOTE}>{t.trademark}</p></section>
    </LegalDoc>
  )
}
