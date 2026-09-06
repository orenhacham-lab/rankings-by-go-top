/**
 * ONE TRUTHFUL READ MODEL for automation publish alerts.
 *
 * THE PRODUCTION STATE THIS REPLACES (Chrome audit):
 *   - /api/content/overview returned NO alerts field while
 *     /api/content/automation/alerts returned an old open publish_failed_final
 *     row, so the Content Hub said the project was fine and the automation panel
 *     said it had an unresolved failure — at the same moment, for the same project;
 *   - that row was a SHOPIFY failure and rendered as "WordPress publish failed",
 *     because the heading was a hard-coded string with nothing behind it;
 *   - the raw Shopify GraphQL error was printed to the merchant verbatim, since
 *     the renderer appended the stored string's tail "so it is debuggable";
 *   - the row had no publishing channel at all, so nothing could have known better.
 *
 * WHAT IS PROVEN HERE
 *   A. the real read model over real row shapes, both channels and the legacy
 *      channel-less row;
 *   B. no raw provider/GraphQL text survives into the API payload or the
 *      rendered card, in either language;
 *   C. a later successful publication supersedes the matching stale failure —
 *      including the legacy row with no channel — while unrelated failures stay;
 *   D. the REAL route handlers, driven end to end against a contract-faithful
 *      in-memory Supabase, return the SAME active-alert decision;
 *   E. the real write path records a channel, and a success resolves the right
 *      rows and only those;
 *   F. NEGATIVE CONTROLS — restoring the endpoint disagreement or the raw-error
 *      leak must fail these checks, so they cannot pass vacuously.
 *
 * Run: npx tsx lib/content/__qa__/publish-alert-read-model.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
const Module: any = require('module')
const origLoad = Module._load
const INTERCEPT = ['@/lib/content/api-auth', '@/lib/supabase/server']
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  const key = INTERCEPT.find((x) => request === x)
  if (!key) return real
  return new Proxy(real, { get: (t, k) => { const o = overrides.get(key); return o && (k as string) in o ? o[k as string] : (t as any)[k] } })
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  selectActiveAlerts, alertReasonCode, isSuperseded, normalizeAlertChannel,
  type AlertRow, type PublicationFact, type ActiveAlert,
} from '../automation/alert-read-model'
import { presentAlert } from '../automation/alert-presentation'
import { publicationFactsFrom, loadActiveAlerts, isMissingSchemaError } from '../automation/load-active-alerts'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// The exact shape of the live reviewer row: a Shopify token failure whose detail
// is the provider's own GraphQL message.
const RAW_GRAPHQL = 'Variable $article of type ArticleCreateInput! was provided invalid value for author (Expected value to not be null)'
const SHOPIFY_RAW_ERROR = `shopify_token_invalid: ${RAW_GRAPHQL}`

const row = (over: Partial<AlertRow> = {}): AlertRow => ({
  id: 'a1', pool_item_id: 'item-1', article_id: 'art-1', topic_id: 't1',
  kind: 'publish_failed_final', channel: null, title: 'How to store perfume decants',
  error: 'shopify_token_invalid', attempts: 3, status: 'open',
  created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', ...over,
})

/** Contract-faithful in-memory Supabase, wide enough for the real route handlers. */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const st: { op: string; updates?: Record<string, unknown>; filters: Record<string, unknown>; isNull: string[]; single: boolean; head: boolean; inFilter?: { col: string; vals: unknown[] } } =
      { op: 'select', filters: {}, isNull: [], single: false, head: false }
    const rows = () => (tables[table] ??= [])
    const match = (r: Record<string, unknown>) =>
      Object.entries(st.filters).every(([k, v]) => r[k] === v)
      && st.isNull.every((c) => r[c] == null)
      && (!st.inFilter || st.inFilter.vals.includes(r[st.inFilter.col]))
    const exec = () => {
      if (st.op === 'update') { for (const r of rows()) if (match(r)) Object.assign(r, st.updates); return { data: null, error: null } }
      const out = rows().filter(match)
      if (st.head) return { data: null, error: null, count: out.length }
      return { data: st.single ? (out[0] ?? null) : out, error: null, count: out.length }
    }
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select(_cols?: string, opts?: { head?: boolean }) { if (opts?.head) st.head = true; return b },
      update(u: Record<string, unknown>) { st.op = 'update'; st.updates = u; return b },
      upsert(payload: Record<string, unknown>[]) {
        for (const p of Array.isArray(payload) ? payload : [payload]) {
          const existing = rows().find((r) => r.dedupe_key === p.dedupe_key)
          if (existing) Object.assign(existing, p); else rows().push({ id: `row${rows().length + 1}`, ...p })
        }
        return b
      },
      eq(col: string, val: unknown) { st.filters[col] = val; return b },
      is(col: string, val: unknown) { if (val === null) st.isNull.push(col); return b },
      in(col: string, vals: unknown[]) { st.inFilter = { col, vals }; return b },
      order() { return b }, limit() { return b },
      maybeSingle() { st.single = true; return b },
      single() { st.single = true; return b },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej) },
    })
    return b
  }
  return { from, tables } as never
}

