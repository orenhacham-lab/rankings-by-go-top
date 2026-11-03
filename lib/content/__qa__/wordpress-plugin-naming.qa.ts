/**
 * THE PLUGIN NAMES THE PRODUCT, NOT THE AGENCY.
 *
 * "GO TOP" on its own is the agency's short mark. components/public/__qa__/w9-public.qa.ts
 * holds that line for the site: the product is "Go Top SEO", and bare "GO TOP" is allowed only
 * in the visible agency credit ("מבית GO TOP" / "By GO TOP"). The plugin drifted the other way
 * and called the product "GO TOP" throughout — in readme.txt, which WordPress.org serves to
 * search engines and AI assistants as the record OF THIS SOFTWARE, and in the admin strings a
 * merchant reads. That is the same entity confusion the site's own JSON-LD was fixed for.
 *
 * Nothing scanned wordpress-plugin/, so there was no guard to fail. This is it.
 *
 * SCOPE, deliberately: the two text files, readme.txt and the repo's own README.md. readme.txt is
 * the only file whose correction is not a plugin release — the directory page is served from
 * trunk's readme and wporg-deploy.yml in `assets` mode copies that one file across (see
 * lib/site-fix/__qa__/approved-plugin.ts). The PHP still calls the product "GO TOP" in six admin
 * strings a merchant reads and in its comments; fixing those is a version bump, a re-pin and a
 * `release` run, so it is its own change. Widen A1 to the PHP in the same commit that makes it.
 *
 *  A) no bare "GO TOP" in the plugin's text files — not in copy, not in a heading;
 *  B) the two places the capitals are correct and must stay: the registered entity in the
 *     Author field (a publisher field, where the legal name belongs), and the plugin's own
 *     published title "GO TOP SEO Bridge" with the "GO TOP SEO" settings page the dashboard
 *     copy names in every language (wordpress-plugin-first.qa.ts D2/D3 reads those);
 *  C) readme.txt introduces the product by name where WordPress.org shows it.
 *
 * Every guard has a mutation control, run against the real text rather than a temp file.
 *
 * Run: npx tsx lib/content/__qa__/wordpress-plugin-naming.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs')
const { join, relative } = require('path') as typeof import('path')

const ROOT = join(__dirname, '..', '..', '..')
const PLUGIN_DIR = join(ROOT, 'wordpress-plugin')

/** The agency's mark used as if it were the product's name. */
const BARE_AGENCY_MARK = /GO TOP(?! SEO| DIGITAL)/g

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? filesUnder(full) : [full]
  })
}

/** Every line of `text` that uses the agency mark as the product name. */
function offendingLines(text: string): string[] {
  return text.split('\n').filter((line) => BARE_AGENCY_MARK.test(line) && (BARE_AGENCY_MARK.lastIndex = 0) === 0)
}

