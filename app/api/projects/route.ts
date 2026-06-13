import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, business_name, target_domain')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      projects: projects || [],
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[projects list] error:', errorMsg)
    return Response.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
