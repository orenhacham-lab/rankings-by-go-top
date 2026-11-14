/**
 * The "show results" pages beside reports, in four languages.
 *
 * Competitors: maps to the rank scan's competitor comparison
 * (lib/competitors/comparison.ts, components/competitors/CompetitorSummary.tsx:
 * per competitor, on how many keywords it ranks above the project, from each
 * keyword's latest check) and the AI-visibility competitors and what tends to
 * replace the project in AI answers (components/ai-visibility).
 *
 * Search Console: maps to components/gsc (clicks, impressions and average
 * position over the last 28 days with the change against the previous 28, the
 * five pages with the most clicks, the searches you already appear for that no
 * tracked keyword covers, and the PDF / Excel / CSV export).
 */
import { BarChart3, Eye, FileDown, FileText, Info, LineChart, MousePointerClick, Plus, Search, Sparkles, Users, Target } from 'lucide-react'
import { WorkListVisual } from '@/components/public/feature-visuals'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import type { MarketingPage } from './marketing-page'

const he = FEATURE_COMMON.he
const en = FEATURE_COMMON.en
const es = FEATURE_COMMON.es
const pt = FEATURE_COMMON['pt-BR']
const fr = FEATURE_COMMON.fr
const it = FEATURE_COMMON.it
const ja = FEATURE_COMMON.ja
const de = FEATURE_COMMON.de
const nl = FEATURE_COMMON.nl
const pl = FEATURE_COMMON.pl
const ko = FEATURE_COMMON.ko

// ── You vs. competitors ───────────────────────────────────────────────────────

