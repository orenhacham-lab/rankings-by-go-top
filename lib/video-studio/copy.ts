/**
 * The video studio screen's words, in the 11 locales. One file on purpose: the screen
 * is behind a flag and not part of the typed dashboard dictionary yet.
 * Never shows a provider's words; `errors` is keyed by the server's stable codes.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

export interface VideoStudioCopy {
  title: string; subtitle: string
  photos: string; photosHint: string; addPhotos: string; remove: string
  prompt: string; promptPlaceholder: string
  seconds: string; format: string; vertical: string; horizontal: string
  cost: (credits: number) => string
  create: string; creating: string; creatingHint: string
  resultTitle: string; download: string; keptFor: string
  errors: Record<'insufficient_credits' | 'daily_limit' | 'too_many_images' | 'images_too_large' | 'invalid_request' | 'failed', string>
  noPhotos: string
}


export const VIDEO_STUDIO_COPY: Record<PublicLocale, VideoStudioCopy> = {
  he: {
    title: 'סטודיו וידאו', subtitle: 'מעלים תמונות, כותבים מה רוצים לראות, ומקבלים קליפ קצר מוכן לרשתות.',
    photos: 'תמונות', photosHint: 'עד 6 תמונות של העסק או המוצר', addPhotos: 'הוספת תמונות', remove: 'הסרה',
    prompt: 'מה יקרה בקליפ', promptPlaceholder: 'לדוגמה: תנועה איטית על הזר, אור רך, תחושה חמה',
    seconds: 'אורך בשניות', format: 'פורמט', vertical: 'לאורך (סטורי, רילס)', horizontal: 'לרוחב',
    cost: (c) => `עלות הקליפ: ${c} קרדיטים`,
    create: 'יצירת קליפ', creating: 'יוצרים את הקליפ…', creatingHint: 'זה לוקח בדרך כלל פחות מדקה. אפשר להישאר במסך.',
    resultTitle: 'הקליפ מוכן', download: 'הורדה', keptFor: 'הקליפ נשמר כאן 7 ימים. כדאי להוריד אותו.',
    errors: {
      insufficient_credits: 'אין מספיק קרדיטים לקליפ הזה.', daily_limit: 'הגעת למגבלה היומית. אפשר להמשיך מחר.',
      too_many_images: 'אפשר להעלות עד 6 תמונות.', images_too_large: 'התמונות גדולות מדי. נסו פחות תמונות.',
      invalid_request: 'חסר משהו בבקשה. בדקו את התיאור והאורך.', failed: 'היצירה לא הצליחה והקרדיטים הוחזרו. אפשר לנסות שוב.',
    },
    noPhotos: 'אפשר ליצור גם בלי תמונות, אבל עם תמונה התוצאה דומה יותר לעסק שלך.',
  },
  en: {
    title: 'Video studio', subtitle: 'Upload photos, describe what you want to see, and get a short clip ready for social.',
    photos: 'Photos', photosHint: 'Up to 6 photos of your business or product', addPhotos: 'Add photos', remove: 'Remove',
    prompt: 'What happens in the clip', promptPlaceholder: 'For example: a slow move across the bouquet, soft light, warm feel',
    seconds: 'Length in seconds', format: 'Format', vertical: 'Vertical (stories, reels)', horizontal: 'Horizontal',
    cost: (c) => `Cost of this clip: ${c} credits`,
    create: 'Create clip', creating: 'Creating your clip…', creatingHint: 'It usually takes under a minute. You can stay on this screen.',
    resultTitle: 'Your clip is ready', download: 'Download', keptFor: 'The clip is kept here for 7 days. Download it to keep it.',
    errors: {
      insufficient_credits: 'You do not have enough credits for this clip.', daily_limit: 'You reached the daily limit. You can continue tomorrow.',
      too_many_images: 'You can upload up to 6 photos.', images_too_large: 'The photos are too large. Try fewer photos.',
      invalid_request: 'Something is missing. Check the description and the length.', failed: 'The clip could not be made and your credits were returned. You can try again.',
    },
    noPhotos: 'You can also create without photos, but a photo makes the clip look more like your business.',
  },
  es: {
    title: 'Estudio de vídeo', subtitle: 'Sube fotos, describe lo que quieres ver y recibe un clip corto listo para redes.',
    photos: 'Fotos', photosHint: 'Hasta 6 fotos de tu negocio o producto', addPhotos: 'Añadir fotos', remove: 'Quitar',
    prompt: 'Qué ocurre en el clip', promptPlaceholder: 'Por ejemplo: un movimiento lento sobre el ramo, luz suave, ambiente cálido',
    seconds: 'Duración en segundos', format: 'Formato', vertical: 'Vertical (stories, reels)', horizontal: 'Horizontal',
    cost: (c) => `Coste de este clip: ${c} créditos`,
    create: 'Crear clip', creating: 'Creando tu clip…', creatingHint: 'Suele tardar menos de un minuto. Puedes quedarte en esta pantalla.',
    resultTitle: 'Tu clip está listo', download: 'Descargar', keptFor: 'El clip se guarda aquí 7 días. Descárgalo para conservarlo.',
    errors: {
      insufficient_credits: 'No tienes créditos suficientes para este clip.', daily_limit: 'Has llegado al límite diario. Puedes seguir mañana.',
      too_many_images: 'Puedes subir hasta 6 fotos.', images_too_large: 'Las fotos son demasiado grandes. Prueba con menos.',
      invalid_request: 'Falta algo. Revisa la descripción y la duración.', failed: 'No se pudo crear el clip y se devolvieron tus créditos. Puedes intentarlo de nuevo.',
    },
    noPhotos: 'También puedes crear sin fotos, pero con una foto el clip se parece más a tu negocio.',
  },
  'pt-BR': {
    title: 'Estúdio de vídeo', subtitle: 'Envie fotos, descreva o que quer ver e receba um clipe curto pronto para as redes.',
    photos: 'Fotos', photosHint: 'Até 6 fotos do seu negócio ou produto', addPhotos: 'Adicionar fotos', remove: 'Remover',
    prompt: 'O que acontece no clipe', promptPlaceholder: 'Por exemplo: um movimento lento sobre o buquê, luz suave, clima acolhedor',
    seconds: 'Duração em segundos', format: 'Formato', vertical: 'Vertical (stories, reels)', horizontal: 'Horizontal',
    cost: (c) => `Custo deste clipe: ${c} créditos`,
    create: 'Criar clipe', creating: 'Criando seu clipe…', creatingHint: 'Costuma levar menos de um minuto. Você pode ficar nesta tela.',
    resultTitle: 'Seu clipe está pronto', download: 'Baixar', keptFor: 'O clipe fica aqui por 7 dias. Baixe para guardar.',
    errors: {
      insufficient_credits: 'Você não tem créditos suficientes para este clipe.', daily_limit: 'Você atingiu o limite diário. Pode continuar amanhã.',
      too_many_images: 'Você pode enviar até 6 fotos.', images_too_large: 'As fotos são grandes demais. Tente com menos fotos.',
      invalid_request: 'Falta algo. Confira a descrição e a duração.', failed: 'Não foi possível criar o clipe e seus créditos foram devolvidos. Tente de novo.',
    },
    noPhotos: 'Também dá para criar sem fotos, mas com uma foto o clipe fica mais parecido com o seu negócio.',
  },
  fr: {
    title: 'Studio vidéo', subtitle: 'Importez des photos, décrivez ce que vous voulez voir et recevez un court clip prêt pour les réseaux.',
    photos: 'Photos', photosHint: "Jusqu'à 6 photos de votre commerce ou produit", addPhotos: 'Ajouter des photos', remove: 'Retirer',
    prompt: 'Ce qui se passe dans le clip', promptPlaceholder: 'Par exemple : un lent mouvement sur le bouquet, lumière douce, ambiance chaleureuse',
    seconds: 'Durée en secondes', format: 'Format', vertical: 'Vertical (stories, reels)', horizontal: 'Horizontal',
    cost: (c) => `Coût de ce clip : ${c} crédits`,
    create: 'Créer le clip', creating: 'Création du clip…', creatingHint: 'Cela prend en général moins d’une minute. Vous pouvez rester sur cet écran.',
    resultTitle: 'Votre clip est prêt', download: 'Télécharger', keptFor: 'Le clip est conservé ici 7 jours. Téléchargez-le pour le garder.',
    errors: {
      insufficient_credits: "Vous n'avez pas assez de crédits pour ce clip.", daily_limit: 'Vous avez atteint la limite du jour. Vous pourrez continuer demain.',
      too_many_images: "Vous pouvez importer jusqu'à 6 photos.", images_too_large: 'Les photos sont trop lourdes. Essayez avec moins de photos.',
      invalid_request: 'Il manque quelque chose. Vérifiez la description et la durée.', failed: "Le clip n'a pas pu être créé et vos crédits ont été rendus. Vous pouvez réessayer.",
    },
    noPhotos: 'Vous pouvez aussi créer sans photo, mais avec une photo le clip ressemble davantage à votre activité.',
  },
  it: {
    title: 'Studio video', subtitle: 'Carica le foto, descrivi cosa vuoi vedere e ricevi una breve clip pronta per i social.',
    photos: 'Foto', photosHint: "Fino a 6 foto dell'attività o del prodotto", addPhotos: 'Aggiungi foto', remove: 'Rimuovi',
    prompt: 'Cosa succede nella clip', promptPlaceholder: 'Ad esempio: un lento movimento sul bouquet, luce morbida, atmosfera calda',
    seconds: 'Durata in secondi', format: 'Formato', vertical: 'Verticale (storie, reel)', horizontal: 'Orizzontale',
    cost: (c) => `Costo di questa clip: ${c} crediti`,
    create: 'Crea la clip', creating: 'Creazione della clip…', creatingHint: 'Di solito richiede meno di un minuto. Puoi restare su questa schermata.',
    resultTitle: 'La tua clip è pronta', download: 'Scarica', keptFor: 'La clip resta qui per 7 giorni. Scaricala per conservarla.',
    errors: {
      insufficient_credits: 'Non hai crediti sufficienti per questa clip.', daily_limit: 'Hai raggiunto il limite giornaliero. Puoi continuare domani.',
      too_many_images: 'Puoi caricare fino a 6 foto.', images_too_large: 'Le foto sono troppo grandi. Prova con meno foto.',
      invalid_request: 'Manca qualcosa. Controlla la descrizione e la durata.', failed: 'Non è stato possibile creare la clip e i crediti ti sono stati restituiti. Puoi riprovare.',
    },
    noPhotos: "Puoi creare anche senza foto, ma con una foto la clip somiglia di più alla tua attività.",
  },
  ja: {
    title: '動画スタジオ', subtitle: '写真をアップロードし、見たい内容を書くと、SNS向けの短いクリップができあがります。',
    photos: '写真', photosHint: 'お店や商品の写真を6枚まで', addPhotos: '写真を追加', remove: '削除',
    prompt: 'クリップの内容', promptPlaceholder: '例：花束の上をゆっくり動くカメラ、やわらかい光、あたたかい雰囲気',
    seconds: '長さ（秒）', format: '形式', vertical: '縦（ストーリーズ、リール）', horizontal: '横',
    cost: (c) => `このクリップの料金：${c}クレジット`,
    create: 'クリップを作成', creating: 'クリップを作成中…', creatingHint: '通常1分もかかりません。この画面のままお待ちください。',
    resultTitle: 'クリップができました', download: 'ダウンロード', keptFor: 'クリップは7日間ここに保存されます。保存したい場合はダウンロードしてください。',
    errors: {
      insufficient_credits: 'このクリップに必要なクレジットが足りません。', daily_limit: '1日の上限に達しました。明日また作成できます。',
      too_many_images: '写真は6枚までアップロードできます。', images_too_large: '写真が大きすぎます。枚数を減らしてお試しください。',
      invalid_request: '入力に不足があります。内容と長さをご確認ください。', failed: 'クリップを作成できませんでした。クレジットは戻っています。もう一度お試しください。',
    },
    noPhotos: '写真なしでも作成できますが、写真があるとお店のイメージに近づきます。',
  },
  de: {
    title: 'Video-Studio', subtitle: 'Fotos hochladen, beschreiben, was zu sehen sein soll, und einen kurzen Clip für Social Media erhalten.',
    photos: 'Fotos', photosHint: 'Bis zu 6 Fotos Ihres Geschäfts oder Produkts', addPhotos: 'Fotos hinzufügen', remove: 'Entfernen',
    prompt: 'Was im Clip passiert', promptPlaceholder: 'Zum Beispiel: eine langsame Bewegung über den Strauß, weiches Licht, warme Stimmung',
    seconds: 'Länge in Sekunden', format: 'Format', vertical: 'Hochkant (Stories, Reels)', horizontal: 'Querformat',
    cost: (c) => `Kosten dieses Clips: ${c} Credits`,
    create: 'Clip erstellen', creating: 'Ihr Clip wird erstellt…', creatingHint: 'Das dauert meist weniger als eine Minute. Sie können auf dieser Seite bleiben.',
    resultTitle: 'Ihr Clip ist fertig', download: 'Herunterladen', keptFor: 'Der Clip wird hier 7 Tage aufbewahrt. Laden Sie ihn herunter, um ihn zu behalten.',
    errors: {
      insufficient_credits: 'Für diesen Clip reichen Ihre Credits nicht.', daily_limit: 'Das Tageslimit ist erreicht. Morgen geht es weiter.',
      too_many_images: 'Sie können bis zu 6 Fotos hochladen.', images_too_large: 'Die Fotos sind zu groß. Versuchen Sie es mit weniger Fotos.',
      invalid_request: 'Es fehlt etwas. Prüfen Sie Beschreibung und Länge.', failed: 'Der Clip konnte nicht erstellt werden, Ihre Credits wurden zurückgegeben. Versuchen Sie es erneut.',
    },
    noPhotos: 'Sie können auch ohne Fotos erstellen, mit einem Foto sieht der Clip aber mehr nach Ihrem Geschäft aus.',
  },
  nl: {
    title: 'Videostudio', subtitle: 'Upload foto’s, beschrijf wat je wilt zien en ontvang een korte clip die klaar is voor social media.',
    photos: 'Foto’s', photosHint: 'Tot 6 foto’s van je bedrijf of product', addPhotos: 'Foto’s toevoegen', remove: 'Verwijderen',
    prompt: 'Wat er in de clip gebeurt', promptPlaceholder: 'Bijvoorbeeld: een rustige beweging over het boeket, zacht licht, warme sfeer',
    seconds: 'Lengte in seconden', format: 'Formaat', vertical: 'Staand (stories, reels)', horizontal: 'Liggend',
    cost: (c) => `Kosten van deze clip: ${c} credits`,
    create: 'Clip maken', creating: 'Je clip wordt gemaakt…', creatingHint: 'Meestal duurt dit minder dan een minuut. Je kunt op dit scherm blijven.',
    resultTitle: 'Je clip is klaar', download: 'Downloaden', keptFor: 'De clip wordt hier 7 dagen bewaard. Download hem om hem te houden.',
    errors: {
      insufficient_credits: 'Je hebt niet genoeg credits voor deze clip.', daily_limit: 'Je hebt de dagelijkse limiet bereikt. Morgen kun je verder.',
      too_many_images: 'Je kunt tot 6 foto’s uploaden.', images_too_large: 'De foto’s zijn te groot. Probeer met minder foto’s.',
      invalid_request: 'Er ontbreekt iets. Controleer de beschrijving en de lengte.', failed: 'De clip kon niet worden gemaakt en je credits zijn teruggegeven. Probeer het opnieuw.',
    },
    noPhotos: 'Je kunt ook zonder foto’s maken, maar met een foto lijkt de clip meer op jouw bedrijf.',
  },
  pl: {
    title: 'Studio wideo', subtitle: 'Prześlij zdjęcia, opisz, co chcesz zobaczyć, i otrzymaj krótki klip gotowy do mediów społecznościowych.',
    photos: 'Zdjęcia', photosHint: 'Do 6 zdjęć firmy lub produktu', addPhotos: 'Dodaj zdjęcia', remove: 'Usuń',
    prompt: 'Co dzieje się w klipie', promptPlaceholder: 'Na przykład: powolny ruch nad bukietem, miękkie światło, ciepły klimat',
    seconds: 'Długość w sekundach', format: 'Format', vertical: 'Pionowy (relacje, rolki)', horizontal: 'Poziomy',
    cost: (c) => `Koszt tego klipu: ${c} kredytów`,
    create: 'Utwórz klip', creating: 'Tworzenie klipu…', creatingHint: 'Zwykle trwa to krócej niż minutę. Możesz zostać na tym ekranie.',
    resultTitle: 'Klip jest gotowy', download: 'Pobierz', keptFor: 'Klip jest tu przechowywany 7 dni. Pobierz go, aby go zachować.',
    errors: {
      insufficient_credits: 'Nie masz wystarczająco kredytów na ten klip.', daily_limit: 'Osiągnięto dzienny limit. Możesz kontynuować jutro.',
      too_many_images: 'Możesz przesłać do 6 zdjęć.', images_too_large: 'Zdjęcia są zbyt duże. Spróbuj z mniejszą liczbą.',
      invalid_request: 'Czegoś brakuje. Sprawdź opis i długość.', failed: 'Nie udało się utworzyć klipu, a kredyty zostały zwrócone. Spróbuj ponownie.',
    },
    noPhotos: 'Możesz tworzyć też bez zdjęć, ale ze zdjęciem klip bardziej przypomina Twoją firmę.',
  },
  ko: {
    title: '동영상 스튜디오', subtitle: '사진을 올리고 보고 싶은 장면을 적으면 SNS용 짧은 클립을 받을 수 있습니다.',
    photos: '사진', photosHint: '매장이나 제품 사진 최대 6장', addPhotos: '사진 추가', remove: '삭제',
    prompt: '클립의 내용', promptPlaceholder: '예: 꽃다발 위를 천천히 지나가는 카메라, 부드러운 빛, 따뜻한 분위기',
    seconds: '길이(초)', format: '형식', vertical: '세로(스토리, 릴스)', horizontal: '가로',
    cost: (c) => `이 클립의 비용: ${c} 크레딧`,
    create: '클립 만들기', creating: '클립을 만드는 중…', creatingHint: '보통 1분이 걸리지 않습니다. 이 화면에 머물러 주세요.',
    resultTitle: '클립이 완성되었습니다', download: '다운로드', keptFor: '클립은 여기에 7일간 보관됩니다. 보관하려면 다운로드하세요.',
    errors: {
      insufficient_credits: '이 클립을 만들 크레딧이 부족합니다.', daily_limit: '하루 한도에 도달했습니다. 내일 계속할 수 있습니다.',
      too_many_images: '사진은 최대 6장까지 올릴 수 있습니다.', images_too_large: '사진이 너무 큽니다. 장수를 줄여 보세요.',
      invalid_request: '빠진 내용이 있습니다. 설명과 길이를 확인하세요.', failed: '클립을 만들지 못했고 크레딧은 돌려드렸습니다. 다시 시도해 주세요.',
    },
    noPhotos: '사진 없이도 만들 수 있지만, 사진이 있으면 매장 느낌에 더 가까워집니다.',
  },
}
