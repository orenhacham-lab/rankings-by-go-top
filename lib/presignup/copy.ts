/**
 * The words of the research before sign-up that are not the research summary's
 * own (those are in the dashboard dictionary, seedOnboarding.preview, next to
 * the summary they extend).
 *
 * The consent sentences live HERE, in one place, because the server stores the
 * exact words the visitor agreed to (Israeli Communications Law s.30A and the
 * Privacy Protection Law require proof of explicit consent): the screen shows
 * these strings and the API stores the same ones, never text sent by the
 * browser. Changing a sentence changes what future consents record, so give it
 * a new version rather than editing it in place. For the same reason the
 * version is PER LOCALE: the Spanish sentence is its own consent text with its
 * own id, so a Spanish consent record can never be read as agreement to the
 * Hebrew or English wording.
 *
 * THERE ARE TWO DECISIONS, NOT ONE, and that is the whole point of v2. Until
 * 5 October 2026 a single mandatory box said "the report, AS WELL AS updates
 * and marketing content": a visitor could not have the thing they asked for
 * without also consenting to marketing. GDPR Art. 7(4) says consent is not
 * freely given when it is bundled with something the person wants, so that
 * marketing consent was worth nothing — and in Israel s.30A wants consent given
 * expressly for advertising, which a bundled tick is not. s.30A carries damages
 * of up to ILS 1,000 per message without proof of harm, which is the shape of
 * an Israeli class action.
 *
 * So: the report box stays required, because the report is what the visitor
 * asked for. Marketing is its own optional box, and the record says which way
 * it went — `consentRecord` writes the marketing sentence when it was ticked
 * and an explicit refusal line when it was not. An absence of words is not
 * proof of anything; a sentence saying "not agreed to" is.
 */
import type { PublicLocale } from '@/lib/i18n/locales'
import type { ResearchErrorCode } from './types'

export const REPORT_CONSENT_VERSION = 'report-email-v2'

/** Spanish has its own id: a Spanish record must not be read as the other wording. */
export const REPORT_CONSENT_VERSION_ES = 'report-email-es-v2'

/** Portuguese likewise. The wording is the legal thread's, reviewed in PR #97. */
export const REPORT_CONSENT_VERSION_PT = 'report-email-pt-v2'

/** The optional second decision, versioned the same way and never shared with the first. */
export const MARKETING_CONSENT_VERSION = 'marketing-email-v1'
export const MARKETING_CONSENT_VERSION_ES = 'marketing-email-es-v1'
export const MARKETING_CONSENT_VERSION_PT = 'marketing-email-pt-v1'

/**
 * One id for a refusal in every language. A refusal has no wording to prove —
 * the sentence is localized so the record reads in the visitor's language, but
 * what it attests is the same fact everywhere: marketing was offered and
 * declined. A query for who may be sent marketing is therefore
 * `consent_text like '%[marketing-email%'` and never a test for absence.
 */
export const MARKETING_DECLINED_VERSION = 'marketing-declined-v1'

/** What the required box says: the report, and nothing but the report. */
const CONSENT: Record<PublicLocale, string> = {
  he: 'אני מסכים/ה לקבל מ-Go Top בדוא״ל את דוח המחקר של האתר.',
  en: 'I agree to receive this site research report from Go Top by email.',
  es: 'Acepto recibir de Go Top por correo electrónico el informe de investigación de este sitio.',
  'pt-BR': 'Concordo em receber da Go Top, por e-mail, o relatório de pesquisa deste site.',
}

/** What the optional box says. Ticking it is the only way marketing is allowed. */
const MARKETING: Record<PublicLocale, string> = {
  he: 'אני מסכים/ה לקבל מ-Go Top גם עדכונים ותוכן שיווקי בדוא״ל. אפשר להסיר את ההסכמה בכל עת בקישור שבכל הודעה.',
  en: 'I also agree to receive updates and marketing content from Go Top by email. I can withdraw consent at any time using the link in every email.',
  es: 'Acepto también recibir de Go Top novedades y contenido comercial por correo electrónico. Puedo retirar mi consentimiento en cualquier momento con el enlace que incluye cada correo.',
  'pt-BR': 'Concordo também em receber da Go Top novidades e conteúdo comercial por e-mail. Posso retirar meu consentimento a qualquer momento pelo link que acompanha cada mensagem.',
}