export const COMPETITORS_PAGE: MarketingPage = {
  path: '/features/competitor-tracking',
  meta: {
    he: {
      title: 'אתם מול המתחרים | Go Top SEO',
      description: 'מוסיפים את המתחרים ורואים על כמה ביטויים כל אחד מהם מופיע מעליכם בגוגל, ואת מי ChatGPT, Gemini ו-Google AI מזכירים כשהם לא מזכירים אתכם.',
    },
    en: {
      title: 'You vs. Competitors | Go Top SEO',
      description: 'Add your competitors and see on how many keywords each one ranks above you in Google, and who ChatGPT, Gemini and Google AI mention when they do not mention you.',
    },
    es: {
      title: 'Tú frente a la competencia | Go Top SEO',
      description: 'Añade a tus competidores y mira en cuántas palabras clave cada uno aparece por encima de ti en Google, y a quién mencionan ChatGPT, Gemini y Google AI cuando no te mencionan a ti.',
    },
    'pt-BR': {
      title: 'Você x concorrentes | Go Top SEO',
      description: 'Adicione os seus concorrentes e veja em quantas palavras-chave cada um aparece acima de você no Google, e quem o ChatGPT, o Gemini e o Google AI citam quando não citam você.',
    },
    fr: {
      title: 'Vous face à vos concurrents | Go Top SEO',
      description: 'Ajoutez vos concurrents et voyez sur combien de mots-clés chacun passe devant vous dans Google, et qui ChatGPT, Gemini et Google AI citent quand ils ne vous citent pas.',
    },
    it: {
      title: 'Lei e i suoi concorrenti | Go Top SEO',
      description: 'Si aggiungono i concorrenti e si vede su quante parole chiave ciascuno passa davanti al suo sito su Google, e chi citano ChatGPT, Gemini e Google AI quando non citano lei.',
    },
    ja: {
      title: '自社と競合 | Go Top SEO',
      description: '競合を登録すると、Googleでいくつのキーワードでそれぞれが自社サイトより上位にいるかがわかります。自社が引用されていないとき、ChatGPT、Gemini、Google AIが誰を引用しているかも確認できます。',
    },
    nl: {
      title: 'U en uw concurrenten | Go Top SEO',
      description: 'Voer uw concurrenten in en zie bij hoeveel zoekwoorden elk van hen in Google boven u staat — en wie ChatGPT, Gemini en Google AI noemen wanneer zij u niet noemen.',
    },
    de: {
      title: 'Sie und Ihre Wettbewerber | Go Top SEO',
      description: 'Tragen Sie Ihre Wettbewerber ein und sehen Sie, bei wie vielen Keywords jeder von ihnen in Google vor Ihnen steht — und wen ChatGPT, Gemini und Google AI nennen, wenn sie Sie nicht nennen.',
    },
    pl: {
      title: 'Państwo i konkurencja | Go Top SEO',
      description: 'Wpisują Państwo konkurentów i widzą, przy ilu słowach kluczowych każdy z nich stoi w Google wyżej, a także kogo wymieniają ChatGPT, Gemini i Google AI, gdy nie wymieniają Państwa firmy.',
    },
    ko: {
      title: '내 업체와 경쟁사 | Go Top SEO',
      description: '경쟁사를 입력하시면 각 경쟁사가 몇 개의 키워드에서 Google 순위가 더 높은지 보실 수 있고, ChatGPT와 Gemini, Google AI가 고객님의 업체를 언급하지 않을 때 누구를 언급하는지도 보실 수 있습니다.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'אתם מול המתחרים',
        eyebrowIcon: Users,
        title: 'יודעים בדיוק',
        accent: 'איפה המתחרים לפניכם',
        subtitle: 'מוסיפים את המתחרים בהגדרות הפרויקט, ובכל בדיקת מיקומים המערכת מראה על כמה ביטויים כל אחד מהם מופיע מעליכם בגוגל. בבדיקת הנראות ב-AI רואים את מי ChatGPT, Gemini ו-Google AI מזכירים כשהם לא מזכירים אתכם.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <WorkListVisual
            heading="אתם מול המתחרים"
            rows={[
              { title: 'מתחרה א׳', detail: 'מעליכם ב-6 מתוך 24 ביטויים', url: 'example-a.co.il', icon: Users, done: false, status: 'לפניכם' },
              { title: 'מתחרה ב׳', detail: 'מעליכם ב-2 מתוך 24 ביטויים', url: 'example-b.co.il', icon: Users, done: true, status: 'אתם לפניו' },
              { title: 'מתחרה ג׳', detail: 'לא מופיע ב-20 התוצאות הראשונות', url: 'example-c.co.il', icon: Users, done: true, status: 'אתם לפניו' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'למה זה חשוב',
          title: 'מיקום לבד לא מספר את כל הסיפור',
          intro: 'מקום חמישי יכול להיות הצלחה או בעיה. זה תלוי במי שנמצא מעליכם.',
          items: [
            { icon: Target, title: 'איפה הם לפניכם', body: 'לכל מתחרה: על כמה מהביטויים שלכם הוא מופיע מעליכם בבדיקה האחרונה.' },
            { icon: Sparkles, title: 'מי מוזכר במקומכם', body: 'בתשובות של מנועי AI: אילו עסקים ואתרים מופיעים כשאתם לא.' },
            { icon: FileText, title: 'מה כותבים עכשיו', body: 'ביטוי שמתחרה מקדים אתכם בו הוא נושא טוב למאמר הבא.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך זה עובד',
          title: 'שלושה צעדים',
          items: [
            { title: 'מוסיפים מתחרים', body: 'בהגדרות הפרויקט מכניסים את שם המתחרה ואת האתר שלו.' },
            { title: 'המערכת בודקת', body: 'בכל בדיקת מיקומים נשמר גם המיקום של המתחרים על אותם ביטויים.' },
            { title: 'רואים את ההשוואה', body: 'מעל טבלת הביטויים ובלוח הבקרה: מי לפניכם, ועל כמה ביטויים.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'על הנתונים',
          body: <p>ההשוואה בנויה רק ממה שהבדיקות שלנו מצאו בפועל בגוגל, על הביטויים שאתם עוקבים אחריהם. מתחרה שהוספתם אחרי בדיקה יופיע מהבדיקה הבאה.</p>,
        },
      ],
      cta: { title: 'תראו מי לפניכם בגוגל', body: he.closeBody, primary: he.check, secondary: he.trial },
    },
    en: {
      hero: {
        eyebrow: 'You vs. competitors',
        eyebrowIcon: Users,
        title: 'Know exactly',
        accent: 'where competitors are ahead',
        subtitle: 'Add your competitors in project settings, and every rank check shows on how many keywords each of them ranks above you in Google. The AI visibility check shows who ChatGPT, Gemini and Google AI mention when they do not mention you.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <WorkListVisual
            heading="You vs. competitors"
            rows={[
              { title: 'Competitor A', detail: 'above you on 6 of 24 keywords', url: 'example-a.com', icon: Users, done: false, status: 'Ahead of you' },
              { title: 'Competitor B', detail: 'above you on 2 of 24 keywords', url: 'example-b.com', icon: Users, done: true, status: 'You lead' },
              { title: 'Competitor C', detail: 'not in the top 20 results', url: 'example-c.com', icon: Users, done: true, status: 'You lead' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Why it matters',
          title: 'A ranking on its own does not tell the whole story',
          intro: 'Fifth place can be a win or a problem. It depends on who is above you.',
          items: [
            { icon: Target, title: 'Where they are ahead', body: 'For each competitor: on how many of your keywords it ranked above you in the latest check.' },
            { icon: Sparkles, title: 'Who is mentioned instead', body: 'In AI engine answers: which businesses and sites appear when you do not.' },
            { icon: FileText, title: 'What to write next', body: 'A keyword where a competitor is ahead of you is a good topic for the next article.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'How it works',
          title: 'Three steps',
          items: [
            { title: 'Add competitors', body: 'In project settings, enter the competitor\'s name and website.' },
            { title: 'The system checks', body: 'Every rank check also records where your competitors rank on the same keywords.' },
            { title: 'See the comparison', body: 'Above the keywords table and on the dashboard: who is ahead of you, and on how many keywords.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'About the data',
          body: <p>The comparison is built only from what our checks actually found in Google, on the keywords you track. A competitor added after a check appears from the next one.</p>,
        },
      ],
      cta: { title: 'See who is ahead of you in Google', body: en.closeBody, primary: en.check, secondary: en.trial },
    },
    es: {
      hero: {
        eyebrow: 'Tú frente a la competencia',
        eyebrowIcon: Users,
        title: 'Sabes exactamente',
        accent: 'dónde te adelanta la competencia',
        subtitle: 'Añade a tus competidores en la configuración del proyecto y cada revisión de posiciones mostrará en cuántas palabras clave cada uno aparece por encima de ti en Google. La revisión de visibilidad en IA muestra a quién mencionan ChatGPT, Gemini y Google AI cuando no te mencionan a ti.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <WorkListVisual
            heading="Tú frente a la competencia"
            rows={[
              { title: 'Competidor A', detail: 'por encima de ti en 6 de 24 palabras clave', url: 'example-a.com', icon: Users, done: false, status: 'Te adelanta' },
              { title: 'Competidor B', detail: 'por encima de ti en 2 de 24 palabras clave', url: 'example-b.com', icon: Users, done: true, status: 'Vas delante' },
              { title: 'Competidor C', detail: 'fuera de los 20 primeros resultados', url: 'example-c.com', icon: Users, done: true, status: 'Vas delante' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por qué importa',
          title: 'Una posición por sí sola no lo cuenta todo',
          intro: 'El quinto puesto puede ser un éxito o un problema. Depende de quién esté por encima.',
          items: [
            { icon: Target, title: 'Dónde te adelantan', body: 'Para cada competidor: en cuántas de tus palabras clave apareció por encima de ti en la última revisión.' },
            { icon: Sparkles, title: 'A quién mencionan en tu lugar', body: 'En las respuestas de los motores de IA: qué negocios y sitios aparecen cuando tú no.' },
            { icon: FileText, title: 'Qué escribir ahora', body: 'Una palabra clave en la que un competidor te adelanta es un buen tema para el próximo artículo.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo funciona',
          title: 'Tres pasos',
          items: [
            { title: 'Añade competidores', body: 'En la configuración del proyecto, escribe el nombre del competidor y su sitio web.' },
            { title: 'El sistema revisa', body: 'Cada revisión de posiciones guarda también dónde aparecen tus competidores en las mismas palabras clave.' },
            { title: 'Ve la comparación', body: 'Encima de la tabla de palabras clave y en el panel: quién va por delante y en cuántas palabras clave.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Sobre los datos',
          body: <p>La comparación se construye solo con lo que nuestras revisiones encontraron realmente en Google, en las palabras clave que sigues. Un competidor añadido después de una revisión aparece a partir de la siguiente.</p>,
        },
      ],
      cta: { title: 'Mira quién te adelanta en Google', body: es.closeBody, primary: es.check, secondary: es.trial },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Você x concorrentes',
        eyebrowIcon: Users,
        title: 'Saiba exatamente',
        accent: 'onde os concorrentes estão na frente',
        subtitle: 'Adicione os seus concorrentes nas configurações do projeto e cada verificação de posições mostra em quantas palavras-chave cada um aparece acima de você no Google. A verificação de visibilidade em IA mostra quem o ChatGPT, o Gemini e o Google AI citam quando não citam você.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <WorkListVisual
            heading="Você x concorrentes"
            rows={[
              { title: 'Concorrente A', detail: 'acima de você em 6 de 24 palavras-chave', url: 'example-a.com.br', icon: Users, done: false, status: 'Na sua frente' },
              { title: 'Concorrente B', detail: 'acima de você em 2 de 24 palavras-chave', url: 'example-b.com.br', icon: Users, done: true, status: 'Você lidera' },
              { title: 'Concorrente C', detail: 'fora dos 20 primeiros resultados', url: 'example-c.com.br', icon: Users, done: true, status: 'Você lidera' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Por que importa',
          title: 'A posição sozinha não conta a história toda',
          intro: 'O quinto lugar pode ser uma vitória ou um problema. Depende de quem está acima.',
          items: [
            { icon: Target, title: 'Onde eles estão na frente', body: 'Para cada concorrente: em quantas das suas palavras-chave ele apareceu acima de você na última verificação.' },
            { icon: Sparkles, title: 'Quem é citado no seu lugar', body: 'Nas respostas dos mecanismos de IA: quais negócios e sites aparecem quando você não aparece.' },
            { icon: FileText, title: 'O que escrever agora', body: 'Uma palavra-chave em que um concorrente está na sua frente é um bom tema para o próximo artigo.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como funciona',
          title: 'Três passos',
          items: [
            { title: 'Adicione concorrentes', body: 'Nas configurações do projeto, informe o nome do concorrente e o site dele.' },
            { title: 'O sistema verifica', body: 'Cada verificação de posições também registra onde os concorrentes aparecem nas mesmas palavras-chave.' },
            { title: 'Veja a comparação', body: 'Acima da tabela de palavras-chave e no painel: quem está na sua frente, e em quantas palavras-chave.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Sobre os dados',
          body: <p>A comparação é feita só com o que as nossas verificações encontraram de fato no Google, nas palavras-chave que você acompanha. Um concorrente adicionado depois de uma verificação aparece a partir da próxima.</p>,
        },
      ],
      cta: { title: 'Veja quem está na sua frente no Google', body: pt.closeBody, primary: pt.check, secondary: pt.trial },
    },
    fr: {
      hero: {
        eyebrow: 'Vous face à vos concurrents',
        eyebrowIcon: Users,
        title: 'Sachez exactement',
        accent: 'où vos concurrents passent devant',
        subtitle: 'Ajoutez vos concurrents dans les réglages du projet : chaque relevé de position montre sur combien de mots-clés chacun d’eux passe devant vous dans Google. La vérification de la visibilité dans les IA montre qui ChatGPT, Gemini et Google AI citent quand ils ne vous citent pas.',
        trust: fr.trust,
        primary: fr.check,
        secondary: fr.trial,
        visual: (
          <WorkListVisual
            heading="Vous face à vos concurrents"
            rows={[
              { title: 'Concurrent A', detail: 'devant vous sur 6 des 24 mots-clés', url: 'example-a.com', icon: Users, done: false, status: 'Devant vous' },
              { title: 'Concurrent B', detail: 'devant vous sur 2 des 24 mots-clés', url: 'example-b.com', icon: Users, done: true, status: 'Vous menez' },
              { title: 'Concurrent C', detail: 'absent des 20 premiers résultats', url: 'example-c.com', icon: Users, done: true, status: 'Vous menez' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Pourquoi c’est important',
          title: 'Une position seule ne raconte pas toute l’histoire',
          intro: 'La cinquième place peut être une réussite ou un problème. Cela dépend de qui se trouve au-dessus de vous.',
          items: [
            { icon: Target, title: 'Où ils sont devant', body: 'Pour chaque concurrent : sur combien de vos mots-clés il est passé devant vous au dernier relevé.' },
            { icon: Sparkles, title: 'Qui est cité à votre place', body: 'Dans les réponses des moteurs d’IA : quelles entreprises et quels sites apparaissent quand vous n’y êtes pas.' },
            { icon: FileText, title: 'Quoi écrire ensuite', body: 'Un mot-clé sur lequel un concurrent vous devance est un bon sujet pour le prochain article.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Comment ça marche',
          title: 'Trois étapes',
          items: [
            { title: 'Ajoutez des concurrents', body: 'Dans les réglages du projet, saisissez le nom du concurrent et son site.' },
            { title: 'Le système vérifie', body: 'Chaque relevé de position enregistre aussi où vos concurrents se placent sur les mêmes mots-clés.' },
            { title: 'Consultez la comparaison', body: 'Au-dessus du tableau des mots-clés et sur le tableau de bord : qui est devant vous, et sur combien de mots-clés.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'À propos des données',
          body: <p>La comparaison est construite uniquement à partir de ce que nos relevés ont réellement trouvé dans Google, sur les mots-clés que vous suivez. Un concurrent ajouté après un relevé apparaît à partir du suivant.</p>,
        },
      ],
      cta: { title: 'Voyez qui est devant vous dans Google', body: fr.closeBody, primary: fr.check, secondary: fr.trial },
    },
    it: {
      hero: {
        eyebrow: 'Lei e i suoi concorrenti',
        eyebrowIcon: Users,
        title: 'Sempre chiaro',
        accent: 'dove i concorrenti passano davanti',
        subtitle: 'I concorrenti si aggiungono nelle impostazioni del progetto: ogni rilevamento di posizione mostra su quante parole chiave ciascuno di loro passa davanti al suo sito su Google. Il controllo della visibilità nelle IA mostra chi citano ChatGPT, Gemini e Google AI quando non citano lei.',
        trust: it.trust,
        primary: it.check,
        secondary: it.trial,
        visual: (
          <WorkListVisual
            heading="Lei e i suoi concorrenti"
            rows={[
              { title: 'Concorrente A', detail: 'davanti su 6 delle 24 parole chiave', url: 'example-a.com', icon: Users, done: false, status: 'Davanti a lei' },
              { title: 'Concorrente B', detail: 'davanti su 2 delle 24 parole chiave', url: 'example-b.com', icon: Users, done: true, status: 'Lei è avanti' },
              { title: 'Concorrente C', detail: 'assente dai primi 20 risultati', url: 'example-c.com', icon: Users, done: true, status: 'Lei è avanti' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Perché è importante',
          title: 'Una posizione da sola non racconta tutta la storia',
          intro: 'Il quinto posto può essere un successo o un problema. Dipende da chi si trova sopra.',
          items: [
            { icon: Target, title: 'Dove sono davanti', body: 'Per ogni concorrente: su quante delle sue parole chiave è passato davanti nell’ultimo rilevamento.' },
            { icon: Sparkles, title: 'Chi viene citato al suo posto', body: 'Nelle risposte dei motori di IA: quali aziende e quali siti compaiono quando il suo non c’è.' },
            { icon: FileText, title: 'Che cosa scrivere poi', body: 'Una parola chiave su cui un concorrente è davanti è un buon argomento per il prossimo articolo.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Come funziona',
          title: 'Tre passaggi',
          items: [
            { title: 'Aggiunta dei concorrenti', body: 'Nelle impostazioni del progetto si inseriscono il nome del concorrente e il suo sito.' },
            { title: 'Il sistema controlla', body: 'Ogni rilevamento di posizione registra anche dove si collocano i concorrenti sulle stesse parole chiave.' },
            { title: 'Lettura del confronto', body: 'Sopra la tabella delle parole chiave e nella dashboard: chi è davanti, e su quante parole chiave.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Sui dati',
          body: <p>Il confronto è costruito solo su ciò che i nostri rilevamenti hanno effettivamente trovato su Google, sulle parole chiave monitorate. Un concorrente aggiunto dopo un rilevamento compare dal successivo.</p>,
        },
      ],
      cta: { title: 'Scopra chi è davanti a lei su Google', body: it.closeBody, primary: it.check, secondary: it.trial },
    },
    nl: {
      hero: {
        eyebrow: 'U en uw concurrenten',
        eyebrowIcon: Users,
        title: 'Weet precies',
        accent: 'waar concurrenten voorliggen',
        subtitle: 'Voer uw concurrenten in de projectinstellingen in, en elke positiecontrole laat zien bij hoeveel zoekwoorden elk van hen in Google boven u staat. De controle van de AI-zichtbaarheid laat zien wie ChatGPT, Gemini en Google AI noemen wanneer zij u niet noemen.',
        trust: nl.trust,
        primary: nl.check,
        secondary: nl.trial,
        visual: (
          <WorkListVisual
            heading="U en uw concurrenten"
            rows={[
              { title: 'Concurrent A', detail: 'bij 6 van de 24 zoekwoorden boven u', url: 'example-a.com', icon: Users, done: false, status: 'Boven u' },
              { title: 'Concurrent B', detail: 'bij 2 van de 24 zoekwoorden boven u', url: 'example-b.com', icon: Users, done: true, status: 'U staat voor' },
              { title: 'Concurrent C', detail: 'niet bij de eerste 20 resultaten', url: 'example-c.com', icon: Users, done: true, status: 'U staat voor' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Waarom dit telt',
          title: 'Een positie alleen vertelt niet het hele verhaal',
          intro: 'Plek vijf kan een succes zijn of een probleem. Dat hangt ervan af wie boven u staat.',
          items: [
            { icon: Target, title: 'Waar zij voorliggen', body: 'Voor elke concurrent: bij hoeveel van uw zoekwoorden hij in de laatste controle boven u stond.' },
            { icon: Sparkles, title: 'Wie er in uw plaats genoemd wordt', body: 'In de antwoorden van de AI-diensten: welke bedrijven en websites verschijnen wanneer u dat niet doet.' },
            { icon: FileText, title: 'Wat er daarna geschreven moet worden', body: 'Een zoekwoord waarbij een concurrent boven u staat, is een goed onderwerp voor het volgende artikel.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Zo gaat het',
          title: 'Drie stappen',
          items: [
            { title: 'Concurrenten invoeren', body: 'In de projectinstellingen de naam en de website van de concurrent invoeren.' },
            { title: 'Het systeem controleert', body: 'Elke positiecontrole legt ook vast waar uw concurrenten bij dezelfde zoekwoorden staan.' },
            { title: 'De vergelijking bekijken', body: 'Boven de zoekwoordentabel en in het dashboard: wie boven u staat, en bij hoeveel zoekwoorden.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Over de gegevens',
          body: <p>De vergelijking berust uitsluitend op wat onze controles in Google werkelijk gevonden hebben, bij de zoekwoorden die u volgt. Een concurrent die na een controle wordt ingevoerd, verschijnt vanaf de volgende.</p>,
        },
      ],
      cta: { title: 'Zie wie in Google boven u staat', body: nl.closeBody, primary: nl.check, secondary: nl.trial },
    },
    de: {
      hero: {
        eyebrow: 'Sie und Ihre Wettbewerber',
        eyebrowIcon: Users,
        title: 'Wissen Sie genau,',
        accent: 'wo Wettbewerber vorne liegen',
        subtitle: 'Tragen Sie Ihre Wettbewerber in den Projekteinstellungen ein, und jede Ranking-Prüfung zeigt, bei wie vielen Keywords jeder von ihnen in Google vor Ihnen steht. Die Prüfung der KI-Sichtbarkeit zeigt, wen ChatGPT, Gemini und Google AI nennen, wenn sie Sie nicht nennen.',
        trust: de.trust,
        primary: de.check,
        secondary: de.trial,
        visual: (
          <WorkListVisual
            heading="Sie und Ihre Wettbewerber"
            rows={[
              { title: 'Wettbewerber A', detail: 'bei 6 von 24 Keywords vor Ihnen', url: 'example-a.com', icon: Users, done: false, status: 'Vor Ihnen' },
              { title: 'Wettbewerber B', detail: 'bei 2 von 24 Keywords vor Ihnen', url: 'example-b.com', icon: Users, done: true, status: 'Sie führen' },
              { title: 'Wettbewerber C', detail: 'nicht unter den ersten 20 Ergebnissen', url: 'example-c.com', icon: Users, done: true, status: 'Sie führen' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Warum das zählt',
          title: 'Eine Position allein erzählt nicht die ganze Geschichte',
          intro: 'Platz fünf kann ein Erfolg sein oder ein Problem. Es hängt davon ab, wer über Ihnen steht.',
          items: [
            { icon: Target, title: 'Wo sie vorne liegen', body: 'Für jeden Wettbewerber: bei wie vielen Ihrer Keywords er in der letzten Prüfung vor Ihnen stand.' },
            { icon: Sparkles, title: 'Wer stattdessen genannt wird', body: 'In den Antworten der KI-Dienste: welche Unternehmen und Websites erscheinen, wenn Sie es nicht tun.' },
            { icon: FileText, title: 'Was als Nächstes zu schreiben ist', body: 'Ein Keyword, bei dem ein Wettbewerber vor Ihnen liegt, ist ein gutes Thema für den nächsten Artikel.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'So läuft es',
          title: 'Drei Schritte',
          items: [
            { title: 'Wettbewerber eintragen', body: 'In den Projekteinstellungen Name und Website des Wettbewerbers eingeben.' },
            { title: 'Das System prüft', body: 'Jede Ranking-Prüfung erfasst auch, wo Ihre Wettbewerber bei denselben Keywords stehen.' },
            { title: 'Den Vergleich ansehen', body: 'Über der Keyword-Tabelle und im Dashboard: wer vor Ihnen liegt, und bei wie vielen Keywords.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'Zu den Daten',
          body: <p>Der Vergleich beruht ausschließlich auf dem, was unsere Prüfungen in Google tatsächlich gefunden haben, bei den Keywords, die Sie verfolgen. Ein Wettbewerber, der nach einer Prüfung eingetragen wird, erscheint ab der nächsten.</p>,
        },
      ],
      cta: { title: 'Sehen Sie, wer in Google vor Ihnen liegt', body: de.closeBody, primary: de.check, secondary: de.trial },
    },
    // JAPANESE. The example competitor domains stay on example.com, which is
    // reserved for documentation, so a screenshot never names a real business.
    ja: {
      hero: {
        eyebrow: '自社と競合',
        eyebrowIcon: Users,
        title: '競合が上に出ている箇所が',
        accent: 'いつでもわかります',
        subtitle: '競合はプロジェクトの設定で登録します。順位を計測するたびに、Googleでいくつのキーワードでそれぞれの競合が自社サイトより上位にいるかが表示されます。AIでの可視性の計測では、自社が引用されていないときにChatGPT、Gemini、Google AIが誰を引用しているかがわかります。',
        trust: ja.trust,
        primary: ja.check,
        secondary: ja.trial,
        visual: (
          <WorkListVisual
            heading="自社と競合"
            rows={[
              { title: '競合A', detail: '24キーワードのうち6件で上位', url: 'example-a.com', icon: Users, done: false, status: '自社より上位' },
              { title: '競合B', detail: '24キーワードのうち2件で上位', url: 'example-b.com', icon: Users, done: true, status: '自社が上位' },
              { title: '競合C', detail: '上位20件に入っていません', url: 'example-c.com', icon: Users, done: true, status: '自社が上位' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'なぜ重要なのか',
          title: '順位だけでは全体像がわかりません',
          intro: '5位は成果かもしれませんし、問題かもしれません。それは上に誰がいるかで決まります。',
          items: [
            { icon: Target, title: 'どこで上に出られているか', body: '競合ごとに、直近の計測で自社のキーワードのうちいくつで上位に出たかがわかります。' },
            { icon: Sparkles, title: '自社の代わりに引用されているのは誰か', body: 'AIエンジンの回答で、自社が出てこないときにどの企業とどのサイトが現れるかがわかります。' },
            { icon: FileText, title: '次に何を書くか', body: '競合が上位にいるキーワードは、次の記事の題材として有望です。' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: '進め方',
          title: '3つの手順',
          items: [
            { title: '競合を登録する', body: 'プロジェクトの設定で、競合の名称とサイトを入力します。' },
            { title: 'システムが計測する', body: '順位を計測するたびに、同じキーワードで競合がどこにいるかも記録します。' },
            { title: '比較を読む', body: 'キーワードの表の上部とダッシュボードで、誰が上位にいて、いくつのキーワードでそうなっているかがわかります。' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'データについて',
          body: <p>比較は、計測中のキーワードについて当社の計測がGoogleで実際に見つけた内容だけで作られます。計測のあとに登録した競合は、次回の計測から表示されます。</p>,
        },
      ],
      cta: { title: 'Googleで自社より上位にいるのは誰かを確認する', body: ja.closeBody, primary: ja.check, secondary: ja.trial },
    },
    pl: {
      hero: {
        eyebrow: 'Państwo i konkurencja',
        eyebrowIcon: Users,
        title: 'Dokładnie wiadomo,',
        accent: 'gdzie konkurencja jest wyżej',
        subtitle: 'Konkurentów wpisują Państwo w ustawieniach projektu, a każde sprawdzenie pozycji pokazuje, przy ilu słowach kluczowych każdy z nich stoi w Google wyżej. Sprawdzenie widoczności w AI pokazuje, kogo wymieniają ChatGPT, Gemini i Google AI, gdy nie wymieniają Państwa firmy.',
        trust: pl.trust,
        primary: pl.check,
        secondary: pl.trial,
        visual: (
          <WorkListVisual
            heading="Państwo i konkurencja"
            rows={[
              { title: 'Konkurent A', detail: 'wyżej przy 6 z 24 słów kluczowych', url: 'example-a.com', icon: Users, done: false, status: 'Wyżej' },
              { title: 'Konkurent B', detail: 'wyżej przy 2 z 24 słów kluczowych', url: 'example-b.com', icon: Users, done: true, status: 'Państwo wyżej' },
              { title: 'Konkurent C', detail: 'poza pierwszymi 20 wynikami', url: 'example-c.com', icon: Users, done: true, status: 'Państwo wyżej' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Dlaczego to ma znaczenie',
          title: 'Sama pozycja nie opowiada całej historii',
          intro: 'Piąte miejsce może być sukcesem albo problemem. Zależy to od tego, kto stoi wyżej.',
          items: [
            { icon: Target, title: 'Gdzie są wyżej', body: 'Dla każdego konkurenta: przy ilu Państwa słowach kluczowych stał wyżej w ostatnim sprawdzeniu.' },
            { icon: Sparkles, title: 'Kogo wymieniają zamiast Państwa', body: 'W odpowiedziach usług AI: jakie firmy i strony pojawiają się wtedy, gdy Państwa firma nie.' },
            { icon: FileText, title: 'Co napisać dalej', body: 'Słowo kluczowe, przy którym konkurent stoi wyżej, to dobry temat na następny artykuł.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Jak to przebiega',
          title: 'Trzy kroki',
          items: [
            { title: 'Wpisanie konkurentów', body: 'W ustawieniach projektu wpisują Państwo nazwę i stronę konkurenta.' },
            { title: 'System sprawdza', body: 'Każde sprawdzenie pozycji zapisuje też, gdzie stoi konkurencja przy tych samych słowach kluczowych.' },
            { title: 'Podgląd porównania', body: 'Nad tabelą słów kluczowych i w panelu: kto stoi wyżej i przy ilu słowach kluczowych.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: 'O danych',
          body: <p>Porównanie opiera się wyłącznie na tym, co nasze sprawdzenia w Google rzeczywiście znalazły, przy monitorowanych przez Państwa słowach kluczowych. Konkurent wpisany po sprawdzeniu pojawia się od następnego.</p>,
        },
      ],
      cta: { title: 'Proszę sprawdzić, kto stoi w Google wyżej', body: pl.closeBody, primary: pl.check, secondary: pl.trial },
    },
    ko: {
      hero: {
        eyebrow: '내 업체와 경쟁사',
        eyebrowIcon: Users,
        title: '경쟁사가 어디에서 더 높은지',
        accent: '정확히 알 수 있습니다',
        subtitle: '경쟁사는 프로젝트 설정에서 입력하시고, 순위를 측정할 때마다 각 경쟁사가 몇 개의 키워드에서 Google 순위가 더 높은지 보여 드립니다. AI 가시성 점검에서는 ChatGPT와 Gemini, Google AI가 고객님의 업체를 언급하지 않을 때 누구를 언급하는지 보여 드립니다.',
        trust: ko.trust,
        primary: ko.check,
        secondary: ko.trial,
        visual: (
          <WorkListVisual
            heading="내 업체와 경쟁사"
            rows={[
              { title: '경쟁사 A', detail: '키워드 24개 중 6개에서 더 높음', url: 'example-a.com', icon: Users, done: false, status: '더 높음' },
              { title: '경쟁사 B', detail: '키워드 24개 중 2개에서 더 높음', url: 'example-b.com', icon: Users, done: true, status: '내 업체가 더 높음' },
              { title: '경쟁사 C', detail: '상위 20위 밖', url: 'example-c.com', icon: Users, done: true, status: '내 업체가 더 높음' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '왜 중요한가',
          title: '순위 숫자만으로는 전체 이야기를 알 수 없습니다',
          intro: '5위는 성과일 수도 있고 문제일 수도 있습니다. 위에 누가 있는지에 따라 달라집니다.',
          items: [
            { icon: Target, title: '어디에서 더 높은가', body: '경쟁사별로, 마지막 측정에서 고객님의 키워드 몇 개에서 더 높았는지 보여 드립니다.' },
            { icon: Sparkles, title: '내 업체 대신 누구를 언급하는가', body: 'AI 서비스의 답변에서, 고객님의 업체가 나오지 않을 때 어떤 업체와 사이트가 등장하는지 보여 드립니다.' },
            { icon: FileText, title: '다음에 무엇을 쓸까', body: '경쟁사가 더 높은 키워드는 다음 아티클의 좋은 주제가 됩니다.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: '진행 방식',
          title: '세 단계',
          items: [
            { title: '경쟁사 입력', body: '프로젝트 설정에서 경쟁사의 이름과 사이트를 입력하십니다.' },
            { title: '시스템이 측정', body: '순위를 측정할 때마다 같은 키워드에서 경쟁사가 어디에 있는지도 함께 기록합니다.' },
            { title: '비교 확인', body: '키워드 표 위와 대시보드에서, 누가 더 높고 몇 개의 키워드에서 그런지 보실 수 있습니다.' },
          ],
        },
        {
          kind: 'callout',
          icon: Info,
          title: '데이터에 대해',
          body: <p>비교는 고객님이 추적하시는 키워드에서 저희 Google 측정이 실제로 찾아낸 것만을 근거로 합니다. 측정 뒤에 입력하신 경쟁사는 그다음 측정부터 나타납니다.</p>,
        },
      ],
      cta: { title: 'Google에서 누가 더 높은지 확인해 보십시오', body: ko.closeBody, primary: ko.check, secondary: ko.trial },
    },
  },
}

// ── Search Console ────────────────────────────────────────────────────────────

export const SEARCH_CONSOLE_PAGE: MarketingPage = {
  path: '/features/search-console',
  meta: {
    he: {
      title: 'נתוני Search Console | Go Top SEO',
      description: 'מחברים את Google Search Console ורואים קליקים, חשיפות ומיקום ממוצע ב-28 הימים האחרונים, את העמודים המובילים ואת החיפושים שאתם כבר מופיעים בהם. כולל הורדה ל-PDF ו-Excel.',
    },
    en: {
      title: 'Search Console Data | Go Top SEO',
      description: 'Connect Google Search Console and see clicks, impressions and average position over the last 28 days, your top pages and the searches you already appear for. Download as PDF or Excel.',
    },
    es: {
      title: 'Datos de Search Console | Go Top SEO',
      description: 'Conecta Google Search Console y consulta clics, impresiones y posición media de los últimos 28 días, tus páginas principales y las búsquedas en las que ya apareces. Descarga en PDF o Excel.',
    },
    'pt-BR': {
      title: 'Dados do Search Console | Go Top SEO',
      description: 'Conecte o Google Search Console e veja cliques, impressões e posição média dos últimos 28 dias, as suas páginas principais e as buscas em que você já aparece. Baixe em PDF ou Excel.',
    },
    fr: {
      title: 'Données Search Console | Go Top SEO',
      description: 'Connectez Google Search Console et consultez clics, impressions et position moyenne sur les 28 derniers jours, vos pages principales et les recherches où vous apparaissez déjà. Export PDF ou Excel.',
    },
    it: {
      title: 'Dati Search Console | Go Top SEO',
      description: 'Si collega Google Search Console e si vedono clic, impressioni e posizione media degli ultimi 28 giorni, le pagine principali e le ricerche in cui il sito compare già. Esportazione in PDF o Excel.',
    },
    ja: {
      title: 'Search Consoleのデータ | Go Top SEO',
      description: 'Google Search Consoleを連携すると、直近28日間のクリック数、表示回数、平均掲載順位、主なページ、そしてサイトがすでに表示されている検索語がわかります。PDFまたはExcelで書き出せます。',
    },
    nl: {
      title: 'Gegevens uit Search Console | Go Top SEO',
      description: 'Verbind Google Search Console en zie klikken, weergaven en de gemiddelde positie van de afgelopen 28 dagen, uw belangrijkste pagina\u2019s en de zoekopdrachten waarvoor u al verschijnt. Te downloaden als pdf of Excel.',
    },
    de: {
      title: 'Search-Console-Daten | Go Top SEO',
      description: 'Verbinden Sie die Google Search Console und sehen Sie Klicks, Impressionen und die durchschnittliche Position der letzten 28 Tage, Ihre wichtigsten Seiten und die Suchanfragen, für die Sie schon erscheinen. Als PDF oder Excel herunterladen.',
    },
    pl: {
      title: 'Dane z Search Console | Go Top SEO',
      description: 'Po podłączeniu Google Search Console widać kliknięcia, wyświetlenia i średnią pozycję z ostatnich 28 dni, najważniejsze podstrony i zapytania, na które strona już się pokazuje. Do pobrania jako pdf albo Excel.',
    },
    ko: {
      title: 'Search Console 데이터 | Go Top SEO',
      description: 'Google Search Console을 연결하시면 최근 28일의 클릭 수, 노출 수, 평균 게재순위와 주요 페이지, 그리고 사이트가 이미 노출되고 있는 검색어를 보실 수 있습니다. PDF나 Excel로 내려받으실 수 있습니다.',
    },
  },
  content: {
    he: {
      hero: {
        eyebrow: 'נתוני Search Console',
        eyebrowIcon: LineChart,
        title: 'מה גוגל עצמו',
        accent: 'אומר על האתר שלכם',
        subtitle: 'מחברים את Google Search Console, ורואים במערכת כמה קליקים וחשיפות האתר קיבל ב-28 הימים האחרונים ומה המיקום הממוצע שלו. לכל נתון מוצג גם השינוי לעומת 28 הימים שלפני כן.',
        trust: he.trust,
        primary: he.check,
        secondary: he.trial,
        visual: (
          <WorkListVisual
            heading="28 הימים האחרונים"
            rows={[
              { title: 'קליקים מגוגל', detail: 'לעומת 28 הימים הקודמים', icon: MousePointerClick, done: true, status: 'עלייה' },
              { title: 'חשיפות בתוצאות', detail: 'לעומת 28 הימים הקודמים', icon: Eye, done: true, status: 'עלייה' },
              { title: 'מיקום ממוצע', detail: 'לעומת 28 הימים הקודמים', icon: Search, done: false, status: 'ללא שינוי' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'מה רואים',
          title: 'הנתונים של גוגל, במקום שבו אתם עובדים',
          items: [
            { icon: LineChart, title: 'המגמה', body: 'קליקים, חשיפות ומיקום ממוצע, עם השינוי לעומת התקופה הקודמת.' },
            { icon: BarChart3, title: 'העמודים המובילים', body: 'חמשת העמודים שגוגל שולח אליהם הכי הרבה קליקים.' },
            { icon: Plus, title: 'חיפושים שאתם כבר בהם', body: 'חיפושים שגוגל כבר מציג אתכם בהם ושאתם עוד לא עוקבים אחריהם. מוסיפים למעקב בלחיצה.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'איך מתחברים',
          title: 'חיבור אחד לחשבון Google',
          items: [
            { title: 'מתחברים עם Google', body: 'בהגדרות הפרויקט מאשרים למערכת לקרוא את נתוני Search Console.' },
            { title: 'בוחרים את האתר', body: 'בוחרים את הנכס ב-Search Console שמתאים לפרויקט.' },
            { title: 'הנתונים מתעדכנים', body: 'המערכת מושכת את הנתונים בעצמה, והם מופיעים במסך הדוחות.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'הורדה ושיתוף',
          body: <p>את הנתונים אפשר להוריד כסיכום PDF של שני עמודים, או את כל השורות ב-Excel או CSV.</p>,
        },
      ],
      cta: { title: 'חברו את Search Console לפרויקט', body: he.closeBody, primary: he.trial, secondary: he.check },
    },
    en: {
      hero: {
        eyebrow: 'Search Console data',
        eyebrowIcon: LineChart,
        title: 'What Google itself',
        accent: 'says about your site',
        subtitle: 'Connect Google Search Console and see in the system how many clicks and impressions your site got over the last 28 days, and its average position. Each figure also shows the change against the 28 days before.',
        trust: en.trust,
        primary: en.check,
        secondary: en.trial,
        visual: (
          <WorkListVisual
            heading="The last 28 days"
            rows={[
              { title: 'Clicks from Google', detail: 'against the previous 28 days', icon: MousePointerClick, done: true, status: 'Up' },
              { title: 'Impressions in results', detail: 'against the previous 28 days', icon: Eye, done: true, status: 'Up' },
              { title: 'Average position', detail: 'against the previous 28 days', icon: Search, done: false, status: 'No change' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'What you see',
          title: 'Google\'s own figures, where you work',
          items: [
            { icon: LineChart, title: 'The trend', body: 'Clicks, impressions and average position, with the change against the previous period.' },
            { icon: BarChart3, title: 'Top pages', body: 'The five pages Google sends the most clicks to.' },
            { icon: Plus, title: 'Searches you already appear for', body: 'Searches Google already shows you for that you do not track yet. Add them to tracking in one click.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Connecting',
          title: 'One connection to your Google account',
          items: [
            { title: 'Sign in with Google', body: 'In project settings, allow the system to read your Search Console data.' },
            { title: 'Choose the site', body: 'Pick the Search Console property that matches the project.' },
            { title: 'The figures update', body: 'The system pulls the data on its own, and it appears on the Reports screen.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Download and share',
          body: <p>Download the figures as a two-page PDF summary, or every row in Excel or CSV.</p>,
        },
      ],
      cta: { title: 'Connect Search Console to your project', body: en.closeBody, primary: en.trial, secondary: en.check },
    },
    es: {
      hero: {
        eyebrow: 'Datos de Search Console',
        eyebrowIcon: LineChart,
        title: 'Lo que el propio Google',
        accent: 'dice de tu sitio',
        subtitle: 'Conecta Google Search Console y consulta en el sistema cuántos clics e impresiones recibió tu sitio en los últimos 28 días y su posición media. Cada dato muestra también el cambio respecto a los 28 días anteriores.',
        trust: es.trust,
        primary: es.check,
        secondary: es.trial,
        visual: (
          <WorkListVisual
            heading="Los últimos 28 días"
            rows={[
              { title: 'Clics desde Google', detail: 'frente a los 28 días anteriores', icon: MousePointerClick, done: true, status: 'Sube' },
              { title: 'Impresiones en resultados', detail: 'frente a los 28 días anteriores', icon: Eye, done: true, status: 'Sube' },
              { title: 'Posición media', detail: 'frente a los 28 días anteriores', icon: Search, done: false, status: 'Sin cambios' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Qué ves',
          title: 'Los datos de Google, donde trabajas',
          items: [
            { icon: LineChart, title: 'La tendencia', body: 'Clics, impresiones y posición media, con el cambio respecto al periodo anterior.' },
            { icon: BarChart3, title: 'Páginas principales', body: 'Las cinco páginas a las que Google envía más clics.' },
            { icon: Plus, title: 'Búsquedas en las que ya apareces', body: 'Búsquedas en las que Google ya te muestra y que aún no sigues. Añádelas al seguimiento con un clic.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Cómo conectarlo',
          title: 'Una conexión con tu cuenta de Google',
          items: [
            { title: 'Inicia sesión con Google', body: 'En la configuración del proyecto, permite que el sistema lea tus datos de Search Console.' },
            { title: 'Elige el sitio', body: 'Selecciona la propiedad de Search Console que corresponde al proyecto.' },
            { title: 'Los datos se actualizan', body: 'El sistema obtiene los datos por sí solo y aparecen en la pantalla de informes.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Descargar y compartir',
          body: <p>Descarga los datos como un resumen en PDF de dos páginas, o todas las filas en Excel o CSV.</p>,
        },
      ],
      cta: { title: 'Conecta Search Console a tu proyecto', body: es.closeBody, primary: es.trial, secondary: es.check },
    },
    'pt-BR': {
      hero: {
        eyebrow: 'Dados do Search Console',
        eyebrowIcon: LineChart,
        title: 'O que o próprio Google',
        accent: 'diz sobre o seu site',
        subtitle: 'Conecte o Google Search Console e veja no sistema quantos cliques e impressões o seu site recebeu nos últimos 28 dias e a posição média dele. Cada número mostra também a variação em relação aos 28 dias anteriores.',
        trust: pt.trust,
        primary: pt.check,
        secondary: pt.trial,
        visual: (
          <WorkListVisual
            heading="Os últimos 28 dias"
            rows={[
              { title: 'Cliques do Google', detail: 'em relação aos 28 dias anteriores', icon: MousePointerClick, done: true, status: 'Subiu' },
              { title: 'Impressões nos resultados', detail: 'em relação aos 28 dias anteriores', icon: Eye, done: true, status: 'Subiu' },
              { title: 'Posição média', detail: 'em relação aos 28 dias anteriores', icon: Search, done: false, status: 'Sem mudança' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'O que você vê',
          title: 'Os números do Google, onde você trabalha',
          items: [
            { icon: LineChart, title: 'A tendência', body: 'Cliques, impressões e posição média, com a variação em relação ao período anterior.' },
            { icon: BarChart3, title: 'Páginas principais', body: 'As cinco páginas para as quais o Google envia mais cliques.' },
            { icon: Plus, title: 'Buscas em que você já aparece', body: 'Buscas em que o Google já mostra você e que você ainda não acompanha. Adicione ao acompanhamento com um clique.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Como conectar',
          title: 'Uma conexão com a sua conta Google',
          items: [
            { title: 'Entre com o Google', body: 'Nas configurações do projeto, permita que o sistema leia os seus dados do Search Console.' },
            { title: 'Escolha o site', body: 'Selecione a propriedade do Search Console que corresponde ao projeto.' },
            { title: 'Os números se atualizam', body: 'O sistema busca os dados sozinho, e eles aparecem na tela de relatórios.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Baixar e compartilhar',
          body: <p>Baixe os números como um resumo em PDF de duas páginas, ou todas as linhas em Excel ou CSV.</p>,
        },
      ],
      cta: { title: 'Conecte o Search Console ao seu projeto', body: pt.closeBody, primary: pt.trial, secondary: pt.check },
    },
    fr: {
      hero: {
        eyebrow: 'Données Search Console',
        eyebrowIcon: LineChart,
        title: 'Ce que Google lui-même',
        accent: 'dit de votre site',
        subtitle: 'Connectez Google Search Console et voyez dans le système combien de clics et d’impressions votre site a obtenus sur les 28 derniers jours, ainsi que sa position moyenne. Chaque chiffre affiche aussi l’évolution par rapport aux 28 jours précédents.',
        trust: fr.trust,
        primary: fr.check,
        secondary: fr.trial,
        visual: (
          <WorkListVisual
            heading="Les 28 derniers jours"
            rows={[
              { title: 'Clics depuis Google', detail: 'par rapport aux 28 jours précédents', icon: MousePointerClick, done: true, status: 'En hausse' },
              { title: 'Impressions dans les résultats', detail: 'par rapport aux 28 jours précédents', icon: Eye, done: true, status: 'En hausse' },
              { title: 'Position moyenne', detail: 'par rapport aux 28 jours précédents', icon: Search, done: false, status: 'Stable' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Ce que vous voyez',
          title: 'Les chiffres de Google, là où vous travaillez',
          items: [
            { icon: LineChart, title: 'La tendance', body: 'Clics, impressions et position moyenne, avec l’évolution par rapport à la période précédente.' },
            { icon: BarChart3, title: 'Pages principales', body: 'Les cinq pages vers lesquelles Google envoie le plus de clics.' },
            { icon: Plus, title: 'Recherches où vous apparaissez déjà', body: 'Les recherches sur lesquelles Google vous affiche déjà et que vous ne suivez pas encore. Ajoutez-les au suivi en un clic.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'La connexion',
          title: 'Une seule connexion à votre compte Google',
          items: [
            { title: 'Connectez-vous avec Google', body: 'Dans les réglages du projet, autorisez le système à lire vos données Search Console.' },
            { title: 'Choisissez le site', body: 'Sélectionnez la propriété Search Console qui correspond au projet.' },
            { title: 'Les chiffres se mettent à jour', body: 'Le système récupère les données tout seul, et elles apparaissent sur l’écran des rapports.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Télécharger et partager',
          body: <p>Téléchargez les chiffres sous forme de résumé PDF de deux pages, ou toutes les lignes en Excel ou CSV.</p>,
        },
      ],
      cta: { title: 'Connectez Search Console à votre projet', body: fr.closeBody, primary: fr.trial, secondary: fr.check },
    },
    it: {
      hero: {
        eyebrow: 'Dati Search Console',
        eyebrowIcon: LineChart,
        title: 'Che cosa dice Google stesso',
        accent: 'del suo sito',
        subtitle: 'Si collega Google Search Console e si vedono nel sistema quanti clic e quante impressioni il sito ha ottenuto negli ultimi 28 giorni, oltre alla sua posizione media. Ogni cifra mostra anche l’andamento rispetto ai 28 giorni precedenti.',
        trust: it.trust,
        primary: it.check,
        secondary: it.trial,
        visual: (
          <WorkListVisual
            heading="Gli ultimi 28 giorni"
            rows={[
              { title: 'Clic da Google', detail: 'rispetto ai 28 giorni precedenti', icon: MousePointerClick, done: true, status: 'In crescita' },
              { title: 'Impressioni nei risultati', detail: 'rispetto ai 28 giorni precedenti', icon: Eye, done: true, status: 'In crescita' },
              { title: 'Posizione media', detail: 'rispetto ai 28 giorni precedenti', icon: Search, done: false, status: 'Stabile' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Che cosa si vede',
          title: 'I numeri di Google, là dove si lavora',
          items: [
            { icon: LineChart, title: 'L’andamento', body: 'Clic, impressioni e posizione media, con la variazione rispetto al periodo precedente.' },
            { icon: BarChart3, title: 'Pagine principali', body: 'Le cinque pagine verso cui Google invia più clic.' },
            { icon: Plus, title: 'Ricerche in cui il sito compare già', body: 'Le ricerche per cui Google mostra già il sito e che non sono ancora monitorate. Si aggiungono al monitoraggio con un clic.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Il collegamento',
          title: 'Un solo collegamento all’account Google',
          items: [
            { title: 'Accesso con Google', body: 'Nelle impostazioni del progetto si autorizza il sistema a leggere i dati di Search Console.' },
            { title: 'Scelta del sito', body: 'Si seleziona la proprietà Search Console corrispondente al progetto.' },
            { title: 'I numeri si aggiornano', body: 'Il sistema recupera i dati da sé e compaiono nella schermata dei report.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Scaricare e condividere',
          body: <p>I numeri si scaricano come riepilogo PDF di due pagine, oppure tutte le righe in Excel o CSV.</p>,
        },
      ],
      cta: { title: 'Colleghi Search Console al suo progetto', body: it.closeBody, primary: it.trial, secondary: it.check },
    },
    nl: {
      hero: {
        eyebrow: 'Gegevens uit Search Console',
        eyebrowIcon: LineChart,
        title: 'Wat Google zelf',
        accent: 'over uw website zegt',
        subtitle: 'Verbind Google Search Console en zie in het systeem hoeveel klikken en weergaven uw website in de afgelopen 28 dagen gekregen heeft en hoe haar gemiddelde positie eruitziet. Elk cijfer laat ook de verandering zien ten opzichte van de 28 dagen daarvoor.',
        trust: nl.trust,
        primary: nl.check,
        secondary: nl.trial,
        visual: (
          <WorkListVisual
            heading="De afgelopen 28 dagen"
            rows={[
              { title: 'Klikken uit Google', detail: 'ten opzichte van de vorige 28 dagen', icon: MousePointerClick, done: true, status: 'Gestegen' },
              { title: 'Weergaven in de resultaten', detail: 'ten opzichte van de vorige 28 dagen', icon: Eye, done: true, status: 'Gestegen' },
              { title: 'Gemiddelde positie', detail: 'ten opzichte van de vorige 28 dagen', icon: Search, done: false, status: 'Onveranderd' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Wat u ziet',
          title: 'Googles eigen cijfers, daar waar u werkt',
          items: [
            { icon: LineChart, title: 'De ontwikkeling', body: 'Klikken, weergaven en gemiddelde positie, met de verandering ten opzichte van de vorige periode.' },
            { icon: BarChart3, title: 'Belangrijkste pagina\u2019s', body: 'De vijf pagina\u2019s waar Google de meeste klikken naartoe stuurt.' },
            { icon: Plus, title: 'Zoekopdrachten waarvoor u al verschijnt', body: 'Zoekopdrachten waarbij Google u al toont en die u nog niet volgt. Met één klik in de monitoring op te nemen.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Verbinden',
          title: 'Eén verbinding met uw Google-account',
          items: [
            { title: 'Aanmelden met Google', body: 'Geef het systeem in de projectinstellingen toestemming om uw Search Console-gegevens te lezen.' },
            { title: 'Website kiezen', body: 'Kies de Search Console-property die bij het project hoort.' },
            { title: 'De cijfers werken zich bij', body: 'Het systeem haalt de gegevens zelf op, en zij verschijnen in het overzicht «Rapporten».' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Downloaden en doorgeven',
          body: <p>Download de cijfers als een pdf-samenvatting van twee pagina\u2019s, of elke afzonderlijke regel als Excel of CSV.</p>,
        },
      ],
      cta: { title: 'Verbind Search Console met uw project', body: nl.closeBody, primary: nl.trial, secondary: nl.check },
    },
    de: {
      hero: {
        eyebrow: 'Search-Console-Daten',
        eyebrowIcon: LineChart,
        title: 'Was Google selbst',
        accent: 'über Ihre Website sagt',
        subtitle: 'Verbinden Sie die Google Search Console und sehen Sie im System, wie viele Klicks und Impressionen Ihre Website in den letzten 28 Tagen erhalten hat und wie ihre durchschnittliche Position aussieht. Jede Zahl zeigt auch die Veränderung gegenüber den 28 Tagen davor.',
        trust: de.trust,
        primary: de.check,
        secondary: de.trial,
        visual: (
          <WorkListVisual
            heading="Die letzten 28 Tage"
            rows={[
              { title: 'Klicks aus Google', detail: 'gegenüber den vorherigen 28 Tagen', icon: MousePointerClick, done: true, status: 'Gestiegen' },
              { title: 'Impressionen in den Ergebnissen', detail: 'gegenüber den vorherigen 28 Tagen', icon: Eye, done: true, status: 'Gestiegen' },
              { title: 'Durchschnittliche Position', detail: 'gegenüber den vorherigen 28 Tagen', icon: Search, done: false, status: 'Unverändert' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Was Sie sehen',
          title: 'Googles eigene Zahlen, dort, wo Sie arbeiten',
          items: [
            { icon: LineChart, title: 'Die Entwicklung', body: 'Klicks, Impressionen und durchschnittliche Position, mit der Veränderung gegenüber dem vorherigen Zeitraum.' },
            { icon: BarChart3, title: 'Wichtigste Seiten', body: 'Die fünf Seiten, auf die Google die meisten Klicks schickt.' },
            { icon: Plus, title: 'Suchanfragen, für die Sie schon erscheinen', body: 'Suchanfragen, bei denen Google Sie bereits zeigt und die Sie noch nicht verfolgen. Mit einem Klick ins Tracking aufnehmen.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Verbinden',
          title: 'Eine Verbindung zu Ihrem Google-Konto',
          items: [
            { title: 'Mit Google anmelden', body: 'Erlauben Sie dem System in den Projekteinstellungen, Ihre Search-Console-Daten zu lesen.' },
            { title: 'Website auswählen', body: 'Wählen Sie die Search-Console-Property, die zum Projekt gehört.' },
            { title: 'Die Zahlen aktualisieren sich', body: 'Das System holt die Daten selbst, und sie erscheinen in der Ansicht «Berichte».' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Herunterladen und weitergeben',
          body: <p>Laden Sie die Zahlen als zweiseitige PDF-Zusammenfassung herunter, oder jede einzelne Zeile als Excel oder CSV.</p>,
        },
      ],
      cta: { title: 'Verbinden Sie die Search Console mit Ihrem Projekt', body: de.closeBody, primary: de.trial, secondary: de.check },
    },
    ja: {
      hero: {
        eyebrow: 'Search Consoleのデータ',
        eyebrowIcon: LineChart,
        title: 'Google自身が',
        accent: 'サイトについて語っている内容',
        subtitle: 'Google Search Consoleを連携すると、直近28日間にサイトが得たクリック数と表示回数、そして平均掲載順位をシステム内でご確認いただけます。どの数値にも、その前の28日間と比べた推移が表示されます。',
        trust: ja.trust,
        primary: ja.check,
        secondary: ja.trial,
        visual: (
          <WorkListVisual
            heading="直近28日間"
            rows={[
              { title: 'Googleからのクリック数', detail: '前の28日間との比較', icon: MousePointerClick, done: true, status: '増加' },
              { title: '検索結果での表示回数', detail: '前の28日間との比較', icon: Eye, done: true, status: '増加' },
              { title: '平均掲載順位', detail: '前の28日間との比較', icon: Search, done: false, status: '横ばい' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '見られる内容',
          title: 'Googleの数値を、作業する場所で',
          items: [
            { icon: LineChart, title: '推移', body: 'クリック数、表示回数、平均掲載順位と、前の期間からの変化です。' },
            { icon: BarChart3, title: '主なページ', body: 'Googleが最も多くクリックを送っているページ5件です。' },
            { icon: Plus, title: 'すでに表示されている検索語', body: 'Googleがすでにサイトを表示していて、まだ計測していない検索語です。ワンクリックで計測に追加できます。' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: '連携',
          title: 'Googleアカウントとの連携は一度だけ',
          items: [
            { title: 'Googleでログイン', body: 'プロジェクトの設定で、Search Consoleのデータの読み取りをシステムに許可します。' },
            { title: 'サイトを選ぶ', body: 'プロジェクトに対応するSearch Consoleのプロパティを選択します。' },
            { title: '数値が更新されます', body: 'システムが自動でデータを取得し、レポートの画面に表示されます。' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'ダウンロードと共有',
          body: <p>数値は2ページのPDFサマリーとして、または全行をExcelかCSVとしてダウンロードできます。</p>,
        },
      ],
      cta: { title: 'Search Consoleをプロジェクトに連携する', body: ja.closeBody, primary: ja.trial, secondary: ja.check },
    },
    pl: {
      hero: {
        eyebrow: 'Dane z Search Console',
        eyebrowIcon: LineChart,
        title: 'Co sam Google',
        accent: 'mówi o Państwa stronie',
        subtitle: 'Po podłączeniu Google Search Console w systemie widać, ile kliknięć i wyświetleń strona dostała w ostatnich 28 dniach i jak wygląda jej średnia pozycja. Każda liczba pokazuje też zmianę wobec poprzednich 28 dni.',
        trust: pl.trust,
        primary: pl.check,
        secondary: pl.trial,
        visual: (
          <WorkListVisual
            heading="Ostatnie 28 dni"
            rows={[
              { title: 'Kliknięcia z Google', detail: 'wobec poprzednich 28 dni', icon: MousePointerClick, done: true, status: 'Wzrost' },
              { title: 'Wyświetlenia w wynikach', detail: 'wobec poprzednich 28 dni', icon: Eye, done: true, status: 'Wzrost' },
              { title: 'Średnia pozycja', detail: 'wobec poprzednich 28 dni', icon: Search, done: false, status: 'Bez zmian' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: 'Co widać',
          title: 'Liczby samego Google, tam gdzie Państwo pracują',
          items: [
            { icon: LineChart, title: 'Przebieg w czasie', body: 'Kliknięcia, wyświetlenia i średnia pozycja, ze zmianą wobec poprzedniego okresu.' },
            { icon: BarChart3, title: 'Najważniejsze podstrony', body: 'Pięć podstron, do których Google wysyła najwięcej kliknięć.' },
            { icon: Plus, title: 'Zapytania, na które strona już się pokazuje', body: 'Zapytania, przy których Google już pokazuje stronę, a których Państwo jeszcze nie monitorują. Dodanie do monitorowania to jedno kliknięcie.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: 'Podłączenie',
          title: 'Jedno połączenie z kontem Google',
          items: [
            { title: 'Logowanie przez Google', body: 'W ustawieniach projektu dają Państwo systemowi zgodę na odczyt danych z Search Console.' },
            { title: 'Wybór strony', body: 'Wybierają Państwo usługę w Search Console, która należy do projektu.' },
            { title: 'Liczby się aktualizują', body: 'System sam pobiera dane, a one pojawiają się w widoku „Raporty”.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: 'Pobranie i przekazanie',
          body: <p>Liczby można pobrać jako dwustronicowe podsumowanie w pdf albo każdy wiersz osobno jako Excel lub CSV.</p>,
        },
      ],
      cta: { title: 'Proszę podłączyć Search Console do projektu', body: pl.closeBody, primary: pl.trial, secondary: pl.check },
    },
    ko: {
      hero: {
        eyebrow: 'Search Console 데이터',
        eyebrowIcon: LineChart,
        title: 'Google이 직접',
        accent: '내 사이트에 대해 말하는 것',
        subtitle: 'Google Search Console을 연결하시면 최근 28일 동안 사이트가 받은 클릭 수와 노출 수, 그리고 평균 게재순위를 시스템에서 보실 수 있습니다. 모든 수치에는 그 이전 28일과 비교한 변화도 함께 표시됩니다.',
        trust: ko.trust,
        primary: ko.check,
        secondary: ko.trial,
        visual: (
          <WorkListVisual
            heading="최근 28일"
            rows={[
              { title: 'Google 유입 클릭', detail: '이전 28일 대비', icon: MousePointerClick, done: true, status: '증가' },
              { title: '검색 결과 노출', detail: '이전 28일 대비', icon: Eye, done: true, status: '증가' },
              { title: '평균 게재순위', detail: '이전 28일 대비', icon: Search, done: false, status: '변동 없음' },
            ]}
          />
        ),
      },
      sections: [
        {
          kind: 'cards',
          tone: 'contrast',
          eyebrow: '무엇이 보이는가',
          title: 'Google 자체 수치를, 일하시는 자리에서',
          items: [
            { icon: LineChart, title: '기간별 추이', body: '클릭 수, 노출 수, 평균 게재순위를 이전 기간과 비교한 변화와 함께 보여 드립니다.' },
            { icon: BarChart3, title: '주요 페이지', body: 'Google이 가장 많은 클릭을 보내는 페이지 다섯 곳입니다.' },
            { icon: Plus, title: '이미 노출되고 있는 검색어', body: 'Google이 이미 사이트를 보여 주고 있는데 아직 추적하지 않으시는 검색어입니다. 클릭 한 번으로 추적에 추가하실 수 있습니다.' },
          ],
        },
        {
          kind: 'steps',
          eyebrow: '연결',
          title: 'Google 계정으로 한 번 연결',
          items: [
            { title: 'Google로 로그인', body: '프로젝트 설정에서 Search Console 데이터를 읽을 권한을 시스템에 주십니다.' },
            { title: '사이트 선택', body: 'Search Console에서 이 프로젝트에 해당하는 속성을 고르십니다.' },
            { title: '수치가 갱신됩니다', body: '시스템이 데이터를 알아서 가져오고, "리포트" 화면에 표시됩니다.' },
          ],
        },
        {
          kind: 'callout',
          icon: FileDown,
          title: '내려받아 전달하기',
          body: <p>수치는 두 페이지 요약 PDF로 내려받으실 수 있고, 각 행을 Excel이나 CSV로 따로 내려받으실 수도 있습니다.</p>,
        },
      ],
      cta: { title: '프로젝트에 Search Console을 연결하십시오', body: ko.closeBody, primary: ko.trial, secondary: ko.check },
    },
  },
}

