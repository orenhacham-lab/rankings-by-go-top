/**
 * J2 — sidebar nav order: "מרכז תוכן" (Content Hub, /content) must sit immediately
 * after "פרויקטים" (Projects, /projects). The Content entry is build-flag gated, so
 * this is a source-order contract (the English nav uses the same array → same order).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function main() {
  console.log('J2 — sidebar order: Content Hub right after Projects')
  const src = readFileSync(join(__dirname, '..', 'Sidebar.tsx'), 'utf8')

  const iProjects = src.indexOf("href: '/projects'")
  const iContent = src.indexOf("href: '/content'")
  const iKeywordResearch = src.indexOf("href: '/keyword-research'")
  const iKeywords = src.indexOf("href: '/keywords'")

  check('all four nav entries are present', iProjects > 0 && iContent > 0 && iKeywordResearch > 0 && iKeywords > 0)
  check('Content Hub comes AFTER Projects', iProjects < iContent)
  check('Content Hub comes immediately after Projects (before keyword-research)', iContent < iKeywordResearch)
  check('nothing else sits between Projects and Content (no other href in that gap)',
    !/href: '\/(?!content)[a-z-]+'/.test(src.slice(iProjects + 1, iContent)))
  check('keyword-research + keywords still follow Content Hub', iContent < iKeywordResearch && iKeywordResearch < iKeywords)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
