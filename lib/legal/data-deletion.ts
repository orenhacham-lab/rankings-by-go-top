/**
 * The public Data Deletion page of the Facebook and Instagram posting feature,
 * in all eleven languages. Meta requires a public page that tells a person how
 * to have their data deleted; the callback at /api/meta/data-deletion hands the
 * person here with a confirmation code.
 *
 * The app's name is META_APP_NAME and is printed exactly as registered at Meta
 * (legal review 2026-11-25, condition 5). The text says only what the code does
 * (lib/meta-posts/store.ts): disconnecting deletes the tokens and the saved
 * Page; a verified deletion request deletes the connection, the saved Pages and
 * every post record; published posts stay on Facebook and Instagram until the
 * person removes them there. Nothing here suggests Meta makes or endorses the
 * service. A page that names a person or holds anything but a code is not built.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export interface DataDeletionText {
  title: string
  subtitle: string
  /** Contains {app} */
  intro: string
  deletedTitle: string
  deleted: string[]
  keptTitle: string
  kept: string[]
  howTitle: string
  /** Three ways; the third contains {email}. */
  how: [string, string, string]
  statusTitle: string
  statusCodeLabel: string
  statusDone: string
  statusUnknown: string
  trademark: string
  breadcrumb: string
}

const en: DataDeletionText = {
  title: 'Data deletion: {app}',
  subtitle: 'How to delete the data held for the Facebook and Instagram posting feature of Go Top SEO',
  intro: '{app} is the app through which Go Top SEO publishes posts that you approved to your Facebook Page and to the Instagram professional account linked to it. This page explains how to have the data we hold about that connection deleted. The operator is GO TOP DIGITAL MARKETING AND ADVERTISING LTD (company number 517274346).',
  deletedTitle: 'What is deleted',
  deleted: [
    'The access tokens Facebook gave us (stored encrypted) and your Facebook user identifier.',
    'The Facebook Page you saved for a project, and the linked Instagram account’s identifier and username.',
    'Every post record: drafts, scheduled posts and published posts, with their text, links, times, and the identifiers Facebook or Instagram returned.',
  ],
  keptTitle: 'What is not deleted by us',
  kept: [
    'Posts already published on Facebook or Instagram. Remove them there, in the post’s own menu.',
    'Data held by Meta (your Page, its posts and followers). Meta processes it under its own policy and controls it.',
  ],
  howTitle: 'How to delete your data',
  how: [
    'In Go Top SEO, open “Facebook & Instagram”, and press “Disconnect”. This asks Facebook to remove our permissions and deletes the tokens and the saved Page at once. Your post history stays until you use one of the two options below.',
    'In your Facebook settings, find “Go Top SEO Publisher” among the apps connected to your account, remove it, and choose to delete the data it received. Facebook then sends us a deletion request, and we delete everything listed above automatically, within 30 days and usually at once. You receive a confirmation code, which you can check below.',
    'Email {email} from the email address of your Go Top SEO account. We confirm that the request comes from that address, and delete within 30 days.',
  ],
  statusTitle: 'Check a deletion request',
  statusCodeLabel: 'Confirmation code',
  statusDone: 'This request was received and the data was deleted.',
  statusUnknown: 'No request was found for this code.',
  trademark: 'Facebook and Instagram are trademarks of Meta Platforms, Inc. This service is not made, approved or endorsed by Meta.',
  breadcrumb: 'Data deletion',
}

