'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createClientAction(formData: FormData) {
  console.log('[CreateClient] ACTION ENTRY')

  try {
    // Log form data contents
    const formDataObj: Record<string, string | null> = {}
    formData.forEach((value, key) => {
      formDataObj[key] = value as string
    })
    console.log('[CreateClient] FormData contents:', formDataObj)

    const supabase = await createClient()
    console.log('[CreateClient] Supabase client created')

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('[CreateClient] Auth getUser result:', { userId: user?.id, error: userError })

    if (userError) {
      console.error('[CreateClient] Auth error:', userError.message)
      throw new Error('שגיאה בקבלת פרטי משתמש')
    }
    if (!user) {
      console.error('[CreateClient] No authenticated user')
      throw new Error('משתמש לא מחובר')
    }

    const name = formData.get('name') as string
    if (!name || !name.trim()) {
      console.error('[CreateClient] Missing required field: name')
      throw new Error('שם הלקוח הוא שדה חובה')
    }

    const data = {
      user_id: user.id,
      name: name.trim(),
      contact_name: (formData.get('contact_name') as string) || null,
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      notes: (formData.get('notes') as string) || null,
      is_active: true,
    }

    // Log payload before insert
    console.log('[CreateClient] Insert payload:', {
      userId: user.id,
      payloadKeys: Object.keys(data),
      payloadValues: data,
    })

    const { data: insertResult, error } = await supabase.from('clients').insert(data)
    console.log('[CreateClient] Insert response:', { result: insertResult, error })

    if (error) {
      console.error('[CreateClient] Insert failed:', {
        message: error.message,
        code: error.code,
      })
      throw new Error(`שגיאה בהוספת לקוח: ${error.message}`)
    }

    console.log('[CreateClient] Insert successful, calling revalidatePath')
    revalidatePath('/clients')
    console.log('[CreateClient] revalidatePath completed')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאה בעיבוד הבקשה'
    console.error('[CreateClient] ACTION ERROR:', message, err)
    throw new Error(message)
  }
}

export async function updateClientAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const data = {
    name: formData.get('name') as string,
    contact_name: (formData.get('contact_name') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    notes: (formData.get('notes') as string) || null,
  }

  const { error } = await supabase.from('clients').update(data).eq('id', id)
  if (error) {
    console.error('[Clients] Update error:', error.message, error.code)
    throw new Error('שגיאה בעדכון לקוח')
  }

  revalidatePath('/clients')
}

export async function toggleClientActiveAction(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('clients')
    .update({ is_active: !isActive })
    .eq('id', id)
  if (error) {
    console.error('[Clients] Toggle error:', error.message, error.code)
    throw new Error('שגיאה בעדכון סטטוס הלקוח')
  }
  revalidatePath('/clients')
}
