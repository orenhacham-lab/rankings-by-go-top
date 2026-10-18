/**
 * WHAT THE SITE ITSELF SELLS — where the relevance vocabulary gets its words.
 *
 * (18 October 2026, from Oren's report: 4dogsoriginal.co.il, a dog-products
 * store, had children's toys — "צעצועים מונטסוריים", "משחק גלידה מעץ" — and
 * dog-adoption topics — "אימוץ כלבים קטנים", "כלבים למסירה מיידית" — approved in
 * its queue.)
 *
 * WHY. buildSiteVocabulary read ONE source, the project's content index (the
 * WordPress index, or the seeding scan's crawl), plus a few extra strings. 43 of
 * the 51 live projects have no index row, so for that store the vocabulary was
 * the business name plus its 20 tracked keywords — and every one of those
 * keywords had been written by OUR OWN published articles
 * (tracking_targets.notes starts with 'source=generated_article'). A drifted
 * article taught the gate its own words: "כלבי צעצוע" made "צעצוע" a site word
 * and "אימוץ חיות" made "אימוץ" one, so the next round's toy and adoption
 * keywords passed the relevance gate, and the drift fed itself.
 *
 * WHAT. The site's subject is read from the pages the MERCHANT published: the
 * full-site mapping (site_page_map — 131 pages for that store, where the content
 * index had none), with the articles WE generated left out, plus the tracked
 * keywords that are not ours. The vocabulary then describes the catalogue, and
 * nothing we wrote can widen it.
 *
 * Every read names the project AND its owner (the service role bypasses RLS),
 * and any failure reads as nothing: the gate is then left with less to judge by,
 * never with more.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { decodeTitle } from '@/lib/ai-visibility/site-topics'

type Admin = ReturnType<typeof createAdminClient>

/** The note tracking_targets carries for a keyword one of our articles created. */
export const GENERATED_ARTICLE_NOTE = 'source=generated_article'
/** The most merchant page titles absorbed (a mapping can hold thousands). */
export const MAX_MERCHANT_TITLES = 600

/** Was this tracked keyword written by one of our own generated articles? */
export function isOurTrackedKeyword(notes: string | null | undefined): boolean {
  return (notes || '').trimStart().startsWith(GENERATED_ARTICLE_NOTE)
}

/** A URL compared without protocol, host prefix, query or trailing slash. */
export function urlKey(url: string | null | undefined): string {
  const raw = (url || '').trim().toLowerCase()
  if (!raw) return ''
  return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '')
}