const he: DataDeletionText = {
  title: 'מחיקת נתונים: {app}',
  subtitle: 'איך מוחקים את הנתונים שנשמרו עבור הפרסום בפייסבוק ובאינסטגרם ב-Go Top SEO',
  intro: '{app} היא האפליקציה שדרכה Go Top SEO מפרסמת פוסטים שאישרת בעמוד הפייסבוק שלך ובחשבון האינסטגרם העסקי המקושר אליו. הדף הזה מסביר איך למחוק את הנתונים ששמורים אצלנו על החיבור הזה. המפעילה היא גו טופ שיווק ופרסום דיגיטלי בע״מ (ח.פ. 517274346).',
  deletedTitle: 'מה נמחק',
  deleted: [
    'אסימוני הגישה שפייסבוק נתנה לנו (שמורים מוצפנים) ומזהה המשתמש שלך בפייסבוק.',
    'עמוד הפייסבוק ששמרת לפרויקט, ומזהה ושם המשתמש של חשבון האינסטגרם המקושר.',
    'כל רשומות הפוסטים: טיוטות, פוסטים מתוזמנים ופוסטים שפורסמו, עם הטקסט, הקישורים, הזמנים והמזהים שפייסבוק או אינסטגרם החזירו.',
  ],
  keptTitle: 'מה אנחנו לא מוחקים',
  kept: [
    'פוסטים שכבר פורסמו בפייסבוק או באינסטגרם. אפשר להסיר אותם שם, בתפריט של הפוסט עצמו.',
    'מידע שנמצא אצל Meta (העמוד, הפוסטים והעוקבים). Meta מעבדת אותו לפי המדיניות שלה והיא השולטת בו.',
  ],
  howTitle: 'איך מוחקים את הנתונים',
  how: [
    'ב-Go Top SEO פתח את “פייסבוק ואינסטגרם” ולחץ על “ניתוק”. הפעולה מבקשת מפייסבוק להסיר את ההרשאות שלנו ומוחקת מיד את האסימונים ואת העמוד ששמרנו. היסטוריית הפוסטים נשארת עד שתשתמש באחת משתי האפשרויות הבאות.',
    'בהגדרות הפייסבוק שלך מצא את “Go Top SEO Publisher” ברשימת האפליקציות המחוברות לחשבון, הסר אותה ובחר למחוק את הנתונים שקיבלה. פייסבוק שולחת לנו בקשת מחיקה, ואנו מוחקים אוטומטית את כל מה שמופיע למעלה, בתוך 30 יום ובדרך כלל מיד. תקבל קוד אישור ותוכל לבדוק אותו למטה.',
    'כתוב ל-{email} מכתובת הדוא״ל של חשבון Go Top SEO שלך. נוודא שהבקשה מגיעה מהכתובת הזו ונמחק בתוך 30 יום.',
  ],
  statusTitle: 'בדיקת בקשת מחיקה',
  statusCodeLabel: 'קוד אישור',
  statusDone: 'הבקשה התקבלה והנתונים נמחקו.',
  statusUnknown: 'לא נמצאה בקשה עם הקוד הזה.',
  trademark: 'Facebook ו-Instagram הם סימנים מסחריים של Meta Platforms, Inc. השירות אינו מופעל, מאושר או ממומן על ידי Meta.',
  breadcrumb: 'מחיקת נתונים',
}

const es: DataDeletionText = {
  title: 'Eliminación de datos: {app}',
  subtitle: 'Cómo eliminar los datos guardados para la publicación en Facebook e Instagram de Go Top SEO',
  intro: '{app} es la app con la que Go Top SEO publica las publicaciones que usted aprueba en su Página de Facebook y en la cuenta profesional de Instagram vinculada. Esta página explica cómo eliminar los datos que guardamos sobre esa conexión. El responsable es GO TOP DIGITAL MARKETING AND ADVERTISING LTD (número de empresa 517274346).',
  deletedTitle: 'Qué se elimina',
  deleted: [
    'Los tokens de acceso que Facebook nos entregó (guardados cifrados) y su identificador de usuario de Facebook.',
    'La Página de Facebook que guardó para un proyecto, y el identificador y el nombre de usuario de la cuenta de Instagram vinculada.',
    'Todos los registros de publicaciones: borradores, programadas y publicadas, con su texto, enlaces, horas y los identificadores que devolvió Facebook o Instagram.',
  ],
  keptTitle: 'Lo que nosotros no eliminamos',
  kept: [
    'Las publicaciones ya publicadas en Facebook o Instagram. Quítelas allí, desde el menú de la propia publicación.',
    'Los datos que tiene Meta (su Página, sus publicaciones y seguidores). Meta los trata según su propia política y los controla.',
  ],
  howTitle: 'Cómo eliminar sus datos',
  how: [
    'En Go Top SEO, abra «Facebook e Instagram» y pulse «Desconectar». Esto pide a Facebook que retire nuestros permisos y elimina de inmediato los tokens y la Página guardada. Su historial de publicaciones permanece hasta que use una de las dos opciones siguientes.',
    'En la configuración de Facebook, busque «Go Top SEO Publisher» entre las apps conectadas a su cuenta, quítela y elija eliminar los datos que recibió. Facebook nos envía entonces una solicitud de eliminación y eliminamos automáticamente todo lo indicado arriba, en un plazo de 30 días y normalmente de inmediato. Recibirá un código de confirmación que puede consultar más abajo.',
    'Escriba a {email} desde la dirección de correo de su cuenta de Go Top SEO. Comprobamos que la solicitud llega de esa dirección y eliminamos en un plazo de 30 días.',
  ],
  statusTitle: 'Consultar una solicitud de eliminación',
  statusCodeLabel: 'Código de confirmación',
  statusDone: 'La solicitud fue recibida y los datos fueron eliminados.',
  statusUnknown: 'No se encontró ninguna solicitud con este código.',
  trademark: 'Facebook e Instagram son marcas registradas de Meta Platforms, Inc. Este servicio no está creado, aprobado ni respaldado por Meta.',
  breadcrumb: 'Eliminación de datos',
}

