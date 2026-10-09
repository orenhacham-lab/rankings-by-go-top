/**
 * THE PUBLIC BLOG IN FOUR LANGUAGES — what must stay true.
 *
 * BEFORE: `app/(public)/articles` read every published row in `articles` and
 * rendered it as the Hebrew blog. `/en/articles`, `/es/articles` and
 * `/pt-BR/articles` were static "coming soon" pages: no list, no `[slug]`
 * route, no way to publish. `articles` had no language column, so there was
 * nothing to separate one blog from another even if the routes had existed.
 *
 * AFTER: `articles.locale` (migration 20261009180750) files each row under one
 * language, each locale has the same four route files, and both pages filter by
 * their own locale. The sitemap and llms.txt put an article under the tree of
 * its language instead of always under the Hebrew one.
 *
 * Every list below is DERIVED from PUBLIC_LOCALES, never typed out: a fifth
 * language must fail this suite until its routes, its copy and the database
 * CHECK exist, which is the only way the next language cannot ship half-built.
 *
 * MUTATION CONTROL: each guard names, in its own comment, the edit that breaks
 * it; `M` below re-runs the behavioural ones against deliberately broken input.
 *
 *   npx tsx lib/articles/__qa__/public-blog-locales.qa.ts
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import { ARTICLES_COPY, articleHref, articlesIndexHref } from '@/lib/articles/i18n'
import { extractFaqSchema, FAQ_HEADING, buildArticleSchemas } from '@/lib/articles/server'
import { sanitizePublicArticleHtml } from '@/lib/content/public-article-html'

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** The directory each locale's blog lives in. Hebrew is the bare root. */
const blogDir = (locale: PublicLocale) =>
  locale === 'he' ? 'app/(public)/articles' : `app/(public)/${locale}/articles`

