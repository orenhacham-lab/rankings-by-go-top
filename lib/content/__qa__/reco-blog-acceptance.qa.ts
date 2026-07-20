/**
 * GOLDEN blog-article acceptance suite — deterministic fixtures built from the PROVEN
 * production cases (GO TOP, Best Gifts, Shoplight, Shashka, Ido Sport, JUP). Every
 * fixture executes the REAL decision function `decideBlogArticle` (which composes the
 * real search-phrase, secondary-keyword, brand-safety, semantic-dup and page-type
 * helpers) and asserts ONE expected outcome:
 *   KEEP · KEEP_WITH_SECONDARIES_REMOVED · RECLASSIFY_TO_ARTICLE · REPAIR_AND_KEEP · REJECT
 * For every invalid fixture there are ≥2 nearby VALID control fixtures that must keep
 * passing — the suite proves proven-invalid topics/fields are removed WITHOUT dropping
 * nearby valid article volume.
 */
import { buildBrandSafety } from '../recommendations/brand-safety'
import { topicSignature } from '../recommendations/semantic-dup'
import { contentTokens } from '../recommendations/evidence-cluster'
import { decideBlogArticle, type BlogAcceptanceContext, type BlogCandidate } from '../recommendations/blog-article-acceptance'
import type { SearchIntent } from '../recommendations/opportunity'
import type { RecommendedPageType } from '../recommendations/opportunity-validation'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── context builder ──────────────────────────────────────────────────────────
function ctxOf(o: {
  businessName: string; entityNames?: string[]; evidence?: string[];
  domainTypeWords?: string[]; pending?: { kw: string; intent?: string }[];
}): BlogAcceptanceContext {
  const brandSafety = buildBrandSafety({ businessName: o.businessName, entityNames: o.entityNames ?? [], ownEvidence: o.evidence ?? [] })
  const businessEvidenceTokens = new Set<string>()
  for (const s of [...(o.entityNames ?? []), ...(o.evidence ?? [])]) for (const t of contentTokens(s)) businessEvidenceTokens.add(t)
  const domainTypeWords = new Set<string>((o.domainTypeWords ?? []).map((w) => contentTokens(w)[0]).filter(Boolean) as string[])
  const pendingSignatures = (o.pending ?? []).map((p) => topicSignature(p.kw, p.intent))
  return { brandSafety, businessEvidenceTokens, domainTypeWords, pendingSignatures }
}
const cand = (o: Partial<BlogCandidate> & { title: string; primaryKeyword: string }): BlogCandidate => ({
  secondaryKeywords: [], intent: 'informational' as SearchIntent, recommendedPageType: 'article' as RecommendedPageType, ...o,
})