const ptBR: DataDeletionText = {
  title: 'Exclusão de dados: {app}',
  subtitle: 'Como excluir os dados guardados para a publicação no Facebook e no Instagram do Go Top SEO',
  intro: '{app} é o app pelo qual o Go Top SEO publica as publicações que você aprovou na sua Página do Facebook e na conta profissional do Instagram vinculada. Esta página explica como excluir os dados que guardamos sobre essa conexão. A operadora é GO TOP DIGITAL MARKETING AND ADVERTISING LTD (número da empresa 517274346).',
  deletedTitle: 'O que é excluído',
  deleted: [
    'Os tokens de acesso que o Facebook nos entregou (guardados criptografados) e o seu identificador de usuário do Facebook.',
    'A Página do Facebook que você salvou para um projeto, e o identificador e o nome de usuário da conta do Instagram vinculada.',
    'Todos os registros de publicações: rascunhos, agendadas e publicadas, com texto, links, horários e os identificadores devolvidos pelo Facebook ou Instagram.',
  ],
  keptTitle: 'O que nós não excluímos',
  kept: [
    'As publicações já feitas no Facebook ou no Instagram. Remova-as lá, no menu da própria publicação.',
    'Os dados que estão com a Meta (sua Página, as publicações e os seguidores). A Meta os trata conforme a política dela e os controla.',
  ],
  howTitle: 'Como excluir seus dados',
  how: [
    'No Go Top SEO, abra «Facebook e Instagram» e clique em «Desconectar». Isso pede ao Facebook que remova nossas permissões e apaga na hora os tokens e a Página salva. O histórico de publicações permanece até você usar uma das duas opções abaixo.',
    'Nas configurações do Facebook, encontre «Go Top SEO Publisher» entre os apps conectados à sua conta, remova-o e escolha excluir os dados que ele recebeu. O Facebook nos envia então uma solicitação de exclusão e apagamos automaticamente tudo o que está listado acima, em até 30 dias e normalmente na hora. Você recebe um código de confirmação que pode consultar abaixo.',
    'Escreva para {email} a partir do e-mail da sua conta do Go Top SEO. Confirmamos que o pedido vem desse endereço e apagamos em até 30 dias.',
  ],
  statusTitle: 'Consultar uma solicitação de exclusão',
  statusCodeLabel: 'Código de confirmação',
  statusDone: 'A solicitação foi recebida e os dados foram excluídos.',
  statusUnknown: 'Nenhuma solicitação foi encontrada para este código.',
  trademark: 'Facebook e Instagram são marcas registradas da Meta Platforms, Inc. Este serviço não é feito, aprovado nem endossado pela Meta.',
  breadcrumb: 'Exclusão de dados',
}

