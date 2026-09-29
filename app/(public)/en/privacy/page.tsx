import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Privacy Policy | Rankings by Go Top',
  description: 'Privacy policy for Rankings by Go Top — how we collect, use and protect your data.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Privacy Policy | Rankings by Go Top',
    description: 'Privacy policy for Rankings by Go Top',
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
      subtitle="Privacy policy for Rankings by Go Top"
    >
      <section>
        <h2>Introduction</h2>
        <p>
          Go Top Digital Marketing &amp; Advertising Ltd. (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the company&rdquo;) operates the Rankings by Go Top service
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
          <li><strong>Serper:</strong> for Google search queries</li>
          <li><strong>Vercel:</strong> for site hosting</li>
          <li><strong>Google (Gemini API):</strong> our AI provider for generating text and images — see &ldquo;AI Providers&rdquo; below</li>
          <li><strong>ScrapeLLM:</strong> for AI visibility tracking — see &ldquo;AI Providers&rdquo; below</li>
          <li><strong>Meta (Facebook / Instagram):</strong> for targeted advertising — see the Meta Advertising section below.
          Data we receive from Google APIs is never shared with Meta or used for advertising</li>
          <li>When required by law</li>
        </ul>
      </section>

      <section>
        <h2>Data We Receive from Google</h2>
        <p>
          Rankings by Go Top can connect to your Google account in three optional ways. Each one asks for its own
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
          Rankings by Go Top&rsquo;s use and transfer of information received from Google APIs to any other app will
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
        <h2>AI Providers</h2>
        <p>Some features send data to the following AI services to produce the result you asked for:</p>
        <ul>
          <li><strong>Google Gemini (Gemini API):</strong> generates article topic ideas, articles, images, and
          Google Business Profile post drafts. We send the details a request needs, such as your business name,
          website, keywords and topics and, as described above, Search Console search queries and your Business
          Profile name.</li>
          <li><strong>ScrapeLLM:</strong> for AI visibility tracking, sends questions built from your business name,
          location and tracked keywords to AI assistants (ChatGPT, Perplexity, Gemini, Microsoft Copilot, Grok and
          Google AI Mode) and returns their answers to us. It does not receive data from your Google account.</li>
        </ul>
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
        <p>We use cookies for essential purposes:</p>
        <ul>
          <li><strong>Session cookies:</strong> for secure server communication and session management</li>
          <li><strong>Analytics cookies:</strong> for site usage analysis via Google Analytics and Google Tag Manager</li>
        </ul>
        <p className="mt-4">By continuing to use the site, you agree to the use of cookies as described above.</p>
      </section>

      <section>
        <h2>Analytics &amp; Marketing Services</h2>
        <p>We use the following services for user behavior analysis and marketing channel management:</p>
        <ul>
          <li><strong>Google Analytics:</strong> to analyze traffic and acquisition channels</li>
          <li><strong>Google Tag Manager:</strong> to manage tags and analyze user composition</li>
        </ul>
        <p className="mt-4">
          These cookies do not personally identify you and are used to improve user experience and the service.
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
          This policy was last updated in September 2026
        </p>
      </section>
    </LegalDoc>
  )
}
