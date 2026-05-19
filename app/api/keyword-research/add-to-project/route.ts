import { createClient } from '@/lib/supabase/server'
import { getUserEntitlement } from '@/lib/subscription'

interface KeywordToAdd {
  keyword: string
}

interface AddKeywordsRequest {
  projectId: string
  engineType: 'google_organic' | 'google_maps'
  keywords: KeywordToAdd[]
}

interface AddKeywordsResult {
  success: boolean
  added: number
  skipped: number
  errors: Array<{ keyword: string; reason: string }>
  message?: string
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { success: false, message: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId : ''
    const engineType = typeof body.engineType === 'string' ? body.engineType : ''
    const rawKeywords = Array.isArray(body.keywords) ? body.keywords : []

    if (!projectId) {
      return Response.json(
        { success: false, message: 'Project ID is required' },
        { status: 400 }
      )
    }

    if (!engineType || !['google_organic', 'google_maps'].includes(engineType)) {
      return Response.json(
        { success: false, message: 'Invalid engine type' },
        { status: 400 }
      )
    }

    if (rawKeywords.length === 0) {
      return Response.json(
        { success: false, message: 'At least one keyword is required' },
        { status: 400 }
      )
    }

    // Extract and deduplicate keywords
    const keywords = [
      ...new Set(
        rawKeywords
          .filter((k: unknown) => typeof k === 'object' && k !== null && 'keyword' in k)
          .map((k: KeywordToAdd) => (k.keyword as string).trim().toLowerCase())
          .filter((k: string) => k.length > 0)
      ),
    ]

    if (keywords.length === 0) {
      return Response.json(
        { success: false, message: 'No valid keywords provided' },
        { status: 400 }
      )
    }

    // Verify project belongs to user
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return Response.json(
        { success: false, message: 'Project not found or access denied' },
        { status: 403 }
      )
    }

    // Check quota
    const entitlement = await getUserEntitlement(user.id, supabase)
    if (!entitlement.isAdmin) {
      const { count: currentCount } = await supabase
        .from('tracking_targets')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('is_active', true)

      const currentKeywords = currentCount ?? 0
      const availableSlots = entitlement.limits.maxKeywordsPerProject - currentKeywords

      if (availableSlots <= 0) {
        return Response.json(
          {
            success: false,
            message: `Keyword limit reached for this project (${entitlement.limits.maxKeywordsPerProject})`,
            added: 0,
            skipped: keywords.length,
            errors: keywords.map((k) => ({
              keyword: k,
              reason: 'Project quota exceeded',
            })),
          } as AddKeywordsResult,
          { status: 402 }
        )
      }

      if (keywords.length > availableSlots) {
        const excess = keywords.slice(availableSlots)
        keywords.splice(availableSlots)
      }
    }

    // Fetch existing keywords to avoid duplicates
    const { data: existing } = await supabase
      .from('tracking_targets')
      .select('keyword')
      .eq('project_id', projectId)

    const existingSet = new Set(
      (existing || []).map((r) => (r.keyword as string).trim().toLowerCase())
    )

    // Separate keywords into new and duplicates
    const newKeywords: string[] = []
    const duplicates: string[] = []

    for (const kw of keywords) {
      if (existingSet.has(kw.toLowerCase())) {
        duplicates.push(kw)
      } else {
        newKeywords.push(kw)
      }
    }

    // Insert new keywords
    const toInsert = newKeywords.map((keyword) => ({
      user_id: user.id,
      project_id: projectId,
      keyword: keyword,
      engine_type: engineType,
      target_domain: null,
      target_business_name: null,
      preferred_landing_page: null,
      notes: 'Added from Keyword Research module',
      location_mode: 'project',
      custom_city: null,
      grid_size: null,
      postal_code: null,
      is_active: true,
    }))

    let insertedCount = 0
    if (toInsert.length > 0) {
      const { error } = await supabase.from('tracking_targets').insert(toInsert)

      if (error) {
        return Response.json(
          {
            success: false,
            message: `Error adding keywords: ${error.message}`,
            added: 0,
            skipped: keywords.length,
            errors: keywords.map((k) => ({
              keyword: k,
              reason: 'Database error',
            })),
          } as AddKeywordsResult,
          { status: 500 }
        )
      }

      insertedCount = toInsert.length
    }

    return Response.json({
      success: true,
      added: insertedCount,
      skipped: duplicates.length,
      errors: duplicates.map((k) => ({
        keyword: k,
        reason: 'Keyword already exists in project',
      })),
      message: `Added ${insertedCount} keywords${duplicates.length > 0 ? ` (${duplicates.length} already existed)` : ''}`,
    } as AddKeywordsResult)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[add-to-project] error:', errorMsg)
    return Response.json(
      { success: false, message: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
