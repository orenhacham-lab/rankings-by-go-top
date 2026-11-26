import fs from 'node:fs'
import { ONE_SYSTEM_HERO, ONE_SYSTEM_HERO_LIVE, type OneSystemHeroCopy } from '../one-system-hero'

let passed = 0, failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name} ${detail}`) }
}
const LOCALES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko']
const words = (c: OneSystemHeroCopy) => [c.eyebrow, c.title, c.accent, c.subtitle, c.calendar, c.caption, ...c.channels.flatMap((x) => [x.name, x.status])]
const BAD = /\bmeta\b|guarant|garant|#\s?\d|\d+%|מבטיחים|הבטחנו|1st|number one/i
const clean = (c: OneSystemHeroCopy) => words(c).every((w) => w.trim().length > 0 && !BAD.test(w))

check('A1: the hero stays OFF until social posting is live', ONE_SYSTEM_HERO_LIVE === false)
check('A2: all 11 languages are present', LOCALES.every((l) => (ONE_SYSTEM_HERO as Record<string, unknown>)[l]))
for (const l of LOCALES) {
  const c = (ONE_SYSTEM_HERO as Record<string, OneSystemHeroCopy>)[l]
  check(`B1 (${l}): names all three channels, no "Meta", no number or guarantee`, clean(c) && c.channels.length === 3)
}
const he = ONE_SYSTEM_HERO.he
check('B2: Hebrew mentions the site, Google Maps and Facebook and Instagram', /אתר/.test(he.title) && /גוגל מפות/.test(he.title) && /פייסבוק/.test(he.channels[2].name))
check('B1-MUT: copy that says Meta or promises a place is caught', !clean({ ...ONE_SYSTEM_HERO.en, subtitle: 'We post to Meta for you' }) && !clean({ ...ONE_SYSTEM_HERO.en, accent: '#1 guaranteed' }))
const page = fs.readFileSync('components/public/LandingPage.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
check('C1: the page uses the one-system words only behind the flag', /ONE_SYSTEM_HERO_LIVE \? ONE_SYSTEM_HERO\[locale\] : null/.test(page))
check('C1-MUT: a page that used the words without the flag would fail C1', !/ONE_SYSTEM_HERO_LIVE \? ONE_SYSTEM_HERO\[locale\] : null/.test(page.replace('ONE_SYSTEM_HERO_LIVE ?', 'true ?')))
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
