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
}

export function gscExportLabels(language: unknown): GscExportLabels {
  return LABELS[normalizeExportLanguage(language)]
}
