/**
 * Phase 3 (review correction) — article generation retry-after-slug-conflict
 * behavior. Exercises the SAME reservation RPCs
 * (lib/billing/usage-reservations.ts, via lib/__qa__/_fake-admin.ts's
 * simulation) that lib/content/article-generation.ts's finalize-retry loop
 * uses, at the exact granularity that loop operates at (one
 * finalizeArticleGeneration call per slug candidate, same reservationId
 * reused throughout) — plus source-contract checks proving the loop itself
 * is bounded and always varies the slug. Gemini generation is NOT invoked
 * here (article-generation.ts has no injectable Gemini dependency to fake;
 * this file tests the reservation/persistence layer the retry loop actually
 * depends on, which is where every one of the 5 required properties lives).
 * Run:
 *   npx tsx lib/content/__qa__/phase3-article-retry-slug-conflict.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { reserveUsage, finalizeArticleGeneration, releaseUsageReservation } from '../../billing/usage-reservations'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const PERIOD_START = new Date('2026-08-01T00:00:00Z')
const PERIOD_END = new Date('2026-09-01T00:00:00Z')

function baseAdmin(nowMs: number, extra: Record<string, unknown[]> = {}) {
  return new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], usage_reservations: [], generated_articles: [], ...extra }, {}, () => nowMs)
}
function art(overrides: Record<string, unknown>) {
  return { project_id: 'p1', topic_id: 't1', title: 'X', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'x', ...overrides }
}
/** Mirrors article-generation.ts's OWN retry loop exactly:
 *  `for (attempt = 0; attempt < 6; attempt++) slug = attempt===0 ? base : `${base}-${attempt+1}`.slice(0,90)`. */
