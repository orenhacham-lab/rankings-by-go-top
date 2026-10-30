/**
 * 特定商取引法に基づく表記 — the one legal page Japanese has and the other six
 * languages do not.
 *
 * WHY IT IS A PAGE AND NOT A SIXTH LEGAL SLUG: the five slugs in
 * lib/legal/markdown.ts are the documents every translated language owes, and
 * the QA contract reads them as a set (components/public/__qa__/translated-legal-coverage.qa.ts
 * compares each language's five against the English pages). A sixth slug would
 * oblige Spanish, Brazilian Portuguese, French and Italian to publish a
 * Japanese statute's disclosure, which is nonsense. So this is a hand-written
 * route inside the /ja tree, gated by the same layout as every other /ja page.
 *
 * WHY WE PUBLISH IT AT ALL: 特定商取引法第26条1項1号 exempts a contract made for
 * business use, but the exemption turns on the PURPOSE OF THE CONTRACT, not on
 * what the seller's marketing says. Signup is open, and an individual can buy
 * this for private use, so the exemption is not ours to rely on and the full
 * disclosure of 第11条 is. Every item the Act and its rules ask for is here,
 * including the 返品特約, which is the item an advertisement must display and
 * the one that decides what a Japanese buyer may get back.
 *
 * The numbers are the owner's: USD 79 a month and up abroad, tax on top, card
 * payment collected by Creem as merchant of record, Shopify billing for stores
 * that installed through Shopify. Nothing here may be edited without him.
 */
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalDoc } from '@/components/public/LegalDoc'
import Link from 'next/link'

const TITLE = '特定商取引法に基づく表記 | Go Top SEO'
const DESCRIPTION = '特定商取引法が通信販売の広告に表示を求める事項の表記です。'

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The whole legal tree is noindex, and this page is part of it. Noindex does
  // not hide it: it is linked from the footer of every Japanese page, which is
  // what the Act asks for — that the buyer can find it before paying.
  robots: 'noindex, nofollow',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://www.gotopseo.com/ja/tokusho',
    locale: 'ja_JP',
  },
}

export default function JapaneseTokushoPage() {
  return (
    <LegalDoc
      locale="ja"
      breadcrumbs={[{ label: '特定商取引法に基づく表記', href: '/ja/tokusho' }]}
      title="特定商取引法に基づく表記"
      subtitle={DESCRIPTION}
    >
      <section>
        <h2>販売事業者</h2>
        <p>GO TOP DIGITAL MARKETING AND ADVERTISING LTD（会社登録番号 517274346）</p>
      </section>

      <section>
        <h2>運営責任者</h2>
        <p>Oren Hacham</p>
      </section>

      <section>
        <h2>所在地</h2>
        <p>HaRechasim 24/2, Ramat Gan 5235524, Israel</p>
      </section>

      <section>
        <h2>連絡先</h2>
        <p>
          メール：
          <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>oren@gotop.co.il</a>
        </p>
        <p className="mt-3">
          電話：
          <a href="tel:+972549489377" className={LEGAL_LINK}>+972-54-9489377</a>
        </p>
        <p className="mt-3">
          イスラエルの営業日は日曜日から木曜日です。お問い合わせはメールが確実で、48時間以内に返信します。
        </p>
      </section>

      <section>
        <h2>役務の内容</h2>
        <p>
          Go Top SEO は、事業者とサイトの運営者のための月額のサービスです。検索順位の計測、サイトの診断と承認された修正の適用、記事の作成と接続されたサイトへの公開、AIでの可視性の計測、Googleビジネスプロフィールへの投稿、およびレポートの作成を含みます。
        </p>
      </section>

      <section>
        <h2>販売価格</h2>
        <p>
          各プランの料金は
          <Link href="/ja/pricing" className={LEGAL_LINK}>料金ページ</Link>
          とアカウント内の「お支払い」画面に表示しています。日本からのお申し込みは米ドル建てで、月額 79 米ドルからです。間接税は別途で、消費税その他の税は Creem が請求先の住所に基づいて計算し、お支払いの画面に表示します。
        </p>
      </section>

      <section>
        <h2>役務の対価以外に必要な費用</h2>
        <p>
          ありません。デジタルのサービスですので送料や手数料は発生しません。インターネットの接続料金はお客様のご負担です。
        </p>
      </section>

      <section>
        <h2>お支払いの方法</h2>
        <p>
          クレジットカードでお支払いいただけます。カードのお支払いは <strong>Creem</strong>（Armitage Labs OÜ）が登録販売者（merchant of record）として収納し、領収書も Creem が発行します。カードの情報が当社に届くことはありません。Shopify App Store からアプリをインストールされたストアについては、請求と解約を Shopify が扱います。
        </p>
      </section>

      <section>
        <h2>お支払いの時期</h2>
        <p>
          お申し込みの時点で初回のお支払いが発生し、その後は毎月同じ日に自動で更新されます。解約されるまで継続します。
        </p>
      </section>

      <section>
        <h2>役務の提供時期</h2>
        <p>
          お支払いの確認後、直ちにご利用いただけます。お支払いの前に7日間のトライアルがあり、トライアルの開始にお支払い用のカードは必要ありません。
        </p>
      </section>

      <section>
        <h2>申込みの有効期限</h2>
        <p>ありません。</p>
      </section>

      <section>
        <h2>解約と返金に関する事項（返品特約）</h2>
        <p>
          通信販売にクーリング・オフの制度はなく、特定商取引法第15条の3が定める8日間の法定返品は商品と特定権利を対象とするもので、本サービスのような役務には及びません。そのうえで、当社の解約と返金の条件は次のとおりです。
        </p>
        <ul>
          <li>サブスクリプションは、アカウント内の「お支払い」画面からいつでも解約できます。理由は必要ありません。</li>
          <li>解約の時点で自動更新は停止し、新たな請求は発生しません。</li>
          <li>すでにお支払いいただいた期間の料金は返金されません。期間の途中で解約された場合も同様です。</li>
          <li>お支払いいただいた期間の終わりまでは、プランをそのままご利用いただけます。</li>
          <li>当社側の障害によって相当期間ご利用いただけなかった場合、または重複請求や誤請求があった場合は、該当する金額をお返しします。</li>
        </ul>
        <p className="mt-3">
          詳しくは
          <Link href="/ja/refund-policy" className={LEGAL_LINK}>解約・返金ポリシー</Link>
          をご覧ください。消費者契約法その他の法律がお客様に与える権利は、この表記によって狭められません。
        </p>
      </section>

      <section>
        <h2>動作環境</h2>
        <p>
          インターネットに接続された端末と、最新版の Chrome、Firefox、Safari または Edge でご利用いただけます。専用のソフトウェアのインストールは必要ありません。
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>最終更新：2026年10月30日</p>
      </section>
    </LegalDoc>
  )
}
