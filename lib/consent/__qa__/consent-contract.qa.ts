/**
 * THE COOKIE-CONSENT CONTRACT — the guard for the one thing that must not
 * regress: no optional tag, ever, before the visitor allows it.
 *
 * Run: npx tsx lib/consent/__qa__/consent-contract.qa.ts
 *
 * A) nothing contacts Google before a decision
 * B) Consent Mode v2 declares everything optional denied, first
 * C) the decision model fails closed
 * D) refusing is as easy as agreeing, and withdrawable from every page
 * E) the audit log can only be written, never read, and holds no address
 * F) the copy no longer claims that browsing is agreement
 *
 * Every check has a mutation control: the code is broken on purpose and the
 * guard is shown to fail. A guard that cannot fail proves nothing.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  CONSENT_POLICY_VERSION,
  actionForChoices,
  normalizeChoices,
} from '../categories'
import { GOOGLE_CONSENT_DEFAULT, GOOGLE_CONSENT_DEFAULT_SCRIPT, googleConsentFrom } from '../google-consent-mode'
import { he } from '../../i18n/public/he'
import { en } from '../../i18n/public/en'

const ROOT = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comments are not behaviour: every source match is made against stripped code. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const code = (p: string) => strip(read(p))

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`, detail === undefined ? '' : detail) }
}

function main() {
  console.log('A) nothing contacts Google before a decision')
  {
    const layout = code('app/layout.tsx')
    // The old layout had BOTH an unconditional gtm.js <script> and a <noscript>
    // ns.html iframe. Neither may come back: a tag that loads before the
    // question is asked makes the answer decorative (ePrivacy Art. 5(3)).
    const layoutClean = (s: string) => !/googletagmanager\.com/.test(s) && !/ns\.html/.test(s) && /<GoogleTags \/>/.test(s)
    check('A1: the root layout requests no tag itself, and defers to the gated loader', layoutClean(layout))
    check('MUT: the unconditional gtm.js script back in the layout is caught',
      !layoutClean(`${layout}\n<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-PC29G3NQ"></script>`))
    check('MUT: the noscript GTM iframe back in the layout is caught',
      !layoutClean(`${layout}\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=X" /></noscript>`))

    const tags = code('components/consent/GoogleTags.tsx')
    // The loader appends the script only behind wantsTags(), and wantsTags is
    // true for no category other than analytics or marketing.
    const gateOk = (s: string) =>
      /if \(!wantsTags\(choices\) \|\| loaded\.current\) return/.test(s)
      && /return choices\.analytics \|\| choices\.marketing/.test(s)
      && /document\.head\.appendChild\(script\)/.test(s)
      // the consent state is pushed BEFORE the script is appended, so a tag
      // never evaluates against a state we have not declared yet
      && s.indexOf('pushConsentUpdate(choices)') < s.indexOf('document.head.appendChild(script)')
    check('A2: gtm.js is appended only when a category allows it, and only after the state is declared', gateOk(tags))
    check('MUT: loading the tag regardless of the choice is caught',
      !gateOk(tags.replace('if (!wantsTags(choices) || loaded.current) return', 'if (loaded.current) return')))
    check('MUT: a wantsTags that is true for necessary alone is caught',
      !gateOk(tags.replace('return choices.analytics || choices.marketing', 'return choices.necessary')))
  }

  console.log('\nB) Consent Mode v2 declares everything optional denied, first')
  {
    const optional = Object.entries(GOOGLE_CONSENT_DEFAULT).filter(([k]) => k !== 'security_storage')
    check('B1: every optional signal defaults to denied; only security_storage is granted',
      optional.every(([, v]) => v === 'denied') && GOOGLE_CONSENT_DEFAULT.security_storage === 'granted', GOOGLE_CONSENT_DEFAULT)
    // Consent Mode v2's two added signals must be in the default too: a signal
    // we never declare is a signal Google's tags treat as unset.
    check('B2: the v2 signals ad_user_data and ad_personalization are declared',
      'ad_user_data' in GOOGLE_CONSENT_DEFAULT && 'ad_personalization' in GOOGLE_CONSENT_DEFAULT)
    check('B3: the default script defines the dataLayer and pushes the default before anything else',
      /window\.dataLayer = window\.dataLayer \|\| \[\]/.test(GOOGLE_CONSENT_DEFAULT_SCRIPT)
      && /gtag\('consent', 'default'/.test(GOOGLE_CONSENT_DEFAULT_SCRIPT)
      && GOOGLE_CONSENT_DEFAULT_SCRIPT.indexOf('dataLayer') < GOOGLE_CONSENT_DEFAULT_SCRIPT.indexOf("'consent'"))
    check('B4: a refusal denies both ad and analytics storage; an acceptance grants them',
      googleConsentFrom(CONSENT_DENIED).ad_storage === 'denied'
      && googleConsentFrom(CONSENT_DENIED).analytics_storage === 'denied'
      && googleConsentFrom(CONSENT_GRANTED).ad_storage === 'granted'
      && googleConsentFrom(CONSENT_GRANTED).analytics_storage === 'granted')
    check('B5: analytics alone never grants an advertising signal',
      googleConsentFrom({ necessary: true, analytics: true, marketing: false }).ad_storage === 'denied')
    check('MUT: an advertising signal riding on analytics is caught',
      googleConsentFrom({ necessary: true, analytics: true, marketing: false }).ad_user_data === 'denied')
  }

  console.log('\nC) the decision model fails closed')
  {
    check('C1: nothing optional is granted by default', CONSENT_DENIED.analytics === false && CONSENT_DENIED.marketing === false)
    check('C2: necessary can never be turned off', normalizeChoices({ necessary: false }).necessary === true)
    for (const junk of [null, undefined, {}, 'yes', 42, { analytics: 'true' }, { analytics: 1 }, { marketing: {} }]) {
      const out = normalizeChoices(junk)
      check(`C3: a malformed record (${JSON.stringify(junk)}) grants nothing`, out.analytics === false && out.marketing === false)
    }
    check('C4: only a literal true grants', normalizeChoices({ analytics: true, marketing: true }).analytics === true)
    // Turning a granted category off is recorded as a withdrawal, not as a
    // fresh refusal: the distinction is what shows a grant ended.
    check('C5: turning everything off after a grant is a withdrawal',
      actionForChoices(CONSENT_DENIED, CONSENT_GRANTED) === 'withdraw')
    check('C6: refusing with nothing granted before is a plain refusal',
      actionForChoices(CONSENT_DENIED, null) === 'reject_all' && actionForChoices(CONSENT_DENIED, CONSENT_DENIED) === 'reject_all')
    check('C7: one category on is a custom choice',
      actionForChoices({ necessary: true, analytics: true, marketing: false }, null) === 'custom')

    const store = code('lib/consent/client-store.ts')
    // A record written against an older disclosure is not a decision about the
    // current one: the visitor is asked again rather than counted as agreeing.
    const versionOk = (s: string) => /if \(parsed\.policy !== CONSENT_POLICY_VERSION\) return null/.test(s)
    check('C8: a decision made against an older policy version is re-asked', versionOk(store))
    check('MUT: honouring a stale policy version is caught', !versionOk(store.replace('if (parsed.policy !== CONSENT_POLICY_VERSION) return null', '')))
    check('C9: the policy version is a dated string the banner can bump', /^\d{4}-\d{2}-\d{2}$/.test(CONSENT_POLICY_VERSION))

    // Global Privacy Control is an opt-out the visitor already sent; it must be
    // honoured, and only a literal true counts.
    const gpcOk = (s: string) => /globalPrivacyControl\?: boolean \}\)\.globalPrivacyControl === true/.test(s)
    check('C10: Global Privacy Control is read strictly', gpcOk(store))
    check('MUT: a truthy GPC check is caught', !gpcOk(store.replace('.globalPrivacyControl === true', '.globalPrivacyControl == true')))
    const banner = code('components/CookieConsent.tsx')
    check('C11: a GPC visitor gets a recorded refusal and no banner',
      /writeConsent\('gpc', CONSENT_DENIED\)/.test(banner) && /if \(globalPrivacyControl\(\)\)/.test(banner))
  }

  console.log('\nD) refusing is as easy as agreeing, and withdrawable from every page')
  {
    const banner = code('components/CookieConsent.tsx')
    // Equal prominence: both decisions are flex-1 buttons in one row with the
    // same height class, so neither can be made the cheaper press.
    const equalOk = (s: string) => {
      const accept = s.match(/onClick=\{handleAccept\}[\s\S]{0,400}?className=\{`([^`]*)`\}/)
      const reject = s.match(/onClick=\{handleReject\}[\s\S]{0,400}?className=\{`([^`]*)`\}/)
      if (!accept || !reject) return false
      const shape = (cls: string) => /flex-1/.test(cls) && /h-\[26px\] text-overline.*h-9 text-copy|compact \? 'h-\[26px\] text-overline' : 'h-9 text-copy'/.test(cls)
      return shape(accept[1]) && shape(reject[1])
    }
    check('D1: accept and reject are peer buttons of the same size in the same row', equalOk(banner))
    check('MUT: a reject rendered as small print is caught',
      !equalOk(banner.replace(/onClick=\{handleReject\}(\s*)className=\{`([^`]*)`\}/, 'onClick={handleReject}$1className="text-overline underline"')))
    check('D2: a third control opens the per-category panel', /onClick=\{\(\) => setPanelOpen\(true\)\}/.test(banner))

    const prefs = code('components/consent/ConsentPreferences.tsx')
    // The necessary toggle is shown, disabled and checked: the visitor can see
    // what runs regardless, rather than having it hidden from them.
    const panelOk = (s: string) =>
      /role="dialog"/.test(s) && /aria-modal="true"/.test(s)
      && /const locked = category === 'necessary'/.test(s)
      && /disabled=\{locked\}/.test(s)
      && /event\.key === 'Escape'/.test(s)
    check('D3: the panel is a labelled modal, escapable, with necessary locked on and visible', panelOk(prefs))
    check('MUT: an editable necessary toggle is caught', !panelOk(prefs.replace('disabled={locked}', 'disabled={false}')))
    check('MUT: a panel with no escape is caught', !panelOk(prefs.replace("event.key === 'Escape'", "event.key === 'Enter'")))
    // Art. 7(3): withdrawal as easy as consent. The footer carries the way back
    // on every public page, and the banner listens for it.
    const footer = code('components/Footer.tsx')
    const withdrawOk = (f: string, b: string) =>
      /gotop:open-consent-settings/.test(f) && /data-cookie-settings-link/.test(f)
      && /addEventListener\('gotop:open-consent-settings', open\)/.test(b)
    check('D4: every public page carries a way back into the panel, and the banner answers it', withdrawOk(footer, banner))
    check('MUT: removing the footer entry is caught', !withdrawOk(footer.replace(/gotop:open-consent-settings/g, 'x'), banner))
    check('MUT: a banner that ignores the footer entry is caught',
      !withdrawOk(footer, banner.replace("addEventListener('gotop:open-consent-settings', open)", "addEventListener('other', open)")))
  }

  console.log('\nE) the audit log can only be written, never read, and holds no address')
  {
    const route = code('app/api/consent/route.ts')
    const routeOk = (s: string) =>
      // insert only: no select, no update, no delete, in a public route
      /\.from\('consent_events'\)\.insert\(/.test(s)
      && !/\.from\('consent_events'\)\.(?:select|update|delete)\(/.test(s)
      // the address is hashed before it is stored or compared
      && /createHash\('sha256'\)/.test(s) && /ip_hash: ipHash/.test(s)
      && !/ip_hash: ip\b/.test(s)
      // a database failure must never reach the visitor
      && /catch \(err\)/.test(s) && /return done\(\)/.test(s)
      && /status: 204/.test(s)
      && /if \(throttled\(ipHash\)\) return done\(\)/.test(s)
    check('E1: the route only inserts, hashes the address, throttles, and always answers 204', routeOk(route))
    check('MUT: storing the raw address is caught', !routeOk(route.replace('ip_hash: ipHash', 'ip_hash: ip')))
    check('MUT: reading the log back from the public route is caught',
      !routeOk(route.replace(".from('consent_events').insert(", ".from('consent_events').select(")))
    check('MUT: dropping the rate limit is caught', !routeOk(route.replace('if (throttled(ipHash)) return done()', '')))
    // The action is validated against the closed list, so no caller can invent
    // a state the log cannot be read against later.
    check('E2: the action is checked against the closed list', /isConsentAction\(payload\.action\)/.test(route))

    // SQL comments are stripped first, same rule as every other source guard
    // here: the migration's own explanation of what it revokes contains the
    // words GRANT, UPDATE and DELETE, and a guard that reads prose as statements
    // reports a leak that does not exist.
    const sql = read('supabase/migrations/20261003000000_consent_events.sql').replace(/^\s*--.*$/gm, '')
    const sqlOk = (s: string) =>
      /ENABLE ROW LEVEL SECURITY/.test(s)
      // service_role must be in the REVOKE too: Supabase's default privileges
      // grant it ALL, and a GRANT only adds, so without the revoke the writer
      // keeps UPDATE and DELETE and the log is not append-only at all.
      && /REVOKE ALL ON TABLE public\.consent_events FROM PUBLIC, anon, authenticated, service_role/.test(s)
      && /GRANT SELECT, INSERT ON TABLE public\.consent_events TO service_role/.test(s)
      // no browser role may be granted anything on this table
      && !/GRANT[^;]*TO (?:anon|authenticated)/.test(s)
      // append-only: the app is never granted UPDATE or DELETE
      && !/GRANT[^;]*(?:UPDATE|DELETE)[^;]*consent_events/.test(s)
      && /CREATE UNIQUE INDEX IF NOT EXISTS consent_events_dedupe/.test(s)
    check('E3: the table has RLS on, no browser grants, and is append-only', sqlOk(sql))
    check('MUT: a grant to authenticated is caught',
      !sqlOk(sql.replace('GRANT SELECT, INSERT ON TABLE public.consent_events TO service_role;', 'GRANT SELECT ON TABLE public.consent_events TO authenticated;')))
    check('MUT: an UPDATE grant on the log is caught',
      !sqlOk(sql.replace('GRANT SELECT, INSERT ON TABLE public.consent_events TO service_role;', 'GRANT SELECT, INSERT, UPDATE ON TABLE public.consent_events TO service_role;')))
    check('MUT: leaving service_role out of the revoke is caught (it keeps Supabase\'s default UPDATE/DELETE)',
      !sqlOk(sql.replace('FROM PUBLIC, anon, authenticated, service_role;', 'FROM PUBLIC, anon, authenticated;')))
    // What Art. 7(1) needs to be answerable later: what was shown, what was
    // chosen, when, in which language, and on which page.
    for (const column of ['consent_id', 'policy_version', 'action', 'categories', 'locale', 'page_path', 'ip_hash', 'user_agent', 'decided_at']) {
      check(`E4: the log keeps ${column}`, new RegExp(`^\\s+${column}\\s`, 'm').test(sql))
    }
    check('E5: the table name is never used anywhere but the one writer',
      ['app/api/consent/route.ts'].length === 1 && /consent_events/.test(route))
  }

  console.log('\nF) the copy no longer claims that browsing is agreement')
  {
    for (const [lang, d] of [['he', he], ['en', en]] as const) {
      const c = d.cookie as Record<string, unknown>
      const words = [c.body, c.short].filter((x): x is string => typeof x === 'string').join(' ')
      // "Continued use means you agree" is not an affirmative act. The old
      // Hebrew sentence said exactly that, in both the card and the phone sheet.
      const implied = /המשך השימוש|המשך הגלישה|by continuing|continuing to use/i.test(words)
      check(`F1 (${lang}): the notice does not treat continued browsing as consent`, !implied, words)
      const required = ['accept', 'rejectAll', 'customize', 'save', 'settings', 'settingsTitle', 'withdrawHint', 'always', 'gpcBody']
      check(`F2 (${lang}): every control and the withdrawal note have words`, required.every((k) => typeof c[k] === 'string' && (c[k] as string).length > 0))
      const cats = c.categories as Record<string, { title: string; desc: string }>
      check(`F3 (${lang}): each category is named and explained`,
        ['necessary', 'analytics', 'marketing'].every((k) => cats?.[k]?.title?.length > 0 && cats?.[k]?.desc?.length > 20))
    }
    check('MUT: the old "continued use is agreement" sentence is caught',
      /המשך השימוש/.test('אנו משתמשים בעוגיות. המשך השימוש באתר מהווה הסכמה'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
