/**
 * Every sentence and button label that says, or acts on, "not connected", in one
 * language: what no screen may paint before its status answered. Shared by the
 * first-paint suite (no-disconnected-flash.qa.ts) and the browser journey
 * (lib/__qa__/reviewer-journey/flash-of-disconnected.js), which runs this file to
 * print them as JSON:
 *
 *   npx tsx lib/connection-status/__qa__/disconnected-copy.ts
 */
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

export function disconnectedCopy(locale: 'he' | 'en'): string[] {
  const d = getDashboardDictionary(locale)
  const cs = d.projectDetail.contentSection
  const s = d.contentHub.setup
  const all: unknown[] = [
    s.rowPlatformNone, s.rowGscNone, s.rowGscNoProperty, s.rowGscReauth, s.connectInSettings, s.gscConnect,
    cs.notConnected, cs.connectButton, cs.platformChoiceTitle, cs.connectWordPress, cs.connectShopify,
    cs.gsc.notConnected, cs.gsc.connect, cs.gsc.errors.not_connected,
    d.sitePlatforms.noneTitle, d.sitePlatforms.noneBody, d.sitePlatforms.choose,
  ]
  return all.filter((x): x is string => typeof x === 'string' && x.length > 3)
}

if (process.argv[1] && /disconnected-copy\.ts$/.test(process.argv[1])) {
  console.log(JSON.stringify({ he: disconnectedCopy('he'), en: disconnectedCopy('en') }))
}
