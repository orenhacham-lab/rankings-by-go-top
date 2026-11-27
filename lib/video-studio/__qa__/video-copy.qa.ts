/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The studio screen's words: all 11 locales, same keys, no provider text, RTL/CJK direct characters,
 * and the page is a 404 without the flag. Mutation controls included.
 * Run: npx tsx lib/video-studio/__qa__/video-copy.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { VIDEO_STUDIO_COPY } from '../copy'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { if (c) passed++; else { failed++; console.log('FAIL:', m) } }
const flat = (c: any): string[] => Object.values(c).flatMap((v) => v === undefined ? [''] : typeof v === 'string' ? [v] : typeof v === 'function' ? [(v as (n: number, p: string) => string)(5, '9')] : flat(v))
const keys = (c: any, p = ''): string[] => Object.entries(c).flatMap(([k, v]) => typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])
const ref = keys(VIDEO_STUDIO_COPY.en)

for (const l of PUBLIC_LOCALES) {
  const c = VIDEO_STUDIO_COPY[l]
  ok(!!c && JSON.stringify(keys(c)) === JSON.stringify(ref), `${l}: same keys as en`)
  const all = flat(c)
  ok(all.every((s) => s.trim().length >= 1), `${l}: no empty string`)
  ok(!all.some((s) => /gemini|google|omni|veo|\\u[0-9a-f]{4}|undefined|\[object/i.test(s)), `${l}: no provider name, no escapes`)
  ok(c.cost(7).includes('7'), `${l}: cost shows the number`)
  ok(c.keptFor.includes('7'), `${l}: says 7 days`)
}
ok(/[א-ת]/.test(VIDEO_STUDIO_COPY.he.title) && /[ぁ-んァ-ン一-龥]/.test(VIDEO_STUDIO_COPY.ja.title) && /[가-힣]/.test(VIDEO_STUDIO_COPY.ko.title), 'he/ja/ko are in their own script')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const page = strip(readFileSync(join(__dirname, '../../../app/(dashboard)/video-studio/page.tsx'), 'utf8'))
ok(/if \(!isVideoStudioEnabled\(\)\) notFound\(\)/.test(page), 'page is a 404 without the flag')
const sidebar = readFileSync(join(__dirname, '../../../components/layout/Sidebar.tsx'), 'utf8')
ok(/href: '\/video-studio', videoLabel: true/.test(sidebar), 'launched: the sidebar has the video studio entry')
ok(!/href: '\/video-studio', videoLabel: true/.test(sidebar.replaceAll('/video-studio', '/x')), 'M: removing the sidebar entry fails the launch guard')
// Mutation controls
const broken = { ...VIDEO_STUDIO_COPY.fr, title: undefined as any }
ok(flat(broken).some((s) => s.trim().length < 1), 'M: a missing key would be caught')
ok(!/if \(!isVideoStudioEnabled\(\)\) notFound\(\)/.test(page.replace('notFound()', 'null')), 'M: removing notFound fails the page guard')
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
