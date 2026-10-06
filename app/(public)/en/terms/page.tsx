import Link from 'next/link'
import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Terms of Use | Go Top SEO',
  description: 'Terms of use for Go Top SEO — the terms that govern your use of our service.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Terms of Use | Go Top SEO',
    description: 'Terms of use for Go Top SEO',
    url: 'https://www.gotopseo.com/en/terms',
    locale: 'en_US',
  },
}

export default function EnglishTermsPage() {
  return (
    <LegalDoc
      locale="en"
      breadcrumbs={[{ label: 'Terms of Use', href: '/en/terms' }]}
      title="Terms of Use"
      subtitle="Go Top SEO"
    >
      <section>
        <h2>1. Introduction and Service Definition</h2>
        <p>
          Go Top SEO (the &ldquo;Service&rdquo; or the &ldquo;Platform&rdquo;) is a SaaS service
          operated by GO TOP MARKETING GRUO LTD (company number 517274346) (the &ldquo;Company&rdquo;). The
          Service allows customers to track keyword rankings on Google search, monitor Google Maps
          visibility, measure visibility on AI engines such as ChatGPT, Gemini and Perplexity, conduct
          keyword research, and generate professional reports. The Service also includes website scans,
          connections to Google accounts and WordPress sites, site fixes you approve, AI-generated content and
          email messages, as set out in sections 15A to 15G.
        </p>
      </section>

      <section>
        <h2>2. Acceptance of Terms</h2>
        <p>
          By registering for, accessing or using the Service, you confirm that you have read, understood
          and agree to be bound by these Terms of Use. If you do not agree to any of these terms, you
          must not register for or use the Service.
        </p>
      </section>

      <section>
        <h2>3. Account Registration and User Responsibility</h2>
        <p>
          When creating an account, you agree to provide accurate, complete and current information.
          You are responsible for maintaining the confidentiality of your account credentials and for
          all activity that takes place under your account. You must notify the Company without delay
          of any suspected unauthorized access.
        </p>
      </section>

      <section>
        <h2>4. Trial Period</h2>
        <p>
          The Service offers a 7-day trial period for new customers. The limits applicable during the
          trial are displayed in the Service and may change from time to time at the Company&rsquo;s
          discretion. Continued use of the Service after the end of the trial period requires an active
          paid subscription.
        </p>
      </section>

      <section>
        <h2>5. Subscriptions and Payments</h2>
        <p>
          The Service operates on a monthly subscription model. As long as the subscription remains
          active, billing renews automatically each month according to the selected plan. Prices,
          plans and limits may change from time to time and updates will be reflected in the Service
          and on the pricing page.
        </p>
        <p className="mt-3">
          <strong>How you are billed depends on how your account was opened:</strong>
        </p>
        <ul>
          <li>
            <strong>Merchants who installed the app through Shopify</strong> (and any account whose
            billing authority is Shopify) are billed exclusively through Shopify App Pricing, as part
            of their Shopify invoice. These merchants are never directed to PayPal or to any other
            checkout outside Shopify, and we do not charge them through a second channel.
          </li>
          <li>
            <strong>Customers who signed up directly on our website</strong>, whose billing authority
            is not Shopify, pay through a third-party payment provider (PayPal).
          </li>
          <li>
            Connecting a Shopify store in order to publish content, by a customer who is already
            billed through the website, does not create double billing: an account is billed through
            one channel only at any given time.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Cancellation</h2>
        <p>
          You may cancel renewal of your subscription at any time through your account settings.
          Access to the Service will be retained until the end of the billing period that has already
          been paid. No retroactive cancellation of a period that has already been paid will be granted,
          except as required by applicable law.
        </p>
      </section>

      <section>
        <h2>7. Refunds</h2>
        <p>
          Subscription fees are non-refundable for a period that has already begun or been paid,
          except where the law requires a refund. Requests to cancel under the law should be
          submitted in writing to the Company&rsquo;s email address. Full details are in our{' '}
          <Link href="/en/refund-policy">Cancellation and Refund Policy</Link>.
        </p>
        <p className="mt-4">
          <strong>7.1 Consumers in the EU and the UK.</strong> If you bought the Service as a private
          consumer, not for business purposes, and you reside in the European Union or the United
          Kingdom, you have the right to withdraw from the contract within 14 days of entering into
          it, without giving a reason. To exercise it, send us written notice at the email address in
          section 21 within those 14 days.
        </p>
        <p className="mt-4">
          <strong>7.2 Waiver of the withdrawal right once the service starts.</strong> The Service is
          a digital service that begins operating immediately. By opening an account you expressly
          request that we begin supplying it at once, and you acknowledge that if we fully supply the
          Service within those 14 days you will lose the right of withdrawal. If you withdraw while
          the Service has been supplied in part, we will refund the price less a proportionate amount
          for what was already supplied.
        </p>
        <p className="mt-4">
          <strong>7.3 Consumers in Israel.</strong> The Israeli Consumer Protection Law, 5741-1981,
          and the regulations under it give a consumer — someone buying other than for business
          purposes — cancellation rights in a distance sale and in a continuing transaction. Nothing
          in these terms derogates from those rights.
        </p>
        <p className="mt-4">
          <strong>7.4</strong> Sections 7.1 to 7.3 apply to private consumers only. For business
          customers, the refund policy in section 7 applies unchanged.
        </p>
      </section>

      <section>
        <h2>8. Usage Limits</h2>
        <p>
          Each plan includes limits as set out on the pricing page and in the account dashboard,
          including:
        </p>
        <ul>
          <li>Number of projects</li>
          <li>Number of keywords per project</li>
          <li>Monthly ranking scans</li>
          <li>Monthly AI visibility scans</li>
          <li>Keyword research usage</li>
          <li>Report generation</li>
        </ul>
        <p>
          Limits are displayed in the Service and may change in accordance with the plan and Company
          policy. Exceeding these limits may result in restricted usage or a requirement to upgrade
          the plan.
        </p>
      </section>

      <section>
        <h2>9. Third-Party Data and Services</h2>
        <p>
          The Service relies, or may rely, on data and services provided by third parties, including:
          Google (including the Gemini API, Search Console and Business Profile), Google Ads API, Google Maps,
          various search providers (including Serper for rank checks), AI providers (ChatGPT, Gemini, Google
          AI Mode, Perplexity, Copilot, Grok and others) and the external scraping provider ScrapeLLM, the
          email provider Resend, payment providers (Shopify for accounts billed through Shopify,
          PayPal for customers billed through the website), and infrastructure and hosting providers
          (Supabase, Vercel and others). Data obtained from third parties may be partial, estimated, delayed
          or unavailable, and its accuracy and availability are not within the Company&rsquo;s control.
        </p>
      </section>

      <section>
        <h2>10. Data Accuracy and No Warranty of Accuracy</h2>
        <p>
          The Company does not warrant the absolute accuracy of ranking data, search volumes,
          competition levels, CPC estimates, AI visibility results or reports. Data is provided
          &ldquo;AS-IS&rdquo; and there may be differences between Service results and manual checks
          or data from other sources.
        </p>
      </section>

      <section>
        <h2>11. No Guarantee of Business Results</h2>
        <p>
          The Company does not guarantee any business outcomes, including improvements in rankings,
          traffic, leads, sales, revenue or visibility on AI engines. The Service provides tracking
          and analytics tools only.
        </p>
      </section>

      <section>
        <h2>12. Service Availability</h2>
        <p>
          The Service is provided as-is and may be subject to outages, maintenance windows, planned
          or unplanned downtime, limitations of third-party APIs and issues at third-party providers.
          The Company will make commercially reasonable efforts to minimize service interruptions but
          does not guarantee continuous 100% availability.
        </p>
      </section>

      <section>
        <h2>13. Prohibited Use</h2>
        <p>The following actions are strictly prohibited:</p>
        <ul>
          <li>Damaging or attempting to disrupt the Service infrastructure</li>
          <li>Circumventing usage limits or security mechanisms</li>
          <li>Reverse engineering, decompiling or extracting source code</li>
          <li>Using the Service for unauthorized scraping</li>
          <li>Sharing access credentials with unauthorized parties</li>
          <li>Using the Service in violation of any applicable law</li>
        </ul>
      </section>

      <section>
        <h2>14. Intellectual Property</h2>
        <p>
          All rights in the Service, including its interface, design, source code, reports, logo and
          brand, belong to the Company. You may not copy, duplicate, distribute, sell or make any
          unauthorized use of the Service&rsquo;s content or components. Permitted use is limited to
          the subscriber&rsquo;s own needs in accordance with the purchased plan.
        </p>
      </section>

      <section>
        <h2>15. User Content</h2>
        <p>
          You are solely responsible for any content you enter into the Service, including domains,
          keywords, AI questions, client details and any other information. You confirm that you hold
          the necessary rights and permissions to use this content within the Service.
        </p>
      </section>

      {/*
        The link network (lib/link-network). This clause applies from the moment a
        project joins, because the feature IS live: the tables exist, the placement
        step runs from lib/content/article-generation.ts, and nothing but a
        per-project opt-in stands between a member and a placed link. An earlier
        draft of this section said the service was not active yet — it was, so the
        sentence was removed. If the service is ever switched off (the
        LINK_NETWORK_DISABLED kill switch, or the tables going away), say so here
        in the same breath as switching it off, never the other way round.
      */}
      <section id="link-network">
        <h2>15A. Link Network</h2>
        <p>
          The link network is an optional service in which the Service may place a link between the
          sites of customers who joined it, inside articles the Service writes for them. It is off by
          default. A connected Shopify store can join it, and the links are placed only inside articles
          the Service writes and publishes to the store&rsquo;s blog; an article, page, product or
          collection that already exists in the store is not edited.
        </p>
        <p className="mt-4">
          <strong>This section applies from the moment you choose to join the network for a given
          project, and not before.</strong> Until you join, the Service places no link from your
          articles and places no links to your site in other customers&rsquo; articles, and this section
          creates no obligation or right for either party. The network is not part of what you pay for
          and is not included in a plan as a commitment, and the Company may suspend or discontinue it
          as stated at the end of this section.
        </p>
        <ul>
          <li>
            <strong>Joining and consent.</strong> Each project joins separately, only by its owner, after
            explicitly accepting the network terms on screen. Consent works both ways: to an outgoing link
            in articles written for you, and to links to your site in articles written for other
            customers in the network. We keep who accepted, when, the wording accepted and the link type
            in force at the time.
          </li>
          <li>
            <strong>Closed scope.</strong> At most one outgoing link per article, inside a sentence already
            in the body of the article, on words already in it. The Service changes no words, adds no text
            and touches no other content on your site.
          </li>
          <li>
            <strong>Placement is never reciprocal.</strong> An outgoing link and the chance to receive a link are
            separate placements, and the Service does not create reciprocal links between two sites.
            Participating sites give and receive contextual links inside articles.
          </li>
          <li>
            <strong>Link type.</strong> The link type (regular or nofollow) is set for the whole network and
            shown on screen and when joining. A change of link type is shown on screen and applies to new
            links only.
          </li>
          <li>
            <strong>Placement rules.</strong> No link is placed between competitors or businesses in the same
            field, between sites of the same owner, or between sites that already link to each other; no
            reciprocal links are placed; the number of links is capped per article and per site each
            month; and a link is placed only where the page is relevant to the paragraph.
          </li>
          <li>
            <strong>Transparency and control.</strong> Every placement is logged and shown to both sides. A
            link added to your article is shown before the article is published and can be removed. Once
            published, the article is on your site and under your control.
          </li>
          <li>
            <strong>Leaving.</strong> You can leave the network at any time. Leaving stops new placements;
            links already published stay as they are unless you remove them from your site.
          </li>
          <li>
            <strong>Privacy.</strong> The Company does not publish a list of network members. The receiving
            side sees the address of the site that links to it and, once published, the page where the link
            appeared.
          </li>
          <li>
            <strong>Risk with Google, and the member&rsquo;s responsibility.</strong> Links intended to influence
            rankings may be treated by Google as a &ldquo;link scheme&rdquo;, and Google&rsquo;s guidelines on link
            networks may change. This may reduce your site&rsquo;s visibility and may even lead to a manual action
            by Google. By joining the network, the project owner confirms that they understand this risk and
            accept it. Joining is optional, off by default, and you can leave at any time.
          </li>
          <li>
            <strong>No guaranteed results.</strong> The Company does not commit to a number of links, to a
            ranking improvement or to how search engines treat the links, and may pause or end the service.
            The site owner is responsible for the site&rsquo;s content and for following search engine
            guidelines.
          </li>
        </ul>
      </section>

      <section id="connections">
        <h2>15B. Connecting Accounts and Sites</h2>
        <p>
          You can connect the following accounts and sites to a project. Each connection is optional, is made
          by you only, and can be disconnected at any time in the project settings. The Privacy Policy explains
          what data is stored and how to delete it.
        </p>
        <ul>
          <li>
            <strong>Google Search Console.</strong> A read-only connection. We change nothing in your Search
            Console account. The data is used to show your site&rsquo;s performance, in reports, and to suggest
            content topics.
          </li>
          <li>
            <strong>Google Business Profile.</strong> When the feature is enabled in the Service, the connection
            lets you publish posts to your business profile. A post is created only when you approved it and
            pressed publish, or at the time you scheduled. We do not change your business information and we do
            not read or reply to reviews.
          </li>
          <li>
            <strong>WordPress.</strong> Connecting a WordPress site is used to read the site&rsquo;s content, to
            publish articles and for the site fixes in section 15C.
          </li>
          <li>
            <strong>Shopify.</strong> Installing the app in your store lets the Service read the store&rsquo;s
            content, products and pages, and publish articles to the store blog, and to apply the site
            fixes in section 15C to them with your approval. The scope is set by the permissions you approved at
            installation, and you can remove the app from the store at any time.
            If you are billed through Shopify, the billing sections of these Terms apply as well. The link
            store can also join the link network in section 15A, by a separate and voluntary joining: the
            links are placed only inside articles the Service writes and publishes to the store&rsquo;s blog,
            and a link can be removed before the article is published. By joining you confirm that you are
            permitted under Shopify&rsquo;s own terms to add such links to the store&rsquo;s content.
          </li>
          <li>
            <strong>Wix.</strong> Connecting a Wix site uses an API key you issue in your own account, and is
            used to read the site&rsquo;s content and to publish articles to its blog. The key is stored
            encrypted, is never shown again on screen after it is saved, and is deleted when you disconnect.
            You can also revoke it on the Wix side at any time.
          </li>
          <li>
            <strong>A site on another platform, through a webhook.</strong> For a site that is not WordPress,
            Shopify or Wix, you can connect an endpoint you control, and the Service sends the article to it
            in a signed request. The signing secret is stored encrypted, is never shown again after it is
            saved, and is deleted when you disconnect. What happens to the article once it reaches that
            endpoint, and your own code&rsquo;s compliance with any law, are your responsibility.
          </li>
        </ul>
        <p className="mt-4">
          This list is every kind of connection the Service offers. A connection added in the future will
          appear here and in the Privacy Policy before it can be used.
        </p>
      </section>

      <section id="site-fixes">
        <h2>15C. Site Fixes</h2>
        <h3>WordPress sites</h3>
        <p>
          On a connected WordPress site, the Service can suggest site fixes and apply them through the GO TOP SEO
          Bridge plugin, only with your consent and your approval of each fix, or within the scope of an
          automatic approval you turned on as described later in this section.
        </p>
        <ul>
          <li>
            <strong>What may be applied.</strong> The list is closed: SEO title, meta description, canonical
            address, focus keyphrase, image alt text, an FAQ block, JSON-LD schema, internal links, repair of
            broken links, demotion of a duplicate H1 heading to a lower heading level, and creating an llms.txt
            file. The Service does not delete content and does not touch prices, products, the theme, other
            plugins, settings or users, and does not publish or unpublish pages.
          </li>
          <li>
            <strong>One approval for a group of fixes.</strong> You can approve, in one approval, a group of safe
            fixes that is shown to you before you approve it: SEO title, meta description and image alt text, up
            to 25 pages at a time, and never the home page. Here too every fix is recorded in the log separately
            and can be undone, and the whole group can be undone at once within 14 days.
          </li>
          <li>
            <strong>Log and undo.</strong> Every fix is recorded in a log together with the previous value, and
            can be undone to restore that value. If the content on the site changed after the fix, automatic undo
            may not be possible.
          </li>
          <li>
            <strong>Disconnecting and removal.</strong> You can disconnect in the settings, and remove the plugin
            from your WordPress admin, at any time. Fixes already applied stay on the site unless you undo them.
          </li>
          <li>
            <strong>Responsibility.</strong> The site, its backups and the compatibility of fixes with your theme
            and plugins are your responsibility. We recommend keeping a backup before approving fixes, and making
            sure you are authorized to make changes to the site.
          </li>
        </ul>
        <h3>Automatic approval of fixes (WordPress only)</h3>
        <p>
          By default every fix needs your approval. For each project separately, on a connected WordPress site
          with the GO TOP SEO Bridge plugin, you can turn on automatic approval in the project settings, after the
          three types of fix it covers are shown to you. It is off by default until you turn it on yourself. In a
          Shopify store there is no automatic approval at all, and every fix there needs your approval each time.
        </p>
        <ul>
          <li>
            <strong>What it covers.</strong> The list is closed and limited to three types. (1) Alt text for an
            image that has no alt attribute at all; an image whose alt text is empty is left as it is, because
            empty can be a deliberate choice. The text is taken from the image file name, or from the page title
            for at most one image per page. (2) A broken internal link: we check the link again at that moment,
            and only if it returns 404 or 410 do we remove the link and keep its words in place. (3) A meta
            description for a page that has none, and only when both the description stored with us and the
            description on the page itself are empty.
          </li>
          <li>
            <strong>What always needs your approval.</strong> Every other fix in this section: SEO title,
            canonical address, focus keyphrase, an FAQ block, JSON-LD schema, internal links, demotion of an H1
            heading and the llms.txt file. Automatic approval does not widen the closed list in this section, and
            does not give us any permission you did not approve in the connection itself.
          </li>
          <li>
            <strong>Pace and limits.</strong> The check runs once a day, automatic fixes are applied to a project
            no more than once every seven days, and only a small number of fixes each time. If you have not signed in
            during the last thirty days, no automatic fixes are applied to the project.
          </li>
          <li>
            <strong>Log and undo.</strong> When it is turned on we record who turned it on, when, and the IP
            address it was turned on from; when it is turned off we record who turned it off and when. Every
            automatic fix is recorded in the fix log like any other fix, together with the previous value, the
            person who turned automatic approval on and the IP address recorded when it was turned on, and is
            marked as a fix applied under automatic approval. At the moment the fix itself is applied we do not
            read and do not store a new IP address, because no person acted at that moment. Every automatic fix
            can be undone exactly like a fix you approved by hand, and the Site health screen shows a summary of
            the fixes applied under automatic approval. We do not send an email about it.
          </li>
          <li>
            <strong>Turning it off.</strong> You can turn it off at any time, and that takes effect at once:
            before every fix we check again that the approval is still on, and at most a fix already being written
            at that moment is completed. Turning it off is final for that approval, and turning it on again
            creates a new approval and is recorded separately. Fixes already applied stay, unless you undo them.
          </li>
        </ul>
        <h3>Shopify stores</h3>
        <p>
          In a connected Shopify store, the Service can suggest site fixes and apply them through the app, only
          with your consent and your approval of each fix.
        </p>
        <ul>
          <li>
            <strong>What may be applied.</strong> The list is closed, and it covers the store&rsquo;s articles and
            pages only: the title and description shown in search results, the alt text of an image inside that
            article or page, the alt text of an article&rsquo;s featured image that has none (a page has no
            featured image), repair of a broken link inside it, an FAQ block added at its end, and turning an
            extra H1 heading inside it into an H2. In alt text we write the text only: we do not touch the image
            file and do not replace the image. Every fix is shown to you before it is applied, and writes to
            that one article or page only. The Service does not touch products, collections, the theme, the
            store&rsquo;s settings, prices, orders, redirects or any file of the store, does not delete content,
            and does not publish or unpublish anything. The FAQ block is visible questions and answers inside the
            content. In a Shopify store the Service adds no JSON-LD schema, adds no scripts and does not touch the
            code of the theme or of the store: everything it writes is content and formatting inside the body of
            that one article or page.
          </li>
          <li>
            <strong>Log and undo.</strong> Every approval of yours is recorded together with who approved it,
            when, the IP address the approval was given from, and the previous and the new value, so that we can
            show you what was done and so that a fix can be undone to restore the previous value. If the content
            in the store changed after the fix, automatic undo may not be possible.
          </li>
          <li>
            <strong>Removal.</strong> You can remove the app from your store at any time. Fixes already applied
            stay in the store unless you undo them.
          </li>
          <li>
            <strong>Responsibility.</strong> The content of the store and the suitability of the fixes to your
            theme are your responsibility, and you must make sure you are authorized to make changes to the
            store.
          </li>
        </ul>
      </section>

      <section id="site-scan">
        <h2>15D. Free Site Check and Onboarding Scan</h2>
        <p>
          The Service offers a free site check before sign-up, and an onboarding scan after a project is
          created. In both, we read public pages of the site you entered, and its robots.txt, sitemap and
          llms.txt files, without signing in and without access to protected areas. Results are stored and used
          to show the findings and to tailor the Service to the site. Entering a site address is a declaration
          that the site is yours or that you are authorized to check it. The free check is rate limited and may
          be blocked.
        </p>
      </section>

      <section id="ai-visibility">
        <h2>15E. AI Visibility Checks</h2>
        <p>
          Visibility checks send questions built from your business name, location and keywords to third-party
          AI engines (ChatGPT, Gemini, Google AI Mode, Perplexity, Copilot and Grok) through an external scraping
          provider, and show the answers. AI engine answers vary from one check to the next, are outside our
          control and may be inaccurate, and there is no commitment that your business will appear in them.
        </p>
        <p className="mt-3">
          In addition to checks you start yourself, the Service runs an automatic monthly check for the
          project. The automatic check counts toward your plan&rsquo;s existing allowance of checks per billing
          period and does not add to it, and you can turn it off at any time on the &ldquo;AI Visibility&rdquo; screen, in the &ldquo;Automatic monthly check&rdquo; card.
        </p>
      </section>

      <section id="ai-content">
        <h2>15F. AI-Generated Content</h2>
        <p>
          The Service uses AI to produce article topics, questions and articles. Such content may contain
          inaccuracies, and reviewing it before publishing, including its factual accuracy, its fit to your
          business and to the law, and third-party rights, is your responsibility.
        </p>
        <ul>
          <li>
            <strong>Automatic topics.</strong> In active projects on a paid plan, the Service tops up article
            topics automatically so the content queue has topics. A topic is not published and does not commit
            you to anything.
          </li>
          <li>
            <strong>Internal links.</strong> The Service may automatically add internal links to other pages of
            your site inside articles.
          </li>
          <li>
            <strong>Call-to-action box.</strong> A call-to-action box at the end of an article is optional, and
            you can turn it on, turn it off and edit its wording.
          </li>
          <li>
            <strong>Approval and publishing.</strong> Content is shown to you for approval and is published on
            your site according to the approval and publishing settings you chose for the project. You may edit,
            reject or delete any content.
          </li>
        </ul>
      </section>

      <section id="emails">
        <h2>15G. Email Messages</h2>
        <ul>
          <li>
            <strong>Account and service messages</strong>, such as sign-up, verification, billing and updates
            about using the Service, are sent as part of the Service.
          </li>
          <li>
            <strong>Reminders.</strong> When content is waiting for your approval, a reminder email may be sent
            to you. Every reminder includes a one-click unsubscribe link that does not require signing in.
          </li>
          <li>
            <strong>Monthly progress report.</strong> A monthly summary of the project&rsquo;s progress, for
            projects where you turned it on in the settings.
          </li>
        </ul>
      </section>

      <section>
        <h2>16. Privacy</h2>
        <p>
          Use of the Service is also governed by the Company&rsquo;s Privacy Policy, which forms an
          integral part of these terms. Where a separate privacy policy is published on the website,
          it should be read together with these terms.
        </p>
      </section>

      <section>
        <h2>17. Limitation of Liability</h2>
        <p>
          Subject to applicable law, the Company shall not be liable for any indirect, consequential,
          special or punitive damages, including loss of profits, loss of data, business impact or
          reliance on Service data. The Company&rsquo;s aggregate liability, if any, shall not exceed
          the amounts actually paid by the user during the 12 months preceding the event giving rise
          to the claim.
        </p>
      </section>

      <section>
        <h2>18. Account Suspension or Termination</h2>
        <p>
          The Company may suspend or terminate a user account, temporarily or permanently, in case
          of a breach of these terms, non-payment, suspected misuse, attempts to harm the Service or
          any other reasonable cause. Upon termination, stored data may be deleted in accordance with
          Company policy and applicable law.
        </p>
      </section>

      <section>
        <h2>19. Changes to the Terms</h2>
        <p>
          The Company may update these terms from time to time. A technical change or a clarification
          takes effect when the updated version is published on the website.
        </p>
        <p className="mt-4">
          <strong>19.1 Material changes.</strong> A change that reduces your rights or widens your
          obligations — including a change in price, a reduction in the scope of the Service, or a
          change to the cancellation policy — will be notified to you by email to the address on your
          account at least 14 days before it takes effect. If you do not agree to it, you may cancel
          the subscription before that date; in that case you may keep using the Service to the end
          of the period you paid for, on the terms in force when you paid.
        </p>
        <p className="mt-4">
          <strong>19.2</strong> Continued use after the notice period has ended, or after a
          non-material change is published, constitutes acceptance of the updated version. This does
          not derogate from the mandatory protections that the law of a private consumer&rsquo;s
          country of residence gives them.
        </p>
      </section>

      <section>
        <h2>20. Governing Law and Jurisdiction</h2>
        <p>
          These terms are governed by the laws of the State of Israel. Exclusive jurisdiction over
          any dispute arising from or related to these terms or the use of the Service lies with the
          competent courts in Israel.
        </p>
        <p className="mt-4">
          <strong>20.1 Consumers.</strong> If you are a private consumer, the choice of law and
          jurisdiction above does not deprive you of the mandatory protections of the law of your
          country of residence, nor of the right to bring proceedings in a court there where that law
          gives you one.
        </p>
        <p className="mt-4">
          <strong>20.2 Sanctions and restricted countries.</strong> We do not provide the Service to
          anyone located in a country or territory subject to sanctions by Israel, the United States
          or the European Union, nor to anyone on a restricted-party list of those authorities. By
          using the Service you confirm that you fall into neither category.
        </p>
      </section>

      <section>
        <h2>21. Contact</h2>
        <p>For any question regarding these terms or the Service, please contact us:</p>
        <p className="mt-4">
          <strong>GO TOP MARKETING GRUO LTD</strong>
          <br />
          Company number: 517274346
          <br />
          Email:{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>
          Last updated: October 6, 2026
        </p>
      </section>
    </LegalDoc>
  )
}
