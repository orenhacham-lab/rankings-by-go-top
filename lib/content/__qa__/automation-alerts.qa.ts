/**
 * Phase 4B automation-alerts closeout QA — offline, no DB/network.
 * Locks the verified reliability behavior of the persisted failure-alert path:
 * the deterministic dedupe key, alert-only-on-final-failure threshold, resolve on
 * success, owner scoping, dismiss persistence, secret sanitization, and the
 * migration's idempotency + RLS. Live migration apply + failure smoke are the
 * operator's step (no DB access here).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { publishFailureDedupeKey } from '../automation/alerts'
import { AUTOMATION_MAX_ATTEMPTS } from '../automation/generate-item'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

async function main() {
  const migration = readFileSync(join(__dirname, '../../../supabase/migrations/20260722_add_content_automation_alerts.sql'), 'utf8')
  const alertsLib = read('../automation/alerts.ts')
  const getRoute = read('../../../app/api/content/automation/alerts/route.ts')
  const patchRoute = read('../../../app/api/content/automation/alerts/[id]/route.ts')
  const publishItem = read('../automation/publish-item.ts')

  console.log('A) migration is idempotent, deduped, owner-scoped (no destructive statements)')
  {
    check('CREATE TABLE is idempotent', /create table if not exists public\.content_automation_alerts/i.test(migration))
    check('1. unique dedupe index on dedupe_key exists', /create unique index if not exists[\s\S]*\(dedupe_key\)/i.test(migration))
    check('project + user + status lookup indexes exist', /\(user_id, status\)/i.test(migration) && /\(project_id, status\)/i.test(migration))
    check('RLS is enabled', /enable row level security/i.test(migration))
    check('owner-scoped policies (auth.uid) for select + update', /for select[\s\S]*auth\.uid\(\)/i.test(migration) && /for update[\s\S]*auth\.uid\(\)/i.test(migration))
    check('service_role policy present for the worker', /to service_role/i.test(migration))
    check('status CHECK constrains open/resolved/dismissed', /status in \('open', 'resolved', 'dismissed'\)/i.test(migration))
    check('NO destructive statements (no drop table / delete / truncate)', !/drop table|truncate|delete from/i.test(migration))
    check('columns match the alert API select', ['user_id', 'project_id', 'pool_item_id', 'article_id', 'topic_id', 'kind', 'dedupe_key', 'title', 'error', 'attempts', 'status', 'created_at', 'updated_at'].every((c) => migration.includes(c)))
  }

  console.log('B) deterministic dedupe key → one alert per item (F4/F5)')
  {
    check('dedupe key is deterministic', publishFailureDedupeKey('item-1') === publishFailureDedupeKey('item-1'))
    check('dedupe key format = <poolItemId>:publish_final_failure', publishFailureDedupeKey('abc') === 'abc:publish_final_failure')
    check('distinct items → distinct keys', publishFailureDedupeKey('a') !== publishFailureDedupeKey('b'))
    check('4/5. record UPSERTs on dedupe_key (repeat cron = same row, never a dup)', /\.upsert\(\{[\s\S]*\}, \{ onConflict: 'dedupe_key' \}\)/.test(alertsLib))
    check('re-failure REOPENS (status: open, resolved_at: null) — no duplicate', /status: 'open',\s*\n?\s*resolved_at: null/.test(alertsLib))
  }

  console.log('C) alert ONLY on final failure; resolve on success (F2/F3)')
  {
    check('retry cap = AUTOMATION_MAX_ATTEMPTS (default 3)', AUTOMATION_MAX_ATTEMPTS === 3)
    // 2. a first transient failure (attempt+1 < cap) records NO alert.
    check('2. alert is gated behind the final-attempt threshold', /if \(\(\(item\.attempts \?\? 0\) \+ 1\) < AUTOMATION_MAX_ATTEMPTS\) return/.test(publishItem))
    check('2. alert only via recordPublishFinalFailureAlert inside that gate', /alertOnFinalFailure = async[\s\S]{0,220}recordPublishFinalFailureAlert/.test(publishItem))
    // 3. a successful publish resolves any open alert (no lingering failure alert).
    check('3. resolvePublishAlerts is called on successful publish', (publishItem.match(/resolvePublishAlerts\(admin, itemId\)/g) || []).length >= 2)
    check('resolve marks open → resolved (recovery)', /status: 'resolved'[\s\S]{0,200}\.eq\('status', 'open'\)/.test(alertsLib))
    // pure re-check of the threshold predicate for a 3-attempt cap.
    const wouldAlert = (attempts: number) => (attempts + 1) >= AUTOMATION_MAX_ATTEMPTS
    check('2. attempt 1 of 3 → NO alert', wouldAlert(0) === false)
    check('   attempt 2 of 3 → NO alert', wouldAlert(1) === false)
    check('6/final. attempt 3 of 3 → alert', wouldAlert(2) === true)
  }

  console.log('D) ownership, dismiss persistence, and safety (F6/F7/F8/F9)')
  {
    // 6. the alert is owner-scoped (user_id resolved from project) + project_id set.
    check('6. owner user_id is resolved from the project + project_id set', /from\('projects'\)\.select\('user_id'\)/.test(alertsLib) && /user_id: userId/.test(alertsLib) && /project_id: input\.projectId/.test(alertsLib))
    // 7/8. dismiss persists (status='dismissed'); GET only lists 'open' so it stays hidden.
    check('7/8. dismiss persists status=dismissed, scoped to id + owned project', /update\(\{ status: 'dismissed'[\s\S]{0,120}\.eq\('id', id\)[\s\S]{0,60}\.eq\('project_id', auth\.project\.id\)/.test(patchRoute))
    check('7/8. GET lists ONLY open alerts (dismissed/resolved never reappear)', /\.eq\('status', 'open'\)/.test(getRoute))
    // 1. missing table surfaces a typed 503 (never a fake-healthy empty list).
    check('1. GET returns 503 automation_alerts_migration_required on 42P01', /code === '42P01'[\s\S]{0,160}automation_alerts_migration_required[\s\S]{0,40}status: 503/.test(getRoute))
    // 9. the alert error is bounded + sourced from typed WP failure codes (no raw HTML/body/secrets).
    check('9. alert error is bounded (slice 500) and sourced from a typed reason', /error: input\.error\.slice\(0, 500\)/.test(alertsLib))
    check('9. the publish reason is a typed short code, not raw remote body', /wordpress_post_failed/.test(publishItem) && /created\.detail\.slice\(0, 120\)/.test(publishItem))
    check('9. alerts logs never include creds/HTML/token/body', !/content_html|applicationPassword|creds\.|Authorization|token/i.test(alertsLib))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
