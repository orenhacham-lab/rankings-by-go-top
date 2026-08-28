/**
 * Phase 3 — weekly rank-scan removal. Proves weekly schedules cannot be
 * created (server-side, independent of the DB constraint), the migration
 * converts weekly/monthly_first_day to monthly with next_scan_at recomputed
 * together, and calculateNextScanDate has no weekly branch. Run:
 *   npx tsx lib/__qa__/phase3-scan-frequency.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isValidScanFrequency, calculateNextScanDate, VALID_SCAN_FREQUENCIES } from '../utils'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

async function main() {
  console.log('Phase 3 — weekly rank-scan removal QA\n')

  console.log('1) isValidScanFrequency — the only 2 allowed values, weekly explicitly rejected')
  {
    check('manual is valid', isValidScanFrequency('manual') === true)
    check('monthly is valid', isValidScanFrequency('monthly') === true)
    check('weekly is REJECTED', isValidScanFrequency('weekly') === false)
    check('monthly_first_day is REJECTED', isValidScanFrequency('monthly_first_day') === false)
    check('daily is REJECTED (never existed, still rejected)', isValidScanFrequency('daily') === false)
    check('empty string is REJECTED', isValidScanFrequency('') === false)
    check('exactly 2 allowed values exported', VALID_SCAN_FREQUENCIES.length === 2)
  }

  console.log('\n2) calculateNextScanDate — no weekly branch, monthly_first_day gap is moot (no branch either)')
  {
    const from = new Date('2026-08-15T00:00:00Z')
    check('monthly advances by 1 calendar month', calculateNextScanDate('monthly', from)?.toISOString() === '2026-09-15T00:00:00.000Z')
    check('manual returns null (no auto-scheduling)', calculateNextScanDate('manual', from) === null)
    check('weekly (if it somehow reaches here) returns null, NOT +7 days', calculateNextScanDate('weekly', from) === null)
    check('monthly_first_day (legacy value) returns null, not silently mishandled', calculateNextScanDate('monthly_first_day', from) === null)
  }

  console.log('\n3) SOURCE) server-side create/update actions reject an invalid scan_frequency BEFORE any DB write')
  {
    const actions = read('app/actions/projects.ts')
    check('createProjectAction validates scan_frequency with isValidScanFrequency', /isValidScanFrequency\(rawScanFrequency\)/.test(actions))
    check('updateProjectAction validates scan_frequency with isValidScanFrequency', (actions.match(/isValidScanFrequency\(rawScanFrequency\)/g) ?? []).length >= 2)
    const apiRoute = read('app/api/projects/create/route.ts')
    check('API route also validates scan_frequency server-side', /isValidScanFrequency\(rawScanFrequency\)/.test(apiRoute))
  }

  console.log('\n4) SOURCE) the ProjectForm UI no longer offers weekly or monthly_first_day as options')
  {
    const form = read('components/projects/ProjectForm.tsx')
    check('no "weekly" option value in the scan-frequency select', !/value:\s*'weekly'/.test(form))
    check('no "monthly_first_day" option value', !/value:\s*'monthly_first_day'/.test(form))
    check('state type narrowed to manual|monthly only', /'manual' \| 'monthly'/.test(form) && !/'manual' \| 'weekly' \| 'monthly' \| 'monthly_first_day'/.test(form))
  }

  console.log('\n5) SOURCE) i18n dictionaries no longer define weekly/monthly_first_day scan-frequency labels')
  {
    const he = read('lib/i18n/dashboard/he.ts')
    const en = read('lib/i18n/dashboard/en.ts')
    check('he.ts: no scanFreqWeekly key', !/scanFreqWeekly/.test(he))
    check('he.ts: no scanFreqMonthlyFirstDay key', !/scanFreqMonthlyFirstDay/.test(he))
    check('he.ts: frequency dict has no weekly/monthlyFirstDay keys', !/frequency:\s*\{[^}]*weekly/.test(he) && !/monthlyFirstDay/.test(he))
    check('en.ts: no scanFreqWeekly key', !/scanFreqWeekly/.test(en))
    check('en.ts: no scanFreqMonthlyFirstDay key', !/scanFreqMonthlyFirstDay/.test(en))
  }

  console.log('\n6) SOURCE) lib/supabase/types.ts scan_frequency type narrowed to manual|monthly')
  {
    const types = read('lib/supabase/types.ts')
    check("scan_frequency: 'manual' | 'monthly' (no weekly/monthly_first_day)", /scan_frequency:\s*'manual' \| 'monthly'(?!\s*\|)/.test(types))
  }

  console.log('\n7) SOURCE) the migration converts weekly AND monthly_first_day to monthly, recomputing next_scan_at in the SAME statement')
  {
    const migration = read('supabase/migrations/20260829000000_add_usage_reservations_and_billing_periods.sql')
    check("UPDATE ... SET scan_frequency = 'monthly' WHERE scan_frequency IN ('weekly', 'monthly_first_day')",
      /UPDATE public\.projects\s+SET scan_frequency = 'monthly',\s+next_scan_at = /.test(migration)
      && /WHERE scan_frequency IN \('weekly', 'monthly_first_day'\)/.test(migration))
    check('next_scan_at is set in the SAME UPDATE (not a separate later statement)',
      /SET scan_frequency = 'monthly',\s+next_scan_at = GREATEST/.test(migration))
    check('the CHECK constraint is redefined to only manual|monthly', /CHECK \(scan_frequency IN \('manual', 'monthly'\)\)/.test(migration))
    check('no weekly/monthly_first_day value survives in the new constraint', !/CHECK \(scan_frequency IN \([^)]*weekly/.test(migration))
  }

  console.log('\n8) SOURCE) weekly is removed ONLY from rank scanning — content automation and GSC weekly sync are untouched')
  {
    const contentSchedule = read('lib/content/automation/schedule.ts')
    check('content-automation Cadence type still has weekly (different, untouched feature)', /'daily' \| 'weekly' \| 'monthly' \| 'custom'/.test(contentSchedule) || /weekly/.test(contentSchedule))
    const gscSync = read('lib/gsc/auto-sync.ts')
    check('GSC auto-sync "weekly" dispatcher comment/logic still present (different, untouched feature)', /weekly/i.test(gscSync))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