/** What the record says when the optional box was left unticked. */
const MARKETING_DECLINED: Record<PublicLocale, string> = {
  he: 'עדכונים ותוכן שיווקי הוצעו ולא אושרו.',
  en: 'Updates and marketing content were offered and not agreed to.',
  es: 'Se ofrecieron novedades y contenido comercial y no se aceptaron.',
  'pt-BR': 'Novidades e conteúdo comercial foram oferecidos e não foram aceitos.',
}

const CONSENT_VERSION: Record<PublicLocale, string> = {
  he: REPORT_CONSENT_VERSION,
  en: REPORT_CONSENT_VERSION,
  es: REPORT_CONSENT_VERSION_ES,
  'pt-BR': REPORT_CONSENT_VERSION_PT,
}

const MARKETING_VERSION: Record<PublicLocale, string> = {
  he: MARKETING_CONSENT_VERSION,
  en: MARKETING_CONSENT_VERSION,
  es: MARKETING_CONSENT_VERSION_ES,
  'pt-BR': MARKETING_CONSENT_VERSION_PT,
}

export function reportConsentText(locale: PublicLocale): string {
  return `${CONSENT[locale]} [${CONSENT_VERSION[locale]}]`
}

export function marketingConsentText(locale: PublicLocale): string {
  return `${MARKETING[locale]} [${MARKETING_VERSION[locale]}]`
}

/**
 * THE WHOLE RECORD, which is what the server stores: both decisions, in the
 * visitor's own language, each with its own version id. It is deliberately one
 * string rather than a second column, because the column list of
 * free_check_report_requests is fixed and a schema change to Production needs
 * Oren's word; a text that states both decisions proves both of them, and the
 * marketing id is greppable for the day a sender exists.
 */
export function consentRecord(locale: PublicLocale, marketing: boolean): string {
  const second = marketing
    ? marketingConsentText(locale)
    : `${MARKETING_DECLINED[locale]} [${MARKETING_DECLINED_VERSION}]`
  return `${reportConsentText(locale)} ${second}`
}

export type ResearchScreenCopy = {
  errors: Record<ResearchErrorCode, string>
  unavailableTitle: string
  unavailableBody: string
  report: {
    link: string
    title: string
    body: string
    emailLabel: string
    emailPlaceholder: string
    consent: string
    marketing: string
    privacy: string
    submit: string
    sending: string
    saved: string
    errors: Record<'consent_required' | 'invalid_email' | 'invalid_claim' | 'rate_limited' | 'unavailable' | 'internal', string>
  }
}

const he: ResearchScreenCopy = {
  errors: {
    not_found: 'המחקר המלא לא זמין כאן.',
    invalid_url: 'הכתובת לא נראית תקינה. נסו שוב, לדוגמה example.co.il',
    blocked_url: 'אפשר לחקור רק אתרים ציבוריים. כתובת פנימית, כתובת IP או הפניה לאתר אחר לא נתמכות.',
    unreachable: 'לא הצלחנו להגיע לאתר. בדקו את הכתובת ונסו שוב.',
    not_html: 'הכתובת הזאת לא מחזירה עמוד אינטרנט שאפשר לקרוא.',
    forbidden: 'האתר חוסם קוראים אוטומטיים, וגם בגוגל לא מצאנו ממנו עמודים. נסו כתובת אחרת של האתר.',
    rate_limited: 'הרצתם כמה מחקרים ברצף. נסו שוב בעוד כמה דקות.',
    daily_cap: 'המחקר החינמי עמוס היום. נסו שוב מאוחר יותר, או פתחו חשבון והמחקר ירוץ בפרויקט שלכם.',
    unavailable: 'המחקר המלא לא זמין כרגע.',
    internal: 'משהו נתקע אצלנו. נסו שוב בעוד רגע.',
  },
  unavailableTitle: 'המחקר המלא לא זמין כרגע',
  unavailableBody: 'בינתיים הרצנו בשבילכם את הבדיקה המהירה של האתר.',
  report: {
    link: 'שלחו לי את הדוח במייל',
    title: 'לקבל את הדוח במייל',
    body: 'השאירו כתובת, ונשלח אליה את דוח המחקר של האתר.',
    emailLabel: 'כתובת אימייל',
    emailPlaceholder: 'you@example.com',
    consent: CONSENT.he,
    marketing: MARKETING.he,
    privacy: 'מדיניות הפרטיות',
    submit: 'שמרו את הבקשה',
    sending: 'שומרים…',
    saved: 'קיבלנו. דוח המחקר יישלח לכתובת הזו.',
    errors: {
      consent_required: 'כדי שנשלח את הדוח צריך לסמן את תיבת ההסכמה.',
      invalid_email: 'כתובת האימייל לא נראית תקינה.',
      invalid_claim: 'המחקר הזה כבר לא זמין לשליחה. הריצו אותו שוב.',
      rate_limited: 'שלחתם כמה בקשות ברצף. נסו שוב מאוחר יותר.',
      unavailable: 'לא הצלחנו לשמור את הבקשה כרגע. נסו שוב מאוחר יותר.',
      internal: 'משהו נתקע אצלנו. נסו שוב בעוד רגע.',
    },
  },
}

