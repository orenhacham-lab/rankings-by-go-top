/**
 * The words on the claim screen, in all four languages.
 *
 * Its own module rather than a section of the dashboard dictionary, the same
 * way lib/i18n/public/affiliates.ts and affiliate-form.ts are their own: this
 * surface is reached by somebody who has just paid on another company's site
 * and is seeing ours for the first time, and its copy has one job that has
 * nothing to do with the rest of the dashboard's.
 *
 * WHAT THE WORDS MAY AND MAY NOT SAY. 'unavailable' covers four different
 * facts — no such link, already spent, refunded, cancelled — and says none of
 * them, because the screen has no way to know which one belongs to the person
 * reading it, and telling a stranger that a token exists is itself an answer.
 * 'needsOperator' never implies the money is lost: the order is on file, and
 * a person finishes it.
 *
 * Deliberately no "contact us at <address>" line: support routes already
 * exist on the site and a second, divergent one here is how an unanswered
 * mailbox gets published.
 */

import type { PublicLocale } from '@/lib/i18n/locales'

export interface MarketplaceClaimCopy {
  title: string
  claimed: string
  alreadyClaimed: string
  unavailable: string
  needsOperator: string
  failed: string
  missingToken: string
  toDashboard: string
}

export const MARKETPLACE_CLAIM_COPY: Record<PublicLocale, MarketplaceClaimCopy> = {
  he: {
    title: 'הרכישה שלך',
    claimed: 'הרכישה שויכה לחשבון שלך והמסלול פעיל. אפשר להתחיל.',
    alreadyClaimed: 'הרכישה הזאת כבר שויכה לחשבון שלך. המסלול פעיל.',
    unavailable: 'הקישור הזה לא פעיל. אם שילמת ולא קיבלת גישה, פנו אלינו מהאתר ונטפל בזה.',
    needsOperator: 'קיבלנו את הרכישה שלך, ויש פרט אחד שצריך השלמה ידנית מצידנו. אנחנו על זה, ואין צורך לשלם שוב.',
    failed: 'משהו נכשל אצלנו בדרך. נסו לרענן את העמוד בעוד רגע.',
    missingToken: 'הקישור לא כולל מספר רכישה.',
    toDashboard: 'למערכת',
  },
  en: {
    title: 'Your purchase',
    claimed: 'Your purchase is attached to this account and the plan is active. You can start.',
    alreadyClaimed: 'This purchase is already attached to your account. The plan is active.',
    unavailable: 'This link is not active. If you paid and have no access, contact us from the site and we will sort it out.',
    needsOperator: 'We have your purchase, and one detail needs finishing by hand on our side. We are on it, and there is nothing to pay again.',
    failed: 'Something failed on our side. Please reload the page in a moment.',
    missingToken: 'This link carries no purchase number.',
    toDashboard: 'Go to the app',
  },
  es: {
    title: 'Tu compra',
    claimed: 'Tu compra está asociada a esta cuenta y el plan está activo. Ya puedes empezar.',
    alreadyClaimed: 'Esta compra ya está asociada a tu cuenta. El plan está activo.',
    unavailable: 'Este enlace no está activo. Si pagaste y no tienes acceso, escríbenos desde el sitio y lo resolvemos.',
    needsOperator: 'Tenemos tu compra y un detalle debe completarse a mano por nuestra parte. Estamos en ello y no hay nada que pagar de nuevo.',
    failed: 'Algo falló de nuestro lado. Vuelve a cargar la página en un momento.',
    missingToken: 'Este enlace no incluye un número de compra.',
    toDashboard: 'Ir a la aplicación',
  },
  'pt-BR': {
    title: 'Sua compra',
    claimed: 'Sua compra está vinculada a esta conta e o plano está ativo. Você já pode começar.',
    alreadyClaimed: 'Esta compra já está vinculada à sua conta. O plano está ativo.',
    unavailable: 'Este link não está ativo. Se você pagou e não tem acesso, fale com a gente pelo site que resolvemos.',
    needsOperator: 'Recebemos sua compra e um detalhe precisa ser concluído manualmente do nosso lado. Estamos cuidando disso, e não há nada a pagar novamente.',
    failed: 'Algo falhou do nosso lado. Recarregue a página em um instante.',
    missingToken: 'Este link não traz um número de compra.',
    toDashboard: 'Ir para o aplicativo',
  },
  fr: {
    title: 'Votre achat',
    claimed: 'Votre achat est rattaché à ce compte et votre offre est active. Vous pouvez commencer.',
    alreadyClaimed: 'Cet achat est déjà rattaché à votre compte. Votre offre est active.',
    unavailable: 'Ce lien n\'est pas actif. Si vous avez payé et n\'avez pas accès, contactez-nous depuis le site et nous réglerons cela.',
    needsOperator: 'Nous avons bien votre achat, et un détail doit être finalisé manuellement de notre côté. Nous nous en occupons, et vous n\'avez rien à payer de nouveau.',
    failed: 'Quelque chose a échoué de notre côté. Rechargez la page dans un instant.',
    missingToken: 'Ce lien ne comporte aucun numéro d\'achat.',
    toDashboard: 'Accéder à l\'application',
  },
  it: {
    title: 'Il suo acquisto',
    claimed: 'L\'acquisto è collegato a questo account e il piano è attivo. Si può iniziare.',
    alreadyClaimed: 'Questo acquisto è già collegato al suo account. Il piano è attivo.',
    unavailable: 'Questo link non è attivo. Se il pagamento è stato effettuato e l\'accesso non è disponibile, è possibile contattarci dal sito e provvederemo.',
    needsOperator: 'L\'acquisto è stato registrato e un dettaglio deve essere completato manualmente da parte nostra. Ci stiamo occupando della cosa e non occorre pagare di nuovo.',
    failed: 'Qualcosa non è andato a buon fine da parte nostra. Si consiglia di ricaricare la pagina tra un istante.',
    missingToken: 'Questo link non contiene alcun numero di acquisto.',
    toDashboard: 'Vai all\'applicazione',
  },
  ja: {
    title: 'ご購入について',
    claimed: 'ご購入はこのアカウントに紐づけられ、プランが有効になりました。すぐにご利用いただけます。',
    alreadyClaimed: 'このご購入はすでにお客様のアカウントに紐づいています。プランは有効です。',
    unavailable: 'このリンクは有効ではありません。お支払いが完了しているのにご利用いただけない場合は、サイトからご連絡ください。こちらで対応いたします。',
    needsOperator: 'ご購入は記録されました。一部の処理をこちらで手動で行う必要があります。対応を進めておりますので、再度のお支払いは不要です。',
    failed: 'こちら側で問題が発生しました。しばらくしてからページを再読み込みしてください。',
    missingToken: 'このリンクには購入番号が含まれていません。',
    toDashboard: 'アプリへ進む',
  },
}
