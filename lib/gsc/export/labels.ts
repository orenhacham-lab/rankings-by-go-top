/**
 * The words of the Search Console positions report, in the three languages the
 * dashboard speaks.
 *
 * They live here rather than in lib/export/i18n.ts on purpose: that file is the
 * live rank report's, and the owner asked for this export without changing that
 * report. Nothing here can reach it.
 *
 * `positionNote` is the sentence that keeps the file honest. Search Console's
 * position is Google's own average over the window, over every place and device
 * a real visitor searched from; our scan is one place, one device, one moment.
 * They are different measurements, and a reader who takes this file for the rank
 * report would read a gap between them as an error in one of them.
 */
import { normalizeExportLanguage, type ExportLanguage } from '@/lib/export/i18n'
import type { GscExportLabels } from './sheets'
import type { GscPdfLabels } from './pdf-summary'

const LABELS: Record<ExportLanguage, GscExportLabels> = {
  he: {
    summarySheet: 'סיכום',
    queriesSheet: 'ביטויים ועמודים',
    pagesSheet: 'עמודים',
    keywordsSheet: 'הביטויים שבמעקב',
    field: 'נתון',
    value: 'ערך',
    project: 'פרויקט',
    domain: 'דומיין',
    property: 'נכס ב-Search Console',
    window: 'טווח',
    windowDays: (n) => `${n} הימים האחרונים`,
    range: 'תאריכים',
    latestAvailable: 'היום האחרון שגוגל מדווחת עליו',
    syncedAt: 'מועד הסנכרון',
    clicks: 'קליקים',
    impressions: 'הופעות',
    ctr: 'אחוז הקלקה',
    avgPosition: 'מיקום ממוצע בגוגל',
    query: 'ביטוי חיפוש',
    page: 'עמוד',
    keyword: 'ביטוי במעקב',
    rowsIncluded: 'מספר השורות בדוח',
    truncatedField: 'הנתונים חלקיים',
    truncatedYes: 'כן, גוגל החזירה יותר שורות ממה שנשמר',
    truncatedNo: 'לא',
    positionNote: 'המיקום בדוח הזה הוא הממוצע של גוגל לאורך הטווח, מכל מקום ומכל מכשיר שממנו חיפשו בפועל. הוא אינו בדיקת המיקום שלנו, שנמדדת במקום, במכשיר ובמועד מוגדרים, ולכן שני המספרים לא חייבים להיות זהים.',
    noKeywordData: 'גוגל לא דיווחה על הביטוי',
  },
  en: {
    summarySheet: 'Summary',
    queriesSheet: 'Queries and pages',
    pagesSheet: 'Pages',
    keywordsSheet: 'Tracked keywords',
    field: 'Field',
    value: 'Value',
    project: 'Project',
    domain: 'Domain',
    property: 'Search Console property',
    window: 'Window',
    windowDays: (n) => `Last ${n} days`,
    range: 'Dates',
    latestAvailable: 'Last day Google reports on',
    syncedAt: 'Synced at',
    clicks: 'Clicks',
    impressions: 'Impressions',
    ctr: 'CTR',
    avgPosition: 'Average position in Google',
    query: 'Search query',
    page: 'Page',
    keyword: 'Tracked keyword',
    rowsIncluded: 'Rows in this report',
    truncatedField: 'Partial data',
    truncatedYes: 'Yes, Google returned more rows than were stored',
    truncatedNo: 'No',
    positionNote: 'The position in this report is Google’s own average over the window, across every place and device real visitors searched from. It is not our rank check, which is measured at one place, one device and one moment, so the two numbers need not agree.',
    noKeywordData: 'Google reported nothing for this keyword',
  },
  es: {
    summarySheet: 'Resumen',
    queriesSheet: 'Consultas y páginas',
    pagesSheet: 'Páginas',
    keywordsSheet: 'Palabras clave en seguimiento',
    field: 'Dato',
    value: 'Valor',
    project: 'Proyecto',
    domain: 'Dominio',
    property: 'Propiedad de Search Console',
    window: 'Periodo',
    windowDays: (n) => `Últimos ${n} días`,
    range: 'Fechas',
    latestAvailable: 'Último día del que informa Google',
    syncedAt: 'Sincronizado el',
    clicks: 'Clics',
    impressions: 'Impresiones',
    ctr: 'CTR',
    avgPosition: 'Posición media en Google',
    query: 'Consulta de búsqueda',
    page: 'Página',
    keyword: 'Palabra clave en seguimiento',
    rowsIncluded: 'Filas de este informe',
    truncatedField: 'Datos parciales',
    truncatedYes: 'Sí, Google devolvió más filas de las que se guardaron',
    truncatedNo: 'No',
    positionNote: 'La posición de este informe es la media de Google durante el periodo, desde cualquier lugar y dispositivo desde el que se buscara realmente. No es nuestra comprobación de posición, que se mide en un lugar, un dispositivo y un momento concretos, por lo que las dos cifras no tienen que coincidir.',
    noKeywordData: 'Google no ha informado de esta palabra clave',
  },
  'pt-BR': {
    summarySheet: 'Resumo',
    queriesSheet: 'Consultas e páginas',
    pagesSheet: 'Páginas',
    keywordsSheet: 'Palavras-chave em acompanhamento',
    field: 'Dado',
    value: 'Valor',
    project: 'Projeto',
    domain: 'Domínio',
    property: 'Propriedade do Search Console',
    window: 'Período',
    windowDays: (n) => `Últimos ${n} dias`,
    range: 'Datas',
    latestAvailable: 'Último dia informado pelo Google',
    syncedAt: 'Sincronizado em',
    clicks: 'Cliques',
    impressions: 'Impressões',
    ctr: 'CTR',
    avgPosition: 'Posição média no Google',
    query: 'Consulta de busca',
    page: 'Página',
    keyword: 'Palavra-chave em acompanhamento',
    rowsIncluded: 'Linhas deste relatório',
    truncatedField: 'Dados parciais',
    truncatedYes: 'Sim, o Google devolveu mais linhas do que foram guardadas',
    truncatedNo: 'Não',
    positionNote: 'A posição deste relatório é a média do próprio Google ao longo do período, de qualquer lugar e dispositivo de onde as pessoas realmente buscaram. Não é a nossa verificação de posição, medida em um lugar, um dispositivo e um momento definidos, por isso os dois números não precisam coincidir.',
    noKeywordData: 'O Google não informou nada para esta palavra-chave',
  },
}

