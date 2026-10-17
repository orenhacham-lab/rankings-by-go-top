/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The author photo in the settings, end to end in the browser (Hebrew):
 *
 *   1. a WordPress site connected with an application password: the image
 *      choice offers "a photo I upload" next to none and the site icon;
 *   2. choosing it and picking a PNG uploads it through the owner-only server
 *      action: one object in the private bucket at <project_id>/<uuid>.png,
 *      the owner's row points at it, the image is 'upload', and the card shows
 *      the photo (signed) in the preview with the consent note;
 *   3. a GIF is refused with our own sentence, nothing stored;
 *   4. "delete the photo" removes the object from storage and clears the row.
 *
 *   node lib/__qa__/reviewer-journey/author-photo-settings.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running (it must have been
 * started with the same CONTENT_CREDENTIALS_ENCRYPTION_KEY as JOURNEY_CRED_KEY);
 * STUB_URL points at a stub on another port; AUTHOR_PHOTO_SHOT copies the
 * Hebrew screenshot with the uploaded photo to that path.
 */
const { spawn } = require('child_process')
const crypto = require('crypto')
const { copyFileSync, mkdirSync, writeFileSync } = require('fs')
const { dirname, join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3994)
const BASE = process.env.JOURNEY_BASE || `http://127.0.0.1:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/author-photo-settings'
// A key made for this run only, so the stub's application password decrypts (no real secret anywhere).
const KEY = process.env.JOURNEY_CRED_KEY || crypto.randomBytes(32).toString('hex')
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const USER_ID = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06' // the stub's user
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555' // the stub's project
const PATH_SHAPE = new RegExp(`^author-photos/${PROJECT_ID}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`)

const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json()).catch(() => null)
const rest = (method, path, body) => fetch(`${STUB}/rest/v1/${path}`, {
  method, headers: { 'content-type': 'application/json', apikey: 'stub-service-key', authorization: 'Bearer stub-service-key' }, body: JSON.stringify(body),
})
const styleRow = async () => (((await stub('/__stub/db')) || {}).project_article_styles || []).find((r) => r.project_id === PROJECT_ID)

function encrypt(plain) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${ct.toString('hex')}`
}

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function shootCard(page, path) {
  await page.$eval('[data-writing-author-box]', (el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -96) })
  await page.waitForTimeout(500)
  const b = await page.$eval('[data-writing-author-box]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  await page.screenshot({ path, clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: Math.min(b.height + 24, 1400 - b.y) } })
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent || '').catch(() => '')

