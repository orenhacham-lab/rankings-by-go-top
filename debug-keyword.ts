/**
 * Debug script for testing a specific keyword.
 * Usage: npx tsx debug-keyword.ts
 *
 * Set environment variables:
 * - SERPER_API_KEY=your_key
 * - DEBUG_KEYWORD="your keyword"
 * - DEBUG_DOMAIN="target.com"
 * - DEBUG_COUNTRY="IL" (default)
 * - DEBUG_LANGUAGE="he" (default)
 * - DEBUG_CITY="your city" (optional)
 */

import { scanGoogleSearch } from './lib/scanner/google-search'
import type { ScanInput } from './lib/scanner/types'

const keyword = process.env.DEBUG_KEYWORD || 'קידום אתרים ברמת גן'
const targetDomain = process.env.DEBUG_DOMAIN || 'gotopseo.com'
const country = process.env.DEBUG_COUNTRY || 'IL'
const language = process.env.DEBUG_LANGUAGE || 'he'
const city = process.env.DEBUG_CITY || 'Ramat Gan'

const input: ScanInput = {
  engine: 'google',
  keyword,
  targetDomain,
  country,
  language,
  city,
  locationMode: 'custom',
  deviceType: 'desktop',
}

console.log('\n' + '='.repeat(100))
console.log('DEBUG KEYWORD TEST')
console.log('='.repeat(100))
console.log('Input:')
console.log(`  Keyword: "${keyword}"`)
console.log(`  Target Domain: "${targetDomain}"`)
console.log(`  Country: ${country}`)
console.log(`  Language: ${language}`)
console.log(`  City: ${city}`)
console.log('='.repeat(100) + '\n')

scanGoogleSearch(input).then((result) => {
  console.log('\n' + '='.repeat(100))
  console.log('RESULT')
  console.log('='.repeat(100))
  console.log(JSON.stringify(result, null, 2))
  console.log('='.repeat(100) + '\n')
})
