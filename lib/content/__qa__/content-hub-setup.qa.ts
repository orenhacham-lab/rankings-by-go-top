/**
 * K5 — Content Hub missing-connections onboarding.
 *
 * Behavioral: the pure selector maps each of the six approved state combinations to
 * the correct card set (states 5/6 compose with the other dimension). Copy contract:
 * every GSC card states it's optional and makes NO requirement claim; no card implies
 * publishing works without a connected platform.
 */
import { selectSetupCards } from '../content-hub-setup'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function main() {
  console.log('K5 — setup card selector (six combinations)')

  // 1) no platform + no GSC → both cards.
  check('1. none + none → platform:none, gsc:none, shown',
    (() => { const r = selectSetupCards({ platform: 'none', gscStatus: 'none' }); return r.platformCard === 'none' && r.gscCard === 'none' && r.showSetup })())
  // 2) platform connected, no GSC → only GSC card.
  check('2. platform ready + gsc none → platform:null, gsc:none',
    (() => { const r = selectSetupCards({ platform: 'wordpress', gscStatus: 'none' }); return r.platformCard === null && r.gscCard === 'none' && r.showSetup })())
  // 3) GSC ready, no platform → only platform card.
  check('3. gsc ready + platform none → platform:none, gsc:null',
    (() => { const r = selectSetupCards({ platform: 'none', gscStatus: 'connected', gscHasProperty: true }); return r.platformCard === 'none' && r.gscCard === null && r.showSetup })())
  // 4) both ready → no cards, block hidden.
  check('4. both ready → nothing shown',
    (() => { const r = selectSetupCards({ platform: 'shopify', gscStatus: 'connected', gscHasProperty: true }); return r.platformCard === null && r.gscCard === null && !r.showSetup })())
  // 5) GSC reauth_required (composes with a ready platform) → gsc:reauth only.
  check('5. gsc reauth (+ platform ready) → gsc:reauth',
    (() => { const r = selectSetupCards({ platform: 'wordpress', gscStatus: 'reauth_required' }); return r.gscCard === 'reauth' && r.platformCard === null })())
  // 6) platform failed (composes with gsc none) → platform:failed.
  check('6. platform failed (+ gsc none) → platform:failed, gsc:none',
    (() => { const r = selectSetupCards({ platform: 'wordpress', platformFailed: true, gscStatus: 'none' }); return r.platformCard === 'failed' && r.gscCard === 'none' })())

  // Extra dimension coverage.
  check('shopify missing scope → platform:failed_scope', selectSetupCards({ platform: 'shopify', shopifyNeedsScope: true, gscStatus: 'connected', gscHasProperty: true }).platformCard === 'failed_scope')
  check("conflict is NOT a setup card (handled elsewhere)", selectSetupCards({ platform: 'conflict', gscStatus: 'connected', gscHasProperty: true }).platformCard === null)
  check('gsc connected but no property → gsc:no_property', selectSetupCards({ platform: 'wordpress', gscStatus: 'connected', gscHasProperty: false }).gscCard === 'no_property')
  check('gsc revoked/error → treated as none (connect)', selectSetupCards({ platform: 'wordpress', gscStatus: 'revoked' }).gscCard === 'none' && selectSetupCards({ platform: 'wordpress', gscStatus: 'error' }).gscCard === 'none')

  console.log('COPY) GSC optional (no requirement claim) + no publishing-without-platform')
  for (const loc of ['he', 'en'] as const) {
    const s = getDashboardDictionary(loc).contentHub.setup

    // Every GSC card explicitly states optionality (title or body).
    const optional = loc === 'he' ? /אופציונלי/ : /optional/i
    check(`(${loc}) gsc-none states optional`, optional.test(s.gscNoneTitle + s.gscNoneBody))
    check(`(${loc}) gsc-no_property states optional`, optional.test(s.gscNoPropertyTitle + s.gscNoPropertyBody))
    check(`(${loc}) gsc-reauth states optional`, optional.test(s.gscReauthTitle + s.gscReauthBody))

    // No requirement CLAIM: strip the allowed negations, then no bare requirement word remains.
    const gscCopy = [s.gscNoneTitle, s.gscNoneBody, s.gscNoPropertyTitle, s.gscNoPropertyBody, s.gscReauthTitle, s.gscReauthBody].join(' ')
    const stripped = loc === 'he'
      ? gscCopy.replace(/אינו חובה|לא נדרש|עובדת גם בלעדיו/g, '')
      : gscCopy.replace(/not required|works without it/gi, '')
    const requirementClaim = loc === 'he' ? /חובה|נדרש/ : /\brequired\b/i
    check(`(${loc}) GSC copy makes NO requirement claim`, !requirementClaim.test(stripped), stripped.slice(0, 80))

    // Publishing is gated on a platform: the platform-none card defers publishing to
    // AFTER connecting, and no card promises publishing without a platform.
    const deferPublish = loc === 'he' ? /ייפתח לאחר החיבור/ : /unlocks once a platform is connected/i
    check(`(${loc}) platform-none defers publishing to after connecting`, deferPublish.test(s.platformNoneBody))
    check(`(${loc}) GSC cards never mention publishing`, !/פרסום|פרסם|publish/i.test(gscCopy))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
