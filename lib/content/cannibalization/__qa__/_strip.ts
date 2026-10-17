/**
 * Source guards match code, never comments: this drops block and line comments
 * (and JSX comments) before a guard looks at a file. A `//` after a colon (a URL in
 * a string) or right after a quote (a string that starts with it) is kept.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

export const ROOT = join(__dirname, '..', '..', '..', '..')

export function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')
}

export function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

export function code(rel: string): string {
  return stripComments(readSrc(rel))
}
