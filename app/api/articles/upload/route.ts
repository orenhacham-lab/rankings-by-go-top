import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'article-images'
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return null
  return user
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך. מותר: JPG, PNG, WEBP' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 5MB)' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const fileName = `article-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  // Service-role upload happens server-side only — never expose the key to the client.
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(fileName, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  })

  if (error) {
    return NextResponse.json(
      { error: `שגיאה בהעלאה: ${error.message}. ודא שה-bucket "${BUCKET}" קיים.` },
      { status: 500 }
    )
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(fileName)
  return NextResponse.json({ url: data.publicUrl })
}