/** The dictionary slice the card composes with — the real strings. */
function dictFor(lang: 'he' | 'en') {
  const hub = getDashboardDictionary(lang).contentHub as never as { autoSchedule: Record<string, string>; genErrors: Record<string, string> }
  const t = hub.autoSchedule
  return {
    alertBlockedTitle: t.alertBlockedTitle,
    alertPublishFailedShopify: t.alertPublishFailedShopify,
    alertPublishFailedWordPress: t.alertPublishFailedWordPress,
    alertPublishFailedGeneric: t.alertPublishFailedGeneric,
    alertAttempts: t.alertAttempts,
    alertReasonOther: t.alertReasonOther,
    genErrors: hub.genErrors,
  }
}

const renderCard = (alert: ActiveAlert, lang: 'he' | 'en') => {
  const p = presentAlert(alert, dictFor(lang))
  return renderToStaticMarkup(createElement('div', null,
    createElement('p', null, p.heading), createElement('p', null, p.detail)))
}

async function main() {
  // ── A) channels ────────────────────────────────────────────────────────────
  console.log('A) the channel decides the heading — never a constant')
  {
    const [shopify] = selectActiveAlerts([row({ channel: 'shopify' })])
    const [wordpress] = selectActiveAlerts([row({ id: 'a2', channel: 'wordpress', error: 'wordpress_media_upload_failed' })])
    const [legacy] = selectActiveAlerts([row({ id: 'a3', channel: null })])
    check('A1: a Shopify failure is labelled Shopify', shopify.heading === 'publish_failed_shopify' && shopify.channel === 'shopify')
    check('A2: a WordPress failure is labelled WordPress', wordpress.heading === 'publish_failed_wordpress' && wordpress.channel === 'wordpress')
    check('A3: a legacy channel-less row is NEUTRAL — never guessed', legacy.heading === 'publish_failed_generic' && legacy.channel === null)
    const [blocked] = selectActiveAlerts([row({ id: 'a4', kind: 'publish_blocked', channel: 'shopify' })])
    check('A4: a blocked alert keeps its own heading regardless of channel', blocked.heading === 'publish_blocked')
    check('A5: an unknown channel value is not trusted', normalizeAlertChannel('bogus') === null && normalizeAlertChannel('shopify') === 'shopify')
    check('A6: only OPEN rows are active',
      selectActiveAlerts([row({ status: 'resolved' }), row({ id: 'x', status: 'dismissed' })]).length === 0)
  }

  // ── B) no raw provider text ────────────────────────────────────────────────
  console.log('\nB) the raw provider error never leaves the server')
  {
    const [a] = selectActiveAlerts([row({ channel: 'shopify', error: SHOPIFY_RAW_ERROR })])
    check('B1: the payload carries the CODE only', a.reasonCode === 'shopify_token_invalid')
    check('B2: no field of the payload contains the GraphQL text',
      !JSON.stringify(a).includes('ArticleCreateInput') && !JSON.stringify(a).includes(RAW_GRAPHQL), JSON.stringify(a))
    check('B3: the payload has no `error` field at all', !('error' in (a as never as Record<string, unknown>)))
    check('B4: prose that is not a code yields null rather than being echoed',
      alertReasonCode('Something exploded: at line 42') === null
      && alertReasonCode(RAW_GRAPHQL) === null && alertReasonCode(null) === null)
    check('B5: a bare code with no tail still resolves', alertReasonCode('shopify_token_invalid') === 'shopify_token_invalid')
    for (const lang of ['he', 'en'] as const) {
      const html = renderCard(a, lang)
      check(`B6-${lang}: the rendered card contains no GraphQL/provider text`,
        !html.includes('ArticleCreateInput') && !html.includes('Expected value to not be null'), html)
      check(`B7-${lang}: …and no raw reason CODE either`, !html.includes('shopify_token_invalid'), html)
      check(`B8-${lang}: it does name Shopify, in this language`,
        html.includes(dictFor(lang).alertPublishFailedShopify), html)
      check(`B9-${lang}: an unmapped code degrades to a localized sentence, not the code`,
        (() => { const h = renderCard({ ...a, reasonCode: 'a_brand_new_code' }, lang); return !h.includes('a_brand_new_code') && h.includes(dictFor(lang).alertReasonOther) })())
    }
    const heHtml = renderCard(a, 'he'); const enHtml = renderCard(a, 'en')
    check('B10: HE and EN genuinely differ', heHtml !== enHtml)
    check('B11: the HE card is Hebrew and the EN card is not', /[֐-׿]/.test(heHtml) && !/[֐-׿]/.test(enHtml))
    // The HEADING is what must not guess. The reason sentence may still be
    // specific — `shopify_token_invalid` is a fact the row DOES record, and
    // suppressing it would make the card less useful, not more honest.
    const legacyAlert = selectActiveAlerts([row({ channel: null })])[0]
    const legacyPresented = presentAlert(legacyAlert, dictFor('en'))
    check('B12: the legacy row\'s HEADING names neither platform',
      legacyPresented.heading.startsWith('Publishing failed')
      && !legacyPresented.heading.includes('WordPress') && !legacyPresented.heading.includes('Shopify'),
      legacyPresented.heading)
    check('B13: …while its recorded reason is still stated specifically and actionably',
      legacyPresented.detail.includes('Reconnect the store'), legacyPresented.detail)
    check('B14: and no raw provider text rides along with it',
      !legacyPresented.detail.includes('ArticleCreateInput'), legacyPresented.detail)
  }

  // ── C) supersession ────────────────────────────────────────────────────────
  console.log('\nC) a later successful publication supersedes the stale failure')
  {
    const later: PublicationFact = { articleId: 'art-1', channel: 'shopify', publishedAt: '2026-09-03T09:00:00Z' }
    const earlier: PublicationFact = { articleId: 'art-1', channel: 'shopify', publishedAt: '2026-08-01T09:00:00Z' }
    const other: PublicationFact = { articleId: 'art-OTHER', channel: 'shopify', publishedAt: '2026-09-03T09:00:00Z' }
    check('C1: same article, same channel, LATER → superseded', isSuperseded(row({ channel: 'shopify' }), [later]))
    check('C2: the LEGACY channel-less row is superseded too — an unknown channel cannot argue it was unrelated',
      isSuperseded(row({ channel: null }), [later]))
    check('C3: a publication EARLIER than the failure supersedes nothing', !isSuperseded(row({ channel: 'shopify' }), [earlier]))
    check('C4: another article\'s publication supersedes nothing', !isSuperseded(row({ channel: 'shopify' }), [other]))
    check('C5: a WordPress success does NOT clear a Shopify failure',
      !isSuperseded(row({ channel: 'shopify' }), [{ articleId: 'art-1', channel: 'wordpress', publishedAt: '2026-09-03T09:00:00Z' }]))
    check('C6: an alert with no article is never superseded', !isSuperseded(row({ article_id: null }), [later]))
    check('C7: missing timestamps never count as "later"',
      !isSuperseded(row({ channel: 'shopify' }), [{ ...later, publishedAt: null }])
      && !isSuperseded(row({ channel: 'shopify', updated_at: null }), [later]))
    const mixed = selectActiveAlerts(
      [row({ id: 'stale', channel: null }), row({ id: 'keep', article_id: 'art-OTHER', channel: 'shopify' })],
      [later])
    check('C8: the stale one disappears and the UNRELATED one stays',
      mixed.length === 1 && mixed[0].id === 'keep', JSON.stringify(mixed.map((m) => m.id)))
  }

  // ── C2) the EVIDENCE contract — a remote id is not a publication ───────────
  console.log('\nC2) publication evidence: a remote id proves nothing on its own')
  {
    type Art = Parameters<typeof publicationFactsFrom>[0][number]
    const art = (over: Partial<Art> = {}): Art => ({
      id: 'art-1', status: 'draft', published_at: null,
      shopify_status: null, shopify_published_at: null, wp_post_id: null, ...over,
    })
    const facts = (a: Art) => publicationFactsFrom([a])

    // SHOPIFY — needs its OWN published status AND its OWN timestamp.
    check('C2-a: a real Shopify publication is a fact',
      JSON.stringify(facts(art({ shopify_status: 'published', shopify_published_at: '2026-09-03T10:00:00Z', status: 'published', published_at: '2026-09-03T10:00:00Z' })))
      === JSON.stringify([{ articleId: 'art-1', channel: 'shopify', publishedAt: '2026-09-03T10:00:00Z' }]))
    // The exact production shape: published to WordPress, later DRAFT-exported to
    // Shopify. The old code read the Shopify id + the WordPress date as a Shopify
    // publication that never happened.
    const draftExport = art({ shopify_status: 'draft', shopify_published_at: null, wp_post_id: 42, status: 'published', published_at: '2026-09-03T09:00:00Z' })
    check('C2-b: a Shopify DRAFT export is NOT a Shopify publication',
      !facts(draftExport).some((f) => f.channel === 'shopify'), JSON.stringify(facts(draftExport)))
    check('C2-c: …and the generic published_at is never borrowed for Shopify',
      !facts(art({ shopify_status: 'draft', published_at: '2026-09-03T09:00:00Z', status: 'published' })).some((f) => f.channel === 'shopify'))
    check('C2-d: a published Shopify status with NO Shopify timestamp is not a fact',
      facts(art({ shopify_status: 'published', shopify_published_at: null, status: 'published', published_at: '2026-09-03T09:00:00Z' })).length === 0)
    check('C2-e: an unparseable Shopify timestamp is not a fact',
      facts(art({ shopify_status: 'published', shopify_published_at: 'not-a-date' })).length === 0)
    check('C2-f: shopify_status remote_missing is not a publication',
      facts(art({ shopify_status: 'remote_missing', shopify_published_at: '2026-09-03T10:00:00Z' })).length === 0)

    // WORDPRESS — needs a post id AND a generic published state AND a date.
    check('C2-g: a real WordPress publication is a fact',
      JSON.stringify(facts(art({ wp_post_id: 55, status: 'published', published_at: '2026-09-02T09:00:00Z' })))
      === JSON.stringify([{ articleId: 'art-1', channel: 'wordpress', publishedAt: '2026-09-02T09:00:00Z' }]))
    check('C2-h: a WordPress DRAFT export (post id, still unpublished) is NOT a fact',
      facts(art({ wp_post_id: 55, status: 'ready', published_at: null })).length === 0)
    check('C2-i: a post id with a published status but no date is not a fact',
      facts(art({ wp_post_id: 55, status: 'published', published_at: null })).length === 0)
    // AMBIGUITY: Shopify owns the generic pair when it says published, so the
    // WordPress fact is withheld rather than invented.
    const both = art({ wp_post_id: 55, status: 'published', published_at: '2026-09-03T10:00:00Z', shopify_status: 'published', shopify_published_at: '2026-09-03T10:00:00Z' })
    check('C2-j: when Shopify claims the generic publish state, no WordPress fact is invented',
      JSON.stringify(facts(both)) === JSON.stringify([{ articleId: 'art-1', channel: 'shopify', publishedAt: '2026-09-03T10:00:00Z' }]),
      JSON.stringify(facts(both)))
    check('C2-k: an article with no publication evidence yields nothing',
      facts(art()).length === 0 && facts(art({ status: 'published', published_at: '2026-09-03T09:00:00Z' })).length === 0)

    // …and the SUPPRESSION consequences the contract exists for.
    const shopFailure = row({ channel: 'shopify' })
    const wpFailure = row({ channel: 'wordpress', error: 'wordpress_media_upload_failed' })
    const legacyFailure = row({ channel: null })
    const draftFacts = facts(draftExport)
    check('C2-l: a Shopify DRAFT does not suppress a Shopify failure',
      selectActiveAlerts([shopFailure], draftFacts).length === 1)
    // A Shopify draft ALONE — no other channel published — must leave the legacy
    // row visible. (draftExport above also carries a genuine WordPress
    // publication, which legitimately does supersede it; see C2-r.)
    const shopifyDraftOnly = facts(art({ shopify_status: 'draft', shopify_published_at: null }))
    check('C2-m: …nor a LEGACY channel-less failure',
      shopifyDraftOnly.length === 0 && selectActiveAlerts([legacyFailure], shopifyDraftOnly).length === 1)
    const wpOnly = facts(art({ wp_post_id: 55, status: 'published', published_at: '2026-09-05T09:00:00Z' }))
    check('C2-n: a WordPress success does not suppress a Shopify failure',
      selectActiveAlerts([shopFailure], wpOnly).length === 1)
    const shopOnly = facts(art({ shopify_status: 'published', shopify_published_at: '2026-09-05T09:00:00Z' }))
    check('C2-o: a Shopify success does not suppress a WordPress failure',
      selectActiveAlerts([wpFailure], shopOnly).length === 1)
    check('C2-p: a later genuine publication on the SAME channel does suppress it',
      selectActiveAlerts([shopFailure], shopOnly).length === 0
      && selectActiveAlerts([wpFailure], wpOnly).length === 0)
    const earlier = facts(art({ shopify_status: 'published', shopify_published_at: '2026-08-01T09:00:00Z' }))
    check('C2-q: an EARLIER publication does not suppress a later failure',
      selectActiveAlerts([shopFailure], earlier).length === 1)
    check('C2-r: a genuine publication DOES supersede the legacy channel-less failure',
      selectActiveAlerts([legacyFailure], shopOnly).length === 0)

    // SOURCE: the loader must actually select the columns this contract needs.
    const loaderSrc = strip(read('lib/content/automation/load-active-alerts.ts'))
    check('C2-s: the loader selects the status columns the contract depends on',
      /shopify_status/.test(loaderSrc) && /shopify_published_at/.test(loaderSrc) && /\bstatus,/.test(loaderSrc))
    check('C2-t: …and never falls back to the generic date for Shopify',
      !/shopify_published_at \?\? a\.published_at/.test(loaderSrc))
  }

  // ── D) both REAL endpoints agree ───────────────────────────────────────────
  console.log('\nD) the two REAL route handlers return the same decision')
  {
    const alertRows = [
      { ...row({ id: 'stale-shopify', channel: null, error: SHOPIFY_RAW_ERROR }), project_id: 'p1' },
      { ...row({ id: 'live-wp', article_id: 'art-2', channel: 'wordpress', error: 'wordpress_media_upload_failed' }), project_id: 'p1' },
    ]
    const articles = [
      // art-1 genuinely published to Shopify AFTER its failure was recorded.
      { id: 'art-1', project_id: 'p1', status: 'published', published_at: '2026-09-03T09:00:00Z', shopify_status: 'published', shopify_published_at: '2026-09-03T09:00:00Z', wp_post_id: null },
      // art-2 never published anywhere — its WordPress failure is still live.
      { id: 'art-2', project_id: 'p1', status: 'failed', published_at: null, shopify_status: null, shopify_published_at: null, wp_post_id: null },
    ]
    const client = fakeClient({
      // The overview endpoint checks ownership against the caller's own project list.
      projects: [{ id: 'p1', user_id: 'u1', is_active: true, name: 'Afrodite', business_name: 'Afrodite', target_domain: 'x', language: 'en' }] as never,
      content_automation_alerts: alertRows as never,
      generated_articles: articles as never,
      wordpress_connections: [] as never,
      shopify_connections: [] as never,
      article_pool_items: [] as never,
    })

    // The shared loader — what both endpoints call.
    const direct = await loadActiveAlerts(client, 'p1')
    check('D1: the loader keeps the live WordPress failure and drops the superseded Shopify one',
      direct.ok && direct.alerts.length === 1 && direct.alerts[0].id === 'live-wp',
      JSON.stringify(direct))

    process.env.ENABLE_CONTENT_AUTOMATION = 'true'
    process.env.ENABLE_CONTENT = 'true'
    overrides.set('@/lib/content/api-auth', {
      authContentProject: async () => ({ user: { id: 'u1' }, admin: client, project: { id: 'p1', user_id: 'u1' } }),
      isContentAutomationEnabled: () => true,
    })
    const { GET: alertsGET } = await import('../../../app/api/content/automation/alerts/route')
    const alertsRes = await alertsGET(new Request('http://localhost/api/content/automation/alerts?projectId=p1') as never)
    const alertsJson = await (alertsRes as Response).json() as { alerts: ActiveAlert[] }
    check('D2: /api/content/automation/alerts returns the read model',
      alertsJson.alerts.length === 1 && alertsJson.alerts[0].id === 'live-wp'
      && alertsJson.alerts[0].heading === 'publish_failed_wordpress', JSON.stringify(alertsJson))
    check('D3: …and its payload carries no raw provider text',
      !JSON.stringify(alertsJson).includes('ArticleCreateInput'), JSON.stringify(alertsJson).slice(0, 200))

    // The overview endpoint, with the caller's own session client.
    const sessionClient = { ...(client as never as Record<string, unknown>), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }
    overrides.set('@/lib/supabase/server', { createClient: async () => sessionClient })
    const { GET: overviewGET } = await import('../../../app/api/content/overview/route')
    const overviewRes = await overviewGET(new Request('http://localhost/api/content/overview?projectId=p1') as never)
    const overviewJson = await (overviewRes as Response).json() as { alerts?: ActiveAlert[] }
    check('D4: /api/content/overview now returns alerts at all',
      Array.isArray(overviewJson.alerts), JSON.stringify(overviewJson).slice(0, 300))
    check('D5: THE TWO ENDPOINTS AGREE, exactly',
      JSON.stringify(overviewJson.alerts) === JSON.stringify(alertsJson.alerts),
      `${JSON.stringify(overviewJson.alerts)} vs ${JSON.stringify(alertsJson.alerts)}`)
    check('D6: …and the overview payload leaks no provider text either',
      !JSON.stringify(overviewJson).includes('ArticleCreateInput'))
  }

  // ── D2) the migration has not been applied ─────────────────────────────────
  console.log('\nD2) a missing COLUMN is a migration, not an outage')
  {
    // The query selects `channel`. Between deploying this code and running the
    // migration the TABLE exists and the COLUMN does not, and Postgres answers
    // 42703 / PostgREST answers PGRST204 — never 42P01, the only code the first
    // revision handled. It would have reported a generic 500 "alerts
    // unavailable" and sent an operator hunting an outage that isn't there.
    check('D2-a: undefined_table is a migration', isMissingSchemaError({ code: '42P01' }))
    check('D2-b: undefined_COLUMN is a migration', isMissingSchemaError({ code: '42703' }))
    check('D2-c: the PostgREST schema-cache codes are migrations',
      isMissingSchemaError({ code: 'PGRST204' }) && isMissingSchemaError({ code: 'PGRST202' }))
    check('D2-d: …and the schema-cache MESSAGE form is too',
      isMissingSchemaError({ message: "Could not find the 'channel' column of 'content_automation_alerts' in the schema cache" })
      && isMissingSchemaError({ message: 'column content_automation_alerts.channel does not exist' }))
    check('D2-e: an UNRELATED database failure stays an outage',
      !isMissingSchemaError({ code: '57014', message: 'canceling statement due to statement timeout' })
      && !isMissingSchemaError({ code: '42501', message: 'permission denied for table' })
      && !isMissingSchemaError({}) && !isMissingSchemaError(null))

    /** A client whose alerts SELECT fails exactly as a missing column does. */
    const failingClient = (error: Record<string, unknown>) => {
      const base = fakeClient({
        projects: [{ id: 'p1', user_id: 'u1', is_active: true, name: 'P', business_name: 'P', target_domain: 'x', language: 'en' }] as never,
        generated_articles: [] as never, wordpress_connections: [] as never, shopify_connections: [] as never, article_pool_items: [] as never,
      }) as never as { from: (t: string) => Record<string, unknown> }
      return {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        from(table: string) {
          if (table !== 'content_automation_alerts') return base.from(table)
          const q: Record<string, unknown> = {}
          Object.assign(q, {
            select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
            maybeSingle: () => q, single: () => q,
            then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error }).then(res),
          })
          return q
        },
      } as never
    }

    for (const [label, error] of [
      ['42703 undefined_column', { code: '42703', message: 'column content_automation_alerts.channel does not exist' }],
      ['PGRST204 schema cache', { code: 'PGRST204', message: "Could not find the 'channel' column in the schema cache" }],
    ] as const) {
      const client = failingClient(error as never)
      const direct = await loadActiveAlerts(client, 'p1')
      check(`D2-f[${label}]: the loader reports migration_required`,
        !direct.ok && direct.reason === 'migration_required', JSON.stringify(direct))

      overrides.set('@/lib/content/api-auth', {
        authContentProject: async () => ({ user: { id: 'u1' }, admin: client, project: { id: 'p1', user_id: 'u1' } }),
        isContentAutomationEnabled: () => true,
      })
      const { GET: aGET } = await import('../../../app/api/content/automation/alerts/route')
      const aRes = await aGET(new Request('http://localhost/api/content/automation/alerts?projectId=p1') as never) as Response
      const aJson = await aRes.json() as { error?: string; migrationRequired?: boolean }
      check(`D2-g[${label}]: /automation/alerts returns the typed 503 migration error`,
        aRes.status === 503 && aJson.error === 'automation_alerts_migration_required' && aJson.migrationRequired === true,
        `${aRes.status} ${JSON.stringify(aJson)}`)

      overrides.set('@/lib/supabase/server', { createClient: async () => client })
      const { GET: oGET } = await import('../../../app/api/content/overview/route')
      const oRes = await oGET(new Request('http://localhost/api/content/overview?projectId=p1') as never) as Response
      const oJson = await oRes.json() as { alerts?: unknown[]; alertsUnavailable?: string }
      check(`D2-h[${label}]: /overview reports it too, and never as a healthy empty list`,
        oJson.alertsUnavailable === 'migration_required' && Array.isArray(oJson.alerts) && oJson.alerts.length === 0,
        JSON.stringify(oJson).slice(0, 200))
    }

    // NEGATIVE CONTROL: an unrelated failure must NOT be reported as a migration.
    const outage = failingClient({ code: '57014', message: 'canceling statement due to statement timeout' } as never)
    const outageResult = await loadActiveAlerts(outage, 'p1')
    check('D2-i: an unrelated DB failure stays `unavailable`, not `migration_required`',
      !outageResult.ok && outageResult.reason === 'unavailable', JSON.stringify(outageResult))
    overrides.set('@/lib/content/api-auth', {
      authContentProject: async () => ({ user: { id: 'u1' }, admin: outage, project: { id: 'p1', user_id: 'u1' } }),
      isContentAutomationEnabled: () => true,
    })
    const { GET: aGET2 } = await import('../../../app/api/content/automation/alerts/route')
    const aRes2 = await aGET2(new Request('http://localhost/api/content/automation/alerts?projectId=p1') as never) as Response
    check('D2-j: …and the endpoint answers 500, not the migration 503', aRes2.status === 500)
    // The first revision's predicate: 42P01 only. It must FAIL the column case,
    // so D2-b/f are not vacuous.
    const oldPredicate = (e: { code?: string }) => e.code === '42P01'
    check('D2-k: the OLD predicate misses a missing column (control)',
      !oldPredicate({ code: '42703' }) && !oldPredicate({ code: 'PGRST204' }))
  }

  // ── E) the write path ──────────────────────────────────────────────────────
  console.log('\nE) alerts are recorded WITH a channel, and resolved precisely')
  {
    const { recordPublishFinalFailureAlert, resolvePublishAlerts } = await import('../automation/alerts')
    const tables: Record<string, Record<string, unknown>[]> = { projects: [{ id: 'p1', user_id: 'u1' }], content_automation_alerts: [] }
    const admin = fakeClient(tables)
    await recordPublishFinalFailureAlert(admin, { projectId: 'p1', poolItemId: 'i1', articleId: 'art-1', topicId: 't1', title: 'T', error: SHOPIFY_RAW_ERROR, attempts: 3, channel: 'shopify' })
    await recordPublishFinalFailureAlert(admin, { projectId: 'p1', poolItemId: 'i2', articleId: 'art-9', topicId: 't2', title: 'Other', error: 'wordpress_media_upload_failed', attempts: 3, channel: 'wordpress' })
    // A legacy row, exactly as production holds it: open, no channel.
    tables.content_automation_alerts.push({ id: 'legacy', project_id: 'p1', pool_item_id: 'old-item', article_id: 'art-1', kind: 'publish_failed_final', channel: null, error: SHOPIFY_RAW_ERROR, attempts: 3, status: 'open', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' })

    const stored = tables.content_automation_alerts
    check('E1: a Shopify failure is stored with channel=shopify',
      stored.some((r) => r.pool_item_id === 'i1' && r.channel === 'shopify'), JSON.stringify(stored.map((r) => [r.pool_item_id, r.channel])))
    check('E2: a WordPress failure is stored with channel=wordpress',
      stored.some((r) => r.pool_item_id === 'i2' && r.channel === 'wordpress'))
    check('E3: the full error (provider detail included) is retained IN THE ROW for server-side diagnosis',
      stored.some((r) => String(r.error).includes('ArticleCreateInput')))

    // A successful Shopify publish of art-1 on a NEW pool item.
    await resolvePublishAlerts(admin, 'new-item', { articleId: 'art-1', channel: 'shopify' })
    const byId = (id: string) => stored.find((r) => r.id === id || r.pool_item_id === id)
    check('E4: the legacy channel-less alert for that article is resolved',
      byId('legacy')?.status === 'resolved', JSON.stringify(byId('legacy')))
    check('E5: the same article\'s Shopify alert is resolved',
      byId('i1')?.status === 'resolved')
    check('E6: the OTHER article\'s WordPress alert is untouched',
      byId('i2')?.status === 'open', JSON.stringify(byId('i2')))
    // A WordPress success must not clear a Shopify failure for a different article.
    const t2: Record<string, Record<string, unknown>[]> = { projects: [{ id: 'p1', user_id: 'u1' }], content_automation_alerts: [
      { id: 's1', project_id: 'p1', pool_item_id: 'x', article_id: 'art-5', channel: 'shopify', status: 'open', error: 'shopify_token_invalid', attempts: 1, kind: 'publish_failed_final', created_at: '', updated_at: '' },
    ] }
    await resolvePublishAlerts(fakeClient(t2), 'other-item', { articleId: 'art-5', channel: 'wordpress' })
    check('E7: a WordPress success does NOT resolve that article\'s Shopify alert',
      t2.content_automation_alerts[0].status === 'open', JSON.stringify(t2.content_automation_alerts[0]))
    check('E8: retry/attempt bookkeeping is untouched by any of this',
      stored.every((r) => typeof r.attempts === 'number'))
  }

  // ── F) negative controls ───────────────────────────────────────────────────
  console.log('\nF) NEGATIVE CONTROLS — the old behaviours must fail these checks')
  {
    // Control 1: the previous renderer appended the stored tail.
    const oldRender = (error: string) => {
      const idx = error.indexOf(':')
      const base = idx >= 0 ? error.slice(0, idx).trim() : error
      const tail = idx >= 0 ? error.slice(idx + 1).trim() : ''
      const label = (dictFor('en').genErrors as Record<string, string>)[base] ?? base
      return tail ? `${label} — ${tail}` : label
    }
    check('F1: the OLD renderer leaks the GraphQL text (so B6 is not vacuous)',
      oldRender(SHOPIFY_RAW_ERROR).includes('ArticleCreateInput'))
    check('F2: the NEW path does not', !presentAlert(selectActiveAlerts([row({ channel: 'shopify', error: SHOPIFY_RAW_ERROR })])[0], dictFor('en')).detail.includes('ArticleCreateInput'))

    // Control 2: the previous heading was a constant.
    const oldHeading = (kind: string) => (kind === 'publish_blocked' ? 'Publishing blocked' : 'WordPress publish failed')
    check('F3: the OLD heading calls a Shopify failure WordPress (so A1 is not vacuous)',
      oldHeading('publish_failed_final') === 'WordPress publish failed')
    check('F4: the NEW heading names Shopify',
      presentAlert(selectActiveAlerts([row({ channel: 'shopify' })])[0], dictFor('en')).heading.startsWith('Shopify'))

    // Control 3: the previous overview returned nothing, so the endpoints disagreed.
    const overviewSrc = strip(read('app/api/content/overview/route.ts'))
    check('F5: SOURCE — the overview endpoint now returns alerts through the SHARED loader',
      /loadActiveAlerts\(/.test(overviewSrc) && /alerts,/.test(overviewSrc))
    const alertsSrc = strip(read('app/api/content/automation/alerts/route.ts'))
    check('F6: SOURCE — the automation endpoint reads through the same loader, not the table',
      /loadActiveAlerts\(/.test(alertsSrc) && !/from\('content_automation_alerts'\)/.test(alertsSrc))
    // The payload TYPE has no `error` field, so no endpoint can forward one; the
    // old endpoint selected `error, attempts` straight out of the table.
    const modelSrc = strip(read('lib/content/automation/alert-read-model.ts'))
    const activeAlertShape = (modelSrc.match(/export interface ActiveAlert \{[\s\S]*?\n\}/) ?? [''])[0]
    check('F7: the public payload TYPE has no raw-error field, and no endpoint selects one',
      activeAlertShape.length > 0 && !/^\s*error[?]?:/m.test(activeAlertShape)
      && !/error, attempts/.test(alertsSrc) && !/error, attempts/.test(overviewSrc), activeAlertShape.slice(0, 120))
    const scheduleSrc = read('components/content/AutomationSchedule.tsx')
    check('F8: SOURCE — the card no longer appends a raw tail anywhere',
      !/\$\{label\} — \$\{tail\}/.test(scheduleSrc) && /alertReasonCode\(code\)/.test(scheduleSrc))
    check('F9: SOURCE — the hard-coded WordPress heading key is gone repo-wide',
      !/alertPublishFailedTitle/.test(read('lib/i18n/dashboard/en.ts'))
      && !/alertPublishFailedTitle/.test(read('lib/i18n/dashboard/he.ts'))
      && !/alertPublishFailedTitle/.test(scheduleSrc))
    // Control 4: the OLD code would have headed this legacy row "WordPress
    // publish failed" — a platform the row never named.
    const legacyHeading = presentAlert(selectActiveAlerts([row({ channel: null })])[0], dictFor('en')).heading
    check('F10: the legacy row is never headed with a guessed platform',
      !legacyHeading.includes('WordPress') && !legacyHeading.includes('Shopify')
      && oldHeading('publish_failed_final').includes('WordPress'), legacyHeading)

    // Control 5: both dictionaries complete.
    for (const lang of ['he', 'en'] as const) {
      const d = dictFor(lang)
      check(`F11-${lang}: every alert string exists and is real prose`,
        [d.alertBlockedTitle, d.alertPublishFailedShopify, d.alertPublishFailedWordPress, d.alertPublishFailedGeneric, d.alertAttempts, d.alertReasonOther]
          .every((v) => typeof v === 'string' && v.length > 3))
    }
    // Control 6: EVERY reason a publish path can persist onto an alert has real,
    // actionable prose in both languages. Enumerated from the SOURCE, so a new
    // blocker cannot ship as "the publishing service reported an error".
    const wpSrc = read('lib/content/automation/publish-item.ts')
    const shopSrc = read('lib/content/automation/publish-item-shopify.ts')
    const artSrc = read('lib/shopify/publish-article.ts')
    const grab = (src: string, re: RegExp) => Array.from(src.matchAll(re)).map((m) => m[1])
    const alertReasons = Array.from(new Set([
      ...grab(wpSrc, /blockItem\(admin, itemId, '([a-z_]+)'/g),
      ...grab(shopSrc, /blockShopifyItem\(admin, item, '([a-z_]+)'/g),
      // A failed ATTEMPT is persisted by the Shopify path as `shopify_<code>`.
      ...grab(artSrc, /return \{ ok: false, reason: '([a-z_]+)'/g).flatMap((c) => [c, `shopify_${c}`]),
      'publish_quality_gate_failed', 'wordpress_media_upload_failed',
    ]))
    check('F14: the enumeration found the real reasons', alertReasons.length >= 8, JSON.stringify(alertReasons))
    for (const lang of ['he', 'en'] as const) {
      const g = dictFor(lang).genErrors
      const missing = alertReasons.filter((r) => typeof g[r] !== 'string' || g[r].length < 10)
      check(`F15-${lang}: every alert-reachable reason has actionable prose`, missing.length === 0, JSON.stringify(missing))
      const vague = alertReasons.filter((r) => g[r] === dictFor(lang).alertReasonOther)
      check(`F16-${lang}: …and none of them falls back to the vague sentence`, vague.length === 0, JSON.stringify(vague))
    }

    // Control 7: the migration is additive and guesses nothing.
    const mig = read('supabase/migrations/20260906000000_content_alert_channel.sql')
    check('F12: the migration adds the column and performs NO data write',
      /ADD COLUMN IF NOT EXISTS channel text/.test(mig)
      && !/\bUPDATE\s+public\./i.test(mig) && !/\bINSERT\s+INTO\b/i.test(mig) && !/\bDELETE\s+FROM\b/i.test(mig))
    check('F13: …and it is nullable with no default, so no legacy row is given a guessed platform',
      !/channel text NOT NULL/.test(mig) && !/DEFAULT 'wordpress'/.test(mig) && !/DEFAULT 'shopify'/.test(mig))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
