/**
 * THE IMAGE REVIEW, AND THE ONE RULE IT MUST NEVER BREAK.
 *
 * 17 November 2026: a mirrored laptop on the Dutch cover, two right hands on the
 * Hebrew one, nonsense lettering on every screen examined that week. The review
 * exists to catch those before they are published.
 *
 * The rule it must never break: it must not be able to stop an article. A review
 * that cannot run, times out, or answers nonsense has NO OPINION, and no opinion
 * publishes. Every failure path below asserts that.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseImageReview, retryGuidanceFor, reviewGeneratedImage, IMAGE_DEFECTS } from '../image-quality'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const bytes = Buffer.from('not-really-a-jpeg')

async function main() {
  console.log('1) reading the answer')
  {
    check('a clean answer publishes',
      parseImageReview('{"duplicated_subject":false,"impossible_device":false,"garbled_text":false}').ok)
    const v = parseImageReview('{"duplicated_subject":false,"impossible_device":true,"garbled_text":true}')
    check('the named faults come back', !v.ok && v.defects.join(',') === 'impossible_device,garbled_text', v)
    check('a code fence is tolerated',
      parseImageReview('```json\n{"garbled_text":true}\n```').defects.join(',') === 'garbled_text')
    check('prose around the JSON is tolerated',
      parseImageReview('Sure! {"garbled_text":true} hope that helps').defects.join(',') === 'garbled_text')

    // NO OPINION IS NOT A DEFECT.
    for (const [name, answer] of [['empty', ''], ['prose only', 'I cannot see the image.'], ['broken json', '{"garbled_text":'], ['a list', '[true,false]']] as const) {
      const r = parseImageReview(answer)
      check(`${name} → no opinion, and it publishes`, r.ok && r.defects.length === 0 && !!r.skipped, r)
    }
    check('a key the model left out is not a defect', parseImageReview('{"garbled_text":false}').ok)
    check('a string "true" is not a defect either (only a real boolean counts)',
      parseImageReview('{"garbled_text":"true"}').ok)
  }

  console.log('2) it can never stop an article')
  {
    const thrown = await reviewGeneratedImage(bytes, 'image/jpeg', {
      ask: async () => { throw new Error('timeout of 20000ms exceeded') },
    })
    check('a provider failure publishes', thrown.ok && thrown.skipped === 'review_failed', thrown)
    const empty = await reviewGeneratedImage(Buffer.alloc(0), 'image/jpeg', { ask: async () => '{"garbled_text":true}' })
    check('no bytes publishes, and does not call the model', empty.ok && empty.skipped === 'no_bytes', empty)
    const nonsense = await reviewGeneratedImage(bytes, 'image/jpeg', { ask: async () => 'the image seems fine?' })
    check('an unparsable answer publishes', nonsense.ok, nonsense)
    const real = await reviewGeneratedImage(bytes, 'image/jpeg', { ask: async () => '{"impossible_device":true}' })
    check('and a real fault is still reported', !real.ok && real.defects.join(',') === 'impossible_device', real)
  }

  console.log('3) the correction names only what was seen')
  {
    const one = retryGuidanceFor(['impossible_device'])
    check('the mirrored laptop is described concretely', /screen facing THEM|keyboard under their hands/.test(one), one)
    check('and nothing else is mentioned', !/ONE person/.test(one) && !/NO lettering/.test(one), one)
    check('the duplicated subject asks for one person with two hands',
      /exactly ONE person/.test(retryGuidanceFor(['duplicated_subject'])))
    check('garbled text asks for no lettering at all',
      /NO lettering/.test(retryGuidanceFor(['garbled_text'])))
    check('several faults are joined into one correction',
      retryGuidanceFor(['duplicated_subject', 'garbled_text']).split(';').length === 2)
    check('no faults means no correction', retryGuidanceFor([]) === '')
    check('every defect the module knows has wording',
      IMAGE_DEFECTS.every((d) => retryGuidanceFor([d]).length > 40), IMAGE_DEFECTS)
  }

  console.log('4) the cover asks again once, and publishes either way')
  {
    const cover = strip(read('../../blog/auto/cover.ts'))
    check('the cover reviews the image it generated',
      /reviewGeneratedImage\(bytes, 'image\/jpeg', deps\.review\)/.test(cover))
    check('a fault orders exactly one more image, with the fault named',
      /order\(retryGuidanceFor\(first\.defects\)\)/.test(cover)
      && (cover.match(/await order\(/g) ?? []).length === 2, (cover.match(/await order\(/g) ?? []).length)
    check('the second image is kept only when it is cleaner',
      /second\.defects\.length < first\.defects\.length/.test(cover))
    check('a failed retry never fails the cover (the first image stands)',
      /catch \{ \/\* keep the first image \*\/ \}|catch \{\s*\}/.test(cover) || /catch \{/.test(cover))
    check('the review is never a reason to return !ok',
      !/return \{ ok: false[^}]*review/.test(cover) && !/defects[^\n]*return \{ ok: false/.test(cover))
    check('an image published with a known fault is logged',
      /publishing an image the review still faults/.test(cover))
    check('the prompt carries the correction last, where it is weighed most',
      /\(input\.retryGuidance \|\| ''\)\.trim\(\),\s*\]\.filter\(Boolean\)/.test(strip(read('../gemini-image.ts'))))
  }

  // MUTATION CONTROLS, run by hand:
  //  - making `parseImageReview` treat a missing key as a defect (`row[d] !== false`)
  //    fails "a key the model left out is not a defect" and both "no opinion" rows;
  //  - removing the try/catch in `reviewGeneratedImage` fails "a provider failure
  //    publishes" with a thrown error rather than a verdict;
  //  - dropping `second.defects.length < first.defects.length` fails "the second
  //    image is kept only when it is cleaner".
  //
  // WHAT THESE TESTS DO NOT PROVE: that the model's eye is any good. Whether it
  // actually sees the mirrored laptop on google-positie-checker is not decidable
  // here — this container has no GEMINI_API_KEY — and no fake can stand in for
  // it. That is why every refusal is logged with the slug and the defects: the
  // first days of `[blog-cover] image refused by review` lines are the evidence,
  // and if the gate turns out to fire on nothing, or on everything, the logs say
  // so before anyone has to look at the blog to find out.

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
