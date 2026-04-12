'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createClientAction(formData: FormData) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) {
    console.error('[Clients] Auth error:', userError.message)
    throw new Error('שגיאה בקבלת פרטי משתמש')
  }
  if (!user) {
    console.error('[Clients] No authenticated user')
    throw new Error('משתמש לא מחובר')
  }

  const data = {
    user_id: user.id,
    name: formData.get('name') as string,
    contact_name: (formData.get('contact_name') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    notes: (formData.get('notes') as string) || null,
    is_active: true,
  }

  const { error } = await supabase.from('clients').insert(data)
  if (error) {
    console.error('[Clients] Insert error:', error.message, error.code)
    throw new Error('שגיאה בהוספת לקוח. בדוק שהנתונים תקינים.')
  }

  revalidatePath('/clients')
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
