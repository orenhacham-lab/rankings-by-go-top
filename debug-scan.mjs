#!/usr/bin/env node
/**
 * debug-scan.mjs
 *
 * Run this locally or paste into a Vercel function to debug the exact
 * production case for keyword + domain detection.
 *
 * Usage:
 *   SERPER_API_KEY=xxxx node debug-scan.mjs
 *
 *   Or if .env.local exists:
 *   node -e "require('fs').readFileSync('.env.local','utf8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k)process.env[k.trim()]=v.join('=').trim()})" && node debug-scan.mjs
 */

// --- CONFIG ---
const KEYWORD = 'קידום אתרים בפתח תקווה'
const TARGET_DOMAIN = 'www.gotop.co.il'
const SERPER_URL = 'https://google.serper.dev/search'
const API_KEY = process.env.SERPER_API_KEY

if (!API_KEY) {
  console.error('❌  SERPER_API_KEY is not set in environment')
  process.exit(1)
}

function normalizeDomain(input) {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '').toLowerCase().replace(/\.$/, '')
  } catch {
    return input
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0].split('?')[0].split('#')[0]
      .toLowerCase().trim()
  }
}

function isDomainMatch(resultNorm, targetNorm) {
  if (!resultNorm || !targetNorm) return false
  if (resultNorm === targetNorm) return `exact`
  if (resultNorm.endsWith('.' + targetNorm)) return `subdomain`
  if (resultNorm.includes(targetNorm)) return `includes`
  return false
}

async function callSerper(hlParam) {
  const body = {
    q: KEYWORD,
    gl: 'il',
    hl: hlParam,
    num: 100,
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`▶  Calling Serper with hl="${hlParam}"`)
  console.log(`   Body: ${JSON.stringify(body)}`)
  console.log('='.repeat(70))

  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`❌  HTTP ${res.status}: ${text.slice(0, 300)}`)
    return null
  }

  const data = await res.json()

  console.log(`\n📦  Top-level keys returned: ${Object.keys(data).join(', ')}`)

  if (data.error) {
    console.error(`❌  Serper error: ${data.error}`)
    return null
  }

  const organic = data.organic ?? []
  console.log(`\n🔢  Organic results count: ${organic.length}`)

  if (organic.length === 0) {
    console.warn('⚠️  No organic results returned!')
    console.log('\nFull raw response:')
    console.log(JSON.stringify(data, null, 2))
    return data
  }

  const normalizedTarget = normalizeDomain(TARGET_DOMAIN)
  console.log(`\n🎯  Target domain:   "${TARGET_DOMAIN}"`)
  console.log(`    Normalized to:   "${normalizedTarget}"`)

  let matchFound = false

  console.log('\n📋  All organic URLs:')
  organic.forEach((r, i) => {
    const norm = normalizeDomain(r.link)
    const match = isDomainMatch(norm, normalizedTarget)
    const flag = match ? `  ✅ MATCH (${match})` : ''
    console.log(`  #${String(i + 1).padStart(3)}  ${r.link}`)
    console.log(`        normalized: "${norm}"${flag}`)
    if (match) matchFound = true
  })

  if (!matchFound) {
    console.log(`\n❌  TARGET "${normalizedTarget}" NOT FOUND in ${organic.length} results`)

    // Check if gotop appears anywhere at all (raw string search)
    const rawJson = JSON.stringify(data)
    const appearsRaw = rawJson.toLowerCase().includes('gotop')
    console.log(`\n🔍  Does "gotop" appear anywhere in raw response? ${appearsRaw ? 'YES' : 'NO'}`)

    if (appearsRaw) {
      // Find context around "gotop"
      const idx = rawJson.toLowerCase().indexOf('gotop')
      console.log(`    Context: ...${rawJson.slice(Math.max(0, idx - 50), idx + 80)}...`)
    }
  } else {
    const matched = organic.find((r, i) => isDomainMatch(normalizeDomain(r.link), normalizedTarget))
    const pos = organic.indexOf(matched) + 1
    console.log(`\n✅  MATCH at position #${pos}: ${matched.link}`)
  }

  return data
}

async function main() {
  console.log('🚀  Debug scan started')
  console.log(`    Keyword: "${KEYWORD}"`)
  console.log(`    Target:  "${TARGET_DOMAIN}"`)

  // Test both Hebrew language codes
  const [resultHe, resultIw] = await Promise.all([
    callSerper('he'),
    callSerper('iw'),
  ])

  console.log('\n' + '='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))

  function summarize(data, hl) {
    if (!data) { console.log(`hl=${hl}: ❌ API error`); return }
    const organic = data.organic ?? []
    const target = normalizeDomain(TARGET_DOMAIN)
    const match = organic.find((r) => isDomainMatch(normalizeDomain(r.link), target))
    if (match) {
      const pos = organic.indexOf(match) + 1
      console.log(`hl=${hl}: ✅ FOUND at position #${pos}  →  ${match.link}`)
    } else {
      console.log(`hl=${hl}: ❌ NOT FOUND in ${organic.length} results`)
    }
  }

  summarize(resultHe, 'he')
  summarize(resultIw, 'iw')
}

main().catch((e) => { console.error(e); process.exit(1) })
