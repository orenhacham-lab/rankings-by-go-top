/**
 * Article subheadings never publish empty — offline, pure.
 *
 * Reported 2026-10-14 on a japan4u draft: under "אטרקציות ופעילויות" the article
 * had two <h3>s ("נקודות חובה בטוקיו:", "פנינים נסתרות בקיוטו:") and nothing
 * below either. Six published articles in other projects carry the same shape.
 * The JSON schema gave a subsection only "paragraphs"; the parser kept a
 * subsection whatever it held, and the builder wrote its heading anyway. A list
 * the model put in the subsection's own "bullets" was dropped on read.
 *
 * Now a subsection carries its own bullets, and one with nothing under its
 * heading is dropped before the HTML is built.
 *
 * MUTATION CONTROLS, run by hand: removing the `.filter(...)` on subsections in
 * parseStructured fails A; reading only `paragraphs` again fails B.
 *
 * Run: npx tsx lib/content/__qa__/article-empty-subheading.qa.ts
 */
import { parseStructuredArticle, buildArticleHtml, buildPrompt } from '../gemini-article'
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const base = {
  title: 'קיוטו מול טוקיו', slug: 'kyoto-vs-tokyo', metaTitle: 't', metaDescription: 'd', excerpt: 'e',
  directAnswer: 'תשובה', intro: ['פתיחה'], faq: [], comparisonTables: [],
}
const emptyH3 = /<h3[^>]*>[^<]*<\/h3>\s*(?:<h[23]|$)/

console.log('A) a subsection with nothing under its heading is not published')
{
  const a = parseStructuredArticle({
    ...base,
    sections: [
      { heading: 'אטרקציות ופעילויות', answerFirst: 'טוקיו מודרנית.', paragraphs: ['סוג האטרקציות משקף את העיר.'], bullets: [],
        subsections: [{ heading: 'נקודות חובה בטוקיו:', paragraphs: [] }, { heading: 'פנינים נסתרות בקיוטו:', paragraphs: ['  '] }] },
      { heading: 'טבלת הבדלים', answerFirst: 'טבלה.', paragraphs: ['הסבר.'], bullets: [] },
    ],
  })
  const html = buildArticleHtml(a, 'he', false)
  check('the parsed section keeps no empty subsection', a.sections[0].subsections.length === 0, JSON.stringify(a.sections[0].subsections))
  check('no <h3> is followed directly by another heading', !emptyH3.test(html))
  check('the empty headings are not in the article', !html.includes('נקודות חובה בטוקיו') && !html.includes('פנינים נסתרות בקיוטו'))
}

console.log('B) a list the model put in the subsection is kept and shown')
{
  const a = parseStructuredArticle({
    ...base,
    sections: [{ heading: 'אטרקציות', answerFirst: 'x', paragraphs: ['y'], bullets: [],
      subsections: [{ heading: 'נקודות חובה בטוקיו:', paragraphs: [], bullets: ['- שיבויה', 'אסאקוסה'] }] }],
  })
  const html = buildArticleHtml(a, 'he', false)
  check('the subsection is kept', a.sections[0].subsections.length === 1)
  check('its heading is followed by its list', /<h3[^>]*>נקודות חובה בטוקיו:<\/h3>\s*<ul><li>שיבויה<\/li><li>אסאקוסה<\/li><\/ul>/.test(html), html.slice(html.indexOf('<h3'), html.indexOf('<h3') + 160))
}

console.log('C) a subsection with paragraphs is unchanged')
{
  const a = parseStructuredArticle({
    ...base,
    sections: [{ heading: 'אוכל', answerFirst: 'x', paragraphs: ['y'], bullets: [],
      subsections: [{ heading: 'ראמן', paragraphs: ['מרק אטריות.'] }] }],
  })
  const html = buildArticleHtml(a, 'he', false)
  check('heading then paragraph', /<h3[^>]*>ראמן<\/h3>\s*<p[^>]*>מרק אטריות\.<\/p>/.test(html))
}

console.log('D) the model is told where a subsection list goes')
{
  const src = readFileSync(join(__dirname, '..', 'gemini-article.ts'), 'utf8')
  check('the JSON shape gives a subsection its own "bullets"', src.includes('"subsections":[{"heading":"...","paragraphs":["..."],"bullets":["..."]}]'))
  check('the prompt requires content under every subsection heading', src.includes('Every subsection you include MUST have content under its heading'))
  check('buildPrompt is still exported (the prompt is built from this file)', typeof buildPrompt === 'function')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
