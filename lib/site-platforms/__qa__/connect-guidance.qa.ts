/**
 * The settings screen's connections, for a merchant who is not a developer.
 *
 *   A. Choosing WordPress and confirming shows the WordPress form. The section
 *      used to reset its choice on the re-read that follows a confirmed choice
 *      (nothing is connected yet, which is exactly that moment), so the form the
 *      modal promised never appeared (components/content/ContentSection.tsx).
 *   B. The WordPress form says where in wp-admin the application password is
 *      made, and a link to that page on the merchant's own site is offered only
 *      for a plain http(s) site address.
 *   C. The WordPress routes' English sentences reach the merchant as ours, in
 *      their language; anything unknown is the generic sentence, never as it came.
 *   D. The modal: the detected platform is preselected (only while nothing is
 *      connected) and says so; Wix explains its two details in steps; the
 *      custom-built site has a way out (the developer, or our WhatsApp).
 *
 * Every source guard has a mutation control. Browser proof:
 * lib/__qa__/reviewer-journey/wordpress-connect-settings.js.
 *
 * Run: npx tsx lib/site-platforms/__qa__/connect-guidance.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { makeChecker } from '../../seed-scan/__qa__/_fixtures'
import { PlatformSwitchBody } from '../../../components/content/site-platforms/PlatformSwitchModal'
import { wpProfileHref } from '../../../components/content/WordPressConnectionPanel'
import { SUPPORT_WHATSAPP_HREF } from '../../onboarding/links'
import { wpErrorKey } from '../../wordpress/error-copy'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const HEBREW = /[֐-׿]/
const DICTS = { he: dashboardHe, en: dashboardEn } as const

function main() {
  console.log('A) a confirmed WordPress choice survives the re-read and opens the form')
  {
    const src = strip(read('components/content/ContentSection.tsx'))
    // w7-flash: the re-read goes through apply(known, keepChoice); refresh forwards opts?.keepChoice.
    const resetOnlyOnDisconnect = (x: string) => /if \(!wpc && !shc && !known\.value\.wordpressPlugin && !keepChoice\) setChoice\(null\)/.test(x)
      && /apply\(await readConnections\(true\), opts\?\.keepChoice\)/.test(x)
    const confirmKeeps = (x: string) => /const onSwitched = [\s\S]*?void refresh\(\{ keepChoice: true \}\)/.test(x)
    const opensForm = (x: string) => /<WordPressConnectionPanel[\s\S]*?startWithForm=\{current !== 'wordpress'( \|\| wpViaPlugin)?\}/.test(x)
    check('the re-read resets the choice only when it did not follow a confirmed choice', resetOnlyOnDisconnect(src))
    check('MUT: the old unconditional reset is caught', !resetOnlyOnDisconnect(src.replace('if (!wpc && !shc && !known.value.wordpressPlugin && !keepChoice) setChoice(null)', 'if (!wpc && !shc) setChoice(null)')))
    check('MUT: a refresh that drops keepChoice is caught', !resetOnlyOnDisconnect(src.replace('apply(await readConnections(true), opts?.keepChoice)', 'apply(await readConnections(true))')))
    check('a confirmed switch re-reads with keepChoice', confirmKeeps(src))
    check('MUT: a confirmed switch that re-reads plainly is caught', !confirmKeeps(src.replace('void refresh({ keepChoice: true })', 'void refresh()')))
    check('the chosen WordPress panel opens with its form out; a connected one does not', opensForm(src))
    check('MUT: a panel that waits for a second click is caught', !opensForm(src.replace("startWithForm={current !== 'wordpress'}", '')))
    check('a disconnect from a panel still returns to the platform choice (a plain re-read)', /const onPanelChanged = useCallback\(\(\) => \{ void refresh\(\) \}, \[refresh\]\)/.test(src)
      && !/onChanged=\{refresh\}/.test(src))
    const panel = strip(read('components/content/WordPressConnectionPanel.tsx'))
    // 3.1.0: the connection steps that open are the plugin's (components/content/WordPressPluginConnect.tsx);
    // the application-password form is the advanced way, one link away (components/content/__qa__/wordpress-plugin-first.qa.ts).
    const formFirst = (x: string) => /const \[stepsOpen, setStepsOpen\] = useState\(startWithForm\)/.test(x)
    check('the WordPress panel starts with its connection steps out when asked', formFirst(panel))
    check('MUT: a panel that ignores startWithForm is caught', !formFirst(panel.replace('useState(startWithForm)', 'useState(false)')))
    check('the Shopify App Store merchant keeps the section as it was (the legacy branch is returned first)', /if \(loading \|\| switchLocked\) return legacy/.test(src))
  }

  console.log('\nB) where the application password is made')
  for (const locale of ['he', 'en'] as const) {
    const t = DICTS[locale].projectDetail.contentSection
    check(`${locale}: three short steps and a title`, t.wpSteps.length === 3 && t.wpSteps.every((s) => s.length > 10 && s.length < 140) && t.wpStepsTitle.length > 0)
    check(`${locale}: …naming the wp-admin path (Users › Profile) and Application Passwords`,
      locale === 'he' ? t.wpSteps[0].includes('משתמשים › פרופיל') && t.wpSteps[1].includes('סיסמאות אפליקציה') : t.wpSteps[0].includes('Users › Profile') && t.wpSteps[1].includes('Application Passwords'))
    check(`${locale}: in the right language`, locale === 'he' ? [t.wpStepsTitle, ...t.wpSteps, t.wpOpenProfile].every((s) => HEBREW.test(s)) : ![t.wpStepsTitle, ...t.wpSteps, t.wpOpenProfile].some((s) => HEBREW.test(s)))
  }
  check('a site address → its own profile page, at the Application Passwords section',
    wpProfileHref('https://blog.example.com') === 'https://blog.example.com/wp-admin/profile.php#application-passwords-section'
    && wpProfileHref('blog.example.com/') === 'https://blog.example.com/wp-admin/profile.php#application-passwords-section'
    && wpProfileHref('https://example.com/site') === 'https://example.com/site/wp-admin/profile.php#application-passwords-section')
  check('…and nothing for anything that is not a plain http(s) site address',
    [ '', '   ', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pw@example.com', 'localhost', 'ftp://example.com', 'https://'].every((v) => wpProfileHref(v) === null),
    JSON.stringify(['javascript:alert(1)', 'https://user:pw@example.com', 'localhost', 'ftp://example.com'].map(wpProfileHref)))

  console.log('\nC) the WordPress routes\' answers, as our sentences')
  {
    const sentences: [string, string][] = [
      ['Authentication failed. Check the username and Application Password.', 'authFailed'],
      ['WordPress REST API not found at this URL. Is this a WordPress site?', 'notWordPress'],
      ['WordPress returned an error (HTTP 500).', 'siteError'],
      ['Site URL must use https://', 'notHttps'],
      ['Site hostname could not be resolved.', 'unreachable'],
      ['Could not reach the WordPress site. Check the URL.', 'unreachable'],
      ['Local or internal hostnames are not allowed.', 'notPublic'],
      ['Site hostname resolves to a private network address.', 'notPublic'],
      ['WordPress site did not respond in time.', 'timeout'],
      ['Unexpected redirect from the site.', 'redirect'],
      ['WordPress returned an invalid response.', 'badResponse'],
      ['Enter the application password to test a different site address.', 'otherSite'],
    ]
    const wrong = sentences.filter(([m, k]) => wpErrorKey(m) !== k)
    check('each sentence the connect and test routes send maps to its own key', wrong.length === 0, JSON.stringify(wrong))
    const client = strip(read('lib/wordpress/client.ts'))
    const thrown = [...client.matchAll(/new WordPressClientError\('([^']+)'/g)].map((m) => m[1])
    const connectPath = thrown.filter((m) => !/media|post id|image uploads/i.test(m))
    const unmapped = connectPath.filter((m) => wpErrorKey(m) === 'generic')
    check('every sentence the WordPress client can throw on the connect path is mapped', connectPath.length >= 10 && unmapped.length === 0, JSON.stringify(unmapped))
    check('anything else is the generic sentence: a raw network error, an unknown text, not a string',
      ['fetch failed', 'getaddrinfo ENOTFOUND blog.example.com', 'WordPress returned an error (HTTP 5000).', 'Something new', ''].every((m) => wpErrorKey(m) === 'generic') && wpErrorKey(null) === 'generic' && wpErrorKey({}) === 'generic')
    for (const locale of ['he', 'en'] as const) {
      const e = DICTS[locale].projectDetail.contentSection.wpErrors as Record<string, string>
      const keys = new Set(sentences.map(([, k]) => k).concat(['invalidUrl', 'missingFields', 'missingPassword', 'reenterPassword']))
      check(`${locale}: every key has a sentence, in the right language`,
        [...keys].every((k) => typeof e[k] === 'string' && e[k].length > 0 && (locale === 'he' ? HEBREW.test(e[k]) : !HEBREW.test(e[k]))))
    }
    const panel = strip(read('components/content/WordPressConnectionPanel.tsx'))
    const noRaw = (x: string) => !/text: data\.error\b|data\.error \|\||data\.test\?\.error \|\|/.test(x) && /wpError\(data\.error\)/.test(x)
    check('the panel never prints a route\'s text as it came', noRaw(panel))
    check('MUT: the old `data.error || t.genericError` is caught', !noRaw(panel.replace('wpError(data.error), ok: false', 'data.error || t.genericError, ok: false')))
  }

  console.log('\nD) the modal')
  for (const locale of ['he', 'en'] as const) {
    // The component takes the Hebrew dictionary's type; both languages share its shape.
    const t = DICTS[locale].sitePlatforms as unknown as Parameters<typeof PlatformSwitchBody>[0]['t']
    const body = (over: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(PlatformSwitchBody, { t, current: null, choice: null, values: {}, onChoose: () => {}, onChange: () => {}, test: { state: 'idle', onRun: () => {} }, ...over }))
    const detected = body({ choice: 'wordpress', detected: 'wordpress' })
    check(`${locale}: the detected platform, chosen for the merchant, says why`, /data-switch-detected="wordpress"/.test(detected) && detected.includes(t.modal.detectedNote))
    check(`${locale}: …and a platform the merchant picked themselves says nothing of the kind`, !/data-switch-detected/.test(body({ choice: 'shopify', detected: 'wordpress' })) && !/data-switch-detected/.test(body({ choice: 'wordpress' })))
    const wix = body({ choice: 'wix' })
    check(`${locale}: Wix: three steps saying where the Site ID and the API key are`, /data-switch-steps/.test(wix) && (wix.match(/<li>/g) ?? []).length === 3 && t.wix.steps.every((s) => wix.includes(s.replace(/"/g, '&quot;').replace(/'/g, '&#x27;'))))
    check(`${locale}: …and a way to ask us instead`, /data-switch-help="wix"/.test(wix) && wix.includes(`href="${SUPPORT_WHATSAPP_HREF}"`))
    const hook = body({ choice: 'webhook' })
    const mail = /href="(mailto:[^"]+)"/.exec(hook)?.[1] ?? ''
    check(`${locale}: custom-built site: "not sure?" with the developer and WhatsApp ways out`, /data-switch-help="webhook"/.test(hook) && hook.includes(t.help.webhookBody.replace(/'/g, '&#x27;')) && hook.includes(`href="${SUPPORT_WHATSAPP_HREF}"`))
    check(`${locale}: …the developer's email carries only our own instructions, no address, nothing typed`,
      mail.startsWith('mailto:?subject=') && decodeURIComponent(mail.replace(/&amp;/g, '&').split('&body=')[1] ?? '') === t.help.developerBody
      && !body({ choice: 'webhook', values: { endpointUrl: 'https://secret.example/hook' } }).match(/mailto:[^"]*secret\.example/))
    check(`${locale}: nothing of the guidance for WordPress or Shopify (their panels have their own)`, !/data-switch-help|data-switch-steps/.test(body({ choice: 'wordpress' }) + body({ choice: 'shopify' })))
    check(`${locale}: in the right language`, locale === 'he' ? HEBREW.test(t.help.title + t.wix.steps.join('')) : !HEBREW.test(JSON.stringify([t.help, t.wix.steps, t.wix.stepsTitle, t.modal.detectedNote])))
  }
  {
    const modal = strip(read('components/content/site-platforms/PlatformSwitchModal.tsx'))
    const onlyWhenNone = (x: string) => /const detectedChoice = !current && preferred && CHOOSABLE_PLATFORMS\.includes\(preferred\) \? preferred : null/.test(x)
    check('the modal preselects the detected platform only while nothing is connected', onlyWhenNone(modal))
    check('MUT: preselecting over a connected platform is caught', !onlyWhenNone(modal.replace('!current && preferred &&', 'preferred &&')))
    const section = strip(read('components/content/ContentSection.tsx'))
    check('…and the section hands it the scan\'s platform only while nothing is connected', /preferred=\{current \? null : platformHint\?\.preferred \?\? null\}/.test(section))
  }

  finish()
}

main()

export {}
