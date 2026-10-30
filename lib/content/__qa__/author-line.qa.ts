/**
 * THE OWNER'S OWN LINE ABOUT THE AUTHOR (author_box_line).
 *
 * Asked for by the owner 2026-10-17: "נראה לי גם כדאי שתהיה אופציה לרשום משהו
 * בעצמך על הכותב במידה ולא אהבו מה שכתבנו בדיפולט". Until now the line under
 * the author's name was always the FIRST SENTENCE of the business description,
 * which is written for the business, not for the author.
 *
 *   L) the resolver: the owner's line wins over the description, an empty one
 *      falls back to it, markup is stripped and the length is capped;
 *   S) the settings round trip: it is saved to its own column, cleared with an
 *      empty field, cleaned before the database sees it, and refused for
 *      someone else's project;
 *   P) publishing draws the owner's line, through the same resolver;
 *   C) the card: one field, its own limit, disabled while the column is
 *      missing, and the preview is drawn with the unsaved line;
 *   I) the label and the hint in all four dashboard languages, used by the card;
 *   M) the migration: the CHECK that matches the app's own rules.
 *
 * Every group has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/content/__qa__/author-line.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { AUTHOR_BOX_LIMITS, authorBoxContent, cleanAuthorBoxLine } from '@/lib/content/author-box/box'
import { decideAuthorBox } from '@/lib/content/author-box/store'
import { loadWritingGuidance, saveWritingGuidance, parseAuthorBoxInput, type GuidanceDeps } from '@/lib/content/writing-guidance/data'
import type * as BoxMod from '@/lib/content/author-box/box'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) } else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** A deliberately broken copy of a module, next to it (so its relative imports resolve), imported, deleted. */
async function mutant<T>(rel: string, edit: (src: string) => string): Promise<T> {
  const file = join(ROOT, rel)
  const src = readFileSync(file, 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const copy = file.replace(/\.ts$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`)
  writeFileSync(copy, out)
  try {
    return (await import(copy)) as T
  } finally {
    unlinkSync(copy)
  }
}

type Row = Record<string, unknown>
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OTHER_PROJECT = 'a9999999-2222-3333-4444-555555555555'
const OWNER = 'u-owner'
const OTHER = 'u-other'
const ART = 'b1111111-2222-3333-4444-555555555555'
const DOMAIN = 'bakery.example.co.il'
const NOW = new Date('2026-10-17T12:00:00Z')
const DESCRIPTION = 'Levi Bakery has baked bread in Ramat Gan since 1998. We deliver every morning.'
const DESC_SENTENCE = 'Levi Bakery has baked bread in Ramat Gan since 1998.'
const OWN_LINE = 'Dana Levi runs the bakery and teaches the sourdough course.'

const baseRow = (extra: Row = {}): Row => ({
  project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], writing_guidance: null,
  author_box: true, theme_author_box: false, theme_author_box_checked_at: NOW.toISOString(),
  author_box_name: 'Dana Levi', author_box_line: null, author_box_url: null, author_box_image: 'none',
  author_box_photo_path: null, author_box_photo_media: null, ...extra,
})

function db(styles: Row[]) {
  return new FakeAdmin({
    projects: [
      { id: PROJECT, user_id: OWNER, name: 'Bakery project', business_name: 'Levi Bakery', target_domain: DOMAIN, language: 'en' },
      { id: OTHER_PROJECT, user_id: OTHER, name: 'Other', business_name: 'Other', target_domain: 'other.example', language: 'en' },
    ],
    project_article_styles: styles,
    project_profiles: [{ project_id: PROJECT, user_id: OWNER, description: DESCRIPTION }],
    generated_articles: [{ id: ART, project_id: PROJECT, topic_id: null, wp_post_url: null, published_at: null }],
    site_page_map: [],
    content_topics: [],
  })
}
const styleRow = (d: FakeAdmin, project = PROJECT) => (d.tables.project_article_styles as Row[]).find((r) => r.project_id === project) as Row
const deps = (d: FakeAdmin, user = OWNER): GuidanceDeps => ({ session: async () => ({ userId: user, db: d as never }), now: () => NOW })
const guidance = { instructions: '', exclusions: [], rules: [] }

async function main() {
  // ── L) the resolver ──────────────────────────────────────────────────────
  console.log('L) the line itself')
  {
    const inputs = { language: 'en' as const, nameOverride: 'Dana Levi', description: DESCRIPTION, domain: DOMAIN }
    const withOwn = authorBoxContent({ ...inputs, lineOverride: OWN_LINE })
    const without = authorBoxContent(inputs)
    check('L1: the owner\'s line is what the box says', withOwn?.line === OWN_LINE, withOwn?.line)
    check('L2: with no line of their own, the description\'s first sentence as before', without?.line === DESC_SENTENCE, without?.line)
    check('L3: an empty or blank line falls back to the description',
      authorBoxContent({ ...inputs, lineOverride: '   ' })?.line === DESC_SENTENCE && authorBoxContent({ ...inputs, lineOverride: null })?.line === DESC_SENTENCE)
    check('L4: no description and no line of their own: a box with a name and no line',
      authorBoxContent({ ...inputs, description: null })?.line === '')
    const markup = authorBoxContent({ ...inputs, lineOverride: '<b>Dana</b> <script>x</script> runs it' })
    check('L5: markup never reaches the box', !!markup && !/[<>]/.test(markup.line), markup?.line)
    const long = authorBoxContent({ ...inputs, lineOverride: 'ש'.repeat(400) })
    check('L6: the line is capped at its own limit', (long?.line.length ?? 0) <= AUTHOR_BOX_LIMITS.ownLine && AUTHOR_BOX_LIMITS.ownLine === 300, String(long?.line.length))
    check('L7: the cleaner is the one the settings use', cleanAuthorBoxLine(`  ${OWN_LINE}  `) === OWN_LINE)
    const blind = await mutant<typeof BoxMod>('lib/content/author-box/box.ts', (s) =>
      s.replace("const line = cleanAuthorBoxLine(input.lineOverride ?? '') || descriptionLine(input.description)", 'const line = descriptionLine(input.description)'))
    check('MUTATION CONTROL: a resolver that ignores the owner\'s line fails L1',
      blind.authorBoxContent({ ...inputs, lineOverride: OWN_LINE })?.line === DESC_SENTENCE)
  }

  // ── S) the settings round trip ───────────────────────────────────────────
  console.log('\nS) saving and clearing it')
  {
    const d = db([baseRow()])
    const saved = await saveWritingGuidance(deps(d), PROJECT, { ...guidance, authorBoxLine: OWN_LINE })
    check('S1: the line is saved to its own column and read back', saved.ok && styleRow(d).author_box_line === OWN_LINE && saved.data.authorBoxLine === OWN_LINE)
    const cleared = await saveWritingGuidance(deps(d), PROJECT, { ...guidance, authorBoxLine: '  ' })
    check('S2: an empty field clears it to NULL (the description again), it is not stored as an empty string',
      cleared.ok && styleRow(d).author_box_line === null && cleared.data.authorBoxLine === '')
    const dirty = await saveWritingGuidance(deps(d), PROJECT, { ...guidance, authorBoxLine: '<b>Dana</b> runs it' })
    check('S3: the database never sees markup', dirty.ok && typeof styleRow(d).author_box_line === 'string' && !/[<>]/.test(String(styleRow(d).author_box_line)))
    const capped = await saveWritingGuidance(deps(d), PROJECT, { ...guidance, authorBoxLine: 'a'.repeat(400) })
    check('S4: what is stored can never fail the column\'s CHECK (<= 300, no markup)',
      capped.ok && String(styleRow(d).author_box_line).length <= 300)
    check('S5: a non-string line is a bad request, and nothing is written',
      parseAuthorBoxInput({ authorBoxLine: 7 }).ok === false)
    const other = db([baseRow({ project_id: OTHER_PROJECT, user_id: OTHER })])
    const refused = await saveWritingGuidance(deps(other, OWNER), OTHER_PROJECT, { ...guidance, authorBoxLine: OWN_LINE })
    check('S6: someone else\'s project is refused and nothing is written',
      !refused.ok && styleRow(other, OTHER_PROJECT).author_box_line === null)
    const d2 = db([baseRow()])
    const untouched = await saveWritingGuidance(deps(d2), PROJECT, { ...guidance, instructions: 'write plainly' })
    check('S7: a save that does not send the line leaves it alone', untouched.ok && styleRow(d2).author_box_line === null)
    const parsed = parseAuthorBoxInput({ authorBoxLine: '  ' })
    check('MUTATION CONTROL: the parser maps a blank line to null, not to an empty string',
      parsed.ok && parsed.value.line === null)
  }

  // ── P) publishing ────────────────────────────────────────────────────────
  console.log('\nP) the published box')
  {
    const d = db([baseRow({ author_box_line: OWN_LINE })])
    const decision = await decideAuthorBox(d as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: '<p>body</p>' }, { now: () => NOW })
    check('P1: publishing draws the owner\'s line', decision.add && decision.content.line === OWN_LINE, decision.add ? decision.content.line : decision.reason)
    const d2 = db([baseRow()])
    const fallback = await decideAuthorBox(d2 as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: '<p>body</p>' }, { now: () => NOW })
    check('P2: without one, the description\'s first sentence as before', fallback.add && fallback.content.line === DESC_SENTENCE)
    const d3 = db([baseRow({ author_box_line: OWN_LINE, user_id: OTHER })])
    const notOwner = await decideAuthorBox(d3 as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: '<p>body</p>' }, { now: () => NOW })
    check('P3: a settings row that is not the project owner\'s is not read at all', !notOwner.add)
    const storeSrc = strip(read('lib/content/author-box/store.ts'))
    check('P4: the line is read in the same owner-named read as the name and the link',
      /AUTHOR_NAME_COLUMN\}, \$\{AUTHOR_LINE_COLUMN\}, \$\{AUTHOR_URL_COLUMN\}/.test(storeSrc)
      && /lineOverride: overrides\.line \|\| null/.test(storeSrc))
    check('MUTATION CONTROL: dropping it from the inputs fails P4', !/lineOverride: overrides\.line \|\| null/.test(storeSrc.replace('lineOverride: overrides.line || null,', '')))
  }

  // ── C) the card ──────────────────────────────────────────────────────────
  console.log('\nC) the settings card')
  {
    const card = strip(read('components/settings/WritingGuidanceCard.tsx'))
    const field = (c: string) => /id="author-box-line"/.test(c)
      && /maxLength=\{AUTHOR_BOX_LIMITS\.ownLine\}/.test(c)
      && /disabled=\{lineDisabled\}/.test(c)
      && /lineDisabled=\{disabled \|\| !view\.authorBoxLineEditable\}/.test(c)
    check('C1: one field, its own limit, and disabled while the column is missing', field(card))
    check('MUTATION CONTROL: a field that is never disabled fails C1', !field(card.replace('disabled={lineDisabled}', 'disabled={false}')))
    const preview = (c: string) => /nameOverride: name, lineOverride: line, linkUrl: url/.test(c)
    check('C2: the preview is drawn with the UNSAVED line, as the name and the link are', preview(card))
    check('MUTATION CONTROL: a preview that ignores the unsaved line fails C2', !preview(card.replace('lineOverride: line, ', '')))
    check('C3: the save sends it only where its column exists', /\.\.\.\(view\.authorBoxLineEditable \? \{ authorBoxLine: boxLine \} : \{\}\)/.test(card))
    const loaded = await loadWritingGuidance(deps(db([baseRow({ author_box_line: OWN_LINE })])), PROJECT)
    check('C4: the card is handed the saved line and told the field is editable',
      loaded.ok && loaded.data.authorBoxLine === OWN_LINE && loaded.data.authorBoxLineEditable === true)
  }

  // ── I) the four languages ────────────────────────────────────────────────
  console.log('\nI) every language')
  {
    const KEYS = ['authorBoxLineLabel', 'authorBoxLineHint'] as const
    for (const locale of ['he', 'en', 'es', 'pt-BR'] as const) {
      const w = getDashboardDictionary(locale).projectSettings.writingGuidance as unknown as Record<string, unknown>
      const all = KEYS.every((k) => typeof w[k] === 'string' && (w[k] as string).trim().length > 10)
      check(`I1 (${locale}): the label and the hint are written in this language`, all, KEYS.map((k) => `${k}=${String(w[k]).slice(0, 20)}`).join(' '))
    }
    const he = getDashboardDictionary('he').projectSettings.writingGuidance as unknown as Record<string, string>
    const en = getDashboardDictionary('en').projectSettings.writingGuidance as unknown as Record<string, string>
    const es = getDashboardDictionary('es').projectSettings.writingGuidance as unknown as Record<string, string>
    const pt = getDashboardDictionary('pt-BR').projectSettings.writingGuidance as unknown as Record<string, string>
    check('I2: and they are four different texts, not English four times',
      new Set([he.authorBoxLineLabel, en.authorBoxLineLabel, es.authorBoxLineLabel, pt.authorBoxLineLabel]).size === 4)
    const card = strip(read('components/settings/WritingGuidanceCard.tsx'))
    check('I3: the card uses both of them and types no sentence of its own',
      KEYS.every((k) => card.includes(`w.${k}`)))
    check('MUTATION CONTROL: a card with the sentence typed in fails I3',
      !KEYS.every((k) => card.replace('w.authorBoxLineHint', "'Write something about the author'").includes(`w.${k}`)))
  }

  // ── M) the migration ─────────────────────────────────────────────────────
  console.log('\nM) the migration')
  {
    const sql = read('supabase/migrations/20261017140000_project_author_box_line.sql')
    const rules = (s: string) => /ADD COLUMN IF NOT EXISTS author_box_line text/.test(s)
      && /char_length\(author_box_line\) BETWEEN 1 AND 300/.test(s)
      && /author_box_line !~ '\[<>\]'/.test(s)
      && /author_box_line IS NULL OR/.test(s)
    check('M1: the column, and a CHECK that is the app\'s own rules (NULL, 1..300, no markup)', rules(sql))
    check('MUTATION CONTROL: a migration without the CHECK fails M1', !rules(sql.replace(/ADD CONSTRAINT project_article_styles_author_box_line CHECK \([\s\S]*?\);/, '')))
    check('M2: the probe that was executed is named in the migration', /project-author-box-line\.probe\.sql/.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()

export {}
