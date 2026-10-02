/**
 * Settings polish (review P2-2 to P2-6):
 *
 *   2) THE INDEX marks one section: the one being read, from a reading line a third of the way
 *      down the window, not the one all but scrolled away; a section already read gets no fill.
 *   3) OFFICIAL PROFILES: drawn network marks (no favicon letters, no two "W"s), Hebrew labels,
 *      and "N מתוך 9 מולאו" (typed addresses are not connections).
 *   4) ARTICLE DESIGN: plain words (no "HTML", no "HEX"), and a preview article about the
 *      project's own line of business and name.
 *   5) JARGON: plain Hebrew for coverage, Schema, robots.txt, llms.txt and canonical where
 *      they are titles and labels; an unknown SEO plugin is not shown at all.
 *   6) CONTRADICTIONS: the auto-scan switch leads and the frequency shows only while it is on;
 *      one "detect again with AI" button for the business group, which runs its cards in turn.
 *
 * Every guard has a MUTATION CONTROL (a broken copy must fail it).
 * Run: npx tsx lib/project-settings/__qa__/settings-polish.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { activeSection, readingLineFor, READING_LINE } from '../../../components/settings/SettingsIndex'
import ProfileGlyph from '../../../components/settings/ProfileGlyph'
import { sampleArticleHtml, sampleCopy } from '../../../components/settings/ArticleStylePreview'
import { PROFILE_NETWORKS } from '../../content/article-style/profiles'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const he = getDashboardDictionary('he')
const en = getDashboardDictionary('en')

console.log('Settings polish — P2-2 to P2-6\n')

// ── 2) the index ────────────────────────────────────────────────────────────
console.log('2) the index marks the section being read')
{
  const tops = (xs: number[]) => xs.map((top, i) => ({ id: `s${i}`, top }))
  const line = readingLineFor(900)
  check('2a: the reading line sits a third of the way down (900px window → ~297px), within its bounds',
    line === 297 && readingLineFor(250) === READING_LINE && readingLineFor(2000) === 320 && readingLineFor(NaN) === READING_LINE, String(line))
  check('2b: a section whose heading sits under the bar, filling the screen, is the one marked (not the one above)',
    activeSection(tops([-2000, 147]), false, line) === 's1')
  check('2c: a click on the index (the section lands at the scroll margin) marks that section',
    activeSection(tops([-900, 80, 520]), false, line) === 's1')
  check('MUTATION (the line pinned at the scroll margin, as before): 2b sees the wrong section',
    activeSection(tops([-2000, 147]), false, READING_LINE) === 's0')
  const src = strip(read('components/settings/SettingsIndex.tsx'))
  const wired = (s: string) => /activeSection\(tops, atEnd, readingLineFor\(window\.innerHeight\)\)/.test(s)
  check('2d (source): the index uses the window\'s reading line', wired(src))
  check('MUTATION (source): the old call → 2d sees it', !wired(src.replace('activeSection(tops, atEnd, readingLineFor(window.innerHeight))', 'activeSection(tops, atEnd)')))
  const oneFill = (s: string) => !/passed \? 'bg-line-strong/.test(s)
  check('2e: a section already read gets no second fill (one marked item)', oneFill(src))
  check('MUTATION: the grey fill back → 2e sees it', !oneFill(src.replace("passed ? 'bg-sunk text-ink'", "passed ? 'bg-line-strong/70 text-ink'")))
}

// ── 3) official profiles ────────────────────────────────────────────────────
console.log('\n3) official profiles')
{
  const marks = PROFILE_NETWORKS.map((n) => renderToStaticMarkup(createElement(ProfileGlyph, { network: n })))
  check('3a: every network has a drawn mark (an svg, no text letter inside)', marks.every((m) => m.startsWith('<svg') && !/<text/.test(m)))
  check('3b: no two networks share a mark (Wikidata and Wikipedia included)', new Set(marks).size === marks.length)
  const card = strip(read('components/settings/OfficialProfilesCard.tsx'))
  const glyphs = (s: string) => (s.match(/<ProfileGlyph network=\{n\} \/>/g) ?? []).length === 2 && !/SiteAvatar/.test(s)
  check('3c: the card shows the drawn marks, never a favicon/letter avatar', glyphs(card))
  check('MUTATION: the favicon avatar back → 3c sees it', !glyphs(card.replace('<ProfileGlyph network={n} />', '<SiteAvatar domain="x" size="sm" />')))
  const labels = he.projectSettings.officialProfiles.networks
  const english = PROFILE_NETWORKS.filter((n) => !/[א-ת]/.test(labels[n].label))
  check('3d: every network label is in Hebrew', english.length === 0, english.join(','))
  check('3e: the count says "filled in", not "connected", in both languages',
    he.projectSettings.officialProfiles.count === '{n} מתוך {max} מולאו' && /filled in/.test(en.projectSettings.officialProfiles.count)
    && /const filled = PROFILE_NETWORKS/.test(card))
}

// ── 4) article design ───────────────────────────────────────────────────────
console.log('\n4) article design')
{
  const a = he.projectSettings.articleStyle
  check('4a: plain words: no "HTML" or "HEX" in the design copy', !/HTML/.test(a.design.minimal.hint) && !/HEX/.test(a.colors.invalid)
    && !/HTML/.test(en.projectSettings.articleStyle.design.minimal.hint) && !/HEX/.test(en.projectSettings.articleStyle.colors.invalid))
  const words = sampleCopy(a.preview, { niche: 'אינסטלציה', business: 'אינסטלציה מהירה' })
  const html = sampleArticleHtml(words)
  check('4b: the preview is about the project\'s line of business and names the business',
    words.title === 'המדריך המלא לאינסטלציה' && html.includes('אינסטלציה מהירה') && !/מזרן/.test(html + words.title), words.title)
  check('4c: without a known niche, the neutral sample stays', sampleCopy(a.preview, { niche: null, business: 'x' }).title === a.preview.title)
  check('4d: without a business name, the call to action stays generic', sampleCopy(a.preview, { niche: 'אינסטלציה', business: null }).cta === a.preview.forNiche.ctaGeneric)
  check('4e: the niche sample exists in English too', sampleCopy(en.projectSettings.articleStyle.preview, { niche: 'plumbing', business: 'Fast Plumbing' }).title === 'The complete guide to plumbing')
  const page = strip(read('app/(dashboard)/settings/page.tsx'))
  const passes = (s: string) => /subject=\{previewSubject\}/.test(s) && /niche: profile\?\.niche|const niche = profile\?\.niche/.test(s)
  check('4f (source): the settings screen hands the project\'s niche and name to the preview', passes(page)
    && /subject=\{subject\}/.test(strip(read('components/settings/ArticleStyleCard.tsx'))))
  check('MUTATION: the preview not given the subject → 4f sees it', !passes(page.replace('subject={previewSubject}', '')))
}

// ── 5) jargon ───────────────────────────────────────────────────────────────
console.log('\n5) plain words')
{
  const heText = read('lib/i18n/dashboard/he.ts')
  const bad = [
    /coverage: 'כיסוי'/, /title: 'נתונים מובנים \(Schema\)'/, /title: 'נתונים מובנים על העסק \(Schema\)'/,
    /title: 'גישה לבוטים של AI \(robots\.txt\)'/, /title: 'קובץ llms\.txt'/, /tabSchema: 'סכמה'/, /title: 'עמודים בלי כתובת קנונית'/,
    /canonical: 'כתובת קנונית לעמוד'/, /gsc: 'מ-Search Console'/,
  ].filter((re) => re.test(heText))
  check('5a: titles and labels are plain Hebrew (coverage, Schema, robots.txt, llms.txt, canonical, Search Console)', bad.length === 0, bad.map(String).join(' '))
  check('MUTATION: "כיסוי" back → 5a sees it', /coverage: 'כיסוי'/.test(heText.replace("coverage: 'נמצאו בגוגל'", "coverage: 'כיסוי'")))
  const wp = strip(read('components/content/WordPressPublishSettings.tsx'))
  const hides = (s: string) => /\{seoPluginKnown\(seoPlugin\) && \(/.test(s) && /const seoPluginKnown = \(p: string\) => p === 'yoast' \|\| p === 'rankmath' \|\| p === 'none' \|\| p === 'permission_error'/.test(s)
  check('5b: "תוסף SEO: לא ידוע" is never shown (the badge shows only a known value)', hides(wp))
  check('MUTATION: the badge always shown → 5b sees it', !hides(wp.replace('{seoPluginKnown(seoPlugin) && (', '{true && (')))
}

// ── 6) contradictions ───────────────────────────────────────────────────────
console.log('\n6) one status per control, one button per group')
{
  const form = strip(read('components/projects/ProjectForm.tsx'))
  const oneStatus = (s: string) => /\{autoScan \? \(\s*<Select/.test(s) && /formData\.set\('scan_frequency', scanFreq\)/.test(s)
    && /if \(on && scanFreq === 'manual'\) setScanFreq\('monthly'\)/.test(s)
  check('6a: the frequency shows only while automatic scans are on, and is still sent on save', oneStatus(form))
  check('MUTATION: the frequency shown with the switch off → 6a sees it', !oneStatus(form.replace('{autoScan ? (', '{true ? (')))
  check('6b: "off" is said in words, in both languages', !!he.projects.form.autoScanOff && !!en.projects.form.autoScanOff)
  const page = strip(read('app/(dashboard)/settings/page.tsx'))
  const buttons = ['BusinessCard', 'ProfileCard', 'AudienceCard'].map((f) => strip(read(`components/settings/${f}.tsx`)))
  const oneButton = (b: string[], p: string) =>
    /actions=\{seedFeatures && !chain \? <RedetectButton/.test(b[1]) && /actions=\{seedFeatures && !chain \? <RedetectButton/.test(b[2])
    && /chain \? chain\.lead && \(/.test(b[0])
    && /lead: section === 'business'/.test(p)
    && /chain=\{visibility\.seedFeatures \? chainFor\('profile'\) : undefined\}/.test(p) && /chain=\{visibility\.seedFeatures \? chainFor\('audience'\) : undefined\}/.test(p)
  check('6c: one "detect again with AI" button for the business group; the other cards take their turn without one', oneButton(buttons, page))
  check('MUTATION: the profile card keeps its own button → 6c sees it',
    !oneButton([buttons[0], buttons[1].replace('actions={seedFeatures && !chain ? <RedetectButton', 'actions={seedFeatures ? <RedetectButton'), buttons[2]], page))
  const hook = strip(read('components/settings/useRedetect.ts'))
  check('6d: each card runs when the group reaches it, once per turn, and hands the turn on',
    /if \(!turn \|\| turn === seen\.current\) return/.test(hook) && /c\?\.done\(stop\)/.test(hook)
    && /return stop \|\| next >= chainOrder\.length \? null : \{ \.\.\.c, step: next \}/.test(page))
  check('6e: with no scan yet, the group stops after the first card (one "scan first" notice, not three)',
    buttons.every((b) => /if \(neverScanned\) \{ redetect\.preempt\(\{ kind: 'scan_required' \}\); return true \}/.test(b)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