async function runRetryLoop(admin: FakeAdmin, reservationId: string, reservationToken: string, baseSlug: string, maxAttempts = 6) {
  const slugsTried: string[] = []
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`.slice(0, 90)
    slugsTried.push(slug)
    const result = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug }) })
    if (result.outcome === 'consumed') return { outcome: 'consumed' as const, articleId: result.articleId, slugsTried }
    if (result.outcome === 'slug_conflict') continue
    return { outcome: result.outcome, slugsTried }
  }
  await releaseUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, reason: 'insert_failed' })
  return { outcome: 'exhausted' as const, slugsTried }
}

async function main() {
  console.log('Phase 3 — article retry-after-slug-conflict QA\n')

  console.log('1) A retry after a slug conflict reuses the SAME reservation — no second reservation is ever created')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), { generated_articles: [{ id: 'existing', project_id: 'p1', slug: 'my-topic' }] })
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:retry-1' })
    check('reserved', res.outcome === 'reserved')
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    const result = await runRetryLoop(admin, reservationId, reservationToken, 'my-topic')
    check('the retry loop succeeds on the second slug candidate', result.outcome === 'consumed')
    check('exactly ONE reservation row exists for this key throughout — no second reservation was ever created', admin.tables.usage_reservations.filter((r) => r.idempotency_key === 'topic:retry-1').length === 1)
    check('the SAME reservation id is what ended up consumed', admin.tables.usage_reservations.find((r) => r.idempotency_key === 'topic:retry-1')?.id === reservationId)
  }

  console.log('\n2) It must not retry forever with the same conflicting slug — bounded, and the slug ALWAYS varies per attempt')
  {
    // Every candidate slug the loop could try (base, base-2 .. base-6) is
    // already taken — simulates persistently bad luck across the WHOLE
    // bounded budget, not just one collision.
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      generated_articles: ['always-taken', 'always-taken-2', 'always-taken-3', 'always-taken-4', 'always-taken-5', 'always-taken-6']
        .map((slug, i) => ({ id: `existing-${i}`, project_id: 'p1', slug })),
    })
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:retry-2' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    const result = await runRetryLoop(admin, reservationId, reservationToken, 'always-taken')
    check('gives up (exhausted), never loops forever', result.outcome === 'exhausted')
    check('tried exactly 6 candidates (bounded budget)', result.slugsTried.length === 6)
    check('every candidate slug was DIFFERENT — never retried with the identical conflicting slug', new Set(result.slugsTried).size === 6)
    check('no article was created', admin.tables.generated_articles.length === 6)
    check('the reservation was released on exhaustion — the credit is NOT lost, available for a fresh attempt', admin.tables.usage_reservations.find((r) => r.id === reservationId)?.status === 'released')
  }

  console.log('\n3) A successful retry consumes EXACTLY one article — never more, regardless of how many slug attempts preceded it')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      generated_articles: ['taken', 'taken-2', 'taken-3'].map((slug, i) => ({ id: `e${i}`, project_id: 'p1', slug })),
    })
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:retry-3' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    const result = await runRetryLoop(admin, reservationId, reservationToken, 'taken')
    check('succeeds on the 4th candidate (taken-4)', result.outcome === 'consumed')
    check('exactly one article row exists', admin.tables.generated_articles.filter((a) => a.slug?.toString().startsWith('taken') && a.id !== 'e0' && a.id !== 'e1' && a.id !== 'e2').length === 1)
    const row = admin.tables.usage_reservations.find((r) => r.id === reservationId)
    check('consumed_amount is exactly 1, never incremented per failed attempt', row?.consumed_amount === 1)
    check('reserved_amount was also exactly 1 (article reservations are always amount=1)', row?.reserved_amount === 1)
  }

  console.log('\n4) Two concurrent retries for the SAME reservation must not create two articles or consume twice')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:retry-4' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    // Two "workers" racing the identical first candidate slug for the same
    // reservation — e.g. a duplicated retry request in flight twice.
    const [r1, r2] = await Promise.all([
      finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'duplicate-race' }) }),
      finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'duplicate-race' }) }),
    ])
    const outcomes = [r1.outcome, r2.outcome].sort()
    check('exactly one call consumes, the other is refused (slug_conflict OR not_reserved — either is a safe refusal)', outcomes[0] === 'consumed' ? (outcomes[1] === 'not_reserved' || outcomes[1] === 'slug_conflict') : false, `outcomes=${outcomes.join(',')}`)
    check('exactly ONE article was created — never two', admin.tables.generated_articles.length === 1)
    const row = admin.tables.usage_reservations.find((r) => r.id === reservationId)
    check('exactly ONE credit was consumed — never two', row?.consumed_amount === 1 && row?.status === 'consumed')
  }
  console.log('\n4b) Concurrent retries with DIFFERENT slug candidates (the realistic case — each caller independently increments its own attempt counter) — still only one winner')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:retry-4b' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    const [r1, r2] = await Promise.all([
      finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'worker-a' }) }),
      finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'worker-b' }) }),
    ])
    const consumedCount = [r1.outcome, r2.outcome].filter((o) => o === 'consumed').length
    check('exactly one of the two concurrent calls consumes (the reservation gate, not just the slug constraint, prevents the second)', consumedCount === 1)
    check('exactly ONE article exists even though the two slugs did not collide with each other', admin.tables.generated_articles.length === 1)
    const row = admin.tables.usage_reservations.find((r) => r.id === reservationId)
    check('exactly one credit consumed', row?.consumed_amount === 1)
  }

  console.log('\n5) Expired reservations must not allow a completed article to escape charging')
  {
    // 5a: a CONSUMED reservation (an article was already, genuinely created)
    // is NEVER treated as "expired" and reused, no matter how old it is —
    // this is the actual guarantee that prevents a completed article from
    // ever escaping its charge: reserve_usage's 30-minute expiry-and-reuse
    // branch is gated on status='reserved' specifically, and NEVER on
    // 'consumed'/'partially_consumed', which this proves directly by using a
    // reservation that is hours old (far past the 30-minute TTL) yet still
    // status='consumed'.
    const HOURS_OLD = '2026-08-01T00:00:00Z' // hours before "now" below
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      usage_reservations: [{
        id: 'old-consumed', user_id: 'u1', project_id: null, usage_type: 'article',
        reserved_amount: 1, consumed_amount: 1, released_amount: 0,
        period_start: PERIOD_START.toISOString(), period_end: PERIOD_END.toISOString(),
        idempotency_key: 'topic:long-done', status: 'consumed', related_ref: 'article-already-made',
        created_at: HOURS_OLD,
      }],
    })
    const retry = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:long-done' })
    check('a retry against a long-completed (hours-old) CONSUMED reservation returns already_consumed, never a fresh reservation', retry.outcome === 'already_consumed')
    check('the original article reference is returned, not lost', retry.outcome === 'already_consumed' && retry.articleId === 'article-already-made')
    check('the reservation row is unchanged — still exactly 1 consumed, never re-opened', admin.tables.usage_reservations.find((r) => r.id === 'old-consumed')?.consumed_amount === 1 && admin.tables.usage_reservations.find((r) => r.id === 'old-consumed')?.status === 'consumed')

    // 5b: finalize_article_generation's insert-and-consume happen atomically
    // — a reservation whose status is no longer 'reserved' (already consumed
    // by a prior call) can NEVER have a SECOND article attached to it, i.e.
    // an article can never be created "for free" against an already-spent
    // reservation.
    const admin2 = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      usage_reservations: [{
        id: 'spent', user_id: 'u1', project_id: null, usage_type: 'article',
        reserved_amount: 1, consumed_amount: 1, released_amount: 0,
        period_start: PERIOD_START.toISOString(), period_end: PERIOD_END.toISOString(),
        idempotency_key: 'topic:spent', status: 'consumed', related_ref: 'article-1',
        created_at: '2026-08-15T00:00:00Z',
      }],
    })
    const secondAttempt = await finalizeArticleGeneration(admin2 as unknown as Admin, { reservationId: 'spent', userId: 'u1', reservationToken: 'irrelevant-any-token', article: art({ slug: 'sneaky-second-article' }) })
    check('a finalize attempt against an already-consumed reservation is refused (not_reserved) — no free article', secondAttempt.outcome === 'not_reserved')
    check('no second article was inserted', admin2.tables.generated_articles.length === 0)
  }

  console.log('\nSOURCE) article-generation.ts retry loop — bounded, always varies the slug, releases on exhaustion')
  {
    const src = read('lib/content/article-generation.ts')
    check('the finalize-retry loop is bounded (attempt < 6), never unbounded/recursive', /for \(let attempt = 0; attempt < 6; attempt\+\+\)/.test(src))
    check('the SAME reservationId and reservationToken are reused across every attempt in the loop (no re-reservation inside the loop)', /finalizeArticleGeneration\(admin, \{ reservationId, userId, reservationToken, article: \{ \.\.\.baseRow, slug \} \}\)/.test(src))
    check('the slug candidate is DIFFERENT every attempt (attempt index appended), never the identical conflicting slug retried verbatim', /const slug = attempt === 0 \? baseSlug : `\$\{baseSlug\}-\$\{attempt \+ 1\}`\.slice\(0, 90\)/.test(src))
    check('on exhausting all 6 candidates, the reservation is explicitly released (credit is not silently lost)', /if \(!inserted\) \{\s*await releaseUsageReservation\(admin, \{ reservationId, userId, reservationToken, reason: 'insert_failed' \}\)/.test(src))
    check('a slug_conflict outcome continues the loop (never breaks/gives up early)', /if \(result\.outcome === 'slug_conflict'\) \{ lastError = \{[\s\S]{0,80}continue \}/.test(src))
    check("an 'already_consumed' retry (client redelivering a completed request) returns the EXISTING article, never regenerates", /if \(reservation\.outcome === 'already_consumed'\)/.test(src) && /return \{ ok: true, articleId: reservation\.articleId/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
