/**
 * THE LINK NETWORK ("רשת הקישורים"): the guards. Every rule has a MUTATION
 * CONTROL: the same check on a deliberately broken copy of the code must fail.
 *
 *   A  matching rules (rules.ts): only a site whose domain the owner proved
 *      (a live WordPress / GO TOP plugin connection on that exact host, or a
 *      verified Search Console property covering it; never a Wix / webhook
 *      address, which the owner types), never reciprocal, no short loops, never a
 *      competitor (either side's list), never the same category, never the same
 *      owner / client / server address, not thin or new, not Shopify, caps per
 *      target (with the ramp for new members) and per source, exact anchors rare.
 *   B  where and how the link is written (anchor.ts): body paragraphs only, the
 *      anchor's own words, no footprint, rel from the setting, removable exactly.
 *   C  the model's answer is checked (choose.ts): threshold, complementary,
 *      literal anchor, offered page only.
 *   D  the placement step end to end on the in-memory database (place.ts):
 *      only allowed targets reach the model, one link per article, the log row,
 *      nothing written on a skip, hidden while the tables do not exist, the
 *      database's reciprocal refusal handled.
 *   E  the routes (http.ts): owner filter, consent required, leave, Shopify and
 *      missing tables hidden, reject before publish only and only by the giver,
 *      nothing of another customer's draft reaches the receiving side (not even
 *      the giving site), rejected links are not listed for it, and the table
 *      grants it nothing of the giver's ids.
 *   F  the one call site in article generation, which never throws.
 *   G  the screen: hidden → the old view; no confirm()/alert(); no literal text.
 *
 * Run: npx tsx lib/link-network/__qa__/link-network.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  eligibleTargets, exactAnchorAllowed, exclusionFor, provenDomains, receivedCapFor, sameCategory, siteQualifies, sourceExclusion,
  type Edge, type NetworkSite,
} from '../rules'
import { bodyParagraphs, classifyAnchor, insertLink, linkContext, linkPresent, removeLink, validAnchor } from '../anchor'
import { readChoice, type CandidateTarget } from '../choose'
import { placeNetworkLink, type PlaceDeps } from '../place'
import { loadSites, readDomainProof } from '../store'
import { runLinkNetworkStep } from '../step'
import { handleMembershipPost, handleNetworkGet, handleRejectPost, type NetworkDeps } from '../http'
import { LINK_NETWORK_CONSENT_VERSION } from '../consent'
import { FakeAdmin } from '../../__qa__/_fake-admin'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

let mutantSeq = 0
/** Load a MUTATED copy of a module under lib/link-network (same folder, so its imports resolve), then remove it. */
function withMutant<T>(rel: string, mutate: (src: string) => string, apply: (mod: any) => T): T {
  const src = read(rel)
  const out = mutate(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const file = join(ROOT, rel.replace(/([^/]+)\.ts$/, `.mutant-${process.pid}-${++mutantSeq}-$1.ts`))
  writeFileSync(file, out)
  try { return apply(require(file)) } finally { try { unlinkSync(file) } catch { /* gone */ } }
}
async function withMutantAsync<T>(rel: string, mutate: (src: string) => string, apply: (mod: any) => Promise<T>): Promise<T> {
  const src = read(rel)
  const out = mutate(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const file = join(ROOT, rel.replace(/([^/]+)\.ts$/, `.mutant-${process.pid}-${++mutantSeq}-$1.ts`))
  writeFileSync(file, out)
  try { return await apply(require(file)) } finally { try { unlinkSync(file) } catch { /* gone */ } }
}

const NOW = new Date('2026-09-20T12:00:00Z')
const OLD = '2026-03-01T00:00:00Z'
function site(id: string, over: Partial<NetworkSite> = {}): NetworkSite {
  return {
    projectId: id, userId: `u-${id}`, clientId: null, domains: [`${id}.co.il`], verifiedDomains: [`${id}.co.il`], language: 'he', category: `קטגוריה ${id}`,
    competitors: [], addresses: [], shopify: false, active: true, memberSince: '2026-05-01T00:00:00Z', createdAt: OLD,
    scanned: true, publishedArticles: 5, indexedPages: 0, linkedDomains: [], ...over,
  }
}
const edge = (source: string, target: string, placedAt = '2026-09-02T00:00:00Z', anchorKind: Edge['anchorKind'] = 'natural'): Edge => ({ source, target, placedAt, anchorKind })

// ── A. matching rules ───────────────────────────────────────────────────────
function partA() {
  console.log('\nA. matching rules')
  const A = site('a', { category: 'מעצבת פנים' }), B = site('b', { category: 'קייטרינג לאירועים' }), C = site('c', { category: 'צלם חתונות' })
  const RULES = 'lib/link-network/rules.ts'
  const ex = (mod: any, s: NetworkSite, t: NetworkSite, e: Edge[], n = NOW) => mod.exclusionFor(s, t, e, n)
  const real = { exclusionFor }

  check('a complementary member with no history may receive', exclusionFor(A, B, [], NOW) === null)

  // Reciprocal.
  check('never reciprocal: B -> A placed, so A -> B is refused', exclusionFor(A, B, [edge('b', 'a')], NOW) === 'reciprocal')
  const recMut = withMutant(RULES, (s) => s.replace("if (edges.some((e) => e.source === t && e.target === s)) return 'reciprocal'", ''), (m) => ex(m, A, B, [edge('b', 'a')]))
  check('MUTATION CONTROL: reciprocal check removed → A -> B allowed → caught', recMut === null, String(recMut))
  check('a pair links at most once: A -> B placed, so a second A -> B is refused', exclusionFor(A, B, [edge('a', 'b')], NOW) === 'already_linked')

  // Loop.
  check('no short loop: B -> C and C -> A placed, so A -> B is refused', exclusionFor(A, B, [edge('b', 'c'), edge('c', 'a')], NOW) === 'loop')
  const loopMut = withMutant(RULES, (s) => s.replace("if (edges.some((e) => e.source === t && intoSource.has(e.target))) return 'loop'", ''), (m) => ex(m, A, B, [edge('b', 'c'), edge('c', 'a')]))
  check('MUTATION CONTROL: loop check removed → caught', loopMut === null, String(loopMut))

  // Competitors, both lists.
  const Acomp = { ...A, competitors: ['b.co.il'] }
  check('never a competitor: B in A\'s competitor list', exclusionFor(Acomp, B, [], NOW) === 'competitor')
  const Bcomp = { ...B, competitors: ['www.a.co.il'] }
  check('never a competitor: A in B\'s competitor list (either side)', exclusionFor(A, Bcomp, [], NOW) === 'competitor')
  const compMut = withMutant(RULES, (s) => s.replace('if (listsAsCompetitor(source, target) || listsAsCompetitor(target, source)) return', 'if (listsAsCompetitor(source, target)) return'), (m) => ex(m, A, Bcomp, []))
  check('MUTATION CONTROL: only the source\'s list checked → the target\'s competitor gets a link → caught', compMut === null, String(compMut))

  // Category.
  const plumber = site('p', { category: 'אינסטלציה' }), plumber2 = site('q', { category: 'אינסטלציה ביתית' })
  check('never the same category (one containing the other)', exclusionFor(plumber, plumber2, [], NOW) === 'same_category')
  check('sameCategory: "Interior design" ~ "interior design studio"', sameCategory('Interior design', 'interior design studio'))
  check('sameCategory: plumbing vs catering are different', !sameCategory('אינסטלציה', 'קייטרינג לאירועים'))
  const catMut = withMutant(RULES, (s) => s.replace('if (x === y || x.includes(y) || y.includes(x)) return true', 'return x === y'), (m) => ex(m, plumber, plumber2, []))
  check('MUTATION CONTROL: exact category equality only → a same-field business gets a link → caught', catMut === null, String(catMut))
  check('an unknown category is left out, never guessed', exclusionFor(A, { ...B, category: null }, [], NOW) === 'category_unknown')
  const unkMut = withMutant(RULES, (s) => s.replace("if (!source.category || !target.category) return 'category_unknown'", ''), (m) => {
    try { return ex(m, A, { ...B, category: null }, []) } catch { return 'threw' }
  })
  check('MUTATION CONTROL: unknown category allowed through → caught', unkMut !== 'category_unknown', String(unkMut))

  // Related sites.
  check('never the same owner', exclusionFor(A, { ...B, userId: A.userId }, [], NOW) === 'same_owner')
  const ownMut = withMutant(RULES, (s) => s.replace("if (source.userId === target.userId) return 'same_owner'", ''), (m) => ex(m, A, { ...B, userId: A.userId }, []))
  check('MUTATION CONTROL: same-owner check removed → caught', ownMut === null, String(ownMut))
  check('never the same client group', exclusionFor({ ...A, clientId: 'cl1' }, { ...B, clientId: 'cl1' }, [], NOW) === 'same_client')
  check('never the same server address', exclusionFor({ ...A, addresses: ['1.2.3.4'] }, { ...B, addresses: ['5.6.7.8', '1.2.3.4'] }, [], NOW) === 'same_address')
  check('never a pair whose articles already link (either direction)', exclusionFor(A, { ...B, linkedDomains: ['a.co.il'] }, [], NOW) === 'already_linked'
    && exclusionFor({ ...A, linkedDomains: ['www.b.co.il'] }, B, [], NOW) === 'already_linked')
  check('never across languages', exclusionFor(A, { ...B, language: 'en' }, [], NOW) === 'language')

  // Thin / new / Shopify.
  check('never a new site (created 5 days ago)', siteQualifies({ ...B, createdAt: '2026-09-15T00:00:00Z' }, NOW) === 'thin_or_new')
  check('never a thin site (1 published article, 4 pages)', siteQualifies({ ...B, publishedArticles: 1, indexedPages: 4 }, NOW) === 'thin_or_new')
  check('never a site without a finished scan', siteQualifies({ ...B, scanned: false }, NOW) === 'thin_or_new')
  check('ten indexed pages are enough content', siteQualifies({ ...B, publishedArticles: 0, indexedPages: 10 }, NOW) === null)
  const thinMut = withMutant(RULES, (s) => s.replace('if (young || thin || !site.scanned', 'if (young || !site.scanned'), (m) => m.siteQualifies({ ...B, publishedArticles: 1, indexedPages: 4 }, NOW))
  check('MUTATION CONTROL: content bar removed → a thin site qualifies → caught', thinMut === null, String(thinMut))
  // Oren 2026-10-06: a Shopify store takes part like any other site (its links go into the articles we publish to its blog).
  check('a Shopify store qualifies like any other site, as a target', exclusionFor(A, { ...B, shopify: true }, [], NOW) === null)
  check('a Shopify store qualifies like any other site, as a source', sourceExclusion({ ...A, shopify: true }, [], NOW) === null)
  const shopRuleMut = withMutant(RULES, (s) => s.replace("  if (!site.active) return 'not_member'\n", "  if (!site.active) return 'not_member'\n  if (site.shopify) return 'not_member'\n"), (m) => m.sourceExclusion({ ...A, shopify: true }, [], NOW))
  check('MUTATION CONTROL: a Shopify exclusion put back → caught', shopRuleMut === 'not_member', String(shopRuleMut))
  check('never a site that left (not active)', exclusionFor(A, { ...B, active: false }, [], NOW) === 'not_member')

  // Domain control: typing a domain into a project proves nothing.
  check('a site without proof of its domain never qualifies (giving or receiving)', siteQualifies({ ...B, verifiedDomains: [] }, NOW) === 'domain_unverified'
    && exclusionFor(A, { ...B, verifiedDomains: [] }, [], NOW) === 'domain_unverified' && sourceExclusion({ ...A, verifiedDomains: [] }, [], NOW) === 'domain_unverified')
  check('an alias proven, the site\'s own domain not: still unverified', siteQualifies({ ...B, domains: ['b.co.il', 'b-alias.co.il'], verifiedDomains: ['b-alias.co.il'] }, NOW) === 'domain_unverified')
  const domMut = withMutant(RULES, (s) => s.replace("if (site.domains.length > 0 && !site.verifiedDomains.includes(site.domains[0])) return 'domain_unverified'", ''), (m) => m.siteQualifies({ ...B, verifiedDomains: [] }, NOW))
  check('MUTATION CONTROL: domain-control check removed → a stranger\'s domain qualifies → caught', domMut === null, String(domMut))
  const noProof = { hosts: [], gscProperties: [] }
  check('provenDomains: a connected site on the exact host (www aside) proves it', provenDomains(['b.co.il'], { ...noProof, hosts: ['https://www.b.co.il/'] }).join() === 'b.co.il')
  check('provenDomains: a lookalike or a parent/sub host proves nothing', provenDomains(['b.co.il'], { ...noProof, hosts: ['https://notb.co.il/', 'https://blog.b.co.il/', 'https://co.il/'] }).length === 0)
  check('provenDomains: a verified Search Console property covering the domain proves it (domain and URL-prefix)',
    provenDomains(['b.co.il'], { ...noProof, gscProperties: [{ siteUrl: 'sc-domain:b.co.il', permissionLevel: 'siteOwner' }] }).length === 1
    && provenDomains(['b.co.il'], { ...noProof, gscProperties: [{ siteUrl: 'https://www.b.co.il/', permissionLevel: 'siteFullUser' }] }).length === 1)
  check('provenDomains: an unverified property, or one for another site, proves nothing',
    provenDomains(['b.co.il'], { ...noProof, gscProperties: [{ siteUrl: 'sc-domain:b.co.il', permissionLevel: 'siteUnverifiedUser' }, { siteUrl: 'sc-domain:x.co.il', permissionLevel: 'siteOwner' }] }).length === 0)
  const unvMut = withMutant(RULES, (s) => s.replace('p.siteUrl && !isUnverifiedPermission(p.permissionLevel)', 'p.siteUrl'),
    (m) => m.provenDomains(['b.co.il'], { ...noProof, gscProperties: [{ siteUrl: 'sc-domain:b.co.il', permissionLevel: 'siteUnverifiedUser' }] }).length)
  check('MUTATION CONTROL: unverified Search Console property accepted → caught', unvMut === 1, String(unvMut))
  const hostMut = withMutant(RULES, (s) => s.replace('return hosts.has(bare) ||', 'return [...hosts].some((h) => h.endsWith(bare)) ||'),
    (m) => m.provenDomains(['b.co.il'], { ...noProof, hosts: ['https://notb.co.il/'] }).length)
  check('MUTATION CONTROL: host matched by suffix, not exactly → a lookalike proves it → caught', hostMut === 1, String(hostMut))

  // Caps and the ramp.
  const newcomer = { ...B, memberSince: '2026-09-03T00:00:00Z' }
  check('ramp: a new member receives at most 1 link in its first month', receivedCapFor(newcomer, NOW) === 1
    && exclusionFor(A, newcomer, [edge('c', 'b', '2026-09-10T00:00:00Z')], NOW) === 'target_month_cap')
  check('ramp: 2 in the second month, 3 after that', receivedCapFor({ memberSince: '2026-08-10T00:00:00Z' }, NOW) === 2 && receivedCapFor({ memberSince: '2026-05-01T00:00:00Z' }, NOW) === 3)
  const threeThisMonth = ['x', 'y', 'z'].map((s) => edge(s, 'b', '2026-09-05T00:00:00Z'))
  check('a veteran target with 3 links this month gets no fourth', exclusionFor(A, B, threeThisMonth, NOW) === 'target_month_cap')
  check('last month\'s links do not count this month', exclusionFor(A, B, ['x', 'y', 'z'].map((s) => edge(s, 'b', '2026-08-05T00:00:00Z')), NOW) === null)
  const capMut = withMutant(RULES, (s) => s.replace("if (receivedThisMonth >= receivedCapFor(target, now)) return 'target_month_cap'", ''), (m) => ex(m, A, B, threeThisMonth))
  check('MUTATION CONTROL: target monthly cap removed → caught', capMut === null, String(capMut))
  const rampMut = withMutant(RULES, (s) => s.replace('receivedPerMonthRamp: [1, 2, 3]', 'receivedPerMonthRamp: [3, 3, 3]'), (m) => m.receivedCapFor(newcomer, NOW))
  check('MUTATION CONTROL: no ramp for new members → caught', rampMut !== 1, String(rampMut))
  const given4 = ['b', 'c', 'd', 'e'].map((t) => edge('a', t, '2026-09-04T00:00:00Z'))
  check('a source gives at most 4 links a month', sourceExclusion(A, given4, NOW) === 'source_month_cap' && sourceExclusion(A, given4.slice(0, 3), NOW) === null)
  const giveMut = withMutant(RULES, (s) => s.replace("return given >= LINK_NETWORK_RULES.maxGivenPerMonth ? 'source_month_cap' : null", 'return null'), (m) => m.sourceExclusion(A, given4, NOW))
  check('MUTATION CONTROL: source monthly cap removed → caught', giveMut === null, String(giveMut))

  // Exact-match anchors are rare.
  check('the first link to a target is never exact-match', !exactAnchorAllowed('b', []))
  check('one exact anchor in five is the most', exactAnchorAllowed('b', ['x', 'y', 'z', 'w'].map((s) => edge(s, 'b')))
    && !exactAnchorAllowed('b', [...['x', 'y', 'z', 'w'].map((s) => edge(s, 'b')), edge('v', 'b', undefined, 'exact')]))
  const exactMut = withMutant(RULES, (s) => s.replace('maxExactShare: 0.2', 'maxExactShare: 1'), (m) => m.exactAnchorAllowed('b', []))
  check('MUTATION CONTROL: exact share lifted → caught', exactMut === true)

  // Fairness order.
  const order = eligibleTargets(A, [B, C], [edge('x', 'b', '2026-09-01T00:00:00Z')], NOW).eligible.map((s) => s.projectId)
  check('the member with fewer links this month comes first', order[0] === 'c', order.join(','))
  check('the real exclusionFor is the one under test', real.exclusionFor === exclusionFor)
}

// ── B. where and how the link is written ────────────────────────────────────
const LONG = 'לפני שבוחרים ספק לאירוע כדאי לבדוק מה כלול במחיר, מי מגיע ביום עצמו ומה קורה אם משהו משתנה ברגע האחרון.'
const ARTICLE = [
  `<p>פתיחה: ${LONG}</p>`,
  '<h2>תכנון האירוע</h2>',
  `<p>כשמתכננים חתונה בחצר, עיצוב פנים של אוהל האירוע משנה את כל האווירה. ${LONG}</p>`,
  `<ul><li><p>ברשימה: עיצוב פנים של אוהל האירוע ${LONG}</p></li></ul>`,
  `<blockquote><p>ציטוט: עיצוב פנים של אוהל האירוע ${LONG}</p></blockquote>`,
  `<p>כבר יש כאן <a href="https://x.co.il/">קישור</a> ${LONG}</p>`,
  '<p>קצר מדי.</p>',
  `<p>פסקה נוספת על תפריט הקייטרינג לאירועים, שכדאי לסגור מוקדם. ${LONG}</p>`,
  `<p>סיכום: ${LONG}</p>`,
].join('\n')

function partB() {
  console.log('\nB. where and how the link is written')
  const paras = bodyParagraphs(ARTICLE)
  const texts = paras.map((p) => p.text)
  check('body paragraphs: the two eligible ones only', paras.length === 2 && texts[0].startsWith('כשמתכננים') && texts[1].startsWith('פסקה נוספת'), texts.map((t) => t.slice(0, 12)).join(' | '))
  check('never the first or last paragraph, a list item, a quote, a paragraph with a link, or a short one',
    !texts.some((t) => /^(פתיחה|סיכום|ברשימה|ציטוט|כבר יש|קצר)/.test(t)))
  const liMut = withMutant('lib/link-network/anchor.ts', (s) => s.replace("const CONTAINERS = ['li', 'ul', 'ol', 'blockquote',", "const CONTAINERS = ["), (m) => m.bodyParagraphs(ARTICLE).length)
  check('MUTATION CONTROL: lists and quotes allowed → caught', liMut > 2, String(liMut))
  const firstMut = withMutant('lib/link-network/anchor.ts', (s) => s.replace('for (const p of all.slice(1, -1))', 'for (const p of all)'), (m) => m.bodyParagraphs(ARTICLE).map((p: any) => p.text).some((t: string) => t.startsWith('פתיחה')))
  check('MUTATION CONTROL: first paragraph allowed → caught', firstMut === true)

  const target = 'https://b.co.il/tents/'
  const follow = insertLink(ARTICLE, paras[0], 'עיצוב פנים של אוהל האירוע', target, 'follow')
  check('the link wraps the words where they stand, in that paragraph', !!follow && follow.includes('<a href="https://b.co.il/tents/">עיצוב פנים של אוהל האירוע</a> משנה'))
  check('only one link was added, and no other character changed', !!follow && (follow.match(/<a /g) || []).length === 2 && removeLink(follow, target) === ARTICLE)
  check('no footprint: no class, id, data or target attribute on the link', !!follow && !/<a href="https:\/\/b\.co\.il\/tents\/"[^>]*(class|id|data-|target)=/.test(follow))
  const nofollow = insertLink(ARTICLE, paras[0], 'עיצוב פנים של אוהל האירוע', target, 'nofollow')
  check('nofollow mode writes rel="nofollow"; follow mode writes no rel', !!nofollow && nofollow.includes('<a href="https://b.co.il/tents/" rel="nofollow">') && !/rel=/.test(follow!.match(/<a href="https:\/\/b\.co\.il\/tents\/"[^>]*>/)![0]))
  check('words that are not in the paragraph are never linked (no invented text)', insertLink(ARTICLE, paras[0], 'מילים שלא קיימות כאן', target, 'follow') === null)
  check('words only in another paragraph are not linked here', insertLink(ARTICLE, paras[0], 'תפריט הקייטרינג לאירועים', target, 'follow') === null)
  check('part of a word is never linked', insertLink('<p>a</p><p>התכנון המוקדם של האירוע הוא חשוב מאוד כדי שהכול יעבור בשלום ובלי הפתעות בכלל ובעיקר ביום עצמו</p><p>z</p>',
    bodyParagraphs('<p>a</p><p>התכנון המוקדם של האירוע הוא חשוב מאוד כדי שהכול יעבור בשלום ובלי הפתעות בכלל ובעיקר ביום עצמו</p><p>z</p>')[0], 'תכנון המוקדם', target, 'follow') === null)
  check('linkPresent / linkContext find the placed link and its sentence', linkPresent(follow, target) && (linkContext(follow, target) ?? '').includes('עיצוב פנים של אוהל האירוע'))
  const punct = '<p>כשעוברים דירה כדאי <a href="https://c.co.il/x">לבדוק את הצנרת</a>, כי <strong>מים</strong> חמים לא עוזרים.</p>'
  const punctWant = 'כשעוברים דירה כדאי לבדוק את הצנרת, כי מים חמים לא עוזרים.'
  check('linkContext keeps punctuation next to the link text (inline tags leave no space)', linkContext(punct, 'https://c.co.il/x') === punctWant)
  const punctMut = withMutant('lib/link-network/anchor.ts', (s) => s.replace(".replace(INLINE_TAG, '')", ''), (m) => m.linkContext(punct, 'https://c.co.il/x'))
  check('mutation control: stripping inline tags with a space splits "הצנרת ," (guard fails)', punctMut !== punctWant, String(punctMut))

  check('validAnchor: 2-8 words', validAnchor('עיצוב פנים') && !validAnchor('עיצוב') && !validAnchor('אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע'))
  check('validAnchor: never "click here" / "לחצו כאן"', !validAnchor('לחצו כאן') && !validAnchor('click here') && !validAnchor('Read more.'))
  const brand = { brandTerms: ['אוהלי הצפון', 'ohaley'], keywords: ['השכרת אוהלים לאירועים'] }
  check('classifyAnchor: branded / exact / partial / natural',
    classifyAnchor('האוהלים של אוהלי הצפון', brand) === 'branded'
    && classifyAnchor('השכרת אוהלים לאירועים', brand) === 'exact'
    && classifyAnchor('השכרת אוהלים לחתונה', brand) === 'partial'
    && classifyAnchor('עיצוב פנים של אוהל האירוע', brand) === 'natural')
  const exMut = withMutant('lib/link-network/anchor.ts', (s) => s.replace("if (keys.some((k) => k === a)) return 'exact'", ''), (m) => m.classifyAnchor('השכרת אוהלים לאירועים', brand))
  check('MUTATION CONTROL: exact match not recognised → caught', exMut !== 'exact', String(exMut))
}

// ── C. the model's answer is checked ────────────────────────────────────────
function partC() {
  console.log('\nC. the model\'s answer is checked')
  const paras = bodyParagraphs(ARTICLE)
  const targets: CandidateTarget[] = [{ projectId: 'b', businessName: 'אוהלי הצפון', domain: 'b.co.il', category: 'השכרת אוהלים', description: null, pages: [{ url: 'https://b.co.il/tents/', title: 'אוהלים לחתונה' }] }]
  const ans = (o: Record<string, unknown>) => JSON.stringify({ place: true, paragraph: paras[0].index, page: 'T1P1', anchor: 'עיצוב פנים של אוהל האירוע', relevance: 85, complementary: true, ...o })
  const ok = readChoice(ans({}), paras, targets)
  check('a sound answer is accepted', ok.ok && ok.choice.page.url === 'https://b.co.il/tents/')
  const code = (r: ReturnType<typeof readChoice>) => (r.ok ? 'ok' : r.skip)
  check('below the relevance threshold → skip, never forced', code(readChoice(ans({ relevance: 55 }), paras, targets)) === 'low_relevance')
  const thrMut = withMutant('lib/link-network/choose.ts', (s) => s.replace('if (relevance < LINK_NETWORK_RULES.minRelevance || relevance > 100)', 'if (relevance > 100)'), (m) => m.readChoice(ans({ relevance: 55 }), paras, targets).ok)
  check('MUTATION CONTROL: threshold removed → a weak fit is placed → caught', thrMut === true)
  check('not complementary → skip', code(readChoice(ans({ complementary: false }), paras, targets)) === 'not_complementary')
  check('the model declining → skip', code(readChoice(JSON.stringify({ place: false, relevance: 0, complementary: false }), paras, targets)) === 'model_declined')
  check('an anchor that is not literally in the paragraph → skip', code(readChoice(ans({ anchor: 'אוהלים יפים במיוחד' }), paras, targets)) === 'anchor_not_in_paragraph')
  const litMut = withMutant('lib/link-network/choose.ts', (s) => s.replace("if (!paragraph.text.toLowerCase().includes(anchor.toLowerCase())) return { ok: false, skip: 'anchor_not_in_paragraph' }", ''), (m) => m.readChoice(ans({ anchor: 'אוהלים יפים במיוחד' }), paras, targets).ok)
  check('MUTATION CONTROL: literal-anchor check removed → invented words accepted → caught', litMut === true)
  check('a page that was not offered → skip', code(readChoice(ans({ page: 'T2P1' }), paras, targets)) === 'unknown_page')
  check('a paragraph that was not offered (the first one) → skip', code(readChoice(ans({ paragraph: 0 }), paras, targets)) === 'unknown_paragraph')
  check('garbage → skip', code(readChoice('not json', paras, targets)) === 'invalid_answer' && code(readChoice(null, paras, targets)) === 'invalid_answer')
}

// ── D. the placement step on the in-memory database ─────────────────────────
const U_S = '10000000-0000-0000-0000-000000000001'
const P = {
  S: 'a0000000-0000-0000-0000-000000000001',  // source: interior designer
  OK: 'a0000000-0000-0000-0000-000000000002', // tents rental: complementary
  SAME: 'a0000000-0000-0000-0000-000000000003', // another interior designer
  COMP: 'a0000000-0000-0000-0000-000000000004', // listed competitor
  SHOP: 'a0000000-0000-0000-0000-000000000005', // Shopify store
  REC: 'a0000000-0000-0000-0000-000000000006', // already linked to the source
  NEW: 'a0000000-0000-0000-0000-000000000007', // created 3 days ago
}
const ART = 'e0000000-0000-0000-0000-000000000001'
const ids = Object.values(P)
function networkDb(over: { hooks?: Record<string, any>; sourceMember?: boolean; articleStatus?: string; unconnected?: string[] } = {}) {
  const user = (id: string) => (id === P.S ? U_S : `20000000-0000-0000-0000-00000000000${ids.indexOf(id)}`)
  const cat: Record<string, string> = { [P.S]: 'עיצוב פנים', [P.OK]: 'השכרת אוהלים לאירועים', [P.SAME]: 'עיצוב פנים לבתים', [P.COMP]: 'נגרות', [P.SHOP]: 'כלי בית', [P.REC]: 'צילום', [P.NEW]: 'פרחים' }
  const domain = (id: string) => `site${ids.indexOf(id)}.co.il`
  const db = new FakeAdmin({
    link_network_settings: [{ id: 1, link_rel: 'follow' }],
    projects: ids.map((id) => ({ id, user_id: user(id), client_id: null, target_domain: domain(id), domain_aliases: [], language: 'he',
      created_at: id === P.NEW ? '2026-09-17T00:00:00Z' : OLD, is_active: true, business_name: `עסק ${ids.indexOf(id)}`, ai_business_profile: null })),
    link_network_members: ids.map((id) => ({ project_id: id, user_id: user(id), active: id === P.S ? over.sourceMember !== false : true,
      consent_version: 'v', consented_at: '2026-05-01T00:00:00Z', consent_link_rel: 'follow', left_at: null })),
    project_profiles: ids.map((id) => ({ project_id: id, niche: cat[id], description: null, detected_platform: id === P.SHOP ? 'Shopify' : 'WordPress' })),
    shopify_connections: [],
    billing_governance: [],
    ai_visibility_competitors: [{ project_id: P.S, domain: domain(P.COMP), is_active: true }],
    project_seed_runs: ids.map((id) => ({ project_id: id, status: 'done', summary: null, created_at: OLD })),
    site_crawl_index: [],
    wordpress_content_index: [],
    generated_articles: [
      { id: ART, project_id: P.S, user_id: U_S, title: 'איך מעצבים אוהל לחתונה', status: over.articleStatus ?? 'draft', wp_post_url: null, content_html: ARTICLE },
      ...ids.flatMap((id) => [1, 2, 3].map((n) => ({
        id: `e0000000-0000-0000-0000-0000000${ids.indexOf(id)}00${n}`, project_id: id, user_id: user(id), title: `עמוד ${n} של ${domain(id)}`, status: 'published',
        wp_post_url: `https://${domain(id)}/page-${n}/`,
        content_html: id === P.REC && n === 1 ? `<p>ראו <a href="https://${domain(P.S)}/">עיצוב</a></p>` : '<p>x</p>',
      }))),
    ],
    tracking_targets: [{ project_id: P.OK, keyword: 'השכרת אוהלים לאירועים' }, { project_id: P.OK, keyword: 'תפריט קייטרינג לאירועים' }],
    link_network_placements: [],
    // Proof of domain control: a tested WordPress connection on each site's own host.
    wordpress_connections: ids.filter((id) => !(over.unconnected ?? []).includes(id)).map((id) => ({ project_id: id, user_id: user(id), site_url: `https://www.${domain(id)}`, connection_status: 'connected' })),
  }, over.hooks ?? {})
  return db
}
function placeDeps(answer: (prompt: string) => string | null, extra: Partial<PlaceDeps> = {}): PlaceDeps & { prompts: string[] } {
  const prompts: string[] = []
  return {
    prompts,
    ask: async (prompt) => { prompts.push(prompt); return answer(prompt) },
    resolve: async () => [],
    now: () => NOW,
    env: {},
    ...extra,
  }
}
const goodAnswer = (prompt: string) => {
  const t = /T(\d+): [^\n]*\(site1\.co\.il\)/.exec(prompt)
  const para = /\[P(\d+)\] כשמתכננים/.exec(prompt)
  return JSON.stringify({ place: true, paragraph: Number(para?.[1] ?? -1), page: `T${t?.[1] ?? 9}P1`, anchor: 'עיצוב פנים של אוהל האירוע', relevance: 88, complementary: true })
}

async function partD() {
  console.log('\nD. the placement step')
  const input = { projectId: P.S, userId: U_S, articleId: ART }
  const db = networkDb()
  const deps = placeDeps(goodAnswer)
  const r = await placeNetworkLink(db as any, input, deps)
  check('a member article gets one link to the complementary member', r.outcome === 'placed' && r.targetProjectId === P.OK, JSON.stringify(r))
  const prompt = deps.prompts[0] ?? ''
  check('the model is shown only allowed members (the Shopify store among them): not the same category, the competitor, the already-linked or the new site',
    prompt.includes('site1.co.il') && prompt.includes('site4.co.il') && !['site2.co.il', 'site3.co.il', 'site5.co.il', 'site6.co.il'].some((d) => prompt.includes(d)), prompt.slice(0, 200))
  const row = db.tables.link_network_placements[0] as any
  check('the log row: source article, target url, anchor, link type, anchor kind, relevance, time',
    row?.source_article_id === ART && row.target_url === 'https://site1.co.il/page-1/' && row.anchor_text === 'עיצוב פנים של אוהל האירוע'
    && row.link_rel === 'follow' && row.anchor_kind === 'natural' && row.relevance === 88 && row.placed_at === NOW.toISOString() && row.status === 'placed', JSON.stringify(row))
  const html = (db.tables.generated_articles.find((a: any) => a.id === ART) as any).content_html as string
  check('the draft carries the link, in follow mode without rel', html.includes('<a href="https://site1.co.il/page-1/">עיצוב פנים של אוהל האירוע</a>'))
  const again = await placeNetworkLink(db as any, input, placeDeps(goodAnswer))
  check('one link per article: a second run skips', again.outcome === 'skipped' && again.reason === 'article_cap', JSON.stringify(again))
  const capMut = await withMutantAsync('lib/link-network/place.ts', (s) => s.replace("if (already.length) return skipped('article_cap')", ''), async (m) => {
    const out = await m.placeNetworkLink(db, input, placeDeps(goodAnswer))
    return out.outcome === 'skipped' ? out.reason : out.outcome
  })
  check('MUTATION CONTROL: per-article cap removed → the second run reaches the model → caught', capMut !== 'article_cap', String(capMut))

  const notMember = networkDb({ sourceMember: false })
  const nm = await placeNetworkLink(notMember as any, input, placeDeps(goodAnswer))
  check('a project that did not join gives nothing (and nothing is asked)', nm.outcome === 'skipped' && nm.reason === 'not_member' && notMember.tables.link_network_placements.length === 0)

  const weak = networkDb()
  const w = await placeNetworkLink(weak as any, input, placeDeps(() => JSON.stringify({ place: true, paragraph: 2, page: 'T1P1', anchor: 'עיצוב פנים של אוהל האירוע', relevance: 40, complementary: true })))
  check('a weak fit writes nothing: no log row, the draft unchanged', w.outcome === 'skipped' && weak.tables.link_network_placements.length === 0
    && (weak.tables.generated_articles.find((a: any) => a.id === ART) as any).content_html === ARTICLE)

  const missing = networkDb({ hooks: { link_network_settings: { select: () => ({ code: 'PGRST205' }) } } })
  const mm = await placeNetworkLink(missing as any, input, placeDeps(goodAnswer))
  check('without the tables the step does nothing ("unavailable")', mm.outcome === 'skipped' && mm.reason === 'unavailable')

  const published = networkDb({ articleStatus: 'published' })
  check('a published article is never touched', (await placeNetworkLink(published as any, input, placeDeps(goodAnswer))).outcome === 'skipped')

  const sameIp = networkDb()
  const ipDeps = placeDeps(goodAnswer, { resolve: async () => ['9.9.9.9'] })
  const ip = await placeNetworkLink(sameIp as any, input, ipDeps)
  check('sites on the same server address are never linked', ip.outcome === 'skipped' && ip.reason === 'no_eligible_member' && ipDeps.prompts.length === 0, JSON.stringify(ip))

  const refused = networkDb({ hooks: { link_network_placements: { insert: () => ({ code: '23514' }) } } })
  const rf = await placeNetworkLink(refused as any, input, placeDeps(goodAnswer))
  check('the database\'s reciprocal refusal (race) is a skip, and the draft is untouched', rf.outcome === 'skipped' && rf.reason === 'db_rule'
    && (refused.tables.generated_articles.find((a: any) => a.id === ART) as any).content_html === ARTICLE)

  const exactDb = networkDb()
  const exact = await placeNetworkLink(exactDb as any, input, placeDeps((p) => {
    const t = /T(\d+): [^\n]*\(site1\.co\.il\)/.exec(p)
    const para = /\[P(\d+)\] פסקה נוספת/.exec(p)
    return JSON.stringify({ place: true, paragraph: Number(para?.[1]), page: `T${t?.[1]}P1`, anchor: 'תפריט הקייטרינג לאירועים', relevance: 90, complementary: true })
  }))
  check('an anchor is classified against the target\'s keywords (partial here) and logged', exact.outcome === 'placed' && (exactDb.tables.link_network_placements[0] as any)?.anchor_kind === 'partial', JSON.stringify(exact))

  const broken = networkDb()
  const flaky = { from: (t: string) => { if (t === 'link_network_members') throw new Error('db down'); return broken.from(t) } }
  const thrown = await runLinkNetworkStep(flaky as any, input, placeDeps(goodAnswer))
  check('the generation hook never throws (a database that throws is a skip)', thrown.outcome === 'skipped' && thrown.reason === 'error', JSON.stringify(thrown))
  const askThrows = await runLinkNetworkStep(networkDb() as any, input, placeDeps(() => { throw new Error('provider said: secret') }))
  check('…nor when the model call throws', askThrows.outcome === 'skipped' && askThrows.reason === 'error')
}

// ── E. the routes ───────────────────────────────────────────────────────────
function routeDeps(userId: string | null, db: any): NetworkDeps {
  return { session: async () => ({ userId }), admin: () => db, now: () => NOW }
}
const jsonReq = (body: unknown) => new Request('http://x/y', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function partE() {
  console.log('\nE. the routes')
  const db = networkDb()
  await placeNetworkLink(db as any, { projectId: P.S, userId: U_S, articleId: ART }, placeDeps(goodAnswer))
  const U_OK = (db.tables.projects.find((p: any) => p.id === P.OK) as any).user_id as string
  // The in-memory database numbers rows; the real one gives uuids (the routes accept uuids only).
  ;(db.tables.link_network_placements[0] as any).id = 'f0000000-0000-0000-0000-00000000000a'

  const own = await (await handleNetworkGet(P.S, routeDeps(U_S, db))).json() as any
  check('the giver sees its placement, waiting, with the sentence and a remove button',
    own.available === true && own.given.length === 1 && own.given[0].state === 'waiting' && own.given[0].canReject === true && (own.given[0].context ?? '').includes('עיצוב פנים של אוהל האירוע'))
  check('the member count is the network\'s size (7 active)', own.memberCount === 7, String(own.memberCount))
  check('the link type in force is part of the answer', own.linkRel === 'follow')

  const recv = await (await handleNetworkGet(P.OK, routeDeps(U_OK, db))).json() as any
  check('the receiver sees the link: on which words, to which page, when', recv.received.length === 1
    && recv.received[0].anchor === 'עיצוב פנים של אוהל האירוע' && recv.received[0].placedAt === NOW.toISOString())
  check('…but not which site gives it while the article is a draft (sourceDomain null)', recv.received[0].state === 'waiting' && recv.received[0].sourceDomain === null
    && !JSON.stringify(recv).includes('site0.co.il'), JSON.stringify(recv.received[0]))
  const domMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace("sourceDomain: state === 'published' ? p.source_domain : null,", 'sourceDomain: p.source_domain,'),
    async (m) => (await (await m.handleNetworkGet(P.OK, routeDeps(U_OK, db))).json()).received[0].sourceDomain)
  check('MUTATION CONTROL: the giving site shown for a draft → caught', domMut === 'site0.co.il', String(domMut))
  check('the giver\'s account id and article id never reach the receiver', !JSON.stringify(recv).includes(U_S) && !JSON.stringify(recv).includes(ART))
  const livePub = networkDbWithPlacement()
  const liveArt = livePub.tables.generated_articles.find((a: any) => a.id === ART) as any
  liveArt.status = 'published'; liveArt.wp_post_url = 'https://site0.co.il/tent/'
  const U_OK2 = (livePub.tables.projects.find((p: any) => p.id === P.OK) as any).user_id as string
  const liveRecv = (await (await handleNetworkGet(P.OK, routeDeps(U_OK2, livePub))).json() as any).received[0]
  check('once the giving article is live: the giving site, the page and the sentence', liveRecv?.state === 'published' && liveRecv.sourceDomain === 'site0.co.il'
    && liveRecv.liveUrl === 'https://site0.co.il/tent/' && (liveRecv.context ?? '').length > 0, JSON.stringify(liveRecv))
  const rejDb = networkDbWithPlacement()
  ;(rejDb.tables.link_network_placements[0] as any).status = 'rejected'
  ;(rejDb.tables.link_network_placements[0] as any).rejected_at = NOW.toISOString()
  const rejRecv = (await (await handleNetworkGet(P.OK, routeDeps(U_OK2, rejDb))).json() as any)
  check('a link the giver rejected is not in the receiver\'s list', rejRecv.received.length === 0 && !JSON.stringify(rejRecv).includes('site0.co.il'), JSON.stringify(rejRecv.received))
  const rejMutR = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace("receivedRows.filter((p) => p.status !== 'rejected').map(", 'receivedRows.map('),
    async (m) => (await (await m.handleNetworkGet(P.OK, routeDeps(U_OK2, rejDb))).json()).received.length)
  check('MUTATION CONTROL: rejected rows listed for the receiver → caught', rejMutR === 1, String(rejMutR))
  check('nothing of the giver\'s draft reaches the receiver (no title, no sentence, no address)', recv.received[0].context === null && recv.received[0].liveUrl === null
    && !JSON.stringify(recv).includes('איך מעצבים אוהל לחתונה'))
  const leakMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace("context: state === 'published' && a ? linkContext(a.content_html, p.target_url) : null,", 'context: a ? linkContext(a.content_html, p.target_url) : null,'),
    async (m) => (await (await m.handleNetworkGet(P.OK, routeDeps(U_OK, db))).json()).received[0].context)
  check('MUTATION CONTROL: the draft sentence shown to the receiver → caught', typeof leakMut === 'string' && leakMut.length > 0)

  check('another owner\'s project is a 404', (await handleNetworkGet(P.S, routeDeps(U_OK, db))).status === 404)
  check('no session is a 401', (await handleNetworkGet(P.S, routeDeps(null, db))).status === 401)
  const ownerMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace(".eq('id', projectId).eq('user_id', userId).limit(1)", ".eq('id', projectId).limit(1)").replace('if (!project || project.user_id !== userId) return', 'if (!project) return'),
    async (m) => (await m.handleNetworkGet(P.S, routeDeps(U_OK, db))).status)
  check('MUTATION CONTROL: project read without the owner filter → another owner\'s log opens → caught', ownerMut === 200)

  // Reject: only the giver, only before publishing.
  const pid = (db.tables.link_network_placements[0] as any).id as string
  check('the receiver cannot remove the giver\'s link (404)', (await handleRejectPost(jsonReq({}), P.OK, pid, routeDeps(U_OK, db))).status === 404
    && (await handleRejectPost(jsonReq({}), P.OK, 'f0000000-0000-0000-0000-000000000001', routeDeps(U_OK, networkDbWithPlacement()))).status === 404)
  const rejMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace(".eq('id', placementId).eq('source_project_id', project.id).eq('source_user_id', userId).limit(1)", ".eq('id', placementId).limit(1)").replace('if (!placement || placement.source_project_id !== project.id) return', 'if (!placement) return'),
    async (m) => (await m.handleRejectPost(jsonReq({}), P.OK, 'f0000000-0000-0000-0000-000000000001', routeDeps(U_OK, networkDbWithPlacement()))).status)
  check('MUTATION CONTROL: reject without the giver filter → the receiver removes it → caught', rejMut !== 404, String(rejMut))
  const ok = await handleRejectPost(jsonReq({}), P.S, pid, routeDeps(U_S, db))
  const html = (db.tables.generated_articles.find((a: any) => a.id === ART) as any).content_html
  check('the giver removes it before publishing: the words stay, the link goes, the log says rejected',
    ok.status === 200 && html === ARTICLE && (db.tables.link_network_placements[0] as any).status === 'rejected' && (db.tables.link_network_placements[0] as any).rejected_by === U_S)
  const after = await (await handleNetworkGet(P.S, routeDeps(U_S, db))).json() as any
  check('the log keeps the line, as "removed before publishing"', after.given[0].state === 'rejected' && after.given[0].canReject === false)

  const pub = networkDbWithPlacement()
  ;(pub.tables.generated_articles.find((a: any) => a.id === ART) as any).status = 'published'
  const pubId = (pub.tables.link_network_placements[0] as any).id
  check('a published article cannot be changed from here (409)', (await handleRejectPost(jsonReq({}), P.S, pubId, routeDeps(U_S, pub))).status === 409)

  // Membership: OFF by default, consent required, leave any time.
  const fresh = networkDb({ sourceMember: false })
  fresh.tables.link_network_members = fresh.tables.link_network_members.filter((m: any) => m.project_id !== P.S)
  const before = await (await handleNetworkGet(P.S, routeDeps(U_S, fresh))).json() as any
  check('before joining: switch off, the network size still shown', before.membership.active === false && before.memberCount === 6)
  check('joining without consent is refused', (await handleMembershipPost(jsonReq({ join: true }), P.S, routeDeps(U_S, fresh))).status === 400
    && (await handleMembershipPost(jsonReq({ join: true, consent: true, consentVersion: 'old' }), P.S, routeDeps(U_S, fresh))).status === 400
    && !fresh.tables.link_network_members.some((m: any) => m.project_id === P.S))
  const consentMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace("if (body.consent !== true || body.consentVersion !== LINK_NETWORK_CONSENT_VERSION) return refuse(400, 'consent_required')", ''),
    async (m) => (await m.handleMembershipPost(jsonReq({ join: true }), P.S, routeDeps(U_S, networkDb({ sourceMember: false })))).status)
  check('MUTATION CONTROL: consent check removed → joined without consent → caught', consentMut === 200)
  const joined = await handleMembershipPost(jsonReq({ join: true, consent: true, consentVersion: LINK_NETWORK_CONSENT_VERSION }), P.S, routeDeps(U_S, fresh))
  const row = fresh.tables.link_network_members.find((m: any) => m.project_id === P.S) as any
  check('joining with consent records who, when, which text and which link type', joined.status === 200 && row?.active === true && row.consented_by === U_S
    && row.consent_version === LINK_NETWORK_CONSENT_VERSION && row.consent_link_rel === 'follow' && row.consented_at === NOW.toISOString())
  const left = await handleMembershipPost(jsonReq({ join: false }), P.S, routeDeps(U_S, fresh))
  check('leaving: switch off, the consent record kept', left.status === 200 && row.active === false && row.left_at === NOW.toISOString() && row.consent_version === LINK_NETWORK_CONSENT_VERSION)
  check('a form post (not JSON) is refused', (await handleMembershipPost(new Request('http://x/y', { method: 'POST', body: 'join=true' }), P.S, routeDeps(U_S, fresh))).status === 400)

  // A Shopify store: shown and joinable like any other site (Oren 2026-10-06).
  const shop = networkDb()
  const U_SHOP = (shop.tables.projects.find((p: any) => p.id === P.SHOP) as any).user_id
  const shopAns = await (await handleNetworkGet(P.SHOP, routeDeps(U_SHOP, shop))).json() as any
  check('a Shopify project: the network is shown', shopAns.ok === true && shopAns.available === true, JSON.stringify(shopAns).slice(0, 200))
  check('a Shopify project can join', (await handleMembershipPost(jsonReq({ join: true, consent: true, consentVersion: LINK_NETWORK_CONSENT_VERSION }), P.SHOP, routeDeps(U_SHOP, shop))).status === 200)
  const billed = networkDb()
  billed.tables.billing_governance.push({ user_id: U_S, billing_authority: 'shopify' })
  check('an account billed by Shopify: the network is shown too', ((await (await handleNetworkGet(P.S, routeDeps(U_S, billed))).json()) as any).available === true)
  const httpMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace("    if (!me) return Response.json({ ok: true, available: false, reason: 'off' }", "    if (!me || me.site.shopify) return Response.json({ ok: true, available: false, reason: 'off' }"),
    async (m) => ((await (await m.handleNetworkGet(P.SHOP, routeDeps(U_SHOP, networkDb()))).json()) as any).available)
  check('MUTATION CONTROL: a Shopify store hidden again → caught', httpMut === false, String(httpMut))
  // Proof of domain control from the store itself: the connected store's own domains, as Shopify reported them.
  const storeProof = (row: Record<string, unknown>) => {
    const db = networkDb({ unconnected: [P.SHOP] })
    db.tables.shopify_connections.push({ project_id: P.SHOP, user_id: U_SHOP, shop_domain: 'site4-store.myshopify.com', storefront_domain: 'www.site4.co.il', connection_status: 'connected', archived_at: null, ...row })
    return db
  }
  const proven = async (db: any) => (await loadSites(db, [P.SHOP])).get(P.SHOP)!.site.verifiedDomains
  check('a connected store proves its own primary domain', (await proven(storeProof({}))).includes('site4.co.il'))
  check('a store connection that is not connected proves nothing', (await proven(storeProof({ connection_status: 'failed' }))).length === 0)
  check('an archived store connection proves nothing', (await proven(storeProof({ archived_at: '2026-10-01T00:00:00Z' }))).length === 0)
  check('another owner\'s store connection under the same project proves nothing', (await proven(storeProof({ user_id: U_S }))).length === 0)
  const proofMut = await withMutantAsync('lib/link-network/store.ts', (s) => s.replace('    if (!ownerOf.has(s.project_id) || s.user_id !== ownerOf.get(s.project_id)) continue\n', ''),
    async (m) => (await m.loadSites(storeProof({ user_id: U_S }), [P.SHOP])).get(P.SHOP).site.verifiedDomains)
  check('MUTATION CONTROL: the owner check on the store removed → another owner\'s store proves the domain → caught', Array.isArray(proofMut) && proofMut.length > 0, String(proofMut))
  const shopArticles = networkDb({ unconnected: [P.SHOP] })
  shopArticles.tables.shopify_connections.push({ project_id: P.SHOP, user_id: U_SHOP, shop_domain: 'site4-store.myshopify.com', storefront_domain: 'site4.co.il', connection_status: 'connected', archived_at: null })
  for (const a of shopArticles.tables.generated_articles as any[]) if (a.project_id === P.SHOP && a.status === 'published') { a.shopify_article_url = a.wp_post_url.replace('/page-', '/blogs/news/page-'); a.wp_post_url = null }
  const shopPages = (await loadSites(shopArticles, [P.SHOP])).get(P.SHOP)!.extras.pages.map((x) => x.url)
  check('a store\'s published articles are pages others may link to', shopPages.some((u) => u.includes('/blogs/news/page-')), shopPages.join(','))
  const noTables = networkDb({ hooks: { link_network_settings: { select: () => ({ code: '42P01' }) } } })
  const nt = await handleNetworkGet(P.S, routeDeps(U_S, noTables))
  check('without the tables: 200 { available: false } (hidden, not an error)', nt.status === 200 && ((await nt.json()) as any).available === false)
  check('the hidden answer says why: off without the tables', ((await (await handleNetworkGet(P.S, routeDeps(U_S, noTables))).json()) as any).reason === 'off')
  check('without the tables: joining is 409', (await handleMembershipPost(jsonReq({ join: true, consent: true, consentVersion: LINK_NETWORK_CONSENT_VERSION }), P.S, routeDeps(U_S, noTables))).status === 409)
  // The table itself: the receiving side cannot read the giver's ids through PostgREST
  // (executed proof: supabase/migrations/__qa__/link-network.probe.sql).
  const mig = read('supabase/migrations/20260929010000_link_network.sql').replace(/--.*$/gm, '')
  const placementsGrantOk = (sql: string) => {
    const tableWide = /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.link_network_placements\s+TO\s+authenticated/i.test(sql)
    const cols = /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+TABLE\s+public\.link_network_placements\s+TO\s+authenticated/i.exec(sql)?.[1] ?? ''
    const policy = /CREATE POLICY link_network_placements_\w+ ON public\.link_network_placements[\s\S]*?;/i.exec(sql)?.[0] ?? ''
    return !tableWide && !!cols && !/source_user_id|target_user_id|rejected_by/.test(cols) && !/target_project_id/.test(policy)
  }
  check('migration: placements are granted to browsers by column, no account ids, and the receiver has no read policy', placementsGrantOk(mig))
  check('MUTATION CONTROL: the old table-wide grant → caught', !placementsGrantOk(mig.replace(/GRANT SELECT \([^)]*\)\s*ON TABLE public\.link_network_placements TO authenticated/, 'GRANT SELECT ON TABLE public.link_network_placements TO authenticated')))
  check('MUTATION CONTROL: the target-side read clause back → caught', !placementsGrantOk(mig.replace("USING (source_project_id IN", "USING (target_project_id IN (SELECT 1) OR source_project_id IN")))
  const errText = JSON.stringify(await (await handleNetworkGet(P.S, routeDeps(U_S, networkDb({ hooks: { link_network_placements: { select: () => ({ code: 'XX000', message: 'relation secret exploded' }) } } })))).json())
  check('a database failure answers a code, never the database text', /"code":"internal"/.test(errText) && !/secret|exploded/.test(errText))
}