async function main() {
  console.log('GO TOP — SEO agency (blog-only)')
  {
    const ctx = ctxOf({
      businessName: 'GO TOP', entityNames: ['שירותי קידום אתרים', 'בניית אתרים', 'ניהול קמפיינים'],
      evidence: ['קידום אתרים', 'קידום אורגני', 'שיווק דיגיטלי', 'לידים', 'דף נחיתה', 'ביקורת אתר'],
      domainTypeWords: ['אתרים', 'אתר', 'גוגל', 'קידום', 'אורגני', 'דיגיטלי'],
      pending: [
        { kw: 'קידום אורגני', intent: 'informational' },
        { kw: 'בניית אתר תדמית', intent: 'informational' },
      ],
    })
    // INVALID — SEO semantic duplicate of pending "קידום אורגני".
    const d1 = decideBlogArticle(cand({ title: 'איך עובד קידום אתרים אורגני בגוגל? עקרונות ושלבים להצלחה', primaryKeyword: 'קידום אתרים אורגני בגוגל' }), ctx)
    check('GO TOP SEO same-need → REJECT pending_semantic_duplicate', d1.outcome === 'reject' && d1.reason === 'pending_semantic_duplicate', JSON.stringify(d1))
    // INVALID — אתר תדמית same intro need as pending "בניית אתר תדמית".
    const d2 = decideBlogArticle(cand({ title: 'מהו אתר תדמית ומדוע כל עסק חייב אחד כזה?', primaryKeyword: 'אתר תדמית' }), ctx)
    check('GO TOP אתר תדמית intro-need → REJECT pending_semantic_duplicate', d2.outcome === 'reject' && d2.reason === 'pending_semantic_duplicate', JSON.stringify(d2))
    // RECLASSIFY — informational "what to check before choosing an SEO company".
    const d3 = decideBlogArticle(cand({ title: 'מה חשוב לבדוק לפני שבוחרים חברת קידום אתרים?', primaryKeyword: 'בחירת חברת קידום אתרים', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('GO TOP choose-SEO-company → RECLASSIFY_TO_ARTICLE', d3.outcome === 'reclassify_to_article' && d3.recommendedPageType === 'article', JSON.stringify(d3))
    // CONTROLS — distinct informational articles must be kept.
    const c1 = decideBlogArticle(cand({ title: 'איך לייצר לידים איכותיים מדף נחיתה', primaryKeyword: 'יצירת לידים מדף נחיתה', intent: 'informational' }), ctx)
    check('CONTROL GO TOP lead-gen article → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'מדריך לביצוע ביקורת קידום אתרים טכנית', primaryKeyword: 'ביקורת קידום אתרים טכנית', intent: 'informational' }), ctx)
    check('CONTROL GO TOP technical audit article → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('Best Gifts — gifting store')
  {
    const ctx = ctxOf({
      businessName: 'Best Gifts', entityNames: ['מנורת ירח', 'מארז מתנה', 'מתנות לגבר'],
      evidence: ['מתנות', 'מארז מתנה', 'מנורת לילה', 'רעיונות למתנה'],
      domainTypeWords: ['מנורה', 'מנורת', 'מתנה', 'מארז'],
      pending: [{ kw: 'מנורת ירח', intent: 'commercial' }],
    })
    // INVALID — moon-lamp selection guide duplicates the pending moon-lamp topic.
    const d1 = decideBlogArticle(cand({ title: 'מנורת ירח: כיצד לבחור את התאורה המושלמת ליצירת אווירה קסומה בחדר', primaryKeyword: 'מנורת ירח', intent: 'commercial' }), ctx)
    check('Best Gifts מנורת ירח → REJECT pending_semantic_duplicate', d1.outcome === 'reject' && d1.reason === 'pending_semantic_duplicate', JSON.stringify(d1))
    // INVALID — malformed marketing-sentence primary keyword, repairable from evidence.
    const d2 = decideBlogArticle(cand({ title: 'איך להרכיב מארז מתנה אישי לכל אירוע', primaryKeyword: 'להרכיב מארז מתנה אישי ומרגש לכל אירוע', supportedQuery: 'מארז מתנה אישי' }), ctx)
    check('Best Gifts marketing-sentence keyword → REPAIR_AND_KEEP', d2.outcome === 'repair_and_keep' && d2.primaryKeyword === 'מארז מתנה אישי', JSON.stringify(d2))
    // CONTROLS — distinct gifting articles.
    const c1 = decideBlogArticle(cand({ title: 'רעיונות למתנות מקוריות לנערים שיש להם כבר הכל', primaryKeyword: 'מתנות מקוריות לנערים', intent: 'informational' }), ctx)
    check('CONTROL Best Gifts teen gifts → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'מה כדאי לכלול במארז מתנה לתינוק?', primaryKeyword: 'מארז מתנה לתינוק', intent: 'informational' }), ctx)
    check('CONTROL Best Gifts baby gift box → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('Shoplight — lighting store (secondary coherence)')
  {
    const ctx = ctxOf({
      businessName: 'Shoplight', entityNames: ['תאורה לחדר שינה', 'ספוטים שקועים', 'עמודי תאורה לגינה', 'פס לד'],
      evidence: ['תאורה', 'מנורה', 'ספוטים', 'לד', 'גינה', 'חדר שינה'],
      domainTypeWords: ['תאורה', 'מנורה', 'גוף', 'תלוי', 'מנורת'],
    })
    // KEEP_WITH_SECONDARIES_REMOVED — bedroom topic, dining-room secondaries removed.
    const d1 = decideBlogArticle(cand({ title: 'איך לבחור תאורה לחדר שינה ליצירת אווירה מושלמת?', primaryKeyword: 'תאורה לחדר שינה', secondaryKeywords: ['מנורה לפינת אוכל', 'גוף תאורה תלוי לפינת אוכל', 'תאורה לפינת אוכל'] }), ctx)
    check('Shoplight bedroom + dining secondaries → KEEP_WITH_SECONDARIES_REMOVED', d1.outcome === 'keep_secondaries_removed' && d1.secondaryKeywords.length === 0 && d1.removedSecondaries.length === 3, JSON.stringify(d1))
    // KEEP_WITH_SECONDARIES_REMOVED — gypsum spotlights, garden-pole secondaries removed.
    const d2 = decideBlogArticle(cand({ title: 'ספוטים שקועים בגבס: המדריך לתכנון והתקנת תאורה נסתרת ומעוצבת', primaryKeyword: 'ספוטים שקועים בגבס', secondaryKeywords: ['עמוד תאורה לגינה', 'התקנת עמוד תאורה'] }), ctx)
    check('Shoplight gypsum + garden secondaries → KEEP_WITH_SECONDARIES_REMOVED', d2.outcome === 'keep_secondaries_removed' && d2.secondaryKeywords.length === 0 && d2.removedSecondaries.length === 2, JSON.stringify(d2))
    // CONTROLS — must remain accepted articles.
    const c1 = decideBlogArticle(cand({ title: 'המדריך המלא לתכנון תאורת גינה', primaryKeyword: 'תכנון תאורת גינה', intent: 'informational' }), ctx)
    check('CONTROL Shoplight garden lighting plan → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'פס לד צמוד תקרה: מדריך בחירה', primaryKeyword: 'פס לד צמוד תקרה', intent: 'informational' }), ctx)
    check('CONTROL Shoplight LED strip → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
    const c3 = decideBlogArticle(cand({ title: 'פס תאורה מגנטי: יתרונות והתקנה', primaryKeyword: 'פס תאורה מגנטי', intent: 'informational' }), ctx)
    check('CONTROL Shoplight magnetic strip → KEEP', c3.outcome === 'keep', JSON.stringify(c3))
  }

  console.log('Shashka — second-hand fashion store')
  {
    const ctx = ctxOf({
      businessName: 'ששקה', entityNames: ['בגדי יד שנייה', 'מכנס מחויט יד שנייה', 'בגד גוף יד שנייה'],
      evidence: ['יד שנייה', 'בגדים', 'אופנה', 'משומש', 'קנייה אונליין'],
      domainTypeWords: ['בגדי', 'בגד', 'אופנה'],
    })
    // INVALID — malformed marketing-sentence keyword; repairable from evidence query.
    const d1 = decideBlogArticle(cand({ title: 'קניית בגדי יד שנייה אונליין בבטחה', primaryKeyword: 'לקניית בגדי יד שנייה אונליין בבטחה ובסטייל', supportedQuery: 'קניית בגדי יד שנייה אונליין' }), ctx)
    check('Shashka malformed search phrase → REPAIR_AND_KEEP', d1.outcome === 'repair_and_keep' && d1.primaryKeyword === 'קניית בגדי יד שנייה אונליין', JSON.stringify(d1))
    // INVALID — own-brand promotional pitch (brand in the title) → not a blog topic.
    const d2 = decideBlogArticle(cand({ title: 'חנויות יד 2: למה ששקה היא הבחירה הנכונה לקנייה אונליין', primaryKeyword: 'חנויות יד 2', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('Shashka brand pitch → REJECT own_brand_not_blog_topic', d2.outcome === 'reject' && d2.reason === 'own_brand_not_blog_topic', JSON.stringify(d2))
    // CONTROLS — second-hand fashion IS the business model → kept (evidence supports יד שנייה).
    const c1 = decideBlogArticle(cand({ title: 'איך לבחור ולקנות בגד גוף יד שנייה שיראה חדש?', primaryKeyword: 'בגד גוף יד שנייה', intent: 'informational' }), ctx)
    check('CONTROL Shashka second-hand body suit → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'טיפים לבחירת מכנס מחויט לנשים יד שנייה שיושב מושלם', primaryKeyword: 'מכנס מחויט לנשים יד שנייה', intent: 'informational' }), ctx)
    check('CONTROL Shashka tailored trousers → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('Ido Sport — NEW fitness equipment store')
  {
    const ctx = ctxOf({
      businessName: 'עידו ספורט', entityNames: ['קטלבל אוניברסלי', 'משקולות יד', 'הליכון חשמלי', 'ספסל אימון'],
      evidence: ['ציוד כושר', 'אימון', 'משקולות', 'קטלבל', 'כושר'],
      domainTypeWords: ['כושר', 'אימון', 'ציוד'],
    })
    // INVALID — own-brand article (the store's own name as the topic).
    const d1 = decideBlogArticle(cand({ title: 'עידו ספורט: המומחים שלכם לציוד כושר ביתי ופתרונות אימון מתקדמים', primaryKeyword: 'עידו ספורט', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('Ido Sport own-brand → REJECT own_brand_not_blog_topic', d1.outcome === 'reject' && d1.reason === 'own_brand_not_blog_topic', JSON.stringify(d1))
    // INVALID — used-equipment expansion with no owned used-equipment evidence.
    const d2 = decideBlogArticle(cand({ title: 'ספת כושר יד 2: מדריך לבחירה חכמה וקנייה בטוחה', primaryKeyword: 'ספת כושר יד 2', intent: 'informational' }), ctx)
    check('Ido Sport used-equipment (no evidence) → REJECT unsupported_business_model_expansion', d2.outcome === 'reject' && d2.reason === 'unsupported_business_model_expansion', JSON.stringify(d2))
    // RECLASSIFY — adjustable-weights buying guide is a valid informational article.
    const d3 = decideBlogArticle(cand({ title: 'משקולות אוניברסליות 40 ק״ג: למי הן מתאימות ואיך לבחור סט מנצח?', primaryKeyword: 'משקולות אוניברסליות 40 קג', intent: 'commercial', recommendedPageType: 'commercial_landing_page' }), ctx)
    check('Ido Sport adjustable weights buying guide → RECLASSIFY_TO_ARTICLE', d3.outcome === 'reclassify_to_article' && d3.recommendedPageType === 'article', JSON.stringify(d3))
    // CONTROLS — distinct fitness articles must be kept.
    const c1 = decideBlogArticle(cand({ title: 'מהו קטלבל אוניברסלי וכיצד הוא יכול לשדרג את אימון הכוח שלכם?', primaryKeyword: 'קטלבל אוניברסלי', intent: 'informational' }), ctx)
    check('CONTROL Ido Sport universal kettlebell → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'קטלבל מתכוונן מול קטלבל רגיל: מה עדיף?', primaryKeyword: 'קטלבל מתכוונן מול קטלבל רגיל', intent: 'comparison' }), ctx)
    check('CONTROL Ido Sport kettlebell comparison → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log('JUP — construction/contractor content (specialist-legal expansion)')
  {
    const ctx = ctxOf({
      businessName: 'JUP', entityNames: ['שיפוצים', 'עבודות בנייה', 'קבלן שלד'],
      evidence: ['שיפוץ', 'בנייה', 'קבלן', 'שלד', 'תכנון'],
      domainTypeWords: ['בנייה', 'שיפוץ', 'קבלן'],
    })
    // INVALID — broad legal-enforcement article with no owned legal-service evidence.
    const d1 = decideBlogArticle(cand({ title: 'מה כוללת אחריות קבלן על פי חוק המכר וכיצד ניתן לאכוף אותה?', primaryKeyword: 'אחריות קבלן חוק המכר', intent: 'informational' }), ctx)
    check('JUP legal-enforcement (no legal evidence) → REJECT unsupported_business_model_expansion', d1.outcome === 'reject' && d1.reason === 'unsupported_business_model_expansion', JSON.stringify(d1))
    // CONTROLS — genuine construction how-to articles must be kept.
    const c1 = decideBlogArticle(cand({ title: 'איך לבחור קבלן שלד אמין לפרויקט בנייה', primaryKeyword: 'בחירת קבלן שלד', intent: 'informational' }), ctx)
    check('CONTROL JUP choose skeleton contractor → KEEP', c1.outcome === 'keep', JSON.stringify(c1))
    const c2 = decideBlogArticle(cand({ title: 'שלבי שיפוץ דירה: המדריך המלא לתכנון', primaryKeyword: 'שלבי שיפוץ דירה', intent: 'informational' }), ctx)
    check('CONTROL JUP apartment renovation stages → KEEP', c2.outcome === 'keep', JSON.stringify(c2))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
