/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The redesigned studio's words: 11 locales, same keys, every goal/chip/length present, no
 * provider name, no price written into a sentence, and the screen wiring that must not be lost.
 * Run: npx tsx lib/video-studio/__qa__/video-ui-copy.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { VIDEO_UI_COPY } from '../copy-ui'
import { CAMERA_IDS, GOAL_IDS, MOOD_IDS, STYLE_IDS } from '../presets'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { if (c) passed++; else { failed++; console.log('FAIL:', m) } }
const flat = (c: any): string[] => Object.values(c).flatMap((v) => typeof v === 'string' ? [v] : typeof v === 'function' ? [(v as (a: number, b: number) => string)(7, 6)] : Array.isArray(v) ? v.flatMap((x) => flat({ x })) : v && typeof v === 'object' ? flat(v) : [''])
const shape = (c: any): string => JSON.stringify(Object.keys(c).sort().map((k) => [k, typeof c[k] === 'object' && !Array.isArray(c[k]) ? shape(c[k]) : typeof c[k] === 'function' ? 'f' : Array.isArray(c[k]) ? c[k].length : 's']))
const ref = shape(VIDEO_UI_COPY.en)

for (const l of PUBLIC_LOCALES) {
  const c: any = VIDEO_UI_COPY[l]
  ok(!!c && shape(c) === ref, `${l}: same keys as en`)
  const all = flat(c)
  ok(all.every((s) => s.trim().length >= 1), `${l}: no empty string`)
  ok(!all.some((s) => /gemini|google|omni|veo|\\u[0-9a-f]{4}|undefined|\[object/i.test(s)), `${l}: no provider name, no escapes`)
  ok(GOAL_IDS.every((g) => c.goals[g]?.label && c.goals[g]?.example), `${l}: every goal has a label and an example`)
  ok(STYLE_IDS.every((g) => c.styles[g]) && MOOD_IDS.every((g) => c.moods[g]) && CAMERA_IDS.every((g) => c.cameras[g]), `${l}: every chip has a label`)
  ok(c.phases.length === 4 && c.createNow(12).includes('12'), `${l}: four phases, create button shows the cost`)
  ok(c.timeNote.includes('7'), `${l}: says 7 days`)
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const view = strip(readFileSync(join(__dirname, '../../../components/video-studio/VideoStudioView.tsx'), 'utf8'))
const packs = strip(readFileSync(join(__dirname, '../../../components/video-studio/CreditPacks.tsx'), 'utf8'))
ok(/improve-prompt/.test(view) && /fallbackPrompt\(/.test(view), 'the screen asks the improver and has a local fallback')
ok(/prompt, seconds, aspect/.test(view), 'generate receives the prepared prompt')
ok(/fresh && plan/.test(view), 'create is offered only for an up-to-date plan')
ok(/errNetwork/.test(view), 'a dropped connection has its own message')
ok(/refund-policy/.test(packs) && /t\.vatIls/.test(packs) && /t\.taxUsd/.test(packs), 'packs keep the refund link and the VAT / tax label')
ok(/slots\.current\[id\]/.test(packs) && /packs\/creem\/checkout/.test(packs) && /packs\/paypal\/capture/.test(packs), 'both checkouts are still wired')
// Mutation controls
const broken: any = { ...VIDEO_UI_COPY.fr, goals: { ...VIDEO_UI_COPY.fr.goals, offer: undefined } }
ok(!GOAL_IDS.every((g) => broken.goals[g]?.label), 'M: a missing goal would be caught')
ok(!(/fresh && plan/.test(view.replace('fresh && plan', 'plan'))), 'M: dropping the freshness check fails the guard')
ok(!(/t\.vatIls/.test(packs.replaceAll('t.vatIls', 'x'))), 'M: dropping the VAT label fails the guard')
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