const en: ResearchScreenCopy = {
  errors: {
    not_found: 'The full research is not available here.',
    invalid_url: "That address doesn't look right. Try again, e.g. example.com",
    blocked_url: 'Only public websites can be researched. Internal addresses, IP addresses and redirects to another site are not supported.',
    unreachable: "We couldn't reach the site. Check the address and try again.",
    not_html: "This address doesn't return a web page we can read.",
    forbidden: "The site blocks automated readers, and Google shows none of its pages either. Try another address of the site.",
    rate_limited: "You've run several researches in a row. Try again in a few minutes.",
    daily_cap: 'The free research is busy today. Try again later, or open an account and the research runs in your project.',
    unavailable: 'The full research is not available right now.',
    internal: 'Something got stuck on our side. Try again in a moment.',
  },
  unavailableTitle: 'The full research is not available right now',
  unavailableBody: "Meanwhile, we've run the quick check of your site.",
  report: {
    link: 'Email me the report',
    title: 'Get the report by email',
    body: "Leave an address and we'll send the site research report to it.",
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    consent: CONSENT.en,
    marketing: MARKETING.en,
    privacy: 'Privacy policy',
    submit: 'Save my request',
    sending: 'Saving…',
    saved: 'Got it. The research report will be sent to this address.',
    errors: {
      consent_required: 'To send you the report, please tick the consent box.',
      invalid_email: "That email address doesn't look right.",
      invalid_claim: 'This research can no longer be sent. Run it again.',
      rate_limited: "You've sent several requests in a row. Try again later.",
      unavailable: "We couldn't save your request right now. Try again later.",
      internal: 'Something got stuck on our side. Try again in a moment.',
    },
  },
}

