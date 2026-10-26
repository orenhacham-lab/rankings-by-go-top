/**
 * WHAT THE SITE ACTUALLY CLEANS, FIXES OR SERVES — the service OBJECT gate.
 *
 * (26 October 2026, from Oren's report on be-cln.co.il, an office-cleaning
 * company. Of the four ideas its "find ideas" run produced, two were about
 * private homes — "שירותי ניקיון בתים בנתניה", "ניקיון בתים לאחר שיפוץ מול
 * ניקיון משרדים" — and he rejected both in one click.)
 *
 * WHY THE RELEVANCE VOCABULARY LET THEM THROUGH. isVocabAligned judges by
 * PROPORTION: a keyword passes when at least two of its meaningful tokens are
 * the site's own words and they are more than half of them. Measured on that
 * project's real vocabulary (173 tokens, well above MIN_SITE_VOCAB_TOKENS, so
 * the gate was live): "שירותי ניקיון בתים בנתניה" matches 3 of 4 — שירותי,
 * ניקיון, נתניה are all over the site — so the ONE foreign word, בתים, rides in
 * on the others. Tightening the ratio is not the answer: an information angle
 * is MADE of words the site does not have ("חומרי ניקוי לרצפות משרד"), and
 * that is exactly what the 26 October information-angle work added.
 *
 * WHAT THIS DOES INSTEAD. One narrow class of word decides: the OBJECT of the
 * service, the kind of place or property being served. A site's own page titles
 * say which objects it serves (offices, clinics, showrooms, buildings for that
 * company); a candidate that names a DIFFERENT kind of place is about someone
 * else's customer, however many of the site's other words it carries.
 *
 * THE FLOOR. ownedServiceObjects of a site that names none is EMPTY, and an
 * empty owned set disables the gate completely: a new project with five thin
 * pages keeps behaving exactly as it does today. The failure direction is
 * always to ACCEPT, because a project with no topics is the worse failure
 * (26 October: a single-service business yielding zero topics).
 *
 * Deterministic and model-free: surface forms, not a classifier, so the same
 * input always gives the same answer and a QA guard can prove both directions.
 */
import { tokens } from './dedupe'
import { isUtilityTitle } from './site-subject'

/** A kind of place or property a service is performed on. */
export type ServiceObject =
  | 'home' | 'office' | 'clinic' | 'hospital' | 'building' | 'showroom' | 'store'
  | 'restaurant' | 'school' | 'warehouse' | 'hotel' | 'vehicle' | 'eldercare'

/**
 * COMPOUNDS FIRST. In Hebrew "בית" opens a compound whose head is a different
 * place entirely: בית ספר is a school, בית קפה a café, בית חולים a hospital.
 * Reading the first word alone would call every one of them a private home, so
 * two-word forms are matched and consumed before any single word is.
 */
const COMPOUND_FORMS: readonly (readonly [string, string, ServiceObject])[] = [
  ['בית', 'ספר', 'school'], ['בתי', 'ספר', 'school'],
  ['בית', 'חולים', 'hospital'], ['בתי', 'חולים', 'hospital'],
  ['בית', 'קפה', 'restaurant'], ['בתי', 'קפה', 'restaurant'],
  ['בית', 'מלון', 'hotel'], ['בתי', 'מלון', 'hotel'],
  ['בית', 'אבות', 'eldercare'], ['בתי', 'אבות', 'eldercare'],
  ['בית', 'כנסת', 'school'], ['בתי', 'כנסת', 'school'],
  ['גן', 'ילדים', 'school'], ['גני', 'ילדים', 'school'],
]

/**
 * Single-word forms, spelled out rather than stemmed: heStem maps בית and בתים
 * to different stems (בית / בתם) and אולם and אולמות likewise, so a stemmer
 * would miss exactly the plural a page title uses. Latin words cover the five
 * other dashboard languages; a word that is not here simply does not decide.
 */
