'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Note: createClientAction is deprecated - client creation now uses API route /api/clients/create
// Kept here for backwards compatibility if needed
export async function createClientAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) {
    throw new Error('שגיאה בקבלת פרטי משתמש')
  }
  if (!user) {
    throw new Error('משתמש לא מחובר')
  }

  const name = formData.get('name') as string
  if (!name || !name.trim()) {
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

  const { error } = await supabase.from('clients').insert(data)
  if (error) {
    throw new Error(`שגיאה בהוספת לקוח: ${error.message}`)
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