/** A title compared without entities, case or repeated spaces. */
export function titleKey(title: string | null | undefined): string {
  return decodeTitle(String(title || '')).toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * 18 October 2026 — A UTILITY PAGE IS NOT THE SITE'S SUBJECT.
 *
 * Running the gate over 4dogsoriginal.co.il's own plan showed "עגלת גלידה
 * לילדים" — an ice-cream cart, a children's toy — passing as the site's own
 * subject, because the mapping holds the shop's basket page, "עגלת הקניות", so
 * "עגלה" was a site word. A cart, a checkout, an account, the terms and the
 * accessibility statement say nothing about what the merchant sells, so their
 * titles are left out of the vocabulary.
 *
 * The match is on the title's FIRST segment (the part before a separator such
 * as "|" or "–", which usually carries the site's name), and only when that
 * segment IS one of these phrases: an article named "מדיניות גזים: למה הכלב
 * מגרד" or "Store your dog food properly" starts with one of these words and is
 * not one of these pages.
 */
const UTILITY_TITLES: readonly string[] = [
  // he
  'עגלת הקניות', 'עגלת קניות', 'סל הקניות', 'עגלה', 'קופה', 'תשלום', 'סליקה', 'צ\'קאאוט',
  'החשבון שלי', 'האזור האישי', 'כניסה', 'התחברות', 'הרשמה', 'התנתקות', 'הזמנות שלי', 'רשימת המשאלות',
  'תנאי שימוש', 'תקנון', 'מדיניות פרטיות', 'מדיניות', 'הצהרת נגישות', 'נגישות', 'הצהרת פרטיות',
  'צור קשר', 'יצירת קשר', 'דברו איתנו', 'אודות', 'אודותינו', 'עלינו', 'שאלות ותשובות', 'שאלות נפוצות',
  'משלוחים', 'משלוח והחזרות', 'החזרות וביטולים', 'מדיניות משלוחים', 'מדיניות החזרות', 'מדיניות ביטולים',
  'הרשמה לניוזלטר', 'ניוזלטר', 'חיפוש', 'תוצאות חיפוש', 'העמוד לא נמצא', 'דף הבית', 'הבלוג', 'בלוג',
  'מפת האתר', 'כל המוצרים', 'החנות',
  // en
  'cart', 'shopping cart', 'basket', 'checkout', 'my account', 'account', 'login', 'log in', 'sign in',
  'sign up', 'register', 'logout', 'my orders', 'order tracking', 'wishlist',
  'terms of service', 'terms and conditions', 'terms of use', 'terms', 'privacy policy', 'privacy',
  'accessibility statement', 'accessibility', 'cookie policy', 'refund policy', 'return policy',
  'shipping policy', 'shipping and returns', 'shipping', 'returns', 'contact', 'contact us', 'about',
  'about us', 'faq', 'faqs', 'newsletter', 'search', 'search results', 'page not found', 'not found',
  'home', 'blog', 'sitemap', 'all products', 'shop', 'store',
  // es
  'carrito', 'carrito de compra', 'cesta', 'finalizar compra', 'mi cuenta', 'cuenta', 'iniciar sesión',
  'registro', 'términos y condiciones', 'términos de uso', 'política de privacidad', 'privacidad',
  'accesibilidad', 'política de cookies', 'política de envíos', 'envíos', 'devoluciones', 'contacto',
  'sobre nosotros', 'acerca de', 'preguntas frecuentes', 'boletín', 'buscar', 'resultados de búsqueda',
  'página no encontrada', 'inicio', 'mapa del sitio', 'todos los productos', 'tienda',
  // pt-BR
  'carrinho', 'carrinho de compras', 'finalizar compra', 'minha conta', 'conta', 'entrar', 'cadastro',
  'termos de uso', 'termos e condições', 'política de privacidade', 'privacidade', 'acessibilidade',
  'política de cookies', 'política de envio', 'envio', 'trocas e devoluções', 'devoluções', 'contato',
  'sobre nós', 'sobre', 'perguntas frequentes', 'buscar', 'resultados da busca',
  'página não encontrada', 'início', 'mapa do site', 'todos os produtos', 'loja',
]

/** The part of a title before the separator that usually carries the site's name. */
export function titleHead(title: string | null | undefined): string {
  const first = titleKey(title).split(/\s*[|–—·•>»:]\s*/)[0] ?? ''
  return first.replace(/[.,;!?]+$/, '').trim()
}

/** A cart, a checkout, the terms, an accessibility statement: not what the merchant sells. */
export function isUtilityTitle(title: string | null | undefined): boolean {
  const head = titleHead(title)
  if (!head) return false
  return UTILITY_TITLES.includes(head)
}

export interface MapEntryLite { u?: unknown; t?: unknown }
export interface OurArticleLite { title?: string | null; urls?: (string | null | undefined)[] }

/**
 * The merchant's own page titles: every mapped page that has a title, minus the
 * pages that are articles we generated (matched by URL, else by title). Pure, so
 * the exclusion is what the guard tests.
 */
export function merchantTitles(entries: readonly MapEntryLite[] | null | undefined, ours: readonly OurArticleLite[] | null | undefined): string[] {
  const ourUrls = new Set<string>()
  const ourTitles = new Set<string>()
  for (const a of ours ?? []) {
    for (const u of a.urls ?? []) { const k = urlKey(u); if (k) ourUrls.add(k) }
    const t = titleKey(a.title)
    if (t) ourTitles.add(t)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of entries ?? []) {
    if (out.length >= MAX_MERCHANT_TITLES) break
    const title = decodeTitle(typeof e?.t === 'string' ? e.t : '').replace(/\s+/g, ' ').trim()
    if (!title) continue
    const key = titleKey(title)
    if (seen.has(key) || ourTitles.has(key)) continue
    if (isUtilityTitle(title)) continue
    if (ourUrls.has(urlKey(typeof e?.u === 'string' ? e.u : ''))) continue
    seen.add(key)
    out.push(title)
  }
  return out
}

/** The merchant's own page titles for this project, or none when nothing answers. */
export async function readMerchantTitles(admin: Admin, scope: { projectId: string; userId?: string | null }): Promise<string[]> {
  let entries: MapEntryLite[] = []
  try {
    let q = admin.from('site_page_map').select('entries').eq('project_id', scope.projectId)
    if (scope.userId) q = q.eq('user_id', scope.userId)
    const { data, error } = await q.maybeSingle()
    if (error) return []
    const rows = (data as { entries?: unknown } | null)?.entries
    entries = Array.isArray(rows) ? (rows as MapEntryLite[]) : []
  } catch { return [] }
  if (entries.length === 0) return []
  let ours: OurArticleLite[] = []
  try {
    let q = admin.from('generated_articles').select('title, wp_post_url, site_post_url, shopify_article_url').eq('project_id', scope.projectId)
    if (scope.userId) q = q.eq('user_id', scope.userId)
    const { data } = await q.limit(1000)
    ours = ((data ?? []) as { title?: string | null; wp_post_url?: string | null; site_post_url?: string | null; shopify_article_url?: string | null }[])
      .map((a) => ({ title: a.title ?? null, urls: [a.wp_post_url, a.site_post_url, a.shopify_article_url] }))
  } catch { /* our articles unknown → the mapping is used as it is */ }
  return merchantTitles(entries, ours)
}

/**
 * The project's tracked keywords that the merchant's own site brought in, most
 * searched first — the keywords OUR articles created are left out, so they
 * neither seed the keyword research nor widen the relevance vocabulary.
 */
export async function readMerchantTrackedKeywords(admin: Admin, projectId: string, limit = 20): Promise<string[]> {
  try {
    const { data, error } = await admin
      .from('tracking_targets').select('keyword, notes, avg_monthly_searches')
      .eq('project_id', projectId)
      .order('avg_monthly_searches', { ascending: false, nullsFirst: false })
      .limit(Math.max(limit, 60))
    if (error) return []
    return ((data ?? []) as { keyword?: string | null; notes?: string | null }[])
      .filter((r) => !isOurTrackedKeyword(r.notes))
      .map((r) => (r.keyword || '').trim())
      .filter(Boolean)
      .slice(0, limit)
  } catch { return [] }
}
