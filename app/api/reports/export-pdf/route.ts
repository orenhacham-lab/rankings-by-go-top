import { createClient } from '@/lib/supabase/server'
import { generateReportHTML, generateAIReportHTML } from '@/lib/export/pdf'
import { normalizeExportLanguage } from '@/lib/export/i18n'
import { Project, Client, TrackingTarget, ScanResult } from '@/lib/supabase/types'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { projectId, reportType, aiReportData } = body
    const language = normalizeExportLanguage(body.language)

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'projectId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Fetch project data
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*, clients(*)')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !projectData) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let html: string

    if (reportType === 'ai') {
      // Generate AI Visibility report
      if (!aiReportData || !aiReportData.summary) {
        return new Response(
          JSON.stringify({ error: 'AI report data is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      try {
        html = generateAIReportHTML({
          client: projectData.clients as Client,
          project: projectData as Project,
          summary: aiReportData.summary,
          results: aiReportData.results || [],
          language,
        })
      } catch (htmlError) {
        console.error('[export-pdf] AI HTML generation failed:', htmlError)
        return new Response(
          JSON.stringify({
            error: 'AI HTML generation failed',
            message: (htmlError as Error).message,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // Generate Google Organic / Maps report (existing logic)
      const { data: targetsData, error: targetsError } = await supabase
        .from('tracking_targets')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)

      if (targetsError || !targetsData) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch tracking targets' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Fetch latest scan results
      const targetIds = targetsData.map((t) => t.id)
      const { data: resultsData, error: resultsError } = await supabase
        .from('scan_results')
        .select('*')
        .in('tracking_target_id', targetIds)
        .order('checked_at', { ascending: false })

      if (resultsError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch scan results' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Build latest results map
      const latestResults: Record<string, ScanResult> = {}
      for (const result of resultsData || []) {
        if (!latestResults[result.tracking_target_id]) {
          latestResults[result.tracking_target_id] = result
        }
      }

      try {
        html = generateReportHTML({
          client: projectData.clients as Client,
          project: projectData as Project,
          targets: targetsData as TrackingTarget[],
          latestResults,
          language,
        })
      } catch (htmlError) {
        console.error('[export-pdf] HTML generation failed:', htmlError)
        return new Response(
          JSON.stringify({
            error: 'HTML generation failed',
            message: (htmlError as Error).message,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    console.log(`[export-pdf] HTML generated successfully, length=${html.length}`)

    // Send to PDFShift
    const apiKey = process.env.PDFSHIFT_API_KEY
    if (!apiKey) {
      console.error('[export-pdf] PDFSHIFT_API_KEY is not set in env')
      return new Response(
        JSON.stringify({ error: 'PDF service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const pdfShiftResponse = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: html,
        landscape: false,
      }),
    })

    if (!pdfShiftResponse.ok) {
      const errorText = await pdfShiftResponse.text()
      console.error('[export-pdf] PDFShift error:', pdfShiftResponse.status, errorText)
      return new Response(
        JSON.stringify({
          error: 'Failed to generate PDF',
          pdfShiftStatus: pdfShiftResponse.status,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const pdfBuffer = await pdfShiftResponse.arrayBuffer()

    // Return PDF with proper headers
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${projectId}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[export-pdf] Unhandled error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: (error as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
