/**
 * TITLE containment guards (Step 1.5) — two typed hard rejections on the
 * model-authored title, added ALONGSIDE the existing shadow scan.
 *
 * WHY: the evidence-first invariant (:921-926) re-anchors a drifted KEYWORD to the
 * brief subject, and the final title↔keyword alignment (:998) then rejects a title
 * that drifted away from it — so subject SUBSTITUTION is already contained
 * deterministically. What was NOT contained is subject CONTAMINATION: a title that
 * keeps its brief subject and adds someone else's brand beside it
 * ("זר כלה קלאסי בשילוב בושם Tom Ford"). Measured on main, every gate passed it:
 * detectUnsafeNamedEntityMutation false, containsExternalBusiness false (the broad
 * classifier needs a typeVocab token the title had dropped), and
 * scanSuggestionBrandSafety is shadow-only. It was persisted.
 *
 * WHAT: (3b) hasNamedExternalBusiness on the title — the STRICT detector, already a
 * hard exclusion on the fallback seed path since 21464c9. (3c) unknownLatinTokens —
 * the structural form of the prompt's per-brief "never mention a brand not in this
 * brief's entities" rule.
 *
 * NOT CHANGED: scanSuggestionBrandSafety stays SHADOW-only. Promoting the broad
 * classifier was tried and proved unsafe (its own comment: "It proved unsafe") —
 * "ורדים ורודים" reads as a business to it. These guards are additions beside it.
 *
 * LIMITATION asserted in section F: a Hebrew-script foreign brand with no legal
 * suffix and no edit-distance relationship to an owned name is NOT caught, here or
 * anywhere. The test pins that as KNOWN, so a later reader cannot mistake a passing
 * title for proof of absence.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildBrandSafety, unknownLatinTokens, hasNamedExternalBusiness,
  containsExternalBusiness, scanSuggestionBrandSafety, detectUnsafeNamedEntityMutation,
  type BrandSafety,
} from '../recommendations/brand-safety'
import { contentTokens } from '../recommendations/evidence-cluster'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The exact allow-set the engine builds at (3c): brief subject + related entities. */
const allowFor = (subject: string, entities: string[] = []) => {
  const s = new Set<string>(contentTokens(subject))
  for (const e of entities) for (const t of contentTokens(e)) s.add(t)
  return s
}
/** The engine's (3b)+(3c) decision for one title, as a single predicate. */
const titleRejected = (title: string, bs: BrandSafety, allow: Set<string>) =>
  hasNamedExternalBusiness(title, bs).hit || unknownLatinTokens(title, bs, allow).length > 0

// ── the three REAL project shapes from the containment matrix ─────────────────
const FLORIST = buildBrandSafety({
  businessName: 'לואיז פרחים',
  entityNames: ['זרי כלה', 'סידורי פרחים לאירועים', 'משלוח פרחים', 'זרים ליום הולדת', 'צמחי בית', 'עיצוב פרחוני לחתונה'],
  ownEvidence: ['איך לשמור על זר פרחים'],
})
const FREELANCER = buildBrandSafety({
  businessName: 'מטלון',
  entityNames: ['פיתוח תוכנה', 'נגישות אתרים', 'WordPress', 'Core Web Vitals', 'SEO טכני'],
  ownEvidence: ['בניית אתרים ב-WordPress'],
})
const PERFUME = buildBrandSafety({
  businessName: 'בשמי הארץ',
  entityNames: ['בשמים לנשים', 'בשמים לגברים', 'Dior', 'Chanel', 'בשמי נישה'],
  ownEvidence: [],
})

