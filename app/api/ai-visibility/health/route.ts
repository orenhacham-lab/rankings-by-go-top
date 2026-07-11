/**
 * Temporary diagnostic endpoint for Phase 2-C verification
 * Safe: does not expose API keys, only boolean flags
 * Remove after verification completes
 */

export async function GET() {
  const enableFlag = process.env.ENABLE_AI_VISIBILITY === 'true'
  const hasKey = !!process.env.SCRAPELLM_API_KEY

  return Response.json({
    route_exists: true,
    feature_enabled: enableFlag,
    has_scrapellm_key: hasKey,
    timestamp: new Date().toISOString(),
  })
}