const es: ResearchScreenCopy = {
  errors: {
    not_found: 'La investigación completa no está disponible aquí.',
    invalid_url: 'Esa dirección no parece correcta. Inténtalo de nuevo, por ejemplo ejemplo.com',
    blocked_url: 'Solo se pueden investigar sitios web públicos. Las direcciones internas, las IP y las redirecciones a otro sitio no están admitidas.',
    unreachable: 'No pudimos acceder al sitio. Revisa la dirección e inténtalo de nuevo.',
    not_html: 'Esta dirección no devuelve una página web que podamos leer.',
    forbidden: 'El sitio bloquea a los lectores automáticos, y Google tampoco muestra ninguna de sus páginas. Prueba con otra dirección del sitio.',
    rate_limited: 'Has lanzado varias investigaciones seguidas. Inténtalo de nuevo en unos minutos.',
    daily_cap: 'La investigación gratuita está saturada hoy. Inténtalo más tarde, o abre una cuenta y la investigación se ejecuta en tu proyecto.',
    unavailable: 'La investigación completa no está disponible ahora mismo.',
    internal: 'Algo se atascó por nuestra parte. Inténtalo de nuevo en un momento.',
  },
  unavailableTitle: 'La investigación completa no está disponible ahora mismo',
  unavailableBody: 'Mientras tanto, hemos hecho el análisis rápido de tu sitio.',
  report: {
    link: 'Enviadme el informe por correo',
    title: 'Recibir el informe por correo',
    body: 'Déjanos una dirección y te enviamos el informe de investigación del sitio.',
    emailLabel: 'Dirección de correo',
    emailPlaceholder: 'tu@ejemplo.com',
    consent: CONSENT.es,
    marketing: MARKETING.es,
    privacy: 'Política de privacidad',
    submit: 'Guardar mi solicitud',
    sending: 'Guardando…',
    saved: 'Recibido. El informe de investigación se enviará a esta dirección.',
    errors: {
      consent_required: 'Para enviarte el informe, marca la casilla de consentimiento.',
      invalid_email: 'Esa dirección de correo no parece correcta.',
      invalid_claim: 'Esta investigación ya no se puede enviar. Vuelve a ejecutarla.',
      rate_limited: 'Has enviado varias solicitudes seguidas. Inténtalo de nuevo más tarde.',
      unavailable: 'No pudimos guardar tu solicitud ahora mismo. Inténtalo de nuevo más tarde.',
      internal: 'Algo se atascó por nuestra parte. Inténtalo de nuevo en un momento.',
    },
  },
}

const ptBR: ResearchScreenCopy = {
  errors: {
    not_found: 'A pesquisa completa não está disponível aqui.',
    invalid_url: 'Esse endereço não parece correto. Tente de novo, por exemplo exemplo.com',
    blocked_url: 'Só é possível pesquisar sites públicos. Endereços internos, IPs e redirecionamentos para outro site não são aceitos.',
    unreachable: 'Não conseguimos acessar o site. Verifique o endereço e tente de novo.',
    not_html: 'Este endereço não devolve uma página que possamos ler.',
    forbidden: 'O site bloqueia leitores automáticos, e o Google também não mostra nenhuma de suas páginas. Tente outro endereço do site.',
    rate_limited: 'Você iniciou várias pesquisas seguidas. Tente de novo em alguns minutos.',
    daily_cap: 'A pesquisa gratuita está lotada hoje. Tente mais tarde, ou abra uma conta e a pesquisa roda no seu projeto.',
    unavailable: 'A pesquisa completa não está disponível agora.',
    internal: 'Algo travou do nosso lado. Tente de novo em um instante.',
  },
  unavailableTitle: 'A pesquisa completa não está disponível agora',
  unavailableBody: 'Por enquanto, fizemos a análise rápida do seu site.',
  report: {
    link: 'Quero receber o relatório por e-mail',
    title: 'Receber o relatório por e-mail',
    body: 'Deixe um endereço e enviamos o relatório de pesquisa do site.',
    emailLabel: 'Endereço de e-mail',
    emailPlaceholder: 'voce@exemplo.com',
    consent: CONSENT['pt-BR'],
    marketing: MARKETING['pt-BR'],
    privacy: 'Política de privacidade',
    submit: 'Salvar minha solicitação',
    sending: 'Salvando…',
    saved: 'Recebido. O relatório de pesquisa será enviado para este endereço.',
    errors: {
      consent_required: 'Para enviar o relatório, marque a caixa de consentimento.',
      invalid_email: 'Esse endereço de e-mail não parece correto.',
      invalid_claim: 'Esta pesquisa já não pode ser enviada. Rode-a de novo.',
      rate_limited: 'Você enviou várias solicitações seguidas. Tente de novo mais tarde.',
      unavailable: 'Não conseguimos salvar sua solicitação agora. Tente de novo mais tarde.',
      internal: 'Algo travou do nosso lado. Tente de novo em um instante.',
    },
  },
}

const SCREEN: Record<PublicLocale, ResearchScreenCopy> = { he, en, es, 'pt-BR': ptBR }

export function researchScreenCopy(locale: PublicLocale): ResearchScreenCopy {
  return SCREEN[locale] ?? he
}