const fr: DataDeletionText = {
  title: 'Suppression des données : {app}',
  subtitle: 'Comment supprimer les données conservées pour la publication Facebook et Instagram de Go Top SEO',
  intro: '{app} est l’application par laquelle Go Top SEO publie les publications que vous avez approuvées sur votre Page Facebook et sur le compte professionnel Instagram qui y est lié. Cette page explique comment faire supprimer les données que nous conservons sur cette connexion. L’exploitant est GO TOP DIGITAL MARKETING AND ADVERTISING LTD (numéro d’entreprise 517274346).',
  deletedTitle: 'Ce qui est supprimé',
  deleted: [
    'Les jetons d’accès que Facebook nous a délivrés (conservés chiffrés) et votre identifiant d’utilisateur Facebook.',
    'La Page Facebook enregistrée pour un projet, ainsi que l’identifiant et le nom d’utilisateur du compte Instagram lié.',
    'Tous les enregistrements de publications : brouillons, publications programmées et publiées, avec leur texte, leurs liens, leurs heures et les identifiants renvoyés par Facebook ou Instagram.',
  ],
  keptTitle: 'Ce que nous ne supprimons pas',
  kept: [
    'Les publications déjà parues sur Facebook ou Instagram. Retirez-les là-bas, depuis le menu de la publication.',
    'Les données détenues par Meta (votre Page, ses publications et abonnés). Meta les traite selon sa propre politique et en a le contrôle.',
  ],
  howTitle: 'Comment supprimer vos données',
  how: [
    'Dans Go Top SEO, ouvrez « Facebook et Instagram » et cliquez sur « Déconnecter ». Cela demande à Facebook de retirer nos autorisations et supprime aussitôt les jetons et la Page enregistrée. Votre historique de publications reste jusqu’à ce que vous utilisiez l’une des deux options suivantes.',
    'Dans vos paramètres Facebook, trouvez « Go Top SEO Publisher » parmi les applications connectées à votre compte, retirez-la et choisissez de supprimer les données qu’elle a reçues. Facebook nous envoie alors une demande de suppression, et nous supprimons automatiquement tout ce qui est listé ci-dessus, dans un délai de 30 jours et en général aussitôt. Vous recevez un code de confirmation que vous pouvez vérifier ci-dessous.',
    'Écrivez à {email} depuis l’adresse e-mail de votre compte Go Top SEO. Nous vérifions que la demande vient de cette adresse et supprimons dans un délai de 30 jours.',
  ],
  statusTitle: 'Vérifier une demande de suppression',
  statusCodeLabel: 'Code de confirmation',
  statusDone: 'La demande a été reçue et les données ont été supprimées.',
  statusUnknown: 'Aucune demande n’a été trouvée pour ce code.',
  trademark: 'Facebook et Instagram sont des marques de Meta Platforms, Inc. Ce service n’est ni créé, ni approuvé, ni soutenu par Meta.',
  breadcrumb: 'Suppression des données',
}

const it: DataDeletionText = {
  title: 'Eliminazione dei dati: {app}',
  subtitle: 'Come eliminare i dati conservati per la pubblicazione su Facebook e Instagram di Go Top SEO',
  intro: '{app} è l’app con cui Go Top SEO pubblica i post che hai approvato sulla tua Pagina Facebook e sull’account professionale Instagram collegato. Questa pagina spiega come far eliminare i dati che conserviamo su questo collegamento. Il gestore è GO TOP DIGITAL MARKETING AND ADVERTISING LTD (numero d’impresa 517274346).',
  deletedTitle: 'Cosa viene eliminato',
  deleted: [
    'I token di accesso che Facebook ci ha rilasciato (conservati cifrati) e il tuo identificativo utente Facebook.',
    'La Pagina Facebook che hai salvato per un progetto, e l’identificativo e il nome utente dell’account Instagram collegato.',
    'Tutti i record dei post: bozze, post programmati e pubblicati, con testo, link, orari e gli identificativi restituiti da Facebook o Instagram.',
  ],
  keptTitle: 'Cosa non eliminiamo noi',
  kept: [
    'I post già pubblicati su Facebook o Instagram. Rimuovili lì, dal menu del post stesso.',
    'I dati presenti presso Meta (la tua Pagina, i post e i follower). Meta li tratta secondo la propria informativa e ne ha il controllo.',
  ],
  howTitle: 'Come eliminare i tuoi dati',
  how: [
    'In Go Top SEO apri «Facebook e Instagram» e premi «Scollega». Questo chiede a Facebook di revocare i nostri permessi ed elimina subito i token e la Pagina salvata. La cronologia dei post resta finché non usi una delle due opzioni seguenti.',
    'Nelle impostazioni di Facebook trova «Go Top SEO Publisher» tra le app collegate al tuo account, rimuovila e scegli di eliminare i dati che ha ricevuto. Facebook ci invia una richiesta di eliminazione e noi eliminiamo automaticamente tutto quanto elencato sopra, entro 30 giorni e di norma subito. Ricevi un codice di conferma che puoi verificare qui sotto.',
    'Scrivi a {email} dall’indirizzo e-mail del tuo account Go Top SEO. Verifichiamo che la richiesta provenga da quell’indirizzo ed eliminiamo entro 30 giorni.',
  ],
  statusTitle: 'Verifica una richiesta di eliminazione',
  statusCodeLabel: 'Codice di conferma',
  statusDone: 'La richiesta è stata ricevuta e i dati sono stati eliminati.',
  statusUnknown: 'Nessuna richiesta trovata per questo codice.',
  trademark: 'Facebook e Instagram sono marchi di Meta Platforms, Inc. Questo servizio non è prodotto, approvato né sostenuto da Meta.',
  breadcrumb: 'Eliminazione dei dati',
}

