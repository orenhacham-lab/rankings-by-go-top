'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createClientAction(formData: FormData) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: 'משתמש לא מחובר' }
    }

    const name = formData.get('name') as string
    if (!name || !name.trim()) {
      return { success: false, error: 'שם הלקוח הוא שדה חובה' }
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

    const { data: insertedClient, error } = await supabase
      .from('clients')
      .insert([data])
      .select()
      .single()

    if (error) {
      console.error('[CreateClient] Insert failed:', error)
      return { success: false, error: `שגיאה בהוספת לקוח: ${error.message}` }
    }

    console.log('[CreateClient] Insert successful:', insertedClient)

    revalidatePath('/clients')

    return { success: true }
  } catch (err) {
    console.error('[CreateClient] ACTION ERROR:', err)
    return { success: false, error: 'שגיאה בעיבוד הבקשה' }
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