const SINGLE_FORMS: Readonly<Record<ServiceObject, readonly string[]>> = {
  home: ['בית', 'בתים', 'בתי', 'דירה', 'דירות', 'וילה', 'וילות', 'קוטג', 'פנטהאוז', 'מגורים', 'דירת',
    'home', 'homes', 'house', 'houses', 'apartment', 'apartments', 'flat', 'flats', 'villa', 'villas', 'residential',
    'casa', 'casas', 'vivienda', 'apartamento', 'apartamentos', 'maison', 'maisons', 'appartement', 'appartements',
    'appartamento', 'appartamenti', 'residencial', 'residenziale'],
  office: ['משרד', 'משרדים', 'משרדי', 'משרדית',
    'office', 'offices', 'oficina', 'oficinas', 'escritorio', 'bureau', 'bureaux', 'ufficio', 'uffici'],
  clinic: ['קליניקה', 'קליניקות', 'מרפאה', 'מרפאות', 'מרפאת',
    'clinic', 'clinics', 'clinica', 'clinicas', 'clinique', 'cliniques', 'ambulatorio'],
  hospital: ['חולים', 'הוספיס', 'hospital', 'hospitals', 'hopital', 'ospedale'],
  building: ['מבנה', 'מבנים', 'בניין', 'בניינים', 'בנייני', 'בנין',
    'building', 'buildings', 'edificio', 'edificios', 'immeuble', 'immeubles', 'palazzo'],
  showroom: ['אולם', 'אולמות', 'אולמי', 'showroom', 'showrooms'],
  store: ['חנות', 'חנויות', 'קניון', 'קניונים',
    'store', 'stores', 'shop', 'shops', 'retail', 'tienda', 'tiendas', 'loja', 'lojas', 'boutique', 'negozio'],
  // "cafe" is left out as a single word: measured on all 554 existing ideas of
  // every project that has pages (26 Oct 2026), its ONLY hit was a perfume called
  // "Montale Intense Cafe" — a product name, not a place. בית קפה covers the real case.
  restaurant: ['מסעדה', 'מסעדות', 'מסעדת', 'פאב',
    'restaurant', 'restaurants', 'restaurante', 'restaurantes', 'ristorante'],
  // "גן" alone is left out on purpose: רמת גן is a city, and a town name must
  // never read as a kindergarten. The compound גן ילדים covers the real case.
  school: ['מכללה', 'אוניברסיטה', 'כיתה', 'כיתות',
    'school', 'schools', 'kindergarten', 'campus', 'escuela', 'escola', 'ecole', 'scuola'],
  warehouse: ['מחסן', 'מחסנים', 'מפעל', 'מפעלים', 'מפעלי', 'תעשייתי', 'תעשייתית',
    'warehouse', 'warehouses', 'factory', 'factories', 'industrial', 'almacen', 'armazem', 'usine', 'magazzino'],
  hotel: ['מלון', 'מלונות', 'צימר', 'צימרים', 'hotel', 'hotels', 'hostel', 'albergo'],
  vehicle: ['רכב', 'רכבים', 'מכונית', 'מכוניות', 'אוטובוס', 'אוטובוסים',
    'car', 'cars', 'vehicle', 'vehicles', 'coche', 'carro', 'voiture'],
  eldercare: ['אבות', 'סיעודי', 'סיעודית', 'nursing', 'hospice'],
}

const FORM_INDEX: Map<string, ServiceObject> = (() => {
  const m = new Map<string, ServiceObject>()
  for (const key of Object.keys(SINGLE_FORMS) as ServiceObject[]) for (const f of SINGLE_FORMS[key]) if (!m.has(f)) m.set(f, key)
  return m
})()

/** A token without the one-letter Hebrew prefix a title attaches (ו/ב/ל/ה/מ/כ/ש). */
function unprefixed(token: string): string {
  return token.length >= 4 && /^[בלמהושכ]/.test(token) ? token.slice(1) : token
}

/** The kinds of place this text names, compounds before single words. */
export function serviceObjectsNamed(text: string): Set<ServiceObject> {
  const list = Array.from(tokens(text || ''))
  const out = new Set<ServiceObject>()
  const consumed = new Set<number>()
  for (let i = 0; i < list.length - 1; i++) {
    const a = unprefixed(list[i] as string)
    const b = unprefixed(list[i + 1] as string)
    const hit = COMPOUND_FORMS.find(([x, y]) => x === a && y === b)
    if (hit) { out.add(hit[2]); consumed.add(i); consumed.add(i + 1) }
  }
  for (let i = 0; i < list.length; i++) {
    if (consumed.has(i)) continue
    const raw = list[i] as string
    const key = FORM_INDEX.get(raw) ?? FORM_INDEX.get(unprefixed(raw))
    if (key) out.add(key)
  }
  return out
}

/**
 * The kinds of place the merchant's OWN pages name. Empty = the gate is off.
 *
 * A utility page is skipped (isUtilityTitle, site-subject.ts) for a concrete
 * reason found by this suite's own floor test: the homepage is titled "דף הבית",
 * whose second word IS the word for a private home, so every site with a
 * homepage would have claimed to serve homes and the gate would never have
 * blocked anything. A cart, the terms or an accessibility statement say nothing
 * about the customer either.
 */
export function ownedServiceObjects(pageNames: readonly string[]): Set<ServiceObject> {
  const out = new Set<ServiceObject>()
  for (const name of pageNames) {
    if (isUtilityTitle(name)) continue
    for (const k of serviceObjectsNamed(name)) out.add(k)
  }
  return out
}

/**
 * The kind of place this candidate names that the site never does, or null.
 * Null whenever the site names none (the floor) or the candidate names none:
 * an information angle with no place in it ("חומרי ניקוי לרצפות") is not this
 * gate's business.
 */
export function foreignServiceObject(text: string, owned: Set<ServiceObject>): ServiceObject | null {
  if (owned.size === 0) return null
  for (const k of serviceObjectsNamed(text)) if (!owned.has(k)) return k
  return null
}

/** English labels for the synthesis prompt, which is written in English. */
const OBJECT_LABEL: Readonly<Record<ServiceObject, string>> = {
  home: 'private homes and apartments', office: 'offices', clinic: 'clinics', hospital: 'hospitals',
  building: 'buildings', showroom: 'showrooms and halls', store: 'stores', restaurant: 'restaurants and cafes',
  school: 'schools and kindergartens', warehouse: 'warehouses and factories', hotel: 'hotels',
  vehicle: 'vehicles', eldercare: 'nursing homes',
}

/** The owned objects as prompt labels, in a stable order. */
export function serviceObjectLabels(owned: Set<ServiceObject>): string[] {
  return (Object.keys(OBJECT_LABEL) as ServiceObject[]).filter((k) => owned.has(k)).map((k) => OBJECT_LABEL[k])
}
