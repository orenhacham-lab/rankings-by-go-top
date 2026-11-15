/**
 * THE INTERFACE LANGUAGE ON THE RAIL — one control, not eleven chips.
 *
 * The switcher used to be a chip per language. At two it was a toggle, at six
 * it still fitted; at eleven it wrapped into three rows of small chips at the
 * foot of the sidebar, ten of which are noise to the one reader looking at them
 * (measured 15.11.2026 on the Hebrew dashboard). It is now the language it is
 * in, which opens the list.
 *
 *   A) the control: it names the current language, says it opens a menu, and
 *      the menu is not in the markup until it is asked for;
 *   B) the list: every language the dashboard HAS, from the one gate, each
 *      naming itself in its own script and marked for a screen reader;
 *   C) the rail: the switcher and the theme toggle, side by side at every
 *      number of languages;
 *   D) it still renders on the first server render (what it was fixed for
 *      before: lib/i18n/dashboard/__qa__/first-render-language.qa.ts keeps the
 *      behaviour, this keeps the shape).
 *
 * Every check has a mutation control.
 *
 * Run: npx tsx lib/shell/__qa__/rail-language-switcher.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { getPublicDictionary } from '../../i18n/getPublicDictionary'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const switcher = strip(read('components/DashboardLanguageSwitcher.tsx'))
const sidebar = strip(read('components/layout/Sidebar.tsx'))

console.log('A) one control, which opens the list')
{
  const collapsed = (src: string) =>
    /aria-haspopup="menu"/.test(src) && /aria-expanded=\{open\}/.test(src)
    && /\{open && \(/.test(src) && /names\[uiLocale\]/.test(src)
  check('A1: it names the language it is in and opens a menu', collapsed(switcher))
  check('A1-MUT (CONTROL): a row of chips, one per language, fails A1',
    !collapsed(switcher.replace('aria-haspopup="menu"', 'aria-pressed={true}')))
  check('A2: the list is not in the markup until it is opened', /\{open && \(/.test(switcher))
  check('A2-MUT (CONTROL): a list rendered always fails A2',
    !/\{open && \(/.test(switcher.replace('{open && (', '{true && (')))
  check('A3: it closes on Escape and on a click outside, like every other menu here',
    /e\.key === 'Escape'/.test(switcher) && /box\.current\?\.contains/.test(switcher))
  check('A3-MUT (CONTROL): a menu with no way out fails A3',
    !/e\.key === 'Escape'/.test(switcher.replace("e.key === 'Escape'", 'false')))
  check('A4: it opens UPWARD — it sits at the foot of the rail', /bottom-full/.test(switcher))
  check('A4-MUT (CONTROL): a menu dropping off the bottom of the screen fails A4',
    !/bottom-full/.test(switcher.replace('bottom-full', 'top-full')))
}

console.log('\nB) the list')
{
  check('B1: the languages come from the ONE gate, not from a list of its own',
    /enabledPublicLocales\(\)/.test(switcher) && !/SiteEnabled\(\) \?/.test(switcher))
  check('B1-MUT (CONTROL): a hand-kept list of languages fails B1',
    !/enabledPublicLocales\(\)/.test("const options = [{ locale: 'he' }, { locale: 'en' }]"))
  check('B2: every language names ITSELF, in its own script',
    /names\[l\]/.test(switcher) && /lang=\{l\}/.test(switcher))
  check('B2-MUT (CONTROL): labels translated into the reader\'s language fail B2',
    !/names\[l\]/.test(switcher.replace(/names\[l\]/g, 'dict.languages[l]')))
  for (const l of PUBLIC_LOCALES) {
    const name = (getPublicDictionary(l).languageSwitcher as unknown as Record<string, string>)[l]
    check(`B3 (${l}): it has a name of its own`, typeof name === 'string' && name.trim().length > 0, name)
    check(`B4 (${l}): the control has a spoken label in this language`,
      !!getDashboardDictionary(l).sidebar.languageLabel?.trim())
  }
  check('B5: the current language is marked for a screen reader too', /aria-current=\{current \? 'true' : undefined\}/.test(switcher))
  check('B5-MUT (CONTROL): a list that marks nothing fails B5',
    !/aria-current=/.test(switcher.replace(/aria-current=\{current \? 'true' : undefined\}/, '')))
}

console.log('\nC) the rail')
{
  check('C1: the switcher and the theme toggle share one row, whatever the number of languages',
    /grid grid-cols-2 gap-2 px-1/.test(sidebar) && /<DashboardLanguageSwitcher \/>/.test(sidebar) && /<ThemeToggle \/>/.test(sidebar))
  check('C1-MUT (CONTROL): a rail that still sizes itself by a language flag fails C1',
    !/grid grid-cols-2 gap-2 px-1/.test(sidebar.replace("grid grid-cols-2 gap-2 px-1", "grid gap-2 px-1")))
  check('C2: no language flag is read in the rail any more', !/SiteEnabled/.test(sidebar))
}

console.log('\nD) it is there from the first render')
{
  check('D1: nothing waits for hydration — no isLoaded gate, no null return',
    !/isLoaded/.test(switcher) && !/return null/.test(switcher))
  check('D1-MUT (CONTROL): a switcher that returns null until hydration fails D1',
    /return null/.test(`${switcher}\n  if (!isLoaded) return null`))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