const ja: DataDeletionText = {
  title: 'データの削除：{app}',
  subtitle: 'Go Top SEOのFacebook・Instagram投稿機能のために保存されたデータの削除方法',
  intro: '{app}は、Go Top SEOが、お客様が承認した投稿をお客様のFacebookページと連携したInstagramのプロアカウントに公開するためのアプリです。このページでは、この接続について当社が保有するデータを削除する方法を説明します。運営者はGO TOP DIGITAL MARKETING AND ADVERTISING LTD（会社番号517274346）です。',
  deletedTitle: '削除されるもの',
  deleted: [
    'Facebookが当社に発行したアクセストークン（暗号化して保存）と、お客様のFacebookユーザーID。',
    'プロジェクトに保存したFacebookページ、および連携したInstagramアカウントのIDとユーザー名。',
    'すべての投稿記録：下書き、予約済み、公開済みの投稿と、その本文、リンク、日時、FacebookまたはInstagramが返したID。',
  ],
  keptTitle: '当社では削除しないもの',
  kept: [
    'すでにFacebookやInstagramに公開された投稿。投稿のメニューから、そちらで削除してください。',
    'Metaが保有するデータ（ページ、投稿、フォロワー）。Metaが自社のポリシーに従って処理し、管理しています。',
  ],
  howTitle: 'データの削除方法',
  how: [
    'Go Top SEOで「FacebookとInstagram」を開き、「接続を解除」を押します。当社の権限の削除をFacebookに依頼し、トークンと保存したページを直ちに削除します。投稿履歴は、下の2つの方法のいずれかを使うまで残ります。',
    'Facebookの設定で、アカウントに連携されたアプリの中から「Go Top SEO Publisher」を探して削除し、アプリが受け取ったデータの削除を選択します。Facebookから当社に削除リクエストが届き、上記のすべてを30日以内（通常は直ちに）に自動的に削除します。確認コードが発行され、下で確認できます。',
    'Go Top SEOアカウントのメールアドレスから {email} までご連絡ください。依頼がそのアドレスから届いたことを確認し、30日以内に削除します。',
  ],
  statusTitle: '削除リクエストの確認',
  statusCodeLabel: '確認コード',
  statusDone: 'リクエストを受け付け、データを削除しました。',
  statusUnknown: 'このコードのリクエストは見つかりませんでした。',
  trademark: 'FacebookとInstagramはMeta Platforms, Inc.の商標です。本サービスはMetaが提供、承認、推奨するものではありません。',
  breadcrumb: 'データの削除',
}