function networkDbWithPlacement() {
  const db = networkDb()
  const html = insertLink(ARTICLE, bodyParagraphs(ARTICLE)[0], 'עיצוב פנים של אוהל האירוע', 'https://site1.co.il/page-1/', 'follow')!
  ;(db.tables.generated_articles.find((a: any) => a.id === ART) as any).content_html = html
  db.tables.link_network_placements.push({
    id: 'f0000000-0000-0000-0000-000000000001', source_project_id: P.S, source_user_id: U_S, source_article_id: ART, source_domain: 'site0.co.il',
    target_project_id: P.OK, target_user_id: (db.tables.projects.find((p: any) => p.id === P.OK) as any).user_id, target_url: 'https://site1.co.il/page-1/',
    anchor_text: 'עיצוב פנים של אוהל האירוע', link_rel: 'follow', anchor_kind: 'natural', relevance: 88, status: 'placed', placed_at: NOW.toISOString(), rejected_at: null,
  })
  return db
}

// ── F. the one call site ────────────────────────────────────────────────────
function partF() {
  console.log('\nF. the one call site in article generation')
  const count = (src: string) => (strip(src).match(/runLinkNetworkStep\(/g) || []).length
  const gen = read('lib/content/article-generation.ts')
  check('article generation calls the network step exactly once', count(gen) === 1)
  check('…with the saved draft\'s id, the project and its owner', /runLinkNetworkStep\(admin, \{ projectId, userId, articleId: inserted\.id \}\)/.test(strip(gen)))
  check('MUTATION CONTROL: a second call site → caught', count(gen + '\nrunLinkNetworkStep(admin, x)') !== 1)
  const others = ['lib/content/automation/generate-item.ts', 'lib/content/automation/publish-item.ts', 'lib/content/wordpress-publish.ts'].filter((f) => /link-network/.test(read(f)))
  check('no other content file reaches into the network', others.length === 0, others.join(', '))
  const step = strip(read('lib/link-network/step.ts'))
  check('the step uses the app\'s existing model helper, not a new provider', /generateRecommendationJSON/.test(step) && !/openai|anthropic|new GoogleGenAI|GoogleGenerativeAI/i.test(step))
}

// ── G. the screen ───────────────────────────────────────────────────────────
function partG() {
  console.log('\nG. the screen')
  const screen = strip(read('components/site-links/network/SiteLinksScreen.tsx'))
  // Wave 9 (owner): the network never vanishes. With no network here, its place at the top says why
  // (NetworkUnavailable, no switch); the outreach hero that used to lead is gone (lib/__qa__/w9-links.qa.ts A1).
  check('hidden network → its place at the top says why (NetworkUnavailable), no switch', /top=\{<NetworkUnavailable reason=\{load\.reason\}/.test(screen) && !/Switch/.test(strip(read('components/site-links/network/NetworkUnavailable.tsx'))))
  check('the page renders the screen', /SiteLinksScreen/.test(read('app/(dashboard)/site-links/page.tsx')))
  const files = ['components/site-links/network/SiteLinksScreen.tsx', 'components/site-links/network/NetworkPanel.tsx', 'components/site-links/network/PlacementLog.tsx', 'components/site-links/network/shared.ts', 'components/site-links/network/NetworkHow.tsx', 'components/site-links/network/NetworkUnavailable.tsx']
  const bad = files.filter((f) => /window\.confirm|\balert\(|confirm\(\s*['"`]/.test(strip(read(f))))
  check('no window.confirm or alert() (useConfirm and toasts)', bad.length === 0, bad.join(', '))
  const literal = files.filter((f) => /[א-ת]/.test(strip(read(f))))
  check('no literal Hebrew in the screen: every word from the dictionary', literal.length === 0, literal.join(', '))
  check('MUTATION CONTROL: a literal Hebrew word → caught', /[א-ת]/.test(strip("const x = 'הסרה'")))
  const raw = files.filter((f) => /\b(bg|text|border|ring)-(slate|gray|blue|red|green|zinc|neutral)-\d{2,3}\b/.test(read(f)))
  check('design tokens only (no raw palette colours)', raw.length === 0, raw.join(', '))
  const panel = strip(read('components/site-links/network/NetworkPanel.tsx'))
  check('joining sends the explicit consent and its version; leaving asks first (danger)', /consent: true, consentVersion: data\.consentVersion/.test(panel) && /tone: 'danger'/.test(panel))
  check('the switch and the consent say which link type is in force', (panel.match(/copy\.linkType\[data\.linkRel\]/g) || []).length >= 2)
  const log = strip(read('components/site-links/network/PlacementLog.tsx'))
  check('server text never reaches the screen (status codes → dictionary words only)', !/\.json\(\)/.test(log) && !/body\.error|\.message/.test(log + panel))
  const terms = read('app/(public)/terms/page.tsx'), termsEn = read('app/(public)/en/terms/page.tsx')
  // THIS GUARD HAS BEEN WRONG TWICE, in opposite directions, so the reasoning
  // is written out rather than left to the next reader.
  //
  // First it required the heading to be marked "draft wording, under review".
  // That was removed because the terms are a live, binding document, and a
  // clause telling a customer the company has not settled its own wording
  // leaves neither side able to say what was agreed.
  //
  // Then it required the terms to state the network "is not active today". That
  // was false, and the guard was pinning the falsehood in place: the three
  // link_network tables exist in production, a project is already an active
  // member, placeNetworkLink is called from lib/content/article-generation.ts
  // through step.ts, and no LINK_NETWORK_DISABLED kill switch is set. Nothing
  // but a per-project opt-in stands between a member and a placed link. A
  // clause that disclaims its own application would have left a link we placed
  // with no contractual basis at all — the opposite of what the clause is for.
  //
  // So what is pinned now is the true and binding statement: the clause applies
  // from the moment a project opts in. The old sentence is asserted GONE, in
  // both languages, so it cannot come back by a revert.
  check('the terms carry the network section, in both languages, applying from the moment a project joins',
    /id="link-network"/.test(terms) && /חל מהרגע שבחרתם להצטרף/.test(terms)
    && /id="link-network"/.test(termsEn) && /applies from the moment you choose to join/.test(termsEn))
  check('the terms no longer claim the network is inactive, because it is not',
    !/השירות אינו פעיל כיום/.test(terms) && !/service is not active today/i.test(termsEn))
  check('MUT: dropping the "applies on joining" statement is caught',
    !(/חל מהרגע שבחרתם להצטרף/.test(terms.replace('חל מהרגע שבחרתם להצטרף', 'x'))))
  check('MUT: the old not-active sentence coming back is caught',
    /service is not active today/i.test(`${termsEn} The service is not active today`))
}

// ── H. domain control, from the stored connections ─────────────────────────
async function partH() {
  console.log('\nH. domain control')
  const STORE = 'lib/link-network/store.ts'
  const input = { projectId: P.S, userId: U_S, articleId: ART }
  const user = (id: string) => (id === P.S ? U_S : `20000000-0000-0000-0000-00000000000${ids.indexOf(id)}`)
  const proofOf = async (db: any, id: string) => (await readDomainProof(db, [{ id, user_id: user(id) }])).get(id)
  const verified = async (db: any, id: string) => (await loadSites(db, [id])).get(id)!.site.verifiedDomains

  // What counts, from the tables that already exist.
  check('a tested WordPress connection on the site\'s host proves it', (await verified(networkDb(), P.OK)).join() === 'site1.co.il')
  const failed = networkDb(); (failed.tables.wordpress_connections.find((r: any) => r.project_id === P.OK) as any).connection_status = 'failed'
  check('a WordPress connection that failed its test proves nothing', (await verified(failed, P.OK)).length === 0)
  const stMut = await withMutantAsync(STORE, (s) => s.replace(".in('project_id', ids).eq('connection_status', 'connected').limit(ids.length)),\n    rows<OwnedSiteRow>(db.from('site_fix_plugin_links')", ".in('project_id', ids).limit(ids.length)),\n    rows<OwnedSiteRow>(db.from('site_fix_plugin_links')"),
    async (m) => (await m.loadSites(failed, [P.OK])).get(P.OK).site.verifiedDomains.length)
  check('MUTATION CONTROL: WordPress status not checked → a failed connection proves it → caught', stMut === 1, String(stMut))
  const foreign = networkDb(); (foreign.tables.wordpress_connections.find((r: any) => r.project_id === P.OK) as any).user_id = U_S
  check('a connection row of another account proves nothing', (await verified(foreign, P.OK)).length === 0)
  const ownMut = await withMutantAsync(STORE, (s) => s.replace(' || r.user_id !== ownerOf.get(r.project_id)) continue', ') continue'),
    async (m) => (await m.loadSites(foreign, [P.OK])).get(P.OK).site.verifiedDomains.length)
  check('MUTATION CONTROL: connection owner not checked → caught', ownMut === 1, String(ownMut))
  const other = networkDb(); (other.tables.wordpress_connections.find((r: any) => r.project_id === P.OK) as any).site_url = 'https://another-site.co.il'
  check('a connection to a different site proves nothing for this domain', (await verified(other, P.OK)).length === 0)

  const plug = networkDb({ unconnected: [P.OK] })
  plug.tables.site_fix_plugin_links = [{ project_id: P.OK, user_id: user(P.OK), site_url: 'https://site1.co.il', status: 'connected' }]
  check('the GO TOP plugin link (connected) proves it', (await verified(plug, P.OK)).join() === 'site1.co.il')
  plug.tables.site_fix_plugin_links[0].status = 'pending'
  check('…a plugin code issued but never answered proves nothing', (await verified(plug, P.OK)).length === 0)
  // A Wix / custom-site (webhook) address is typed by the owner and never checked: no proof.
  const wix = networkDb({ unconnected: [P.OK] })
  wix.tables.site_platform_connections = [{ project_id: P.OK, user_id: user(P.OK), platform: 'webhook', site_url: 'https://site1.co.il/', endpoint_url: 'https://site1.co.il/hook', connection_status: 'connected' }]
  check('a webhook / Wix connection alone proves nothing (typed address)', (await verified(wix, P.OK)).length === 0)
  const U_WIX = user(P.OK)
  const wixAns = await (await handleNetworkGet(P.OK, routeDeps(U_WIX, wix))).json() as any
  check('…so a webhook / Wix-only project is domain_unverified and cannot join', wixAns.readiness === 'domain_unverified'
    && (await handleMembershipPost(jsonReq({ join: true, consent: true, consentVersion: LINK_NETWORK_CONSENT_VERSION }), P.OK, routeDeps(U_WIX, wix))).status === 409, String(wixAns.readiness))
  const wixMut = await withMutantAsync(STORE, (s) => s.replace('  for (const r of [...wp, ...plugin]) {',
    "  for (const r of [...wp, ...plugin, ...(await rows<OwnedSiteRow>(db.from('site_platform_connections').select('project_id, user_id, site_url').in('project_id', ids).eq('connection_status', 'connected').limit(ids.length)))]) {"),
    async (m) => (await m.loadSites(wix, [P.OK])).get(P.OK).site.verifiedDomains.length)
  check('MUTATION CONTROL: Wix / webhook site_url accepted as proof → caught', wixMut === 1, String(wixMut))

  const gsc = networkDb({ unconnected: [P.OK] })
  gsc.tables.project_gsc_properties = [{ project_id: P.OK, connection_id: 'g1', site_url: 'sc-domain:site1.co.il', permission_level: 'siteOwner' }]
  gsc.tables.gsc_connections = [{ id: 'g1', user_id: user(P.OK), status: 'connected' }]
  check('a verified Search Console property of the owner\'s live Google connection proves it', (await verified(gsc, P.OK)).join() === 'site1.co.il')
  ;(gsc.tables.gsc_connections[0] as any).status = 'revoked'
  check('…not once that Google connection is revoked', (await verified(gsc, P.OK)).length === 0)
  const gscMut = await withMutantAsync(STORE, (s) => s.replace(".in('id', connIds).eq('status', 'connected')", ".in('id', connIds)"),
    async (m) => (await m.loadSites(gsc, [P.OK])).get(P.OK).site.verifiedDomains.length)
  check('MUTATION CONTROL: Google connection status not checked → caught', gscMut === 1, String(gscMut))
  ;(gsc.tables.gsc_connections[0] as any).status = 'connected'; (gsc.tables.gsc_connections[0] as any).user_id = U_S
  check('…nor when the Google connection belongs to another account', (await verified(gsc, P.OK)).length === 0)
  check('no connection at all: no proof', (await proofOf(networkDb({ unconnected: [P.OK] }), P.OK)) === undefined)

  // The rule reaches the placement step: an unconnected member is never offered.
  const unconnected = networkDb({ unconnected: [P.OK] })
  const deps = placeDeps(goodAnswer)
  const r = await placeNetworkLink(unconnected as any, input, deps)
  check('a member that never connected its site receives no link (not even offered to the model)', r.outcome === 'skipped' && !deps.prompts.some((p) => p.includes('site1.co.il')), JSON.stringify(r))
  const srcUnc = await placeNetworkLink(networkDb({ unconnected: [P.S] }) as any, input, placeDeps(goodAnswer))
  check('a member that never connected its site gives no link', srcUnc.outcome === 'skipped' && srcUnc.reason === 'source_domain_unverified', JSON.stringify(srcUnc))
  // Pages we link to are on a proven domain only.
  const alias = networkDb()
  const okProject = alias.tables.projects.find((p: any) => p.id === P.OK) as any
  okProject.domain_aliases = ['typed-in.co.il']
  alias.tables.generated_articles.push({ id: 'e0000000-0000-0000-0000-00000000aaaa', project_id: P.OK, user_id: user(P.OK), title: 'עמוד על דומיין שלא הוכח', status: 'published', wp_post_url: 'https://typed-in.co.il/page/', content_html: '<p>x</p>' })
  const pages = (await loadSites(alias, [P.OK])).get(P.OK)!.extras.pages.map((p) => p.url)
  check('a page on a domain that was only typed in (an unproven alias) is never a link target', pages.length > 0 && !pages.some((u) => u.includes('typed-in.co.il')), pages.join(', '))
  const pageMut = await withMutantAsync(STORE, (s) => s.replace('const u = ownPage(url, verifiedDomains)', 'const u = ownPage(url, domains)'),
    async (m) => (await m.loadSites(alias, [P.OK])).get(P.OK).extras.pages.some((p: any) => p.url.includes('typed-in.co.il')))
  check('MUTATION CONTROL: pages from every typed domain → caught', pageMut === true)

  // The routes: the switch cannot be turned on, and the server refuses too.
  const U_OK = user(P.OK)
  const fresh = networkDb({ unconnected: [P.OK] })
  fresh.tables.link_network_members = fresh.tables.link_network_members.filter((m: any) => m.project_id !== P.OK)
  const ans = await (await handleNetworkGet(P.OK, routeDeps(U_OK, fresh))).json() as any
  check('GET says why the switch cannot be turned on (readiness domain_unverified)', ans.available === true && ans.readiness === 'domain_unverified', String(ans.readiness))
  const joinReq = () => jsonReq({ join: true, consent: true, consentVersion: LINK_NETWORK_CONSENT_VERSION })
  const refused = await handleMembershipPost(joinReq(), P.OK, routeDeps(U_OK, fresh))
  check('joining without a proven domain is refused (409 domain_unverified), nothing written', refused.status === 409 && ((await refused.json()) as any).code === 'domain_unverified'
    && !fresh.tables.link_network_members.some((m: any) => m.project_id === P.OK))
  const joinMut = await withMutantAsync('lib/link-network/http.ts', (s) => s.replace("if (siteQualifies({ ...me.site, active: true }, deps.now()) === 'domain_unverified') return refuse(409, 'domain_unverified')", ''),
    async (m) => (await m.handleMembershipPost(joinReq(), P.OK, routeDeps(U_OK, networkDb({ unconnected: [P.OK] })))).status)
  check('MUTATION CONTROL: join refusal removed → an unconnected site joins → caught', joinMut === 200, String(joinMut))
  check('leaving is always allowed', (await handleMembershipPost(jsonReq({ join: false }), P.OK, routeDeps(U_OK, networkDb({ unconnected: [P.OK] })))).status === 200)

  // The screen: the switch is disabled with the reason, in both languages.
  const panel = strip(read('components/site-links/network/NetworkPanel.tsx'))
  // Wave 8: the reason is the hero's body (h.body.cannotJoin) and the switch's line (cannotJoinDescription).
  const panelOk = (src: string) => /const cannotJoin = !active && data\.readiness === 'domain_unverified'/.test(src) && /disabled=\{busy \|\| cannotJoin\}/.test(src)
    && /h\.body\.cannotJoin/.test(src) && /copy\.switch\.cannotJoinDescription/.test(src)
  check('the switch is disabled and says why when the site is not connected', panelOk(panel))
  check('MUTATION CONTROL: the switch left enabled → caught', !panelOk(panel.replace('disabled={busy || cannotJoin}', 'disabled={busy}')))
  const he = read('lib/i18n/dashboard/he.ts'), en = read('lib/i18n/dashboard/en.ts')
  check('the reason is in both dictionaries', /cannotJoin: 'מחברים את האתר ב-WordPress \(או בתוסף של Go Top\) או ב-Search Console, ומיד אפשר להפעיל\.'/.test(he)
    && /cannotJoin: 'Connect it through WordPress \(or the Go Top plugin\) or Search Console, then turn the network on\.'/.test(en) && /domain_unverified: '/.test(he) && /domain_unverified: '/.test(en))
}

// ── I. the page count reads the full-site mapping (review P1-8) ───────────
async function partI() {
  console.log('\nI. pages from the full-site mapping (site_page_map)')
  const STORE = 'lib/link-network/store.ts'
  const user = (id: string) => (id === P.S ? U_S : `20000000-0000-0000-0000-00000000000${ids.indexOf(id)}`)
  /** P.OK with no published articles and an empty link index: only the mapping knows its pages. */
  const onlyMapped = (map: Record<string, unknown> | null, over: { unconnected?: string[] } = {}) => {
    const db = networkDb(over)
    db.tables.generated_articles = db.tables.generated_articles.filter((a: any) => a.project_id !== P.OK)
    db.tables.site_page_map = map ? [{ project_id: P.OK, user_id: user(P.OK), status: 'completed', counts: { all: 14, page: 9, article: 5 }, ...map }] : []
    return db
  }
  const siteOf = async (db: any) => (await loadSites(db, [P.OK])).get(P.OK)!.site
  const bare = await siteOf(onlyMapped(null))
  check('without the mapping, a site with no articles and no index is thin (the old reading)', siteQualifies(bare, NOW) === 'thin_or_new' && bare.indexedPages === 0)
  const mapped = await siteOf(onlyMapped({}))
  check('with the mapping (14 pages), the site counts 14 pages and qualifies', mapped.indexedPages === 14 && siteQualifies(mapped, NOW) === null, `${mapped.indexedPages} ${siteQualifies(mapped, NOW)}`)
  check('the larger of the link index and the mapping counts', (await siteOf(onlyMapped({ counts: { page: 7, article: 4 } }))).indexedPages === 11)
  check('a mapping still running or failed is no evidence yet', (await siteOf(onlyMapped({ status: 'running' }))).indexedPages === 0 && (await siteOf(onlyMapped({ status: 'failed' }))).indexedPages === 0)
  check('a partial mapping counts what it found', (await siteOf(onlyMapped({ status: 'partial' }))).indexedPages === 14)
  check('a mapping row of another account never counts (owner filter)', (await siteOf(onlyMapped({ user_id: U_S }))).indexedPages === 0)
  check('pages never replace domain control: an unconnected site with 14 mapped pages stays domain_unverified',
    siteQualifies(await siteOf(onlyMapped({}, { unconnected: [P.OK] })), NOW) === 'domain_unverified')
  const noTable = networkDb({ hooks: { site_page_map: { select: () => ({ code: '42P01', message: 'missing' }) } } })
  check('a missing site_page_map table reads as no mapping (nothing breaks)', !!(await loadSites(noTable, [P.OK])).get(P.OK))
  const countMut = await withMutantAsync(STORE, (s) => s.replace('indexedPages: Math.max(index.length, pageMapCount(mapOf.get(p.id))),', 'indexedPages: index.length,'),
    async (m) => (await m.loadSites(onlyMapped({}), [P.OK])).get(P.OK).site.indexedPages)
  check('MUTATION CONTROL: the mapping ignored (the old count) → caught', countMut === 0, String(countMut))
  const ownerMut = await withMutantAsync(STORE, (s) => s.replace('pageMaps.filter((m) => m.user_id && m.user_id === ownerOfProject.get(m.project_id))', 'pageMaps'),
    async (m) => (await m.loadSites(onlyMapped({ user_id: U_S }), [P.OK])).get(P.OK).site.indexedPages)
  check('MUTATION CONTROL: mapping owner not checked → caught', ownerMut === 14, String(ownerMut))
  const readsCountsOnly = (src: string) => /from\('site_page_map'\)\.select\('project_id, user_id, status, counts'\)/.test(src)
  check('the mapping is read for its counts only, never its entries (up to 10 000 per site)', readsCountsOnly(strip(read(STORE))))
  check('MUTATION CONTROL: entries read too → caught', !readsCountsOnly(strip(read(STORE)).replace("select('project_id, user_id, status, counts')", "select('project_id, user_id, status, counts, entries')")))
}

// ── J. one count, and the free tab first (review P2-8) ──────────────────────
function partK() {
  console.log('\nK. the joining screen carries the Google risk, in every language')
  // The public links page leaves the Google risk off on one condition set by
  // the legal session (9 Oct 2026): the screen where the owner actually
  // consents states it. So it is pinned here, with the link type beside it.
  const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary') as typeof import('../../i18n/dashboard/getDashboardDictionary')
  const locales = ['he', 'en', 'es', 'pt-BR'] as const
  const risks = locales.map((l) => getDashboardDictionary(l).siteLinks.network.consent.risk)
  check('every language states the risk on the joining screen', risks.every((r) => typeof r === 'string' && r.trim().length > 80))
  check('the languages are not copies of each other', new Set(risks).size === locales.length)
  const panel = readFileSync(join(ROOT, 'components/site-links/network/NetworkPanel.tsx'), 'utf8')
  check('the joining dialog renders it, next to the link type',
    /copy\.consent\.risk/.test(panel) && /copy\.linkType\[data\.linkRel\]/.test(panel))
  // MUTATION CONTROL
  check('K-MUT: a dialog without the risk line is caught', !/copy\.consent\.risk/.test(panel.replace(/copy\.consent\.risk/g, '')))
}

async function partJ() {
  console.log('\nJ. one definition of a link; opportunities first')
  const { linkCount, countsAsLink } = require('../counting') as typeof import('../counting')
  check('a link is live or waiting; removed or taken out is history', countsAsLink('published') && countsAsLink('waiting') && !countsAsLink('removed') && !countsAsLink('rejected'))
  const totalsOf = async (db: any) => {
    const ans = await (await handleNetworkGet(P.S, routeDeps(U_S, db))).json() as any
    return { kpi: ans.totals?.given, list: linkCount(ans.given ?? []), rows: (ans.given ?? []).length }
  }
  const live = await totalsOf(networkDbWithPlacement())
  check('a link in the article: KPI 1, log count 1', live.kpi === 1 && live.list === 1, JSON.stringify(live))
  const gone = networkDbWithPlacement()
  ;(gone.tables.generated_articles.find((a: any) => a.id === ART) as any).content_html = ARTICLE
  const g = await totalsOf(gone)
  check('a link no longer in the article: KPI 0 and log count 0 (the row is kept as history)', g.kpi === 0 && g.list === 0 && g.rows === 1, JSON.stringify(g))
  const mut = await withMutantAsync('lib/link-network/http.ts', (src) => src.replace('totals: { received: linkCount(received), given: linkCount(given) },', 'totals: { received: received.length, given: given.length },'),
    async (m) => (await (await m.handleNetworkGet(P.S, routeDeps(U_S, gone))).json() as any).totals.given)
  check('MUTATION CONTROL: KPI counts every row again → the numbers disagree → caught', mut === 1 && g.list === 0, String(mut))
  const log = strip(read('components/site-links/network/PlacementLog.tsx'))
  const logOk = (src: string) => /count: linkCount\(data\.received\)/.test(src) && /count: linkCount\(given\)/.test(src) && /const list = all\.filter\(\(i\) => countsAsLink\(i\.state\)\)/.test(src)
  check('the log\'s tab counts and list use the same definition as the KPI', logOk(log))
  check('MUTATION CONTROL: tab count back to every row → caught', !logOk(log.replace('count: linkCount(data.received)', 'count: data.received.length')))
  // Wave 8 (UX A1): one page, no tabs. The network's state first; the log only for a member;
  // the free opportunities always on the same page, under it.
  const screen = strip(read('components/site-links/network/SiteLinksScreen.tsx'))
  const defOk = (src: string) => !/Segmented/.test(src) && /<NetworkPanel projectId=\{projectId\} data=\{load\.data\} onChanged=\{refresh\} \/>/.test(src)
    && /\{member && <PlacementLog /.test(src) && src.indexOf('<NetworkPanel') < src.indexOf('<PlacementLog') && /<SiteLinksView\s+projectId=\{projectId\}\s+top=/.test(src)
  check('one page: the network\'s state first, the log only for a member, the opportunities on the same page', defOk(screen))
  check('MUTATION CONTROL: a tab switch back → caught', !defOk(screen + '\n<Segmented />'))
  check('MUTATION CONTROL: the log shown to a site that is not in the network → caught', !defOk(screen.replace('{member && <PlacementLog ', '{<PlacementLog ')))
  check('the history line is in both dictionaries', /history: \(n: number\) =>/.test(read('lib/i18n/dashboard/he.ts')) && /history: \(n: number\) =>/.test(read('lib/i18n/dashboard/en.ts')))
}

async function main() {
  partA()
  partB()
  partC()
  await partD()
  await partE()
  partF()
  partG()
  await partH()
  await partI()
  await partJ()
  partK()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
void main()
export {}