export function gscExportLabels(language: unknown): GscExportLabels {
  return LABELS[normalizeExportLanguage(language)]
}

/**
 * The words of the two-page summary (lib/gsc/export/pdf-summary.ts). Separate
 * from the spreadsheet's labels above because the summary says things a table of
 * rows never has to: what an opportunity is, what was filtered out, and what an
 * empty report means. The shared words — clicks, impressions, query, page — are
 * still read from the record above, so the two files cannot disagree on a column
 * name.
 */
const PDF_LABELS: Record<ExportLanguage, GscPdfLabels> = {
  he: {
    title: 'סיכום Search Console',
    generatedOn: 'הופק בתאריך',
    figuresTitle: 'המספרים',
    opportunitiesTitle: 'ההזדמנויות הקרובות',
    opportunitiesSub: 'ביטויים שאתם כבר מופיעים עליהם קרוב לעמוד הראשון, לפי מספר ההופעות. אלה המקומות שבהם קידום קטן מביא את התנועה הגדולה ביותר.',
    opportunitiesNone: 'אין כרגע ביטוי בטווח הזה. זה קורה כששאר הביטויים נמצאים בעמוד הראשון או רחוק ממנו.',
    topQueriesTitle: 'הביטויים המובילים',
    topQueriesSub: (n) => `${n} הביטויים עם מספר ההופעות הגבוה ביותר בטווח.`,
    topPagesTitle: 'העמודים המובילים',
    topPagesSub: (n) => `${n} העמודים שהביאו את מספר הקליקים הגבוה ביותר.`,
    keywordsTitle: 'הביטויים שבמעקב',
    keywordsMore: (n) => `עוד ${n} ביטויים במעקב מופיעים בקובץ האקסל המלא.`,
    filterNote: (min, from, to) => `הדוח הזה מסנן: ביטוי או עמוד נכנסים אליו רק מ-${min} הופעות בטווח ומעלה, וכהזדמנות נחשב מיקום ממוצע בין ${from} ל-${to}. כל השורות, גם אלה שסוננו, נמצאות בקובץ האקסל.`,
    truncatedNote: 'גוגל החזירה יותר שורות ממה שנשמר בסנכרון הזה, כך שהטבלאות מבוססות על החלק שנשמר.',
    nothingTitle: 'אין עדיין מספיק נתונים',
    nothingBody: (min) => `גוגל לא דיווחה על ביטוי או עמוד עם ${min} הופעות או יותר בטווח הזה. זה נורמלי באתר חדש או באתר שקט, והנתונים יצטברו עם הזמן.`,
  },
  en: {
    title: 'Search Console summary',
    generatedOn: 'Generated on',
    figuresTitle: 'The figures',
    opportunitiesTitle: 'Your closest opportunities',
    opportunitiesSub: 'Queries you already rank for just off the first page, ordered by how often they were searched. This is where a small push buys the most traffic.',
    opportunitiesNone: 'No query sits in that range right now. That happens when the rest are already on the first page, or still far from it.',
    topQueriesTitle: 'Top queries',
    topQueriesSub: (n) => `The ${n} queries with the most impressions in the window.`,
    topPagesTitle: 'Top pages',
    topPagesSub: (n) => `The ${n} pages that brought the most clicks.`,
    keywordsTitle: 'Your tracked keywords',
    keywordsMore: (n) => `${n} more tracked keywords are in the full spreadsheet.`,
    filterNote: (min, from, to) => `What this report filters: a query or page appears only from ${min} impressions in the window upward, and an opportunity means an average position between ${from} and ${to}. Every row, filtered ones included, is in the spreadsheet.`,
    truncatedNote: 'Google returned more rows than this sync stored, so the tables cover the part that was stored.',
    nothingTitle: 'Not enough data yet',
    nothingBody: (min) => `Google reported no query or page with ${min} impressions or more in this window. That is normal on a new or quiet site, and the data builds up over time.`,
  },
  es: {
    title: 'Resumen de Search Console',
    generatedOn: 'Generado el',
    figuresTitle: 'Las cifras',
    opportunitiesTitle: 'Tus oportunidades más cercanas',
    opportunitiesSub: 'Consultas por las que ya apareces justo fuera de la primera página, ordenadas por cuántas veces se buscaron. Aquí es donde un pequeño empujón consigue más tráfico.',
    opportunitiesNone: 'Ahora mismo ninguna consulta está en ese rango. Ocurre cuando las demás ya están en la primera página o siguen lejos de ella.',
    topQueriesTitle: 'Consultas principales',
    topQueriesSub: (n) => `Las ${n} consultas con más impresiones del periodo.`,
    topPagesTitle: 'Páginas principales',
    topPagesSub: (n) => `Las ${n} páginas que consiguieron más clics.`,
    keywordsTitle: 'Tus palabras clave en seguimiento',
    keywordsMore: (n) => `Hay ${n} palabras clave más en la hoja de cálculo completa.`,
    filterNote: (min, from, to) => `Lo que filtra este informe: una consulta o página aparece solo a partir de ${min} impresiones en el periodo, y una oportunidad es una posición media entre ${from} y ${to}. Todas las filas, incluidas las filtradas, están en la hoja de cálculo.`,
    truncatedNote: 'Google devolvió más filas de las que guardó esta sincronización, así que las tablas cubren la parte guardada.',
    nothingTitle: 'Todavía no hay datos suficientes',
    nothingBody: (min) => `Google no ha informado de ninguna consulta ni página con ${min} impresiones o más en este periodo. Es normal en un sitio nuevo o con poco tráfico, y los datos se acumulan con el tiempo.`,
  },
  'pt-BR': {
    title: 'Resumo do Search Console',
    generatedOn: 'Gerado em',
    figuresTitle: 'Os números',
    opportunitiesTitle: 'Suas oportunidades mais próximas',
    opportunitiesSub: 'Consultas em que você já aparece logo depois da primeira página, ordenadas por quantas vezes foram buscadas. É aqui que um empurrão pequeno traz mais tráfego.',
    opportunitiesNone: 'Nenhuma consulta está nessa faixa agora. Isso acontece quando as outras já estão na primeira página ou ainda estão longe dela.',
    topQueriesTitle: 'Principais consultas',
    topQueriesSub: (n) => `As ${n} consultas com mais impressões no período.`,
    topPagesTitle: 'Principais páginas',
    topPagesSub: (n) => `As ${n} páginas que trouxeram mais cliques.`,
    keywordsTitle: 'Suas palavras-chave em acompanhamento',
    keywordsMore: (n) => `Mais ${n} palavras-chave em acompanhamento estão na planilha completa.`,
    filterNote: (min, from, to) => `O que este relatório filtra: uma consulta ou página só aparece a partir de ${min} impressões no período, e uma oportunidade é uma posição média entre ${from} e ${to}. Todas as linhas, inclusive as filtradas, estão na planilha.`,
    truncatedNote: 'O Google devolveu mais linhas do que esta sincronização guardou, portanto as tabelas cobrem a parte guardada.',
    nothingTitle: 'Ainda não há dados suficientes',
    nothingBody: (min) => `O Google não informou nenhuma consulta ou página com ${min} impressões ou mais neste período. Isso é normal em um site novo ou com pouco movimento, e os dados se acumulam com o tempo.`,
  },
}

export function gscPdfLabels(language: unknown): GscPdfLabels {
  return PDF_LABELS[normalizeExportLanguage(language)]
}