const de: DataDeletionText = {
  title: 'Datenlöschung: {app}',
  subtitle: 'So löschen Sie die Daten, die für die Facebook- und Instagram-Veröffentlichung von Go Top SEO gespeichert sind',
  intro: '{app} ist die App, über die Go Top SEO Beiträge, die Sie freigegeben haben, auf Ihrer Facebook-Seite und auf dem verknüpften professionellen Instagram-Konto veröffentlicht. Diese Seite erklärt, wie Sie die Daten löschen lassen, die wir zu dieser Verbindung speichern. Betreiberin ist GO TOP DIGITAL MARKETING AND ADVERTISING LTD (Handelsregisternummer 517274346).',
  deletedTitle: 'Was gelöscht wird',
  deleted: [
    'Die Zugriffstoken, die Facebook uns ausgestellt hat (verschlüsselt gespeichert), und Ihre Facebook-Nutzerkennung.',
    'Die Facebook-Seite, die Sie für ein Projekt gespeichert haben, sowie Kennung und Benutzername des verknüpften Instagram-Kontos.',
    'Alle Beitragsdatensätze: Entwürfe, geplante und veröffentlichte Beiträge mit Text, Links, Zeiten und den von Facebook oder Instagram zurückgegebenen Kennungen.',
  ],
  keptTitle: 'Was wir nicht löschen',
  kept: [
    'Beiträge, die bereits auf Facebook oder Instagram veröffentlicht sind. Entfernen Sie sie dort über das Menü des Beitrags.',
    'Daten, die bei Meta liegen (Ihre Seite, deren Beiträge und Follower). Meta verarbeitet sie nach der eigenen Richtlinie und kontrolliert sie.',
  ],
  howTitle: 'So löschen Sie Ihre Daten',
  how: [
    'Öffnen Sie in Go Top SEO „Facebook und Instagram“ und klicken Sie auf „Trennen“. Das bittet Facebook, unsere Berechtigungen zu entfernen, und löscht sofort die Token und die gespeicherte Seite. Ihr Beitragsverlauf bleibt, bis Sie eine der beiden folgenden Möglichkeiten nutzen.',
    'Suchen Sie in Ihren Facebook-Einstellungen „Go Top SEO Publisher“ unter den mit Ihrem Konto verbundenen Apps, entfernen Sie die App und wählen Sie, die von ihr erhaltenen Daten zu löschen. Facebook sendet uns dann eine Löschanfrage, und wir löschen alles oben Genannte automatisch, innerhalb von 30 Tagen und in der Regel sofort. Sie erhalten einen Bestätigungscode, den Sie unten prüfen können.',
    'Schreiben Sie an {email} von der E-Mail-Adresse Ihres Go-Top-SEO-Kontos. Wir prüfen, dass die Anfrage von dieser Adresse kommt, und löschen innerhalb von 30 Tagen.',
  ],
  statusTitle: 'Löschanfrage prüfen',
  statusCodeLabel: 'Bestätigungscode',
  statusDone: 'Die Anfrage wurde empfangen und die Daten wurden gelöscht.',
  statusUnknown: 'Zu diesem Code wurde keine Anfrage gefunden.',
  trademark: 'Facebook und Instagram sind Marken von Meta Platforms, Inc. Dieser Dienst wird nicht von Meta hergestellt, genehmigt oder empfohlen.',
  breadcrumb: 'Datenlöschung',
}

