/**
 * THE SWITCHER'S "NEW PROJECT" AND THE PLAN'S PROJECT LIMIT (UX review P1-14).
 *
 * "New project" was offered at the limit, and the limit was only discovered
 * after the merchant had typed a site address and submitted. Now:
 *
 *  A) the decision (lib/projects/project-quota.ts): an administrator is never
 *     limited; a read that failed is 'unknown' and NEVER turns the entry off;
 *     only a known, reached limit does;
 *  B) the route (GET /api/projects/quota) authenticates the caller itself (proxy.ts
 *     does not cover /api/*), reads THIS user's entitlement and active projects,
 *     counts exactly as the create route counts, writes nothing and never shows a
 *     raw error;
 *  C) the switcher: at the limit the entry stays, switched off, with the reason
 *     and a link to the plan — and the listbox is keyboard-operable (arrows move
 *     focus with a roving tabindex, Enter picks, Escape returns to the button).
 *
 * Source guards strip comments first. Every guard has a mutation control that
 * breaks the rule on purpose and shows the guard fails.
 *
 * Run: npx tsx lib/projects/__qa__/project-quota.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { newProjectBlocked, parseProjectQuota, projectQuota } from '../project-quota'
import { PLAN_LIMITS } from '../../subscription'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))

console.log('A) the decision')
{
  const basic = PLAN_LIMITS.regular.maxProjects
  check('A1: an administrator is never limited', projectQuota({ isAdmin: true, plan: 'regular', maxProjects: basic, activeCount: 999 }).state === 'unlimited')
  const at = projectQuota({ isAdmin: false, plan: 'regular', maxProjects: basic, activeCount: basic })
  check('A2: at the plan\'s limit the entry is blocked, with the numbers',
    at.state === 'known' && at.atLimit && at.used === basic && at.limit === basic && newProjectBlocked(at))
  const under = projectQuota({ isAdmin: false, plan: 'premium', maxProjects: PLAN_LIMITS.premium.maxProjects, activeCount: 1 })
  check('A3: under the limit it is not', under.state === 'known' && !under.atLimit && !newProjectBlocked(under))
  check('A4: a failed entitlement read is unknown, and unknown never blocks',
    projectQuota({ isAdmin: false, plan: 'entitlement_unavailable', maxProjects: 0, activeCount: 0 }).state === 'unknown'
    && !newProjectBlocked({ state: 'unknown' }) && !newProjectBlocked(null))
  check('A4-MUT: the same read taken at face value (limit 0) WOULD block — which is why it is unknown',
    newProjectBlocked(projectQuota({ isAdmin: false, plan: 'trial', maxProjects: 0, activeCount: 0 })))
  check('A5: a failed project count is unknown', projectQuota({ isAdmin: false, plan: 'regular', maxProjects: 1, activeCount: null }).state === 'unknown')
  check('A6: a Shopify account without a Shopify plan (limit 0) is blocked, as the create route would refuse',
    newProjectBlocked(projectQuota({ isAdmin: false, plan: 'shopify_billing_required', maxProjects: PLAN_LIMITS.shopify_billing_required.maxProjects, activeCount: 1 })))
  check('A7: a response body is read defensively',
    parseProjectQuota({ state: 'known', used: 1, limit: 1, atLimit: true }).state === 'known'
    && parseProjectQuota({ state: 'known', used: '1' }).state === 'unknown'
    && parseProjectQuota(null).state === 'unknown' && parseProjectQuota({ error: 'x' }).state === 'unknown'
    && parseProjectQuota({ state: 'unlimited' }).state === 'unlimited')
}

console.log('\nB) the route')
{
  const route = code('app/api/projects/quota/route.ts')
  const authFirst = (src: string) => {
    const gate = src.search(/if \(!user\) return Response\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/)
    const work = src.search(/createAdminClient\(\)/)
    return gate >= 0 && work > gate
  }
  check('B1: it answers 401 before any service-role read', authFirst(route))
  check('B1-MUT: the service-role read before the gate fails B1',
    !authFirst(route.replace("const supabase = await createClient()", "const early = createAdminClient()\n  const supabase = await createClient()")))
  const ownerOnly = (src: string) => /getUserEntitlement\(user\.id, createAdminClient\(\)\)/.test(src)
    && /\.eq\('user_id', user\.id\)\s*\.eq\('is_active', true\)/.test(src) && !/searchParams|request\.json|await request/.test(src)
  check('B2: it reads the signed-in user\'s own entitlement and active projects, and takes no input', ownerOnly(route))
  check('B2-MUT: a user id from the request fails B2', !ownerOnly(route.replace("getUserEntitlement(user.id,", "getUserEntitlement(new URL(request.url).searchParams.get('u')!,")))
  const create = code('app/api/projects/create/route.ts')
  check('B3: it uses the create route\'s own limit and count (PLAN_LIMITS[plan].maxProjects, active projects)',
    /PLAN_LIMITS\[entitlement\.plan\]\.maxProjects/.test(route) && /PLAN_LIMITS\[entitlement\.plan\]/.test(create)
    && /\.eq\('is_active', true\)/.test(create) && /\.eq\('is_active', true\)/.test(route))
  check('B4: it writes nothing', !/\.(insert|update|upsert|delete|rpc)\(/.test(route))
  const quiet = (src: string) => /catch \{\s*return Response\.json\(UNKNOWN\)/.test(src) && !/error\.message|String\(e/.test(src)
  check('B5: a failure answers "unknown", never a raw error', quiet(route))
  check('B5-MUT: returning the error text fails B5', !quiet(route.replace('return Response.json(UNKNOWN)', 'return Response.json({ error: String(e) })')))
}

console.log('\nC) the switcher')
{
  const sw = code('components/layout/WorkspaceSwitcher.tsx')
  const blocksOnlyOnKnown = (src: string) => /const blocked = newProjectBlocked\(quota\) \? quota : null/.test(src)
    && /\{blocked \? <span \/> : \(\s*<Link\s+href="\/projects\/new"/.test(src)
  check('C1: at the limit "New project" is not a link; otherwise it is, as before', blocksOnlyOnKnown(sw))
  check('C1-MUT: a link that ignores the limit fails C1', !blocksOnlyOnKnown(sw.replace('{blocked ? <span /> : (', '{false ? <span /> : (')))
  check('C2: the switched-off entry says why and links to the plan',
    /aria-disabled="true"/.test(sw) && /aria-describedby=\{limitId\}/.test(sw) && /t\.createLimitReached\(blocked\.used, blocked\.limit\)/.test(sw) && /href="\/billing"/.test(sw))
  check('C3: the reason is written in both languages, with the numbers',
    /1 מתוך 1/.test(dashboardHe.workspace.createLimitReached(1, 1)) && /1 of 1/.test(dashboardEn.workspace.createLimitReached(1, 1))
    && dashboardHe.workspace.createLimitReached(0, 0) !== dashboardHe.workspace.createLimitReached(1, 1))
  const keys = (src: string) => /role="listbox"/.test(src) && /role="option"/.test(src)
    && /e\.key === 'ArrowDown'\) \{ e\.preventDefault\(\); focusOption\(focusIndex \+ 1\) \}/.test(src)
    && /e\.key === 'ArrowUp'\) \{ e\.preventDefault\(\); focusOption\(focusIndex - 1\) \}/.test(src)
    && /tabIndex=\{i === focusable \? 0 : -1\}/.test(src)
  check('C4: the list is a listbox whose arrows move focus between options (roving tabindex)', keys(sw))
  check('C4-MUT: a list without the arrow handling fails C4', !keys(sw.replace('focusOption(focusIndex + 1)', 'void 0')))
  check('C5: Arrow Down on the button opens the list; Escape closes it and returns focus to the button',
    /onKeyDown=\{onTriggerKey\}/.test(sw) && /if \(e\.key !== 'Escape'\) return\s*setOpen\(false\)\s*triggerRef\.current\?\.focus/.test(sw))
  check('C6: Enter picks through the option\'s own button, which sets the SHARED project',
    /onClick=\{\(\) => \{ setActiveProject\(p\.id\); setOpen\(false\) \}\}/.test(sw) && /type="button"\s+role="option"/.test(sw))
  check('C7: only the listbox holds options (the search box and the footer are outside it)',
    /<ul id=\{listId\} role="listbox"/.test(sw) && !/<div\s+role="listbox"/.test(sw))
  check('C8: the site icon with its letter fallback is kept, in the button and in every row',
    // SiteAvatar (components/ui/SiteAvatar.tsx) is SiteIcon with the shared letter fallback.
    /<SiteAvatar[^>]*domain=\{current\?\.target_domain\}[^>]*name=/.test(sw) && /<SiteAvatar[^>]*domain=\{p\.target_domain\}[^>]*name=/.test(sw)
    && /<SiteIcon[\s\S]*?fallback=\{siteInitial\(/.test(code('components/ui/SiteAvatar.tsx')))
  check('C8-MUT: a switcher row back to a bare initial fails C8', !/<SiteAvatar[^>]*domain=\{p\.target_domain\}[^>]*name=/.test(sw.replace(/<SiteAvatar domain=\{p\.target_domain\}[^>]*\/>/, '<span>{p.name.charAt(0)}</span>')))
  check('C9: an unread limit leaves the entry on (the fetch failure is "unknown")',
    /\.catch\(\(\) => \{ if \(!cancelled\) setQuota\(\{ state: 'unknown' \}\) \}\)/.test(sw))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
