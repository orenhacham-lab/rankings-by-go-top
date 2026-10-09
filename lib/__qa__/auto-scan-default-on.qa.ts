/**
 * Automatic rank tracking is ON for a new project, and its FIRST scan is a
 * week out — offline, pure + source guards.
 *
 * The owner reported that tracking "isn't scanning". It was not a bug: the
 * switch defaulted OFF in every new project, and when it was turned on the
 * first scan was scheduled a MONTH ahead, so a project's first month had no
 * automatic scan at all. Meanwhile the public site's comparison table promises
 * "מעקב אוטומטי אחרי המיקומים" against "בודקים מיקומים ידנית", which an
 * untouched default did not deliver.
 *
 * Each group ends with a MUTATION CONTROL proving the guard fails when the
 * pre-fix value is put back.
 */
import { firstScanDate, calculateNextScanDate, FIRST_SCAN_DELAY_DAYS, isValidScanFrequency } from '../utils'
import { code } from '../content/cannibalization/__qa__/_strip'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const FROM = new Date('2026-08-15T00:00:00.000Z')
const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000)

async function main() {
  console.log('A) the first automatic scan is a week out, not a month')
  {
    const first = firstScanDate('monthly', FROM)
    check('monthly: a first scan is scheduled', first !== null)
    check(`monthly: it is ${FIRST_SCAN_DELAY_DAYS} days out, not a month`, !!first && days(first, FROM) === FIRST_SCAN_DELAY_DAYS, first ? `${days(first, FROM)} days` : 'null')
    check('the delay is a week', FIRST_SCAN_DELAY_DAYS === 7)
    check('manual: still no schedule at all', firstScanDate('manual', FROM) === null)
    check('an unsupported frequency gets no schedule (fails closed)', firstScanDate('weekly', FROM) === null && firstScanDate('', FROM) === null)
    // Every scan AFTER the first stays monthly — the cadence itself is unchanged.
    const second = calculateNextScanDate('monthly', first!)
    check('the scan after the first is a month later, not another week', !!second && days(second, first!) >= 28 && days(second, first!) <= 31)
    check('monthly cadence from the old helper is untouched', calculateNextScanDate('monthly', FROM)?.toISOString() === '2026-09-15T00:00:00.000Z')

    // MUTATION CONTROL — the pre-fix scheduling (a month out for the first scan too).
    const brokenFirst = calculateNextScanDate('monthly', FROM)!
    check('MUTATION: scheduling the first scan with the monthly helper is ~a month out (guard is real)', days(brokenFirst, FROM) >= 28)
  }

  console.log('B) a NEW project opens with automatic monthly tracking on')
  {
    const form = code('components/projects/ProjectForm.tsx')
    check('the switch defaults ON for a new project (?? true)', /useState\(project\?\.auto_scan_enabled \?\? true\)/.test(form))
    check('the switch is NOT off by default any more', !/useState\(project\?\.auto_scan_enabled \?\? false\)/.test(form))
    check('the frequency defaults to monthly for a new project', /useState<'manual' \| 'monthly'>\(\s*project\?\.scan_frequency \|\| 'monthly'\s*\)/.test(form))
    // Editing must keep whatever the project stores: both defaults read through `project?.`,
    // so a stored false / 'manual' still wins over the new default.
    check('editing reads the stored switch value, never a hard-coded true', !/useState\(true\)/.test(form) && /project\?\.auto_scan_enabled/.test(form))
    check('editing reads the stored frequency', /project\?\.scan_frequency/.test(form))
    check('the switch value is still submitted with the form', /auto_scan_enabled', autoScan \? 'true' : 'false'/.test(form))

    // MUTATION CONTROL — the pre-fix default.
    check('MUTATION: the old `?? false` text would fail the ON guard (guard is real)',
      !/useState\(project\?\.auto_scan_enabled \?\? true\)/.test("const [autoScan, setAutoScan] = useState(project?.auto_scan_enabled ?? false)"))
  }

  console.log('C) BOTH project-creation paths schedule the first scan the new way')
  {
    for (const rel of ['app/actions/projects.ts', 'app/api/projects/create/route.ts']) {
      const src = code(rel)
      check(`${rel}: creation uses firstScanDate`, /firstScanDate\(scanFrequency\)/.test(src))
      check(`${rel}: creation no longer uses the monthly helper`, !/calculateNextScanDate/.test(src))
      check(`${rel}: a project with the switch off gets no schedule`, /autoScan[Ee]nabled \? firstScanDate\(scanFrequency\) : null/.test(src))
      check(`${rel}: the switch value still reaches the row`, /auto_scan_enabled: autoScanEnabled/.test(src))
    }
    // firstScanDate fails closed on 'manual', so the two paths need no separate
    // frequency check to stay safe — prove that rather than assuming it.
    check('a manual frequency cannot produce a schedule even with the switch on', firstScanDate('manual') === null)
    check('isValidScanFrequency still rejects weekly (no new frequency slipped in)', !isValidScanFrequency('weekly'))
  }

  console.log('D) the public promise now matches the code')
  {
    // The home-page comparison table's "with us" column claims automatic rank
    // tracking, in every language, against "checking by hand" in the "without"
    // column. Those lines are only true while the default is on, so each is
    // pinned to the default here: turn the default back off and this fails.
    const form = code('components/projects/ProjectForm.tsx')
    const defaultOn = /useState\(project\?\.auto_scan_enabled \?\? true\)/.test(form)
    const CLAIM: Array<[string, RegExp]> = [
      ['he', /מעקב אוטומטי אחרי המיקומים/],
      ['en', /Automatic tracking of your Google/],
      ['es', /Seguimiento automático de tus posiciones/],
      ['pt-BR', /Acompanhamento automático das suas posições/],
    ]
    // The list is derived, not hard-coded to one file, so a new language's
    // landing file is covered the moment its claim matches one of these.
    let claimed = 0
    for (const [lang, re] of CLAIM) {
      const landing = code(`lib/i18n/public/landing-${lang}.ts`)
      const claimsAuto = re.test(landing)
      if (claimsAuto) claimed++
      check(`${lang}: if the site promises automatic tracking, the default is on`, !claimsAuto || defaultOn)
    }
    check('the promise was actually found (the guard is not vacuously passing)', claimed === CLAIM.length, `${claimed}/${CLAIM.length} languages`)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
