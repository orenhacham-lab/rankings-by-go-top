/**
 * The two affiliate-directory badges in the public footer.
 *
 * AffyList and SaaSAffiliate.net list the affiliate program for free in
 * exchange for their badge being visible on the site, and both re-check it
 * after the submission — weekly, in AffyList's case. So the badge is not
 * decoration: remove it and the listing is dropped or turned nofollow without
 * anyone here noticing. That is what A guards.
 *
 * B guards the part that is ours rather than theirs. Their own snippets load an
 * <img> from their domain, which would send every visitor's IP to two third
 * parties on every page of the site, before consent, and would mean naming both
 * of them in the privacy policy in six languages. The images are therefore
 * SELF-HOSTED under public/badges, and the outgoing link is nofollow so no
 * ranking strength leaves — Oren's rule of 23.10.2026 against outbound links in
 * exchange for a listing.
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

/** The anchor plus the image of one badge, as the footer has to carry them. */
function badgeIsPresent(src: string, host: string, file: string) {
  return src.includes(`https://${host}/`) && src.includes(`/badges/${file}`)
}

function main() {
  const footer = strip(read('components/Footer.tsx'))

  console.log('A) Both listings keep their badge')
  check('A1: the AffyList badge links to affylist.com and shows its image',
    badgeIsPresent(footer, 'affylist.com', 'affylist.svg'))
  check('A2: the SaaSAffiliate.net badge links to saasaffiliate.net and shows its image',
    badgeIsPresent(footer, 'saasaffiliate.net', 'saasaffiliate.svg'))
  check('MUT-A: dropping the AffyList link fails A1',
    !badgeIsPresent(footer.replace('https://affylist.com/', 'https://example.com/'), 'affylist.com', 'affylist.svg'))

  console.log('\nB) Self-hosted, and nothing leaks out')
  for (const file of ['affylist.svg', 'saasaffiliate.svg']) {
    const path = join(ROOT, 'public', 'badges', file)
    check(`B1 ${file}: the image is served from our own public/badges`, existsSync(path))
    if (existsSync(path)) {
      const svg = readFileSync(path, 'utf8')
      check(`B2 ${file}: the file pulls nothing from another host`,
        !/(?:src|href)\s*=\s*"https?:\/\/(?!www\.w3\.org)/i.test(svg) && !/<script|<foreignObject|<image/i.test(svg))
    }
  }
  check('B3: neither badge image is loaded from the directory\'s own domain',
    !/src="https:\/\/(affylist\.com|saasaffiliate\.net)/.test(footer))
  check('MUT-B3: pointing the image back at their domain fails B3',
    /src="https:\/\/(affylist\.com|saasaffiliate\.net)/.test(footer.replace('src="/badges/affylist.svg"', 'src="https://affylist.com/badge/affylist-v1-light.svg"')))

  // Both anchors carry nofollow, so a listing never costs us ranking strength.
  const anchors = footer.match(/<a\b[\s\S]*?>/g) ?? []
  const directoryAnchors = anchors.filter((a) => /affylist\.com|saasaffiliate\.net/.test(a))
  check('B4: every directory anchor is rel="nofollow"',
    directoryAnchors.length === 2 && directoryAnchors.every((a) => /rel="[^"]*nofollow/.test(a)),
    `found ${directoryAnchors.length}`)
  check('MUT-B4: a directory anchor without nofollow fails B4',
    !directoryAnchors.map((a) => a.replace(/rel="[^"]*"/, 'rel="noopener"')).every((a) => /rel="[^"]*nofollow/.test(a)))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
