import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Privacy Policy | Go Top SEO',
  description: 'Privacy policy for Go Top SEO — how we collect, use and protect your data.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Privacy Policy | Go Top SEO',
    description: 'Privacy policy for Go Top SEO',
    url: 'https://www.gotopseo.com/en/privacy',
    locale: 'en_US',
  },
}

export default function EnglishPrivacyPage() {
  return (
    <LegalDoc
      locale="en"
      breadcrumbs={[{ label: 'Privacy Policy', href: '/en/privacy' }]}
      title="Privacy Policy"
      subtitle="Privacy policy for Go Top SEO"
    >
      <section>
        <h2>Introduction</h2>
        <p>
          GO TOP MARKETING GRUO LTD (company number 517274346) (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the company&rdquo;) operates the Go Top SEO service
          at https://www.gotopseo.com (the &ldquo;Service&rdquo;). This privacy policy describes our practices regarding the collection,
          use, and disclosure of personal information when you use our Service.
        </p>
      </section>

      <section>
        <h2>Information We Collect</h2>
        <p>We collect different types of information, including:</p>
        <ul>
          <li><strong>Authentication information:</strong> name, email address, password (encrypted)</li>
          <li><strong>Profile information:</strong> plan details and subscription information</li>
          <li><strong>Business information:</strong> company name, domain, keywords, ranking data</li>
          <li><strong>Technical information:</strong> IP address, browser type, referring page</li>
          <li><strong>Google account data:</strong> only if you choose to sign in with Google or to connect
          Google Search Console or Google Business Profile — see &ldquo;Data We Receive from Google&rdquo; below</li>
          <li><strong>Information from your site:</strong> public pages, robots.txt, the sitemap and llms.txt
          read in the free site check and the onboarding scan, and the findings derived from them — see
          &ldquo;Site Scanning&rdquo; below</li>
          <li><strong>WordPress connection:</strong> the site address, a username and Application Password and the
          plugin&rsquo;s signing key (both stored encrypted), and the log of fixes on the site — see &ldquo;WordPress
          Connection&rdquo; below</li>
          <li><strong>Shopify connection:</strong> the store address, the store identifier, the permissions you
          approved at installation, and the access token the store issues (stored encrypted) — see
          &ldquo;Connecting a Site on Another Platform&rdquo; below</li>
          <li><strong>Wix or webhook connection:</strong> the site address or the endpoint you configured, and
          the Wix API key or the signing secret (stored encrypted and never shown again after saving) — see
          &ldquo;Connecting a Site on Another Platform&rdquo; below</li>
          <li><strong>An address for local rank tracking:</strong> if you typed an exact address, it is stored
          together with the coordinates returned — see &ldquo;Turning an Address into Coordinates&rdquo; below</li>
          <li><strong>Link network:</strong> your joining consent (who accepted, when, the wording and the link
          type) and the placement log — see &ldquo;Link Network&rdquo; below</li>
          <li><strong>Results and content:</strong> AI visibility check results, and content generated for you:
          topics, questions and articles</li>
          <li><strong>Email preferences:</strong> which messages you receive, and unsubscribes from reminders</li>
          <li><strong>Payment information:</strong> we do not store your payment instrument. For
          accounts whose billing authority is Shopify — including merchants who installed the app
          through Shopify — payment is processed by Shopify under Shopify App Pricing, and we never
          direct them to PayPal. For customers who signed up directly on our website, whose billing
          authority is not Shopify, payment is processed through PayPal</li>
        </ul>
      </section>

      <section>
        <h2>How We Use Your Data</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide the rank tracking service</li>
          <li>Run scans and AI visibility checks, generate content and apply the site fixes you approve</li>
          <li>Send reminders and progress reports, and answer your enquiries</li>
          <li>Authenticate users and manage accounts</li>
          <li>Process payments</li>
          <li>Send service updates and news</li>
          <li>Improve our service</li>
          <li>Comply with legal requirements</li>
        </ul>
      </section>

      <section>
        <h2>Information Sharing</h2>
        <p>We do not share your personal information with third parties, except:</p>
        <ul>
          <li><strong>Shopify:</strong> for payment processing for accounts billed through Shopify App Pricing, and for publishing content to a connected store</li>
          <li><strong>PayPal:</strong> for payment processing for website-billed customers only</li>
          <li><strong>Supabase:</strong> for secure data storage</li>
          <li><strong>Serper:</strong> for Google search queries and rank checks</li>
          <li><strong>Resend:</strong> for sending email — see &ldquo;Email Messages&rdquo; below</li>
          <li><strong>Vercel:</strong> for hosting the site and the Service</li>
          <li><strong>Google (Gemini API, Search Console, Business Profile, Google Ads API):</strong> our AI provider for generating text and images, the connections you choose to make, and the Google Ads API, to which we send keywords to get search volumes and further keyword ideas. That interface is a Company account and not an advertising account of yours; we do not run campaigns for you — see &ldquo;AI Providers&rdquo; and &ldquo;Data We Receive from Google&rdquo; below</li>
          <li><strong>Wix:</strong> only if you connected a Wix site — to read the site&rsquo;s content and publish articles to its blog</li>
          <li><strong>The endpoint you configured yourself (webhook):</strong> only if you connected a site on another platform — the article is sent to the address you gave, in a signed request</li>
          <li><strong>PDFShift:</strong> to convert a report to PDF, and only when you asked to download one. We send the report&rsquo;s content as displayed in order to get the PDF file back</li>
          <li><strong>OpenStreetMap (Nominatim):</strong> to turn an address into coordinates, and only when you typed an exact address for local rank tracking. The address you typed and the country name are sent, never account details</li>
          <li><strong>ScrapeLLM:</strong> for AI visibility tracking — see &ldquo;AI Providers&rdquo; below</li>
          <li><strong>Other sites in the link network:</strong> only if you joined the network — see &ldquo;Link Network&rdquo; below</li>
          <li><strong>Meta (Facebook / Instagram):</strong> for targeted advertising — see the Meta Advertising section below.
          Data we receive from Google APIs is never shared with Meta or used for advertising</li>
          <li>When required by law</li>
        </ul>
      </section>

      <section>
        <h2>Data We Receive from Google</h2>
        <p>
          Go Top SEO can connect to your Google account in three optional ways. Each one asks for its own
          permission on Google&rsquo;s consent screen, and we request only the access described here.
        </p>

        <h3>Sign in with Google</h3>
        <p>
          If you choose &ldquo;Continue with Google&rdquo;, Google shares your name, email address and profile picture
          with us through Supabase Auth. We use them only to create your account and sign you in.
        </p>

        <h3>Google Search Console</h3>
        <p>
          Permission: read-only access to Search Console (<strong>webmasters.readonly</strong>). We never ask for
          permission to change anything in your Search Console account.
        </p>
        <ul>
          <li><strong>What we read:</strong> the list of Search Console properties your Google account can access, so
          you can choose one for each project; and, for the property you choose, its search performance data: search
          queries and pages with their clicks, impressions, click-through rate and average position, and the
          property&rsquo;s totals.</li>
          <li><strong>What we store:</strong> the property assigned to each project and your permission level on it,
          and the performance data of each sync (the last 28 and 90 days). Data is synced when you press sync and
          automatically about once a week.</li>
          <li><strong>How we use it:</strong> to show you your site&rsquo;s search performance, to find content
          opportunities, to include search figures in your reports, and to suggest article topics. For topic
          suggestions, search queries from this data may be sent to Google&rsquo;s Gemini model (see &ldquo;AI
          Providers&rdquo; below).</li>
        </ul>

        <h3>Google Business Profile (Posts on Google Maps)</h3>
        <p>
          Permission: <strong>business.manage</strong>, requested in a separate consent only when you connect this
          feature. Google offers no narrower permission that allows creating posts.
        </p>
        <ul>
          <li><strong>What we read:</strong> the Business Profile accounts you manage and their business locations:
          business name, address, website and Google Maps link.</li>
          <li><strong>What we store:</strong> the location you choose for a project (its Google identifiers, name,
          address, website and Maps link), and each post you create: its text, button, photo, scheduled time, and
          Google&rsquo;s post identifier, link and review status.</li>
          <li><strong>What we do with it:</strong> we create a post only when you press publish, or at the time you
          scheduled it, and then read that post back from Google to show you whether it is live. We do not change
          your business information and we do not read or reply to reviews.</li>
          <li><strong>AI drafts:</strong> if you ask for a draft, the business name and the article or topic you
          chose are sent to Google&rsquo;s Gemini model. A draft is never published until you review it and press
          publish.</li>
        </ul>

        <h3>Limited Use</h3>
        <p>
          Go Top SEO&rsquo;s use and transfer of information received from Google APIs to any other app will
          adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul>
          <li>We use Google user data only to provide the features described above, which you see and use in the app.</li>
          <li>We do not sell Google user data, and we do not use or transfer it for advertising, including
          retargeting and personalised or interest-based ads.</li>
          <li>We do not use Google user data to develop, improve or train generalised AI or machine-learning models.
          We send parts of it to an AI provider only to produce the result you asked for, as described in
          &ldquo;AI Providers&rdquo; below.</li>
          <li>We do not allow people to read this data, unless you give us permission (for example, when you ask
          for support), it is necessary for security purposes such as investigating abuse, it is required to comply
          with applicable law, or the data is aggregated and anonymised for internal operations.</li>
        </ul>

        <h3>How We Protect Google Data</h3>
        <ul>
          <li>The Google OAuth refresh tokens that let us access Search Console and Business Profile are encrypted
          with AES-256-GCM before we store them, and are decrypted only on our servers at the moment of use. We do
          not store access tokens.</li>
          <li>Google data is stored in our Supabase database, and the app shows it only to your own account.</li>
        </ul>

        <h3>Disconnecting, Retention and Deletion</h3>
        <ul>
          <li><strong>Search Console:</strong> &ldquo;Disconnect property from project&rdquo; removes the property
          from that project and stops syncing it. &ldquo;Revoke Google access for the whole account&rdquo; is
          available once no project uses the connection: it asks Google to revoke our access and deletes the stored
          token. In both cases, data already synced is kept.</li>
          <li><strong>Business Profile:</strong> &ldquo;Disconnect&rdquo; asks Google to revoke our access and
          deletes the stored token and the saved business location. Your post history stays in the app, and
          published posts stay on Google until you remove them there.</li>
          <li><strong>Retention:</strong> synced Search Console data and your post history are kept for as long as
          your account exists, unless you ask us to delete them.</li>
          <li><strong>Deletion:</strong> to delete your account or the Google data stored with it, email us at{' '}
          <a href="mailto:oren@gotop.co.il">oren@gotop.co.il</a>.</li>
          <li><strong>Revoking access at Google:</strong> you can also remove our access at any time at{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          . After that we can no longer read from or post to your Google account. Data we already stored stays
          until you disconnect in the app or ask us to delete it.</li>
        </ul>
      </section>

      <section>
        <h2>Site Scanning (Free Check and Onboarding Scan)</h2>
        <p>
          In the free site check, which you can run before signing up, and in the onboarding scan after a project
          is created, we access the site address you entered and read public pages on it, and its robots.txt,
          sitemap and llms.txt files. Reading is done without signing in, without cookies and without access to
          protected areas, and the onboarding scan reads a page only if robots.txt allows it.
        </p>
        <ul>
          <li><strong>What we store:</strong> the site address, the findings derived from the pages (such as
          titles, descriptions, site structure and SEO signals), and a business summary generated from them. The result of a free check is also
          stored so it can be shown again and to limit misuse of the check.</li>
          <li><strong>How we use it:</strong> to show you the findings, to tailor the Service to your site and to
          suggest topics and fixes. Some of the text may be sent to Google&rsquo;s Gemini model to produce the
          summary (see &ldquo;AI Providers&rdquo;).</li>
          <li><strong>Deletion:</strong> you can email us to ask for stored results to be deleted.</li>
        </ul>
      </section>

      <section>
        <h2>WordPress Connection and the GO TOP SEO Bridge Plugin</h2>
        <p>
          When you connect a WordPress site, we store the site address, the username and Application Password you
          created, and the signing key that authenticates requests between us and the plugin. Both are stored
          encrypted and decrypted only on our servers at the moment of use. With your consent, and your approval of
          each fix, the GO TOP SEO Bridge plugin applies to the site only fixes from a closed list (SEO title, meta
          description, canonical address, focus keyphrase, image alt text, an FAQ block, JSON-LD schema, internal
          links, repair of broken links, demotion of a duplicate H1 heading, and creating llms.txt).
        </p>
        <ul>
          <li><strong>Fix log:</strong> every fix is recorded in our log with who approved it, the time it was
          applied, the IP address the approval was given from, and the previous and the new value, so that it can
          be shown and undone and so that we have evidence that the write to the site was made with your
          approval. The log is kept as long as the project exists.</li>
          <li><strong>Disconnecting and removal:</strong> &ldquo;Disconnect&rdquo; deletes the stored connection
          details and the signing key, after which we can no longer reach the site. You can also remove the plugin
          from your WordPress admin at any time. Fixes already applied stay on the site unless you undid them.</li>
          <li><strong>What we do not do:</strong> we do not delete content, and we do not touch your site&rsquo;s
          prices, products, theme, other plugins, settings or users.</li>
        </ul>
      </section>

      <section>
        <h2>Connecting a Site on Another Platform</h2>
        <p>
          Besides WordPress, you can connect a Shopify store, a Wix site, or a site on any other platform
          through an endpoint you configure. Each connection is optional and is made by you.
        </p>
        <ul>
          <li><strong>Shopify:</strong> installing the app in your store lets us read the store&rsquo;s content,
          products and pages, and publish articles to the store blog, within the permissions you approved at
          installation. With your approval of each fix, we also write site fixes to the store&rsquo;s articles and
          pages. The approval itself is recorded in a log: who approved it, when, the IP address the approval was
          given from, and the previous and the new value — so that we can show you what was done, so that a fix
          can be undone, and so that we have evidence that the write to your store was made with your approval.
          The log is kept for as long as the project exists. The store&rsquo;s access token
          is stored encrypted. Removing the app from the store revokes the access.</li>
          <li><strong>Wix:</strong> the connection uses an API key you issue in your own account, and is used
          to read the site&rsquo;s content and publish articles to its blog. We send Wix the article&rsquo;s
          content and its publishing details, and no other account data. The key is stored encrypted, is never
          shown again after saving, and is deleted when you disconnect. You can revoke it on the Wix side at
          any time.</li>
          <li><strong>Webhook:</strong> the Service sends the article to the endpoint you configured, in a
          signed request. The endpoint is yours, so what happens to the article once it arrives is under your
          control. The signing secret is stored encrypted, is never shown again after saving, and is deleted
          when you disconnect.</li>
          <li><strong>Errors:</strong> if publishing fails we store an internal error code only. We do not
          store or display the provider&rsquo;s or your server&rsquo;s own error text.</li>
        </ul>
      </section>

      <section>
        <h2>Turning an Address into Coordinates</h2>
        <p>
          To track rankings from an exact point you can type an address instead of coordinates. When you do, we
          send the address you typed and the project&rsquo;s country name to OpenStreetMap&rsquo;s
          <strong> Nominatim</strong> service to get coordinates back. We do not send your name, your email
          address or any other account details. The address and the coordinates returned are stored with us as
          the tracking target&rsquo;s definition, and you can change or delete them in the target&rsquo;s
          settings. OpenStreetMap is operated by the OpenStreetMap Foundation, and the Nominatim service has
          its own usage and privacy policy.
        </p>
      </section>

      <section>
        <h2>Converting a Report to PDF</h2>
        <p>
          When you ask to download a report as a PDF, we send the report&rsquo;s content as displayed to the
          <strong> PDFShift</strong> service, which returns the file to us. This happens only when you pressed
          to download a report, never on a regular or scheduled basis, and the content is sent for the
          conversion alone. Retention at PDFShift is governed by their own privacy policy and terms.
        </p>
      </section>

      <section>
        <h2>Link Network</h2>
        <p>
          Joining the link network is optional, is done for each project separately, and is off by default.
          Whoever joins agrees to both directions: that a link from their articles may point to another network
          member&rsquo;s site, and that links to their site may be placed in other members&rsquo; articles. A
          connected Shopify store can join as well, and the links are placed only inside articles the Service
          writes and publishes to the store&rsquo;s blog. For such a store, ownership of the domain is taken from
          the connection itself: the store&rsquo;s myshopify address and its primary domain, as Shopify reported
          them at installation.
        </p>
        <ul>
          <li><strong>What we store:</strong> who accepted the joining, when, the wording of the terms accepted and
          the link type, and each placement made, on both sides.</li>
          <li><strong>What another member sees:</strong> the Company does not publish a member list. The receiving
          side sees the address of the site that links to it and, once published, the page where the link
          appeared. A published link is a public link on the site.</li>
          <li><strong>Leaving:</strong> you can leave the network at any time. Leaving stops new placements; links
          already published stay unless you remove them from your site, and placements stay in the log.</li>
        </ul>
      </section>

      <section>
        <h2>Partner Program</h2>
        <p>
          The partner program is for people who recommend the Service and receive a commission for customers who
          join through them. Taking part is voluntary, every application is reviewed by a person, and none of this
          applies to you unless you apply.
        </p>
        <ul>
          <li><strong>When you apply:</strong> we receive what you send us by email or WhatsApp &mdash; your name,
          your contact details, the site, channel or audience you intend to promote to and, after approval, the
          payout method you choose. We use them to decide on the application and to run the agreement with you.</li>
          <li><strong>While you are a partner:</strong> we store your contact details, your referral code, the
          accounts that opened through it, the qualifying payments and the commission calculated on them, the
          payouts made to you, and the invoices and tax certificates the law requires us to keep.</li>
          <li><strong>What a partner sees about the people they referred:</strong> nothing personal. A partner sees
          counts and amounts. A partner does not receive the email address, the website, the plan or the identity of
          any customer they referred.</li>
          <li><strong>Paying commission:</strong> the provider the partner chooses &mdash; PayPal, Wise or a bank
          transfer &mdash; receives the details it needs in order to pay. Invoices and withholding certificates are
          kept for seven years, as Israeli bookkeeping rules require.</li>
          <li><strong>Crediting a referral:</strong> the partner&rsquo;s code travels in the link itself. We
          set no cookie for the program and store nothing on your device, so what you choose about cookies does
          not affect it in either direction. If we ever credit a visit that comes back later, which would mean
          storing something, this policy will say so and your consent will be asked first.</li>
        </ul>
        <p className="mt-4">
          As of the date of this policy the program runs by application only: we receive applications and approve
          partners by hand, and no referral tracking, commission record or payout has been built yet. Each of them
          will be described here before it starts running. The terms themselves are in the{' '}
          <a href="/en/affiliate-terms">Partner Program Agreement</a>, which also requires a partner to say openly
          that they are paid.
        </p>
      </section>

      <section>
        <h2>AI Providers</h2>
        <p>Some features send data to the following AI services to produce the result you asked for:</p>
        <ul>
          <li><strong>Google Gemini (Gemini API):</strong> generates article topic ideas, questions, articles, images, and
          Google Business Profile post drafts. We send the details a request needs, such as your business name,
          website, keywords and topics and, as described above, Search Console search queries and your Business
          Profile name.</li>
          <li><strong>ScrapeLLM:</strong> for AI visibility tracking, sends questions built from your business name,
          location and tracked keywords to AI assistants (ChatGPT, Perplexity, Gemini, Microsoft Copilot, Grok and
          Google AI Mode) and returns their answers to us. It does not receive data from your Google account. In addition to checks you start
          yourself, an automatic monthly check runs for the project; it counts toward your plan&rsquo;s allowance of checks
          and can be turned off on the &ldquo;AI Visibility&rdquo; screen, in the &ldquo;Automatic monthly check&rdquo; card.</li>
        </ul>
      </section>

      <section>
        <h2>Email Messages</h2>
        <p>
          We send email through the sending provider Resend, which receives your email address and the content of the
          message in order to deliver it.
        </p>
        <ul>
          <li><strong>Account and service messages:</strong> sign-up, verification, billing and updates about using the
          Service.</li>
          <li><strong>Reminders:</strong> when content is waiting for your approval, a reminder may be sent. Every
          reminder has a one-click unsubscribe link, with no sign-in needed, and unsubscribing stops these reminders.
          Your preference is stored with us.</li>
          <li><strong>Monthly progress report:</strong> a monthly summary of the project, for projects where you turned it
          on in the settings.</li>
        </ul>
      </section>

      <section>
        <h2>How We May Contact You About a Free Check</h2>
        <p>
          If you ran a free check on a website, we may get in touch about it. By email, only to the address
          you gave us and only as far as the boxes you ticked allow: the report you asked for, and updates or
          marketing content only if you agreed to those on their own separate box.
        </p>
        <p>
          We may also contact the business whose website was checked, using contact details that business
          publishes on its own site &mdash; a phone number or a general address. We do that on our legitimate
          interest in offering a service to a business that looks like a fit (GDPR Art. 6(1)(f)), not on your
          consent, and those details come from the site itself rather than from anything you gave us. When we
          call, we say who we are and where we got the number.
        </p>
        <p>
          You can tell us to stop at any time and by any channel, and we stop &mdash; by email, by phone, in
          every language. For direct marketing that is an absolute right (GDPR Art. 21(2)), it costs you
          nothing, and we record it so a later list cannot undo it.
        </p>
      </section>

      <section>
        <h2>Data Security</h2>
        <p>
          We use SSL/TLS encryption for all communication. Your passwords are stored encrypted via Supabase Auth.
          We maintain high data security standards, but we cannot guarantee 100% security.
        </p>
      </section>

      <section>
        <h2>Your Rights</h2>
        <p>Under applicable privacy law, you have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your account</li>
          <li>Object to certain processing</li>
          <li>Request data portability</li>
        </ul>
        <p className="mt-4">To exercise these rights, contact us at:</p>
        <p className="mt-2">
          <strong>Email:</strong>{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
        <p>
          <strong>Phone:</strong>{' '}
          <a href="tel:0549489377">
            054-9489377
          </a>
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>We sort cookies into three categories, and we ask you about two of them before they load:</p>
        <ul>
          <li><strong>Strictly necessary:</strong> signing in, remembering your interface language,
          security and abuse prevention. The service cannot run without them, so they need no consent.</li>
          <li><strong>Measurement:</strong> how many people visited, which pages they read and what
          did not work. Loaded only if you allow it.</li>
          <li><strong>Marketing:</strong> measuring how our ads perform and showing relevant ads on
          the Google and Meta networks. Loaded only if you allow it.</li>
        </ul>
        <p className="mt-4">
          <strong>Before you choose, no measurement or marketing cookie is set and no request is
          made to Google&rsquo;s servers.</strong>{' '}
          Accepting and refusing are two equal buttons on the notice, and each category can be
          allowed on its own.
        </p>
        <p className="mt-4">
          <strong>Changing or withdrawing your consent:</strong> at any time, through the
          &ldquo;Cookie settings&rdquo; link at the bottom of every page. Withdrawing is exactly as
          easy as giving consent, and costs you nothing in the service.
        </p>
        <p className="mt-3">
            <strong>The partner program:</strong> it sets no cookie at all. If you reach the site through a
          partner link, that partner&rsquo;s code is carried in the link itself and nothing is written to your
          device, which is why the program does not appear among the categories above and why your choice on
          this notice neither helps nor hinders it. A cookie that keeps a partner&rsquo;s code is not strictly
          necessary for the site to work, so we would have needed your consent for one; we chose not to need it.
        </p>
        <p className="mt-4">
          If your browser sends a Global Privacy Control signal, we treat it as a refusal: no
          measurement or marketing cookies are loaded, and we do not show you the notice.
        </p>
        <p className="mt-4">
          So that we can demonstrate what you chose, we record every decision: what you were shown,
          what you chose, when, in which language, on which page, and a one-way hash of your IP
          address. <strong>The IP address itself is not stored in that log.</strong> The log is
          append-only and cannot be edited or deleted from within the system.
        </p>
      </section>

      <section>
        <h2>Analytics &amp; Marketing Services</h2>
        <p>
          Our measurement and marketing tools are managed through Google Tag Manager, which loads
          only after you have allowed measurement or marketing. The tools that may run through it:
        </p>
        <ul>
          <li><strong>Google Analytics:</strong> traffic and acquisition analysis (subject to measurement consent)</li>
          <li><strong>Google Ads:</strong> conversion measurement and personalised advertising (subject to marketing consent)</li>
          <li><strong>Meta Pixel:</strong> conversion measurement and advertising on Facebook and Instagram (subject to marketing consent)</li>
        </ul>
        <p className="mt-4">
          Which tools are active changes from time to time. What does not change: none of them loads
          before you have allowed its category, and withdrawing your consent stops the collection.
        </p>
        <p className="mt-4">
          We declare your consent state to Google through the Consent Mode v2 protocol, so the tools
          are bound by your choice even if we add a new tag in the future.
        </p>
      </section>

      <section>
        <h2>Meta Advertising (Facebook / Instagram)</h2>
        <p>
          We use the Meta Pixel (Facebook Pixel) to run advertising campaigns on Facebook and Instagram. The Pixel
          allows us to measure conversion events (such as completing a signup), build custom audiences, and show
          relevant ads to people who have visited our site.
        </p>
        <p className="mt-4">Information that may be collected and sent to Meta includes:</p>
        <ul>
          <li>Browsing data and pages visited on our site</li>
          <li>Conversion events (such as registering for the service)</li>
          <li>IP address and browser technical information</li>
          <li>Information collected via Meta cookies</li>
        </ul>
        <p className="mt-4">
          This use is subject to the privacy policy of Meta Platforms, Inc., available at{' '}
          <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">
            facebook.com/privacy/policy
          </a>
          {'. '}
          You can opt out of personalised advertising through your Facebook account&rsquo;s privacy settings.
        </p>
      </section>

      <section>
        <h2>Contacting Us via WhatsApp</h2>
        <p>
          Our site and services may offer an option to contact us via WhatsApp. When a user chooses to contact us
          through WhatsApp, we may receive and process the information provided as part of that contact, including
          name, phone number, the content of the messages, files or images sent to us at the user&rsquo;s initiative,
          and any additional contact details shared during the conversation.
        </p>
        <p className="mt-4">
          The information provided to us via WhatsApp will be used to respond to the inquiry, provide service and
          support, handle requests, document inquiries, improve the service, maintain information security and
          protect our rights, as well as to comply with legal requirements where necessary.
        </p>
        <p className="mt-4">
          Use of WhatsApp is also subject to the terms of use and privacy policy of WhatsApp and/or Meta, and we
          recommend reviewing them before using this channel. Please do not send us, via WhatsApp, sensitive
          information that is not required to handle your inquiry, including passwords, full payment details, medical
          information, identification documents or other sensitive personal information, unless you have been
          expressly asked to do so for a defined purpose.
        </p>
        <p className="mt-4">
          We may retain the correspondence records for as long as necessary for the purposes of providing the
          service, handling inquiries, documentation, monitoring, legal defense and compliance with the law. Users
          may contact us to request access to, correction of, or deletion of the personal information they provided,
          subject to applicable law and this privacy policy.
        </p>
      </section>

      <section>
        <h2>Legal Basis for Processing</h2>
        <p>
          We process personal data only where we have a legal basis for it. Each purpose has its own
          basis, which is why your options differ from one purpose to the next:
        </p>
        <ul>
          <li><strong>Performance of a contract</strong> (GDPR Art. 6(1)(b)): opening an account,
          running the subscription, performing scans and checks, generating content and publishing it
          to the site you connected. Without this there is no service.</li>
          <li><strong>Consent</strong> (Art. 6(1)(a) and the ePrivacy rules): measurement and
          marketing cookies, marketing email, and joining the link network. Each is separate, and
          each can be withdrawn at any time.</li>
          <li><strong>Legitimate interests</strong> (Art. 6(1)(f)): securing the system, preventing
          abuse, operational reminders about your own account, and improving the service from
          aggregate data. You may object to processing on this basis.</li>
          <li><strong>Legal obligation</strong> (Art. 6(1)(c)): keeping billing records and
          reporting to the tax authorities.</li>
        </ul>
        <p className="mt-4">
          In Israel we are subject to the Protection of Privacy Law, 5741-1981, including Amendment
          13, which took effect on 14 August 2025. We are not required to appoint a data protection
          officer under that amendment, and we are not a data broker: we do not sell personal data to
          anyone, for any consideration.
        </p>
      </section>

      <section>
        <h2>How Long We Keep Data</h2>
        <p>We keep data only as long as it is needed for the purpose it was collected for:</p>
        <ul>
          <li><strong>Account and the content generated for you:</strong> for the life of the
          account, and up to 90 days after it is deleted so an accidental deletion can be undone.
          Then erased.</li>
          <li><strong>Billing records and invoices:</strong> seven years, as Israeli tax law
          requires. We have no discretion here, even if you ask for erasure.</li>
          <li><strong>Connection credentials</strong> (WordPress, Shopify, Search Console): until you
          disconnect or delete the account, and then erased immediately.</li>
          <li><strong>Free site check:</strong> cached for up to 24 hours, then erased if no account
          was opened from it.</li>
          <li><strong>Cookie decision log:</strong> up to three years from the decision, so that we
          can demonstrate what you chose. That is the legal basis for keeping it, which is why it is
          not erased together with the account.</li>
          <li><strong>Security and server logs:</strong> up to 90 days.</li>
        </ul>
      </section>

      <section>
        <h2>International Transfers</h2>
        <p>
          The service runs on international cloud and infrastructure providers, so data may be stored
          or processed outside your country of residence. The main providers: Vercel (application
          hosting), Supabase (the database, in the Mumbai region in India), and every other provider listed
          under &ldquo;Information Sharing&rdquo; above, among them the AI and search providers, the PDF
          conversion provider and the address lookup service.
        </p>
        <p className="mt-4">
          For data about residents of the European Economic Area, Switzerland or the United Kingdom:
          Israel has been recognised by the European Commission as providing an adequate level of
          protection, so a transfer to us requires no further instrument. For transfers to providers
          outside the EU in countries without an adequacy decision we rely on the European
          Commission&rsquo;s Standard Contractual Clauses, within those providers&rsquo; own terms.
        </p>
        <p className="mt-4">
          You may ask us which instrument we rely on for a particular transfer, and we will answer in
          writing.
        </p>
      </section>

      <section>
        <h2>Rights of Residents of the EEA, Switzerland and the UK</h2>
        <p>
          If you are in the European Economic Area, Switzerland or the United Kingdom, you also have
          the following rights under the GDPR and the UK GDPR:
        </p>
        <ul>
          <li><strong>Access</strong> (Art. 15): a copy of the data we hold about you.</li>
          <li><strong>Rectification</strong> (Art. 16) and <strong>erasure</strong> (Art. 17).</li>
          <li><strong>Restriction of processing</strong> (Art. 18).</li>
          <li><strong>Portability</strong> (Art. 20): your data in a structured, machine-readable format.</li>
          <li><strong>Objection</strong> (Art. 21), including an absolute right to object to marketing.</li>
          <li><strong>Withdrawal of consent</strong> (Art. 7(3)) at any time, without affecting the
          lawfulness of processing carried out before it.</li>
        </ul>
        <p className="mt-4">
          We answer within 30 days. We will not charge you and will not degrade your service because
          you exercised a right.
        </p>
        <p className="mt-4">
          <strong>Right to complain:</strong> if you are not satisfied with our answer, you may
          complain to the supervisory authority in your country of residence, or to the Israeli
          Privacy Protection Authority
          (<a href="https://www.gov.il/en/departments/the_privacy_protection_authority" target="_blank" rel="noopener noreferrer">
            Privacy Protection Authority
          </a>). Contacting us first is not a condition of complaining, though we would welcome the
          chance to put it right.
        </p>
      </section>

      <section>
        <h2>Rights of United States Residents</h2>
        <p>
          If you are a resident of California, or of another state that has enacted a state privacy
          law, you have the right to know which categories of data were collected about you, to
          obtain a copy, to request deletion, to correct inaccurate data, and not to be discriminated
          against for exercising a right.
        </p>
        <p className="mt-4">
          <strong>We do not sell personal information and we do not transfer it for
          consideration.</strong> We do share identifiers and usage events with the Google and Meta
          advertising networks for targeted advertising, which may count as &ldquo;sharing&rdquo;
          under California law. That sharing happens <strong>only</strong> if you allowed the
          marketing category, and it stops the moment you withdraw.
        </p>
        <p className="mt-4">
          We honour the browser&rsquo;s Global Privacy Control signal as a &ldquo;do not sell or
          share my personal information&rdquo; request, and we record it. No form is needed: the
          signal itself is enough.
        </p>
      </section>

      <section>
        <h2>Automated Decisions</h2>
        <p>
          The service produces recommendations and content with AI models, but it makes no automated
          decision with a legal or similarly significant effect on you: no credit scoring, no
          candidate screening, and no eligibility decision made without a person. Content is
          published to the site you connected according to the schedule and the approvals you set.
        </p>
      </section>

      <section>
        <h2>Minimum Age</h2>
        <p>
          The service is intended for businesses and site owners, not for children. We do not
          knowingly collect data from anyone under 18, and the service may not be used below that
          age. If such data has reached us, write to us and we will erase it.
        </p>
      </section>

      <section>
        <h2>Privacy Contact and Representatives</h2>
        <p>For any privacy matter, including exercising the rights above:</p>
        <p className="mt-2">
          <strong>Email:</strong>{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
        <p>
          <strong>Phone:</strong>{' '}
          <a href="tel:0549489377" dir="ltr">
            +972-54-948-9377
          </a>
        </p>
        <p className="mt-4">
          We are not required to appoint a data protection officer under Amendment 13 to the Israeli
          Protection of Privacy Law, and we have not appointed one. Requests are handled by the
          contact above.
        </p>
      </section>

      <section>
        <h2>Updates to This Policy</h2>
        <p>
          We may update this policy from time to time. Changes take effect immediately upon publication. We encourage you
          to review this policy regularly.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>If you have questions about this privacy policy, please contact:</p>
        <p className="mt-2">
          <strong>Email:</strong>{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
        <p>
          <strong>Phone:</strong>{' '}
          <a href="tel:0549489377">
            054-9489377
          </a>
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>
          This policy was last updated on October 6, 2026
        </p>
      </section>
    </LegalDoc>
  )
}
