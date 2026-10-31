/**
 * The public footer carries NO affiliate-directory badge.
 *
 * AffyList and SaaSAffiliate.net listed the affiliate program for free in
 * exchange for their badge being visible on the site. Oren removed both on
 * 31.10.2026: a footer that advertises two unknown directories reads cheap on
 * our own site, and the trade was never worth that. Both directories re-check
 * the badge, so each listing may be dropped or turned nofollow on their next
 * pass — that was the accepted cost of the decision, not an oversight.
 *
 * So this guard is inverted: it fails if either badge, or the self-hosted
 * images they used, comes back into the tree. Anyone re-adding one has to read
 * this file and talk to Oren first.
 *
 * Both groups have a mutation control.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** The directories whose badges were removed, each with the file it used. */
const REMOVED = [
  { host: 'affylist.com', file: 'affylist.svg' },
  { host: 'saasaffiliate.net', file: 'saasaffiliate.svg' },
]

/** True when the footer still carries that directory in any form. */
function badgeIsPresent(src: string, host: string, file: string) {
  return src.includes(host) || src.includes(`/badges/${file}`)
}

function main() {
  const footer = strip(read('components/Footer.tsx'))

  console.log('A) Neither directory is linked from the footer')
  for (const { host, file } of REMOVED) {
    check(`A ${host}: no link and no image in the footer`,
      !badgeIsPresent(footer, host, file))
  }
  check('MUT-A: putting the AffyList badge back fails A',
    badgeIsPresent(`${footer}\n<a href="https://affylist.com/"><img src="/badges/affylist.svg" /></a>`, 'affylist.com', 'affylist.svg'))

  console.log('\nB) The badge images are gone from the tree')
  for (const { file } of REMOVED) {
    check(`B ${file}: the file is not in public/badges`,
      !existsSync(join(ROOT, 'public', 'badges', file)))
  }
  // The folder itself held nothing else, so it should not be back either.
  check('B3: public/badges does not exist', !existsSync(join(ROOT, 'public', 'badges')))
  check('MUT-B3: a path that does exist fails B3', existsSync(join(ROOT, 'public')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