const nl: DataDeletionText = {
  title: 'Gegevensverwijdering: {app}',
  subtitle: 'Zo verwijdert u de gegevens die zijn bewaard voor het publiceren op Facebook en Instagram via Go Top SEO',
  intro: '{app} is de app waarmee Go Top SEO berichten die u hebt goedgekeurd publiceert op uw Facebook-pagina en op het gekoppelde zakelijke Instagram-account. Deze pagina legt uit hoe u de gegevens laat verwijderen die wij over die koppeling bewaren. De exploitant is GO TOP DIGITAL MARKETING AND ADVERTISING LTD (ondernemingsnummer 517274346).',
  deletedTitle: 'Wat wordt verwijderd',
  deleted: [
    'De toegangstokens die Facebook ons gaf (versleuteld bewaard) en uw Facebook-gebruikersidentificatie.',
    'De Facebook-pagina die u voor een project hebt opgeslagen, en de identificatie en gebruikersnaam van het gekoppelde Instagram-account.',
    'Alle berichtgegevens: concepten, geplande en gepubliceerde berichten, met tekst, links, tijden en de identificaties die Facebook of Instagram teruggaf.',
  ],
  keptTitle: 'Wat wij niet verwijderen',
  kept: [
    'Berichten die al op Facebook of Instagram zijn gepubliceerd. Verwijder ze daar, via het menu van het bericht zelf.',
    'Gegevens die bij Meta staan (uw pagina, de berichten en volgers). Meta verwerkt ze volgens eigen beleid en heeft er de controle over.',
  ],
  howTitle: 'Zo verwijdert u uw gegevens',
  how: [
    'Open in Go Top SEO ‘Facebook en Instagram’ en klik op ‘Loskoppelen’. Dat vraagt Facebook onze machtigingen in te trekken en verwijdert direct de tokens en de opgeslagen pagina. Uw berichtgeschiedenis blijft staan tot u een van de twee onderstaande mogelijkheden gebruikt.',
    'Zoek in uw Facebook-instellingen ‘Go Top SEO Publisher’ onder de apps die met uw account zijn verbonden, verwijder de app en kies ervoor de ontvangen gegevens te verwijderen. Facebook stuurt ons dan een verwijderverzoek en wij verwijderen automatisch alles wat hierboven staat, binnen 30 dagen en meestal direct. U ontvangt een bevestigingscode die u hieronder kunt controleren.',
    'Mail naar {email} vanaf het e-mailadres van uw Go Top SEO-account. Wij controleren dat het verzoek van dat adres komt en verwijderen binnen 30 dagen.',
  ],
  statusTitle: 'Een verwijderverzoek controleren',
  statusCodeLabel: 'Bevestigingscode',
  statusDone: 'Het verzoek is ontvangen en de gegevens zijn verwijderd.',
  statusUnknown: 'Voor deze code is geen verzoek gevonden.',
  trademark: 'Facebook en Instagram zijn handelsmerken van Meta Platforms, Inc. Deze dienst is niet gemaakt, goedgekeurd of aanbevolen door Meta.',
  breadcrumb: 'Gegevensverwijdering',
}

const pl: DataDeletionText = {
  title: 'Usunięcie danych: {app}',
  subtitle: 'Jak usunąć dane przechowywane na potrzeby publikacji na Facebooku i Instagramie w Go Top SEO',
  intro: '{app} to aplikacja, za pomocą której Go Top SEO publikuje zatwierdzone przez Państwa posty na Państwa stronie na Facebooku i na powiązanym firmowym koncie na Instagramie. Ta strona wyjaśnia, jak usunąć dane, które przechowujemy w związku z tym połączeniem. Operatorem jest GO TOP DIGITAL MARKETING AND ADVERTISING LTD (numer przedsiębiorstwa 517274346).',
  deletedTitle: 'Co zostanie usunięte',
  deleted: [
    'Tokeny dostępu wydane nam przez Facebooka (przechowywane w postaci zaszyfrowanej) i Państwa identyfikator użytkownika Facebooka.',
    'Strona na Facebooku zapisana dla projektu oraz identyfikator i nazwa użytkownika powiązanego konta na Instagramie.',
    'Wszystkie zapisy postów: szkice, posty zaplanowane i opublikowane, wraz z tekstem, linkami, czasami i identyfikatorami zwróconymi przez Facebooka lub Instagram.',
  ],
  keptTitle: 'Czego sami nie usuwamy',
  kept: [
    'Postów już opublikowanych na Facebooku lub Instagramie. Proszę usunąć je tam, z menu samego posta.',
    'Danych przechowywanych przez Meta (strona, jej posty i obserwujący). Meta przetwarza je zgodnie z własną polityką i ma nad nimi kontrolę.',
  ],
  howTitle: 'Jak usunąć dane',
  how: [
    'W Go Top SEO proszę otworzyć „Facebook i Instagram” i kliknąć „Rozłącz”. Prosi to Facebooka o cofnięcie naszych uprawnień i od razu usuwa tokeny oraz zapisaną stronę. Historia postów pozostaje do czasu skorzystania z jednej z dwóch poniższych możliwości.',
    'W ustawieniach Facebooka proszę znaleźć „Go Top SEO Publisher” wśród aplikacji połączonych z kontem, usunąć ją i wybrać usunięcie otrzymanych przez nią danych. Facebook wyśle nam wtedy żądanie usunięcia, a my automatycznie usuniemy wszystko, co wymieniono powyżej, w ciągu 30 dni, zwykle od razu. Otrzymają Państwo kod potwierdzenia, który można sprawdzić poniżej.',
    'Proszę napisać na {email} z adresu e-mail konta Go Top SEO. Sprawdzimy, że prośba pochodzi z tego adresu, i usuniemy dane w ciągu 30 dni.',
  ],
  statusTitle: 'Sprawdzenie żądania usunięcia',
  statusCodeLabel: 'Kod potwierdzenia',
  statusDone: 'Żądanie zostało przyjęte, a dane usunięte.',
  statusUnknown: 'Nie znaleziono żądania dla tego kodu.',
  trademark: 'Facebook i Instagram są znakami towarowymi Meta Platforms, Inc. Ta usługa nie jest tworzona, zatwierdzana ani polecana przez Meta.',
  breadcrumb: 'Usunięcie danych',
}