function main() {
  console.log('Title brand containment — (3b) named business + (3c) unknown latin token\n')

  // ── A) the measured gap this closes ─────────────────────────────────────────
  console.log('A) the contamination case that reached acceptance on main')
  {
    const allow = allowFor('זר כלה קלאסי')
    const contaminated = 'זר כלה קלאסי בשילוב בושם Tom Ford'
    check('A1. main\'s gates all PASSED it (the gap is real, not hypothetical)',
      !detectUnsafeNamedEntityMutation(contaminated, 'זר כלה קלאסי', FLORIST)
      && !containsExternalBusiness(contaminated, FLORIST)
      && scanSuggestionBrandSafety({ title: contaminated, primaryKeyword: 'זר כלה קלאסי' }, FLORIST).safe)
    check('A2. (3c) now rejects it', unknownLatinTokens(contaminated, FLORIST, allow).length > 0)
    check('A3. …naming the offending tokens', JSON.stringify(unknownLatinTokens(contaminated, FLORIST, allow)) === '["tom","ford"]',
      JSON.stringify(unknownLatinTokens(contaminated, FLORIST, allow)))
    const suffixed = 'זר כלה קלאסי לעומת פרחי השרון בע"מ'
    check('A4. (3b) rejects a legal-suffix competitor name', hasNamedExternalBusiness(suffixed, FLORIST).hit)
    check('A5. …with typed evidence', hasNamedExternalBusiness(suffixed, FLORIST).evidence === 'business_legal_suffix')
  }

  // ── B) NO FALSE POSITIVES — the three project shapes ────────────────────────
  console.log('\nB) no false positives across the three project shapes')
  {
    const fl = allowFor('זר כלה קלאסי')
    for (const t of [
      'איך לבחור זר כלה קלאסי לחתונה',
      'זר כלה קלאסי עם ניחוח יסמין',
      'מה ההבדל בין זר כלה קלאסי לזר מודרני',
      'זר כלה קלאסי — כמה זמן מחזיק',
    ]) check(`B-florist. passes: ${t}`, !titleRejected(t, FLORIST, fl))

    // A Hebrew site whose LEGITIMATE vocabulary is latin.
    const fr = allowFor('שיפור Core Web Vitals', ['WordPress'])
    check('B-freelancer1. "איך לשפר Core Web Vitals באתר WordPress" passes',
      !titleRejected('איך לשפר Core Web Vitals באתר WordPress', FREELANCER, fr))
    check('B-freelancer2. "SEO טכני לאתרי WordPress" passes',
      !titleRejected('SEO טכני לאתרי WordPress', FREELANCER, fr))
    check('B-freelancer3. a FOREIGN latin vendor is still rejected',
      titleRejected('שיפור Core Web Vitals עם Cloudflare Enterprise', FREELANCER, fr),
      JSON.stringify(unknownLatinTokens('שיפור Core Web Vitals עם Cloudflare Enterprise', FREELANCER, fr)))

    // THE case the requirement names explicitly: a retailer that genuinely sells Dior.
    const pf = allowFor('בשמים מתוקים לנשים')
    check('B-perfume1. legitimate OWNED brand "Dior" PASSES',
      !titleRejected('המדריך לבשמים מתוקים לנשים מבית Dior', PERFUME, pf))
    check('B-perfume2. legitimate OWNED brand "Chanel" PASSES',
      !titleRejected('בשמים מתוקים לנשים מבית Chanel', PERFUME, pf))
    check('B-perfume3. NON-owned "Tom Ford" is REJECTED',
      titleRejected('בשמים מתוקים לנשים מבית Tom Ford', PERFUME, pf))
    check('B-perfume4. Dior and Tom Ford in the SAME title → rejected (any hit rejects)',
      titleRejected('Dior מול Tom Ford — בשמים מתוקים לנשים', PERFUME, pf))
  }

  // ── C) a CLEAN title can never be rejected ──────────────────────────────────
  console.log('\nC) a clean title is untouchable — Hebrew-only and mixed-script')
  {
    // Hebrew-only: no latin token exists, so (3c) is structurally incapable of firing.
    const heb = ['זר כלה קלאסי לחתונת קיץ', 'סידורי פרחים לאירועים גדולים', 'צמחי בית שקל לגדל', 'משלוח פרחים באותו יום']
    const fl = allowFor('זר כלה קלאסי')
    for (const t of heb) {
      check(`C-heb. no latin token → (3c) cannot fire: ${t}`, unknownLatinTokens(t, FLORIST, fl).length === 0)
      check(`C-heb. and (3b) does not fire: ${t}`, !hasNamedExternalBusiness(t, FLORIST).hit)
    }
    // Mixed-script, using ONLY project vocabulary + the brief's own entities.
    const fr = allowFor('נגישות אתרים', ['WordPress', 'SEO טכני'])
    for (const t of ['נגישות אתרים ב-WordPress: מדריך מעשי', 'SEO טכני ונגישות אתרים — מה קודם']) {
      check(`C-mixed. passes on own vocabulary: ${t}`, !titleRejected(t, FREELANCER, fr))
    }
    // The brief's OWN entity authorises a latin token even when ownVocab lacks it.
    const bsThin = buildBrandSafety({ businessName: 'חנות', entityNames: ['מוצרים'], ownEvidence: [] })
    check('C-brief. a latin token present in THIS brief\'s entities is allowed',
      unknownLatinTokens('סקירת Acme Widget לעסקים', bsThin, allowFor('סקירת מוצר', ['Acme Widget'])).length === 0)
    check('C-brief. …and the same token is rejected WITHOUT that entity',
      unknownLatinTokens('סקירת Acme Widget לעסקים', bsThin, allowFor('סקירת מוצר')).length > 0)
  }

  // ── D) precision properties inherited from unknownTokens ────────────────────
  console.log('\nD) precision properties')
  {
    const fl = allowFor('זר כלה')
    check('D1. empty title → no hit, no throw', unknownLatinTokens('', FLORIST, fl).length === 0)
    check('D2. tokens shorter than 3 chars are below the existing unknownTokens threshold',
      unknownLatinTokens('זר כלה hp', FLORIST, fl).length === 0)
    check('D3. a token already in ownVocab is never unknown',
      unknownLatinTokens('WordPress ונגישות', FREELANCER, allowFor('נגישות')).length === 0)
    check('D4. no allow-set supplied → still only flags UNKNOWN tokens',
      unknownLatinTokens('בשמים מבית Dior', PERFUME).length === 0)
    check('D5. the function is pure — the allow-set is not mutated',
      (() => { const a = allowFor('זר כלה'); const before = a.size; unknownLatinTokens('זר כלה Tom Ford', FLORIST, a); return a.size === before })())
  }

  // ── E) SOURCE CONTRACT ──────────────────────────────────────────────────────
  console.log('\nE) source contract')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    const bsSrc = stripComments(read('lib/content/recommendations/brand-safety.ts'))
    check('E1. (3b) is a typed hard rejection with its own reason',
      /return rej\('title_named_external_business', 'brand_safety_title_named_business'/.test(gfb))
    check('E2. (3c) is a typed hard rejection with its own reason',
      /return rej\('title_unknown_latin_token', 'brand_safety_title_unknown_token'/.test(gfb))
    check('E3. scanSuggestionBrandSafety is STILL shadow-only (never promoted)',
      /const scan = scanSuggestionBrandSafety\([\s\S]{0,200}?\n\s*if \(!scan\.safe\) shadow\('competitor_brand_leakage'\)/.test(gfb))
    check('E4. the existing (3) mutation gate is byte-identical',
      /if \(detectUnsafeNamedEntityMutation\(t\.title, primaryKeyword, brandSafety\)\) return rej\('unsafe_named_entity_mutation', 'brand_safety',/.test(gfb))
    check('E5. the keyword classifier at (3) is still a shadow, not a rejection',
      /if \(classifyKeywordEntity\(primaryKeyword, brandSafety\) === 'suspected_external_business'\) shadow\('competitor_brand_leakage'\)/.test(gfb))
    // Gate ORDER: the new gates sit after (3) and before (4). Positional, not a span match.
    const iMutation = gfb.indexOf("detectUnsafeNamedEntityMutation(t.title, primaryKeyword, brandSafety)")
    const iNamed = gfb.indexOf("'title_named_external_business'")
    const iLatin = gfb.indexOf("'title_unknown_latin_token'")
    const iWorthiness = gfb.indexOf('const w = evaluateArticleWorthiness(')
    check('E6. gate order unchanged: (3) → (3b) → (3c) → (4)',
      iMutation > 0 && iNamed > iMutation && iLatin > iNamed && iWorthiness > iLatin,
      JSON.stringify({ iMutation, iNamed, iLatin, iWorthiness }))
    check('E7. the aligned demand query is NOT in the allow-set (keyword research stays excluded)',
      !/unknownLatinTokens\([^)]*alignedDemandQuery/.test(gfb))
    check('E8. the allow-set is exactly brief subject + related entities',
      /const briefOwnTokens = new Set<string>\(contentTokens\(brief\.subject\)\)/.test(gfb)
      && /for \(const e of brief\.relatedEntities\) for \(const tok of contentTokens\(e\.name\)\) briefOwnTokens\.add\(tok\)/.test(gfb))
    check('E9. unknownLatinTokens reuses the existing unknownTokens helper',
      /return unknownTokens\(toks\(text\), bs\)\.filter/.test(bsSrc))
  }

  // ── F) the DOCUMENTED limitation — containment is partial, on the record ────
  console.log('\nF) the Hebrew-script blind spot is real and documented in code')
  {
    const pf = allowFor('בשמים מתוקים לנשים')
    const hebrewBrand = 'בשמים מתוקים לנשים בהשראת שאנל'
    check('F1. KNOWN GAP: a Hebrew-script foreign brand is NOT caught (asserted, not hidden)',
      !titleRejected(hebrewBrand, PERFUME, pf))
    check('F2. no REJECTING gate catches it (the mutation gate misses it too)',
      !detectUnsafeNamedEntityMutation(hebrewBrand, 'בשמים מתוקים לנשים', PERFUME))
    // MEASURED nuance, not an assumption: the BROAD classifier does flag this title —
    // but only because the title kept the project's type token ("בשמים"). It is
    // shadow-only, so it observes without blocking. The florist case proves the
    // observation is not even reliable: that title dropped "פרחים" and went unflagged.
    check('F2b. the broad classifier FLAGS it — shadow-only, so it never blocks',
      !scanSuggestionBrandSafety({ title: hebrewBrand, primaryKeyword: 'בשמים מתוקים לנשים' }, PERFUME).safe)
    check('F2c. …and that observation is UNRELIABLE: a title dropping its type token is not flagged',
      scanSuggestionBrandSafety({ title: 'זר כלה קלאסי בשילוב בושם Tom Ford', primaryKeyword: 'זר כלה קלאסי' }, FLORIST).safe)
    const raw = read('lib/content/recommendations/brand-safety.ts')
    check('F3. the limitation is documented IN THE CODE, not only in review',
      /LIMITATION — DELIBERATE AND UNCLOSED/.test(raw) && /HEBREW letters/.test(raw))
    check('F4. the comment warns against reading a pass as proof of absence',
      /do not\s*\n?\s*\*?\s*read a passing title as proof that no external brand is present/.test(raw.replace(/\s+/g, ' ')) || /proof that no external brand is present/.test(raw))
  }

  // ── G) FROZEN ───────────────────────────────────────────────────────────────
  console.log('\nG) FROZEN — no engine, cost, prompt or persistence change')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('G1. no new model call', (gfb.match(/await generateRecommendationJSON\(/g) ?? []).length === 3)
    check('G2. the synthesis PROMPT is untouched (Step 2 not started)',
      /- If a brief cannot become a distinct, well-formed topic, SKIP it with a short reason\./.test(read('lib/content/recommendations/brief-synthesis.ts'))
      && /Do NOT generate brands, products, services, entities or subject areas that are absent from it\./.test(read('lib/content/recommendations/prompt-guidance.ts')))
    check('G3. deriveProjectFocus is unchanged (Step 3 not started)',
      /return \{ primaryProjectFocus: cats\[0\], secondaryProjectAreas: Array\.from\(new Set\(cats\.slice\(1\)\)\)\.slice\(0, 8\) \}/.test(read('lib/content/recommendations/prompt-guidance.ts')))
    check('G4. no persistence or migration touched',
      !/title_unknown_latin_token|title_named_external_business/.test(read('lib/content/recommendations/topic-idea-store.ts')))
    check('G5. the low-yield fallback seed exclusion (21464c9) is intact',
      /if \(hasNamedExternalBusiness\(phrase, params\.brandSafety\)\.hit\)/.test(read('lib/content/recommendations/low-yield-fallback.ts')))
    check('G6. the reasons are engine reasons only — no customer-facing i18n string added',
      !/title_unknown_latin_token/.test(read('lib/i18n/dashboard/he.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
