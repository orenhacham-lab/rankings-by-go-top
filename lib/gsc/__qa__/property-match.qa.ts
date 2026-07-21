/**
 * Stage E1 — property ↔ project-URL matching. Domain properties cover subdomains but not
 * lookalike domains; URL-prefix matching normalizes protocol/host/port/path/trailing-slash
 * and treats HTTP≠HTTPS; unverified properties are excluded from assignment; the selection
 * view sorts covering-first.
 */
import { propertyKind, propertyCoversProjectUrl, isUnverifiedPermission, buildPropertyViews } from '../property-match'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function main() {
  console.log('GSC property-match')

  check('sc-domain: is a Domain property', propertyKind('sc-domain:example.com') === 'domain')
  check('https:// is a URL-prefix property', propertyKind('https://www.example.com/') === 'url_prefix')

  // Domain covers the apex + any subdomain, any protocol/path.
  check('Domain covers apex', propertyCoversProjectUrl('sc-domain:example.com', 'https://example.com/'))
  check('Domain covers www subdomain', propertyCoversProjectUrl('sc-domain:example.com', 'https://www.example.com/blog'))
  check('Domain covers deep subdomain', propertyCoversProjectUrl('sc-domain:example.com', 'http://a.b.example.com'))
  check('Domain covers bare-host project url', propertyCoversProjectUrl('sc-domain:example.com', 'example.com'))
  // Critical: lookalike domain is NOT covered.
  check('Domain does NOT cover notexample.com', !propertyCoversProjectUrl('sc-domain:example.com', 'https://notexample.com'))
  check('Domain does NOT cover example.com.evil.com', !propertyCoversProjectUrl('sc-domain:example.com', 'https://example.com.evil.com'))

  // URL-prefix: exact protocol + host, project path inside the prefix path.
  check('URL-prefix covers same host root', propertyCoversProjectUrl('https://www.example.com/', 'https://www.example.com/page'))
  check('URL-prefix path is a boundary (/blog/ covers /blog/x)', propertyCoversProjectUrl('https://www.example.com/blog/', 'https://www.example.com/blog/x'))
  check('URL-prefix /blog covers /blog (trailing-slash normalized)', propertyCoversProjectUrl('https://www.example.com/blog', 'https://www.example.com/blog'))
  check('URL-prefix /blog does NOT cover /blogging', !propertyCoversProjectUrl('https://www.example.com/blog', 'https://www.example.com/blogging'))
  // HTTP ≠ HTTPS.
  check('URL-prefix HTTP does NOT cover HTTPS', !propertyCoversProjectUrl('http://www.example.com/', 'https://www.example.com/'))
  // Different host / subdomain not equivalent under URL-prefix.
  check('URL-prefix www does NOT cover apex', !propertyCoversProjectUrl('https://www.example.com/', 'https://example.com/'))
  check('URL-prefix apex does NOT cover www', !propertyCoversProjectUrl('https://example.com/', 'https://www.example.com/'))
  // Port sensitivity.
  check('URL-prefix default vs explicit :8080 differ', !propertyCoversProjectUrl('https://www.example.com/', 'https://www.example.com:8080/'))

  // Null/empty project URL → never covers.
  check('null project url → not covered', !propertyCoversProjectUrl('sc-domain:example.com', null))

  // Unverified detection.
  check('siteUnverifiedUser is unverified', isUnverifiedPermission('siteUnverifiedUser'))
  check('siteOwner is verified', !isUnverifiedPermission('siteOwner'))

  // buildPropertyViews: covering first, unverified last, assignable = covers && verified.
  const views = buildPropertyViews([
    { siteUrl: 'https://other.com/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteUnverifiedUser' },
    { siteUrl: 'https://www.example.com/', permissionLevel: 'siteOwner' },
  ], 'https://www.example.com/blog')
  check('covering property sorts first', views[0].siteUrl === 'https://www.example.com/' && views[0].covers)
  check('covering + verified is assignable', views[0].assignable === true)
  const unv = views.find((v) => v.siteUrl === 'sc-domain:example.com')!
  check('covering but unverified is NOT assignable', unv.covers === true && unv.assignable === false)
  const other = views.find((v) => v.siteUrl === 'https://other.com/')!
  check('non-covering property is not assignable', other.covers === false && other.assignable === false)

  // ── Scheme-less project target_domain vs URL-prefix property (live defect fix) ──
  // A stored target_domain without a scheme is assumed https:// for URL-prefix matching.
  check('scheme-less root domain matches https URL-prefix property', propertyCoversProjectUrl('https://www.gotop.co.il/', 'www.gotop.co.il'))
  check('scheme-less domain WITH path matches deeper URL-prefix property', propertyCoversProjectUrl('https://www.gotop.co.il/blog/', 'www.gotop.co.il/blog'))
  check('scheme-less apex matches https apex URL-prefix property', propertyCoversProjectUrl('https://gotop.co.il/', 'gotop.co.il'))
  // www vs non-www still differ after normalization.
  check('scheme-less www does NOT match apex URL-prefix property', !propertyCoversProjectUrl('https://gotop.co.il/', 'www.gotop.co.il'))
  // Explicit scheme is preserved: http stays http.
  check('explicit http:// does NOT match https URL-prefix property', !propertyCoversProjectUrl('https://www.gotop.co.il/', 'http://www.gotop.co.il'))
  // Explicit https retains existing correct behavior.
  check('explicit https:// matches https URL-prefix property (unchanged)', propertyCoversProjectUrl('https://www.gotop.co.il/', 'https://www.gotop.co.il'))
  // Path-prefix strictness unchanged after normalization.
  check('scheme-less /blog does NOT match /blogging boundary', !propertyCoversProjectUrl('https://www.gotop.co.il/blog', 'www.gotop.co.il/blogging'))
  check('scheme-less path OUTSIDE the prefix is not covered', !propertyCoversProjectUrl('https://www.gotop.co.il/shop/', 'www.gotop.co.il/blog'))
  // Domain (sc-domain:) coverage is unaffected by the URL-prefix normalization.
  check('Domain property still covers scheme-less subdomain', propertyCoversProjectUrl('sc-domain:gotop.co.il', 'www.gotop.co.il'))
  check('Domain property still rejects a scheme-less lookalike', !propertyCoversProjectUrl('sc-domain:gotop.co.il', 'notgotop.co.il'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
