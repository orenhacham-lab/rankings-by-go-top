/**
 * What every comparison page shares: the table's column headings, the dated
 * "we read their pages on" line, and the sentence that tells a reader what the
 * page is and is not.
 *
 * `Record<PublicLocale, …>` on purpose. The day a fifth language is added to
 * `PublicLocale`, every comparison page stops compiling until its words exist
 * in that language — which is the rule the site runs on, that a reader is never
 * dropped out of their own language, held by the compiler instead of by
 * somebody remembering.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export type CompareCommon = {
  /** The left-hand column: what each row is about. */
  column: string
  /** The middle column: us. */
  ours: string
  /** Screen-reader caption for the table. */
  tableCaption: (competitor: string) => string
  /** Under the table: when their pages were read, and what that means. */
  checkedOn: (competitor: string, date: string) => string
  /** The honesty note that opens every comparison page's body. */
  fairness: (competitor: string) => string
}

export const COMPARE_COMMON: Record<PublicLocale, CompareCommon> = {
  he: {
    column: 'מה משווים',
    ours: 'Go Top SEO',
    tableCaption: (c) => `השוואה בין Go Top SEO לבין ${c}`,
    checkedOn: (c, date) =>
      `הטור של ${c} נכתב לפי העמודים של ${c} עצמם, כפי שנקראו ב-${date}. חברות משנות מחירים ותכונות, אז אם משהו כאן כבר לא מדויק, הקישורים למטה הם המקור וכדאי לבדוק בהם.`,
    fairness: (c) =>
      `${c} הוא מוצר טוב, ולחלק מהעסקים הוא הבחירה הנכונה. העמוד הזה לא מנסה להגיד אחרת, אלא להראות איפה כל אחד מהם חזק, כדי שתדעו מה מתאים לכם.`,
  },
  en: {
    column: 'What we compare',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO compared with ${c}`,
    checkedOn: (c, date) =>
      `The ${c} column is taken from ${c}'s own pages, as read on ${date}. Companies change prices and features, so if something here is out of date, the links below are the source and are worth checking.`,
    fairness: (c) =>
      `${c} is a good product, and for some businesses it is the right one. This page is not here to argue otherwise. It is here to show what each of us is strong at, so you can tell which one fits you.`,
  },
  es: {
    column: 'Qué comparamos',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO comparado con ${c}`,
    checkedOn: (c, date) =>
      `La columna de ${c} procede de las páginas del propio ${c}, leídas el ${date}. Las empresas cambian precios y funciones, así que si algo ya no es exacto, los enlaces de abajo son la fuente y conviene comprobarlos.`,
    fairness: (c) =>
      `${c} es un buen producto y para algunos negocios es la opción correcta. Esta página no pretende decir lo contrario, sino mostrar en qué es fuerte cada uno para que sepas cuál encaja contigo.`,
  },
  'pt-BR': {
    column: 'O que comparamos',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO comparado com ${c}`,
    checkedOn: (c, date) =>
      `A coluna do ${c} vem das páginas do próprio ${c}, lidas em ${date}. As empresas mudam preços e recursos, então, se algo aqui já não estiver exato, os links abaixo são a fonte e vale conferir.`,
    fairness: (c) =>
      `${c} é um bom produto e, para alguns negócios, é a escolha certa. Esta página não quer dizer o contrário: ela mostra em que cada um é forte, para você saber qual combina com você.`,
  },
  fr: {
    column: 'Ce que nous comparons',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO comparé à ${c}`,
    checkedOn: (c, date) =>
      `La colonne ${c} provient des pages de ${c} elle-même, lues le ${date}. Les entreprises changent leurs prix et leurs fonctions : si quelque chose n'est plus exact ici, les liens ci-dessous sont la source et valent la peine d'être vérifiés.`,
    fairness: (c) =>
      `${c} est un bon produit, et pour certaines entreprises c'est le bon choix. Cette page ne cherche pas à dire le contraire : elle montre les points forts de chacun, pour que vous sachiez lequel vous convient.`,
  },
  it: {
    column: 'Che cosa confrontiamo',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO a confronto con ${c}`,
    checkedOn: (c, date) =>
      `La colonna ${c} proviene dalle pagine di ${c} stessa, lette il ${date}. Le aziende cambiano prezzi e funzioni: se qualcosa qui non è più esatto, i link qui sotto sono la fonte e vale la pena verificarli.`,
    fairness: (c) =>
      `${c} è un buon prodotto e per alcune aziende è la scelta giusta. Questa pagina non vuole dire il contrario: mostra i punti di forza di ciascuno, così da capire quale sia più adatto.`,
  },
  pl: {
    column: 'Co porównujemy',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO w porównaniu z ${c}`,
    checkedOn: (c, date) =>
      `Kolumna o ${c} pochodzi ze stron samego ${c}, przeczytanych ${date}. Firmy zmieniają ceny i funkcje: jeśli coś przestało się tu zgadzać, linki na dole są źródłem i warto do nich zajrzeć.`,
    fairness: (c) =>
      `${c} to dobry produkt i dla części firm jest właściwym wyborem. Ta strona nie twierdzi niczego przeciwnego. Pokazuje, gdzie leżą mocne strony każdego z nich, żeby widać było, co pasuje do Państwa.`,
  },
  nl: {
    column: 'Wat wij vergelijken',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO vergeleken met ${c}`,
    checkedOn: (c, date) =>
      `De kolom over ${c} komt van ${c}s eigen pagina’s, gelezen op ${date}. Bedrijven wijzigen prijzen en functies: mocht hier iets niet meer kloppen, dan zijn de links onderaan de bron en de moeite van een blik waard.`,
    fairness: (c) =>
      `${c} is een goed product, en voor sommige bedrijven is het de juiste keuze. Deze pagina wil niet het tegendeel beweren. Zij laat zien waar de sterke punten van elk liggen, zodat u ziet wat bij u past.`,
  },
  de: {
    column: 'Was wir vergleichen',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO im Vergleich mit ${c}`,
    checkedOn: (c, date) =>
      `Die Spalte zu ${c} stammt von ${c}s eigenen Seiten, gelesen am ${date}. Unternehmen ändern Preise und Funktionen: sollte hier etwas nicht mehr stimmen, sind die Links unten die Quelle und lohnen einen Blick.`,
    fairness: (c) =>
      `${c} ist ein gutes Produkt, und für manche Unternehmen ist es das richtige. Diese Seite will nichts anderes behaupten. Sie zeigt, wo die Stärken jeweils liegen, damit Sie erkennen, was zu Ihnen passt.`,
  },
  ja: {
    column: '比較する項目',
    ours: 'Go Top SEO',
    tableCaption: (c) => `Go Top SEO と ${c} の比較`,
    checkedOn: (c, date) =>
      `${c} の列は ${c} 自身のページを ${date} に確認した内容です。価格や機能は変更されることがあります。ここに古い記述があった場合は、下のリンクが出典ですので、そちらをご確認ください。`,
    fairness: (c) =>
      `${c} は優れた製品で、企業によっては ${c} が最適な選択です。このページはその逆を主張するものではありません。それぞれの強みを示し、どちらが自社に合うかを判断していただくためのものです。`,
  },
}
