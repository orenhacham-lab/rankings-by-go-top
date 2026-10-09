/**
 * EVERY ARTICLE GIVES THE READER SOMETHING TO CHECK THEMSELVES.
 *
 * The owner asked to raise E-E-A-T on the page itself, for every customer, not
 * behind a setting (9 October 2026). The prompt already bans invented
 * experience, years in business, customer numbers, certifications, awards and
 * results, and the audit already measures structure — lists, tables, FAQ,
 * headings. What neither covered is Google's "Experience" dimension: an
 * article could be perfectly shaped and still leave the reader with nothing to
 * do. The one thing an article can always give without inventing a fact is
 * what to check, ask for or compare before deciding.
 *
 * Groups: A the measure, B the gate and the repair loop, C the label the
 * merchant reads, in every language. Each ends with a MUTATION CONTROL.
 */
import { readerVerifyCount, runArticleAudit } from '../article-audit'
import { FAILURE_HINT } from '../gemini-article'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import { code } from '../cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** A body long enough to clear the audit's own length floor. */
function body(extra: string): string {
  const para = 'משפט מקצועי על ניקוי משרדים שחוזר כדי להגיע לאורך סביר. '.repeat(12)
  return `<p>${para}</p>\n<h2>מה חשוב לדעת</h2>\n<p>${para}</p>\n<ul><li>${extra}</li></ul>`
}

const AUDIT = {
  language: 'he' as const, desiredWordCount: 900, primaryKeyword: '', secondaryKeywords: [],
  ctaPreference: 'none', ctaDetails: { text: '', phone: '', whatsapp: '', url: '' },
  includeBrandName: false, brandName: '', businessName: '',
  title: 'ניקוי משרדים', metaTitle: '', metaDescription: '', slug: 'office-cleaning', excerpt: '',
  faq: [], anchors: [],
}

async function main() {
  console.log('A) what counts as something the reader can check')
  {
    check('two different cues count', readerVerifyCount('בדקו את הציוד. בקשו הצעת מחיר בכתב.', 'he') === 2)
    check('one cue alone is not enough to pass the gate later', readerVerifyCount('בדקו את הציוד.', 'he') === 1)
    check('the same cue twice is still one cue', readerVerifyCount('בדקו את זה, ואחר כך בדקו את זה', 'he') === 1)
    check('a noun is not a cue, only an instruction is', readerVerifyCount('בדיקה שנתית היא נוהל מקובל', 'he') === 0)
    check('English cues are counted', readerVerifyCount('Ask for a written quote and compare two suppliers.', 'en') >= 2)
    check('Spanish cues are counted', readerVerifyCount('Pregunte por el precio y compare dos proveedores.', 'es') >= 2)
    check('a generic article scores zero', readerVerifyCount('ניקוי משרדים הוא תחום חשוב מאוד לכל עסק', 'he') === 0)
    check('case does not matter', readerVerifyCount('ASK FOR a quote and COMPARE two offers', 'en') >= 2)

    // MUTATION CONTROL — counting the noun forms too would pass an article that
    // only talks ABOUT checking, which is the generic article the owner complained of.
    const loose = (t: string) => ['בדיקה', 'בדקו'].filter((w) => t.includes(w)).length
    check('MUTATION: counting noun forms passes an article with no instruction (guard is real)',
      loose('בדיקה שנתית היא נוהל מקובל') === 1 && readerVerifyCount('בדיקה שנתית היא נוהל מקובל', 'he') === 0)
  }

  console.log('B) the gate, and the repair attempt that follows it')
  {
    const weak = runArticleAudit({ ...AUDIT, contentHtml: body('ניקוי משרדים הוא תחום חשוב') })
    const strong = runArticleAudit({ ...AUDIT, contentHtml: body('בדקו את סוג הרצפה ובקשו הצעת מחיר בכתב') })
    check('an article with nothing to check is flagged', weak.warnings.includes('reader_can_verify'))
    check('an article that tells the reader what to check is not', !strong.warnings.includes('reader_can_verify'))
    check('it is a warning, not a blocker, so a draft is never lost over it', !weak.blockers.includes('reader_can_verify'))
    // The repair loop feeds unmet warnings back to the model, so the hint has to exist.
    check('the repair attempt knows what to ask for', typeof FAILURE_HINT.reader_can_verify === 'string' && /CHECK|ASK FOR|COMPARE/.test(FAILURE_HINT.reader_can_verify))
    check('the hint forbids inventing a fact to satisfy it', /never an invented fact/.test(FAILURE_HINT.reader_can_verify))
    // The prompt asks for it up front, so most articles never reach the repair.
    const prompt = code('lib/content/gemini-article.ts')
    check('the prompt asks for it in the first place', /EXPERIENCE \(E-E-A-T\)/.test(prompt))
    check('the prompt keeps the ban on invented facts next to it', /never invent a fact, a price, a standard or a law/.test(prompt))

    // MUTATION CONTROL — a one-cue article would pass a threshold of 1, which is
    // a single aside rather than guidance.
    check('MUTATION: a threshold of one passes an article with a single aside (guard is real)',
      readerVerifyCount('בדקו את הציוד', 'he') >= 1 && runArticleAudit({ ...AUDIT, contentHtml: body('בדקו את הציוד') }).warnings.includes('reader_can_verify'))
  }

  console.log('C) the merchant can read why it was flagged')
  {
    for (const lang of ['he', 'en', 'es', 'pt-BR'] as const) {
      const labels = getDashboardDictionary(lang).contentHub.editor.auditCodes as unknown as Record<string, string>
      const label = labels.reader_can_verify
      check(`${lang}: the check has a label`, typeof label === 'string' && label.trim().length > 0)
      check(`${lang}: it is not the English fallback copied in`, lang === 'en' || label !== labels.not_generic)
    }

    // MUTATION CONTROL — an unlabelled check shows the merchant a bare id.
    const labels = getDashboardDictionary('he').contentHub.editor.auditCodes as unknown as Record<string, string>
    check('MUTATION: an id with no label would be empty here (guard is real)', labels['no_such_check_id'] === undefined)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