async function photoFiles() {
  const sharp = require('sharp')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f4c095"/><stop offset="1" stop-color="#c60035"/></linearGradient></defs>
    <rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="160" r="78" fill="#fff4ea"/><ellipse cx="200" cy="360" rx="140" ry="110" fill="#fff4ea"/></svg>`
  const png = join(SHOTS, 'author.png')
  writeFileSync(png, await sharp(Buffer.from(svg)).png().toBuffer())
  const gif = join(SHOTS, 'not-allowed.gif')
  writeFileSync(gif, await sharp(Buffer.from(svg)).gif().toBuffer())
  return { png, gif }
}

async function run(browser) {
  console.log('\nhe) the author photo in the settings')
  const files = await photoFiles()
  await stub('/__stub/reset')
  await stub('/__stub/fixture?account=web')
  await rest('PATCH', `projects?id=eq.${PROJECT_ID}`, { business_name: 'מאפיית לוי', name: 'מאפיית לוי', target_domain: 'levi-bakery.co.il', language: 'he' })
  await rest('PATCH', `project_profiles?project_id=eq.${PROJECT_ID}`, { description: 'מאפייה משפחתית בחיפה שאופה לחם מחמצת מאז 1998. אנחנו גם שולחים משלוחים למשרדים בצפון.' })
  // A WordPress site connected over an application password (encrypted with this run's key).
  await rest('POST', 'wordpress_connections', { id: 'wp-conn-1', project_id: PROJECT_ID, user_id: USER_ID, site_url: 'https://levi-bakery.co.il',
    wp_username: 'editor', wp_application_password_encrypted: encrypt('abcd efgh ijkl mnop'), connection_status: 'connected' })
  await rest('POST', 'project_article_styles', { project_id: PROJECT_ID, user_id: USER_ID, design: 'formatted', brand_colors: ['#c60035'], image_style: 'realistic',
    hero_ratio: '16:9', inline_images: 0, own_images_only: false, official_profiles: {}, article_cta: {}, writing_guidance: {},
    author_box: true, theme_author_box: null, theme_author_box_checked_at: null, author_box_name: 'דנה כהן', author_box_url: null, author_box_image: 'none',
    author_box_photo_path: null, author_box_photo_media: null })

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, locale: 'he-IL' })
  const page = await ctx.newPage()
  for (let attempt = 0; attempt < 2 && (attempt === 0 || page.url().includes('/login')); attempt += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 }).catch(() => {}), page.click('button[type="submit"]')])
  }
  check('signed in', !page.url().includes('/login'), page.url())

  await page.goto(`${BASE}/settings?projectId=${PROJECT_ID}&lang=he#writing-guidance`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const ready = await page.waitForSelector('[data-author-box-preview="ready"]', { timeout: 90000 }).then(() => true).catch(() => false)
  check('the card shows the author-box preview', ready)
  if (!ready) { await page.screenshot({ path: join(SHOTS, '0-settings.png'), fullPage: true }); await ctx.close(); return }
  const radios = await page.$$eval('[data-author-box-image] [role="radio"]', (els) => els.map((e) => e.textContent.trim()))
  check('WordPress with an application password: none, the site icon and an uploaded photo are offered', radios.length === 3 && radios[2] === 'תמונה שאעלה', radios.join(' | '))
  const sample = await text(page, '[data-author-box-sample]')
  check('the name is the link, and the business name is not repeated under it', (await page.$$('[data-author-box-name-link]')).length === 1 && !sample.includes('מאפיית לוי'), sample)

  await page.locator('[data-author-box-image] [role="radio"]', { hasText: 'תמונה שאעלה' }).click()
  const shown = await page.waitForSelector('[data-author-photo-consent]', { timeout: 10000 }).then(() => true).catch(() => false)
  if (!shown) { await page.screenshot({ path: join(SHOTS, '0-no-controls.png'), fullPage: true }); check('choosing the photo shows its controls', false); await ctx.close(); return }
  check('choosing it shows the consent note and no photo yet', (await text(page, '[data-author-photo-consent]')).includes('הסכים') && !!(await page.$('[data-author-photo-empty]')))

  await page.setInputFiles('#author-box-photo', files.gif)
  const refused = await page.waitForSelector('[data-author-photo-error="photo_type"]', { timeout: 10000 }).then(() => true).catch(() => false)
  check('a GIF is refused with our own sentence, nothing stored', refused && ((await stub('/__stub/storage')) || []).length === 0)

  await page.setInputFiles('#author-box-photo', files.png)
  const thumb = await page.waitForSelector('[data-author-photo-thumb]', { timeout: 30000 }).then(() => true).catch(() => false)
  const objects = (await stub('/__stub/storage')) || []
  const row = await styleRow()
  check('the upload stores ONE object in the private bucket at <project_id>/<uuid>.png', objects.length === 1 && PATH_SHAPE.test(objects[0]), objects.join(','))
  check('the owner\'s row points at it and the image is upload', row && row.user_id === USER_ID && `author-photos/${row.author_box_photo_path}` === objects[0] && row.author_box_image === 'upload', JSON.stringify(row && { p: row.author_box_photo_path, i: row.author_box_image }))
  await page.waitForSelector('[data-author-box-image]', { timeout: 15000 }).catch(() => {})
  const previewSrc = await page.$eval('[data-author-box-sample] img', (el) => el.getAttribute('src')).catch(() => '')
  check('the preview shows the photo through a signed address (never a public one)', thumb && /\/storage\/v1\/object\/sign\/author-photos\//.test(previewSrc) && !/object\/public/.test(previewSrc), previewSrc)
  await page.waitForFunction(() => [...document.querySelectorAll('[data-author-box-sample] img, [data-author-photo-thumb]')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {})
  const shot = join(SHOTS, '1-uploaded.png')
  await shootCard(page, shot)
  if (process.env.AUTHOR_PHOTO_SHOT) {
    mkdirSync(dirname(process.env.AUTHOR_PHOTO_SHOT), { recursive: true })
    copyFileSync(shot, process.env.AUTHOR_PHOTO_SHOT)
  }

  await page.click('[data-author-photo-delete]')
  let after = null
  for (let i = 0; i < 40; i++) { after = await styleRow(); if (after && after.author_box_photo_path == null) break; await page.waitForTimeout(250) }
  const left = (await stub('/__stub/storage')) || []
  check('delete removes the object from storage and clears the row (image back to none)', left.length === 0 && after && after.author_box_photo_path == null && after.author_box_image === 'none', JSON.stringify({ left, p: after && after.author_box_photo_path }))
  const removeCalls = ((await stub('/__stub/requests')) || []).filter((r) => r.method === 'DELETE' && r.path === '/storage/v1/object/author-photos')
  check('…through storage.remove on the bucket, as the service role', removeCalls.length === 1 && removeCalls[0].role === 'service_role')
  await ctx.close()
}

;(async () => {
  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENABLE_SEED_SCAN: 'true', ENABLE_CONTENT: 'true', CONTENT_CREDENTIALS_ENCRYPTION_KEY: KEY },
    })
  }
  const kill = () => { if (server) try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return }
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    await run(browser)
  } finally {
    await browser.close()
    kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exitCode = fail ? 1 : 0
})()
