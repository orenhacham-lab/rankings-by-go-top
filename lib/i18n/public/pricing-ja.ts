/**
 * The Japanese pricing page's words around the plan grid
 * (app/(public)/ja/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise — in Japan 景品表示法 treats an
 * unprovable performance claim as a misrepresentation, so the badge says what it
 * is, a recommendation, and nothing here says how far a site will rise.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Japan sees the same dollar price
 * every market outside Israel is billed in today, because Japan's own local
 * price is not set yet. Nothing here promises a currency, and the Japanese page
 * never names yen.
 *
 * THE TAX LINE says what we can prove: Creem is the merchant of record, it
 * computes the tax from the billing address and shows the final amount before
 * payment. It deliberately does NOT say that the receipt is a 適格請求書 under
 * Japan's インボイス制度 — whether Creem's invoice carries a registration number
 * is a question for Creem, and a Japanese business buyer's input-tax credit
 * depends on that answer. Claiming it before it is confirmed would be the kind
 * of sentence a customer's accountant discovers at the worst moment.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingJa: PricingCopy = {
  hero: {
    eyebrow: '料金',
    title: '見つけてもらうために必要なものを、',
    accent: '月額料金で',
    subtitle: '記事を作成してサイトに公開し、GoogleとGoogleマップでの検索順位を計測し、ChatGPTとGeminiが何を推薦しているかを確認します。プランはご自身の必要に合わせてお選びいただけます。まずは無料トライアルから始められます。',
    trust: [`${DAYS}日間の無料トライアル`, 'クレジットカードは不要', 'ダッシュボードからいつでも解約'],
  },
  plans: {
    perMonth: '／月',
    popular: '当社のおすすめ',
    cta: `${DAYS}日間無料で試す`,
    dashboard: 'ダッシュボード',
    noCard: 'クレジットカードは不要',
    checksNote: CHECKS_EXPLAINER.ja,
    taxNote: {
      ILS: '表示価格にはイスラエルの付加価値税が含まれています。これがお支払いいただく金額で、追加はありません。',
      USD: 'カード決済の販売者は、登録事業者であるCreemです。請求先の住所にもとづいて税額を計算し、お支払いの前に最終金額を表示します。ここに表示している価格に税額は含まれていません。',
    },
    everyPlanLabel: 'すべてのプランに含まれます',
    everyPlan: [
      'WordPress、Shopify、Wixへの予約公開を自動で',
      'GoogleとGoogleマップでの検索順位の計測',
      'ChatGPTやGeminiを含むAIエンジン6種が、自社を引用しているかの確認',
      'サイトの健全性スコアと、修正項目の一覧',
      'そのまま送れるPDFとExcelのレポート',
      '担当者による直接のサポート',
    ],
  },
  unsure: {
    text: 'まだ決めかねている方は、サイトの無料診断から始めてください。',
    cta: 'サイトを診断する',
  },
  included: {
    eyebrow: 'すべてのプランに含まれます',
    title: 'オプションはありません。初日からすべて含まれています。',
    body: 'プランの違いは量だけです。サイトの件数、記事の本数、毎月のチェックの件数です。機能はどのプランでも同じです。',
    items: [
      {
        title: '記事の作成と公開',
        desc: 'ご承認いただいた題材について、画像、よくある質問のセクション、内部リンクを含む記事を一本ずつ仕上げ、予定に沿ってサイトに公開します。',
      },
      {
        title: 'GoogleとGoogleマップでの計測',
        desc: '重要な検索語ごとに、通常の検索とマップで自社が何位に出ているか、そしてそれが時間とともにどう変わるかがわかります。',
      },
      {
        title: 'AIエンジンでの可視性',
        desc: 'ChatGPT、Gemini、Perplexity、Copilot、Grok、Google AIが自社を引用しているか、そして代わりに誰を引用しているかを確認します。',
      },
      {
        title: 'キーワード調査',
        desc: '顧客が検索し、尋ねている内容を見つけ出し、どこから始めるとよいかをご提案します。',
      },
      {
        title: 'そのまま送れるレポート',
        desc: '順位、推移、AIでの可視性を、ワンクリックで作成するPDFまたはExcelのレポートにまとめます。取引先や経営層にそのままお渡しいただけます。',
      },
      {
        title: '担当者による直接のサポート',
        desc: 'WhatsAppとメールで、担当者が直接お答えします。',
      },
    ],
  },
  value: {
    eyebrow: '選ばれる理由',
    title: '3つの職能の代わりに、1つの契約で',
    body: '通常は、題材を選んで書く人、それをサイトに公開する人、そして効いたかどうかを確認する道具が必要になります。ここではそのすべてが同じ場所で起こります。',
    items: [
      {
        title: '計測するだけでなく、作業そのものを行います',
        desc: '誰かが動くのを待つレポートがもう一つ増えるわけではありません。ご承認いただいた題材についてのみ、プラットフォームが自分で記事を書いて公開します。',
      },
      {
        title: '何に対して支払っているかが正確にわかります',
        desc: '公開した記事、順位の変動、AIでの引用が一つのダッシュボードにまとまり、どなたにでも転送できるレポートになります。',
      },
      {
        title: '縛りはありません',
        desc: `${DAYS}日間のトライアルはクレジットカード不要、お支払いは月ごとで、解約はダッシュボードからいつでも行えます。`,
      },
    ],
  },
  usage: {
    eyebrow: '利用量の数え方',
    title: '但し書きはありません',
    body: '3つの単位だけで数え、どの枠も毎月更新されます。',
    items: [
      {
        title: '記事',
        desc: '新しい記事を作成すると、枠を1つ使います。既存の記事の修正、予約、公開では枠を使いません。',
      },
      {
        title: 'Google順位チェック',
        desc: '1つのキーワードが1か所で何位に出ているかを確認します。GoogleまたはGoogleマップのいずれかです。同じキーワードを両方で確認すると、2件と数えます。',
      },
      {
        title: 'AI可視性チェック',
        desc: 'AIエンジン1つに質問を1件送り、自社が引用されているかを確認します。同じ質問をChatGPTとGeminiに送ると、2件と数えます。',
      },
    ],
    note: '記事の枠はアカウント単位です。複数のサイトを扱うプランでは、すべてのサイトで共有されます。',
  },
  faq: {
    eyebrow: 'よくある質問',
    title: 'プランを選ぶ前に聞かれること',
    body: '答えが見つからない場合は、WhatsAppでご連絡ください。',
    items: [
      {
        q: 'どのプランが合いますか',
        a: `BasicとAdvancedはサイト1件向けで、主な違いは月あたりの記事の本数です。${BASIC_ARTICLES}本に対して${ADVANCED_ARTICLES}本です。Premiumは複数のサイトを運営する方向け、Agencyは取引先のサイトを運用する方向けです。小さく始めて、いつでもプランを変更できます。`,
      },
      {
        q: '無料トライアルには何が含まれますか',
        a: `${DAYS}日間、クレジットカードは不要です。サイト1件、キーワード${TRIAL_CATALOG.maxKeywordsPerProject}件まで、Google順位チェック${TRIAL_CATALOG.maxGoogleChecksLifetime}件まで、AI可視性チェック${TRIAL_CATALOG.maxAIChecksLifetime}件まで、そして記事1本です。最初から公開までの流れをすべてご確認いただけます。`,
      },
      {
        q: `${DAYS}日間のトライアルが終わるとどうなりますか`,
        a: 'プランをお選びいただければ、中断したところから続きます。お選びにならない場合、請求は発生しません。クレジットカードを一度もお伺いしていないためです。',
      },
      {
        q: 'プランの変更や解約はできますか',
        a: 'はい。プランはいつでも変更でき、新しい枠はその時点から適用されます。解約はダッシュボードから行え、違約金も解約手数料もありません。',
      },
      {
        q: '使わなかった記事の枠はどうなりますか',
        a: '枠は毎月更新され、使わなかった分は翌月に繰り越されません。',
      },
      {
        q: '計測は自動で始まりますか',
        a: '手動の計測はいつでも実行できます。月に一度自動で実行する月次計測を有効にすることもできます。日次や週次の自動計測は、現時点ではご用意していません。',
      },
      {
        q: '記事を予約して自動で公開できますか',
        a: 'はい。将来の日付に予約することも、連携済みのサイトへすぐに公開することもできます。WordPress、Shopify、Wixに対応しています。',
      },
      {
        q: '当社のデータはどのように保護されますか',
        a: 'すべての通信は暗号化されています（SSL／TLS）。パスワードは暗号化して保管し、どのアカウントもご自身のデータのみを参照できます。情報は、ホスティング、決済、検索データなど、このプラットフォームが動くために必要な提供元とのみ共有し、その取り扱いはプライバシーポリシーに従います。',
        // The privacy policy exists in this language (content/legal/ja, rendered
        // by app/(public)/ja/privacy), so the link stays inside the language the
        // reader chose. The French page learned this the hard way: its link
        // pointed at /en/privacy for months, which handed the reader an English
        // document — the one thing the site's language rule forbids.
        link: { label: 'プライバシーポリシーを読む', href: '/ja/privacy' },
      },
    ],
  },
  cta: {
    title: 'まずはプラットフォームがサイトで何を見つけるかをご覧になりませんか',
    body: `無料診断はサイトを読み取り、登録なしで最初の調査のまとめを返します。あるいは${DAYS}日間のトライアルを開いて、すべてをお試しいただけます。`,
    check: 'サイトを無料で診断する',
    trial: '無料トライアルを始める',
    dashboard: 'ダッシュボード',
  },
}