function main() {
  console.log('\nA. every language has the same four route files')
  for (const locale of PUBLIC_LOCALES) {
    for (const file of ['page.tsx', 'layout.tsx', '[slug]/page.tsx', '[slug]/layout.tsx']) {
      // MUTATION: delete any one of these files and this fails.
      check(`A. ${locale}: ${file}`, existsSync(join(ROOT, blogDir(locale), file)))
    }
  }

  console.log('\nB. each page is wired to its own language')
  for (const locale of PUBLIC_LOCALES) {
    const index = stripComments(read(join(blogDir(locale), 'page.tsx')))
    const article = stripComments(read(join(blogDir(locale), '[slug]/page.tsx')))
    const articleLayout = stripComments(read(join(blogDir(locale), '[slug]/layout.tsx')))
    // MUTATION: copy the Hebrew page into /es and this fails for 'es' —
    // which is exactly the bug (Spanish shell, Hebrew articles).
    check(`B. ${locale}: list passes locale="${locale}"`, index.includes(`locale="${locale}"`))
    check(`B. ${locale}: article passes locale="${locale}"`, article.includes(`locale="${locale}"`))
    check(`B. ${locale}: metadata and schema resolve the row in '${locale}'`,
      (articleLayout.match(new RegExp(`'${locale.replace('-', '\\-')}'`, 'g')) || []).length >= 3)
  }

  console.log('\nC. both pages ask the database for one language only')
  const indexSrc = stripComments(read('components/public/articles/ArticlesIndex.tsx'))
  const viewSrc = stripComments(read('components/public/articles/ArticleView.tsx'))
  const serverSrc = stripComments(read('lib/articles/server.ts'))
  // MUTATION: drop `.eq('locale', locale)` from either component and every
  // language's blog shows every language's articles again.
  check('C1. the listing filters by locale', /\.eq\('locale',\s*locale\)/.test(indexSrc))
  check('C2. the article page filters by locale', /\.eq\('locale',\s*locale\)/.test(viewSrc))
  check('C3. the server-side metadata/schema read filters by locale', /\.eq\('locale',\s*locale\)/.test(serverSrc))
  check('C4. both still read published rows only', /\.eq\('is_published',\s*true\)/.test(indexSrc)
    && /\.eq\('is_published',\s*true\)/.test(viewSrc) && /\.eq\('is_published',\s*true\)/.test(serverSrc))

  console.log('\nD. copy exists for every language, and the compiler cannot be the only check')
  for (const locale of PUBLIC_LOCALES) {
    const copy = ARTICLES_COPY[locale]
    // MUTATION: blank any one string and this fails.
    const strings = [copy.index.title, copy.index.subtitle, copy.index.breadcrumb, copy.index.empty,
      copy.index.loading, copy.index.readMore, copy.article.notFoundTitle, copy.article.notFoundBody,
      copy.article.backToArticles, copy.article.backHome, copy.article.toc]
    check(`D. ${locale}: every blog string is present and non-empty`,
      strings.every((s) => typeof s === 'string' && s.trim().length > 0))
    check(`D. ${locale}: the promo block points at this language's signup and pricing`,
      copy.promo.signup.href.startsWith(LOCALE_PREFIX[locale] || '/')
      && copy.promo.pricing.href.startsWith(LOCALE_PREFIX[locale] || '/'))
  }

  console.log('\nE. URLs live under the tree of their language')
  for (const locale of PUBLIC_LOCALES) {
    const expected = `${LOCALE_PREFIX[locale]}/articles`
    check(`E. ${locale}: index href is ${expected}`, articlesIndexHref(locale) === expected)
    check(`E. ${locale}: article href is ${expected}/<slug>`, articleHref(locale, 'x') === `${expected}/x`)
  }
  const sitemapSrc = stripComments(read('app/sitemap.xml/route.ts'))
  const llmsSrc = stripComments(read('app/llms.txt/route.ts'))
  // MUTATION: restore the old `${baseUrl}/articles/${article.slug}` in either
  // file and this fails — that line put every Spanish article on a Hebrew URL
  // that 404s.
  check('E1. the sitemap prefixes an article URL with its locale',
    /LOCALE_PREFIX\[/.test(sitemapSrc) && !/\$\{baseUrl\}\/articles\/\$\{article\.slug\}/.test(sitemapSrc))
  check('E2. llms.txt prefixes an article URL with its locale',
    /LOCALE_PREFIX\[/.test(llmsSrc) && !/\$\{baseUrl\}\/articles\/\$\{article\.slug\}/.test(llmsSrc))
  check('E3. the sitemap still reads the locale column', /select\('slug, published_at, locale'\)/.test(sitemapSrc))

  console.log('\nF. the database agrees with the code about the list of languages')
  const migration = read('supabase/migrations/20261009180750_articles_locale.sql')
  const checkList = migration.match(/CHECK \(locale IN \(([^)]*)\)\)/)
  const inCheck = (checkList?.[1] || '').split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
  // MUTATION: add a language to PUBLIC_LOCALES without touching the migration
  // and this fails, which is the point: the row would be refused in production.
  check('F1. the CHECK lists exactly PUBLIC_LOCALES',
    inCheck.length === PUBLIC_LOCALES.length && PUBLIC_LOCALES.every((l) => inCheck.includes(l)),
    `migration has [${inCheck.join(', ')}]`)
  check('F2. the column is additive: NOT NULL with a Hebrew default',
    /ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'he'/.test(migration))
  check('F3. the listing query has an index', /CREATE INDEX IF NOT EXISTS articles_locale_published_idx/.test(migration))

  // A version Supabase has already recorded is never applied again, and it
  // reports no error for the file it skipped. This one was first committed as
  // 20261009180000, which production had already recorded for
  // email_suppressions, so the column existed in production (it was applied by
  // hand) while every fresh environment — a preview branch, a local stack, a
  // restore — would have skipped the file in silence and served a blog whose
  // locale column did not exist.
  // MUTATION: give any second migration the same version prefix and this fails.
  const migrationVersions = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .map((f) => f.slice(0, 14))
  const duplicated = migrationVersions.filter((v, i) => migrationVersions.indexOf(v) !== i)
  check('F4. no two migrations in the repo share a version', duplicated.length === 0,
    `duplicated: ${[...new Set(duplicated)].join(', ')}`)

  console.log('\nG. the FAQ block becomes schema in every language')
  for (const locale of PUBLIC_LOCALES) {
    const html = `<h2>${FAQ_HEADING[locale]}</h2><p><strong>Q1?</strong><br>A1.</p><p><strong>Q2?</strong><br>A2.</p><h2>After</h2><p><strong>Q3?</strong><br>A3.</p>`
    const faq = extractFaqSchema(html, locale)
    // MUTATION: match the Hebrew heading in every language (what the code did
    // before) and this fails for en, es and pt-BR, silently shipping no FAQ.
    check(`G. ${locale}: the two questions under its own heading, and nothing after the next h2`,
      faq.length === 2 && faq[0].name === 'Q1?' && faq[1].acceptedAnswer.text === 'A2.')
  }

  console.log('\nH. an article page carries the schema a crawler needs')
  const article = {
    title: 'T', meta_title: null, meta_description: 'D', excerpt: null,
    content: `<h2>${FAQ_HEADING.es}</h2><p><strong>P?</strong><br>R.</p>`,
    featured_image_url: null, featured_image_alt: null, author: 'A',
    published_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T10:00:00Z',
  }
  const { breadcrumbSchema, articleSchema, faqSchema } = buildArticleSchemas(article, 'slug-es', 'es')
  check('H1. the breadcrumb walks the Spanish tree',
    breadcrumbSchema.itemListElement[2].item === 'https://www.gotopseo.com/es/articles/slug-es'
    && breadcrumbSchema.itemListElement[1].item === 'https://www.gotopseo.com/es/articles')
  check('H2. the Article declares its language', articleSchema?.inLanguage === 'es')
  check('H3. the FAQ of a Spanish article is emitted', (faqSchema?.mainEntity as unknown[])?.length === 1)
  const empty = buildArticleSchemas(null, 'missing', 'en')
  check('H4. a missing article emits breadcrumbs and nothing else',
    empty.articleSchema === null && empty.faqSchema === null && !!empty.breadcrumbSchema)

  console.log('\nI. the admin editor saves what the page will show')
  const apiSrc = stripComments(read('app/api/articles/route.ts'))
  const apiIdSrc = stripComments(read('app/api/articles/[id]/route.ts'))
  // MUTATION: put the old narrow ALLOWED_TAGS list back and this fails — an
  // edit through the admin form silently deleted the article's tables.
  check('I1. create and update use the public-article sanitizer',
    /sanitizePublicArticleHtml/.test(apiSrc) && /sanitizePublicArticleHtml/.test(apiIdSrc))
  check('I2. neither route keeps a second, narrower allow-list',
    !/ALLOWED_TAGS/.test(apiSrc) && !/ALLOWED_TAGS/.test(apiIdSrc))
  check('I3. both persist the language, defaulting to Hebrew',
    /locale: normalizePublicLocale\(locale\) \?\? 'he'/.test(apiSrc)
    && /locale: normalizePublicLocale\(locale\) \?\? 'he'/.test(apiIdSrc))
  check('I4. the admin form offers every language',
    /PUBLIC_LOCALES\.map/.test(stripComments(read('components/admin/ArticleForm.tsx'))))
  const withTable = sanitizePublicArticleHtml('<table><tr><td>1</td></tr></table><p>x</p>')
  check('I5. a table survives the shared sanitizer', /<table>/.test(withTable) && /<td>1<\/td>/.test(withTable))
  const withScript = sanitizePublicArticleHtml('<p onclick="x()">a</p><script>b()</script>')
  check('I6. script and handlers still do not', !/script/i.test(withScript) && !/onclick/i.test(withScript))

  console.log('\nM. mutation controls — the behavioural guards fail on broken input')
  check('M1. a FAQ under the wrong language\'s heading yields nothing',
    extractFaqSchema(`<h2>${FAQ_HEADING.he}</h2><p><strong>Q?</strong><br>A.</p>`, 'es').length === 0)
  check('M2. an article page of the wrong locale builds a different URL',
    buildArticleSchemas(article, 'slug-es', 'he').breadcrumbSchema.itemListElement[2].item
      === 'https://www.gotopseo.com/articles/slug-es')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
