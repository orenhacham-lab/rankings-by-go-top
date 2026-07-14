/**
 * WordPress publish error-transparency QA — offline, no network.
 * Proves the typed error mapping, safe Hebrew messages, secret-free diagnostics,
 * and that the low-level client enriches errors with structured meta. It does NOT
 * hit a live WordPress site (that is the Buy Buy republish trace).
 */
import {
  buildWordPressResponseError,
  sniffResponseFormat,
  WordPressClientError,
} from '../../wordpress/client'
import {
  classifyWordPressError,
  hebrewMessageFor,
  httpStatusFor,
  safeRemoteDiagnostics,
  type WpPublishErrorCode,
} from '../wordpress-error'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const clientErr = (meta: ConstructorParameters<typeof WordPressClientError>[1]) => new WordPressClientError('x', meta)

async function main() {
  console.log('A) low-level client enriches errors with SECRET-FREE structured meta')
  {
    const e401 = buildWordPressResponseError(401, 'application/json', JSON.stringify({ code: 'rest_cannot_create', message: 'Sorry, you are not allowed to do that.' }))
    check('401 → status meta present', e401.meta.status === 401)
    check('401 preserves the WordPress REST code', e401.meta.wpCode === 'rest_cannot_create')
    check('401 preserves a sanitized upstream message', e401.meta.sanitizedMessage === 'Sorry, you are not allowed to do that.')
    check('401 message string unchanged (other branches still match)', /Authentication failed/.test(e401.message))

    const e404 = buildWordPressResponseError(404, 'application/json', '{}')
    check('404 → status meta present', e404.meta.status === 404)
    check('404 message string unchanged', /REST API not found/.test(e404.message))

    const eHtml = buildWordPressResponseError(403, 'text/html', '<!doctype html><html><body>blocked by firewall</body></html>')
    check('403 HTML response → responseFormat html', eHtml.meta.responseFormat === 'html')
    check('403 HTML response records NO wpCode/sanitizedMessage (not JSON)', !eHtml.meta.wpCode && !eHtml.meta.sanitizedMessage)
    check('sanitized message strips tags from a JSON error body', buildWordPressResponseError(400, 'application/json', JSON.stringify({ code: 'x', message: '<b>bad</b> value' })).meta.sanitizedMessage === 'bad value')

    check('sniff: json content-type', sniffResponseFormat('application/json', '{"a":1}') === 'json')
    check('sniff: html content-type', sniffResponseFormat('text/html', '<html></html>') === 'html')
    check('sniff: empty body', sniffResponseFormat('', '') === 'empty')
    check('meta records body LENGTH, never body content', typeof eHtml.meta.bodyLength === 'number' && eHtml.meta.bodyLength! > 0)
  }

  console.log('B) typed classification — transport/auth signals win, no flattening')
  {
    check('1/2. 401 → wordpress_auth_failed', classifyWordPressError(clientErr({ status: 401 })) === 'wordpress_auth_failed')
    check('3. 403 JSON → wordpress_forbidden', classifyWordPressError(clientErr({ status: 403, responseFormat: 'json' })) === 'wordpress_forbidden')
    check('3. 403 HTML → wordpress_rest_blocked', classifyWordPressError(clientErr({ status: 403, responseFormat: 'html' })) === 'wordpress_rest_blocked')
    check('4. 404 → wordpress_not_found', classifyWordPressError(clientErr({ status: 404 })) === 'wordpress_not_found')
    check('6. timeout → wordpress_timeout', classifyWordPressError(clientErr({ timeout: true })) === 'wordpress_timeout')
    check('5. non-JSON 2xx (HTML) → wordpress_non_json_response', classifyWordPressError(clientErr({ status: 200, responseFormat: 'html' })) === 'wordpress_non_json_response')
    check('5. non-JSON "other" → wordpress_non_json_response', classifyWordPressError(clientErr({ status: 200, responseFormat: 'other' })) === 'wordpress_non_json_response')
    check('5xx → wordpress_server_error', classifyWordPressError(clientErr({ status: 502, responseFormat: 'json' })) === 'wordpress_server_error')
    check('7. WP JSON validation code → wordpress_invalid_payload', classifyWordPressError(clientErr({ status: 400, responseFormat: 'json', wpCode: 'rest_invalid_param' })) === 'wordpress_invalid_payload')
    check('WP term code → wordpress_category_invalid', classifyWordPressError(clientErr({ status: 400, responseFormat: 'json', wpCode: 'rest_invalid_term_id' })) === 'wordpress_category_invalid')
    check('WP author code → wordpress_author_invalid', classifyWordPressError(clientErr({ status: 400, responseFormat: 'json', wpCode: 'rest_invalid_author' })) === 'wordpress_author_invalid')
    check('WP media code → wordpress_media_invalid', classifyWordPressError(clientErr({ status: 400, responseFormat: 'json', wpCode: 'rest_upload_no_data' })) === 'wordpress_media_invalid')
    // Auth/transport ALWAYS beats stage: a 401 during media upload is still auth.
    check('auth beats stage: 401 during media_upload → auth_failed', classifyWordPressError(clientErr({ status: 401 }), { stage: 'media_upload' }) === 'wordpress_auth_failed')
    check('stage media_upload w/ empty meta → wordpress_media_invalid', classifyWordPressError(clientErr({}), { stage: 'media_upload' }) === 'wordpress_media_invalid')
    check('stage taxonomy_resolution w/ empty meta → wordpress_category_invalid', classifyWordPressError(clientErr({}), { stage: 'taxonomy_resolution' }) === 'wordpress_category_invalid')
    check('generic empty WP error → wordpress_publish_failed (not flattened away)', classifyWordPressError(clientErr({})) === 'wordpress_publish_failed')
    check('8. a plain non-WordPress throw → unexpected_publish_error', classifyWordPressError(new Error('boom')) === 'unexpected_publish_error')
    check('8. null/undefined throw → unexpected_publish_error', classifyWordPressError(undefined) === 'unexpected_publish_error')
    // A cross-module WordPressClientError (name-matched, not instanceof) still classifies.
    const foreign = { name: 'WordPressClientError', message: 'x', meta: { status: 404 } }
    check('cross-boundary WordPressClientError still classified', classifyWordPressError(foreign) === 'wordpress_not_found')
  }

  console.log('C) exact safe Hebrew messages (as supplied) + interpolation')
  {
    const exact: Partial<Record<WpPublishErrorCode, string>> = {
      wordpress_auth_failed: 'האימות מול אתר WordPress נכשל. יש לבדוק את שם המשתמש וסיסמת האפליקציה.',
      wordpress_forbidden: 'למשתמש WordPress אין הרשאה לפרסם מאמרים באתר.',
      wordpress_rest_blocked: 'ממשק ה-REST של WordPress חסום על ידי האתר, תוסף אבטחה או חומת אש.',
      wordpress_non_json_response: 'האתר החזיר תגובה לא תקינה במקום תשובת WordPress. ייתכן שקיימת חסימה של Cloudflare או תוסף אבטחה.',
      wordpress_timeout: 'החיבור לאתר WordPress הסתיים עקב חריגה מזמן ההמתנה.',
      wordpress_credentials_decryption_failed: 'לא ניתן לקרוא את פרטי החיבור השמורים. יש לחבר מחדש את אתר WordPress.',
    }
    for (const [code, text] of Object.entries(exact)) {
      check(`exact Hebrew for ${code}`, hebrewMessageFor(code as WpPublishErrorCode, 'diag-1') === text)
    }
    const unexpected = hebrewMessageFor('unexpected_publish_error', 'diag-XYZ')
    check('unexpected_publish_error interpolates the diagnosticId', unexpected.includes('diag-XYZ') && !unexpected.includes('{diagnosticId}'))
    check('every typed code has a non-empty Hebrew message', (['wordpress_connection_missing','wordpress_credentials_invalid','wordpress_credentials_decryption_failed','wordpress_auth_failed','wordpress_forbidden','wordpress_rest_blocked','wordpress_not_found','wordpress_timeout','wordpress_non_json_response','wordpress_invalid_payload','wordpress_category_invalid','wordpress_author_invalid','wordpress_media_invalid','wordpress_server_error','wordpress_publish_failed','unexpected_publish_error'] as WpPublishErrorCode[]).every((c) => hebrewMessageFor(c, 'd').trim().length > 0))
    check('http statuses map sensibly (401/403/404/timeout/unexpected)', httpStatusFor('wordpress_auth_failed') === 401 && httpStatusFor('wordpress_forbidden') === 403 && httpStatusFor('wordpress_not_found') === 404 && httpStatusFor('wordpress_timeout') === 504 && httpStatusFor('unexpected_publish_error') === 500)
  }

  console.log('D) 9. diagnostics are SECRET-FREE (no credentials/headers/body content)')
  {
    const diag = safeRemoteDiagnostics({ status: 502, contentType: 'text/html', wpCode: 'rest_x', sanitizedMessage: 'nope', bodyLength: 1234, responseFormat: 'html' })
    const keys = Object.keys(diag).sort()
    const allowed = ['remoteContentType','remoteHttpStatus','remoteWordPressCode','responseBodyLength','responseWasHtml','responseWasJson','sanitizedRemoteMessage','timeout'].sort()
    check('diagnostics expose ONLY the safe allowlisted keys', JSON.stringify(keys) === JSON.stringify(allowed))
    const blob = JSON.stringify(diag).toLowerCase()
    check('diagnostics never contain auth/password/cookie/token fields', !/authorization|password|cookie|secret|application_?password|token|apikey|api_key/.test(blob))
    check('diagnostics carry body LENGTH, never body content', diag.responseBodyLength === 1234)
    check('diagnostics reflect response shape flags', diag.responseWasHtml === true && diag.responseWasJson === false)
    check('empty meta → all-null diagnostics (no leakage)', (() => { const d = safeRemoteDiagnostics(undefined); return d.remoteHttpStatus === null && d.remoteWordPressCode === null && d.sanitizedRemoteMessage === null && d.timeout === false })())
  }

  console.log('E) route wiring — safe boundary, typed shape, alerts independence')
  {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const routeSrc = readFileSync(join(__dirname, '../../../app/api/content/articles/[id]/wordpress/route.ts'), 'utf8')
    const publishSrc = readFileSync(join(__dirname, '../wordpress-publish.ts'), 'utf8')

    check('route has a top-level try/catch boundary', /try\s*\{/.test(routeSrc) && /catch\s*\{[\s\S]*unexpected_publish_error/.test(routeSrc))
    check('route returns the { ok:false, error, message, diagnosticId } shape', /ok:\s*false/.test(routeSrc) && /message:\s*hebrewMessageFor/.test(routeSrc) && /diagnosticId/.test(routeSrc))
    check('route emits the [content-wp-export] publish failed structured log', /\[content-wp-export\] publish failed/.test(routeSrc))
    check('route log includes failureStage', /failureStage/.test(routeSrc))
    check('10./11. route NEVER references content_automation_alerts (independent)', !/content_automation_alerts/.test(routeSrc))
    check('route never logs Authorization/application password/cookie', !/authorization|application_password|applicationPassword|\bcookie\b/i.test(routeSrc))
    check('publish core threads stage + secret-free wpErrorMeta (no flattening)', /stage:\s*'post_creation'/.test(publishSrc) && /wpErrorMeta/.test(publishSrc))
    check('publish core no longer emits only wordpress_post_failed', !/wordpress_post_failed/.test(routeSrc))
  }

  console.log('F) 12. recommendation cost-control invariants untouched by Part 2')
  {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const modelSrc = readFileSync(join(__dirname, '../recommendations/model.ts'), 'utf8')
    check('reco primary model still Flash-only default', /RECOMMENDATION_MODEL_PRIMARY[\s\S]*gemini-2\.5-flash/.test(modelSrc))
    check('billing circuit breaker still present', /BillingExhaustedError/.test(modelSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