function main() {
  console.log('A) the agency mark is not the product name')

  const files = filesUnder(PLUGIN_DIR).filter((f) => /\.(txt|md)$/.test(f))
  check('A0: the plugin\'s text files are there and were scanned', files.length >= 2, `${files.length} files`)

  const offenders = files.flatMap((f) => offendingLines(readFileSync(f, 'utf8')).map((l) => `${relative(ROOT, f)}: ${l.trim().slice(0, 80)}`))
  check(`A1: no bare "GO TOP" in ${files.length} plugin text files`, offenders.length === 0, offenders.slice(0, 3).join(' | '))

  check('MUT A1: the old wording put back is caught',
    offendingLines('Connects your site to GO TOP: publishes the articles you send.').length === 1)
  check('MUT A1: a changelog line is scanned too, not only the description',
    offendingLines('* 3.1.0: the plugin reads the site\'s own content, so GO TOP needs no password.').length === 1)
  check('MUT A1: the corrected wording is not flagged',
    offendingLines('Connects your site to Go Top SEO: publishes the articles you send.').length === 0)

  console.log('\nB) the capitals that are correct and must stay')

  const header = readFileSync(join(PLUGIN_DIR, 'gotop-seo-bridge', 'gotop-seo-bridge.php'), 'utf8')
  const admin = readFileSync(join(PLUGIN_DIR, 'gotop-seo-bridge', 'includes', 'admin.php'), 'utf8')

  // The registered entity belongs in a publisher field and nowhere else. Not a brand use.
  check('B1: the Author field is still the registered entity',
    /Author:\s+GO TOP DIGITAL MARKETING AND ADVERTISING LTD/.test(header))
  check('MUT B1: the entity replaced by the product name fails B1',
    !/Author:\s+GO TOP DIGITAL MARKETING AND ADVERTISING LTD/.test(header.replace('GO TOP DIGITAL MARKETING AND ADVERTISING LTD', 'Go Top SEO')))

  // The dashboard tells the merchant to open Settings > GO TOP SEO, in every language. If the
  // menu label changes here, that copy becomes a lie, so it is pinned on this side too.
  check('B2: the published plugin title and the settings page label are unchanged',
    /Plugin Name:\s+GO TOP SEO Bridge/.test(header) && admin.includes("add_options_page('GO TOP SEO', 'GO TOP SEO'"))
  check('MUT B2: a renamed settings page fails B2',
    !admin.replace("add_options_page('GO TOP SEO', 'GO TOP SEO'", "add_options_page('Go Top SEO', 'Go Top SEO'").includes("add_options_page('GO TOP SEO', 'GO TOP SEO'"))

  console.log('\nC) the WordPress.org record introduces the product by name')

  const readme = readFileSync(join(PLUGIN_DIR, 'gotop-seo-bridge', 'readme.txt'), 'utf8')
  const shortDescription = readme.split('\n').find((l) => l.startsWith('Connects your site to')) ?? ''
  check('C1: the short description WordPress.org lists names Go Top SEO',
    shortDescription.includes('Go Top SEO') && offendingLines(shortDescription).length === 0, shortDescription.slice(0, 80))

  const description = readme.slice(readme.indexOf('== Description =='), readme.indexOf('== Installation ==') + 1 || undefined)
  check('C2: the Description section opens on the product, with its address',
    /Go Top SEO \(https:\/\/www\.gotopseo\.com\/en\)/.test(description))
  check('MUT C2: the agency mark back in the opening sentence fails C2',
    !/Go Top SEO \(https:\/\/www\.gotopseo\.com\/en\)/.test(description.replaceAll('Go Top SEO (https://www.gotopseo.com/en)', 'GO TOP (https://www.gotopseo.com/en)')))

  // The product's own truth limits, on the record WordPress.org serves: the readme says the
  // tracking is monthly and names the three engines the automatic check covers.
  check('C3: the readme still says the tracking is monthly, not daily',
    /tracks every month/.test(description) && !/every day|daily rank|tracks daily/i.test(description))

  console.log('\nD) the correction actually reaches the page')

  // 03.11.2026: the first run of this looked like a success and published
  // nothing. WordPress.org renders the plugin page from the STABLE TAG's
  // readme whenever Stable tag names a version, and `assets` mode was copying
  // the file to trunk only. api.wordpress.org went on serving the old text out
  // of tags/3.2.0 while trunk held the corrected one.
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'wporg-deploy.yml'), 'utf8')
  const copiesIntoTheTag = (s: string) => /cp "\$PLUGIN_DIR\/readme\.txt" "svn\/tags\/\$VERSION\/readme\.txt"/.test(s)
    && /svn update --set-depth infinity "svn\/tags\/\$VERSION"/.test(s)
  check('D1: `assets` mode copies the readme into the tag Stable tag names, not only into trunk', copiesIntoTheTag(workflow))
  check('MUT D1: dropping the tag copy fails D1',
    !copiesIntoTheTag(workflow.replace('cp "$PLUGIN_DIR/readme.txt" "svn/tags/$VERSION/readme.txt"', 'true')))

  // And only the readme: a released tag's zip is what merchants already have.
  const tagBlock = workflow.slice(workflow.indexOf('cp "$PLUGIN_DIR/readme.txt" svn/trunk/readme.txt'))
  check('D2: nothing but readme.txt is written into an existing tag',
    !/rsync[^\n]*svn\/tags/.test(tagBlock) && (tagBlock.match(/svn\/tags\/\$VERSION\/[a-z.]+/g) ?? []).every((p) => p.endsWith('readme.txt')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