const ko: DataDeletionText = {
  title: '데이터 삭제: {app}',
  subtitle: 'Go Top SEO의 페이스북·인스타그램 게시 기능을 위해 보관된 데이터를 삭제하는 방법',
  intro: '{app}은(는) Go Top SEO가 고객님이 승인한 게시물을 고객님의 페이스북 페이지와 연결된 인스타그램 프로페셔널 계정에 게시할 때 사용하는 앱입니다. 이 페이지는 이 연결과 관련해 당사가 보관하는 데이터를 삭제하는 방법을 설명합니다. 운영자는 GO TOP DIGITAL MARKETING AND ADVERTISING LTD(사업자 번호 517274346)입니다.',
  deletedTitle: '삭제되는 정보',
  deleted: [
    '페이스북이 당사에 발급한 액세스 토큰(암호화하여 보관)과 고객님의 페이스북 사용자 ID.',
    '프로젝트에 저장하신 페이스북 페이지, 그리고 연결된 인스타그램 계정의 ID와 사용자 이름.',
    '모든 게시물 기록: 초안, 예약된 게시물, 게시된 게시물과 그 본문, 링크, 시각, 페이스북 또는 인스타그램이 돌려준 ID.',
  ],
  keptTitle: '당사가 삭제하지 않는 정보',
  kept: [
    '이미 페이스북이나 인스타그램에 게시된 게시물. 해당 게시물의 메뉴에서 직접 삭제해 주세요.',
    'Meta가 보유한 데이터(페이지, 게시물, 팔로워). Meta가 자체 방침에 따라 처리하며 관리합니다.',
  ],
  howTitle: '데이터 삭제 방법',
  how: [
    'Go Top SEO에서 \'페이스북 및 인스타그램\'을 열고 \'연결 해제\'를 누르세요. 페이스북에 당사 권한 삭제를 요청하고 토큰과 저장된 페이지를 즉시 삭제합니다. 게시물 기록은 아래 두 가지 방법 중 하나를 사용하실 때까지 남습니다.',
    '페이스북 설정에서 계정에 연결된 앱 중 \'Go Top SEO Publisher\'를 찾아 제거하고, 앱이 받은 데이터를 삭제하도록 선택하세요. 그러면 페이스북이 당사에 삭제 요청을 보내며, 당사는 위에 나열한 모든 정보를 30일 이내(보통 즉시)에 자동으로 삭제합니다. 확인 코드를 받으시며 아래에서 확인하실 수 있습니다.',
    'Go Top SEO 계정의 이메일 주소로 {email}에 보내 주세요. 요청이 해당 주소에서 온 것인지 확인한 뒤 30일 이내에 삭제합니다.',
  ],
  statusTitle: '삭제 요청 확인',
  statusCodeLabel: '확인 코드',
  statusDone: '요청이 접수되었고 데이터가 삭제되었습니다.',
  statusUnknown: '이 코드에 해당하는 요청을 찾지 못했습니다.',
  trademark: 'Facebook과 Instagram은 Meta Platforms, Inc.의 상표이며, 이 서비스는 Meta가 제작, 승인 또는 보증하지 않습니다.',
  breadcrumb: '데이터 삭제',
}

export const DATA_DELETION_TEXT: Record<PublicLocale, DataDeletionText> = {
  en, he, es, 'pt-BR': ptBR, fr, it, ja, de, nl, pl, ko,
}
