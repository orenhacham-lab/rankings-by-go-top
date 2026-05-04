import { createClient } from '@/lib/supabase/server'
import { generateReportHTML } from '@/lib/export/pdf'
import { Project, Client, TrackingTarget, ScanResult } from '@/lib/supabase/types'

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json()

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

    // Fetch tracking targets
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

    // Generate HTML
    let html: string
    try {
      html = generateReportHTML({
        client: projectData.clients as Client,
        project: projectData as Project,
        targets: targetsData as TrackingTarget[],
        latestResults,
      })
    } catch (htmlError) {
      console.error('[export-pdf] HTML generation failed:', htmlError)
      return new Response(
        JSON.stringify({
          error: 'HTML generation failed',
          message: (htmlError as Error).message,
          stack: (htmlError as Error).stack,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[export-pdf] HTML generated successfully, length=${html.length}`)
    console.log(`[export-pdf] targets=${targetsData.length}, results=${Object.keys(latestResults).length}`)

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
        use_print_media: true,
      }),
    })

    if (!pdfShiftResponse.ok) {
      const errorText = await pdfShiftResponse.text()
      console.error('[export-pdf] PDFShift error:', pdfShiftResponse.status, errorText)
      return new Response(
        JSON.stringify({
          error: 'Failed to generate PDF',
          pdfShiftStatus: pdfShiftResponse.status,
          pdfShiftBody: errorText.slice(0, 500),
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
        stack: (error as Error).stack,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
