'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createClientAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('המשתמש לא מחובר')
  }

  const data = {
    name: formData.get('name') as string,
    contact_name: (formData.get('contact_name') as string) || null,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    notes: (formData.get('notes') as string) || null,
    is_active: true,
    user_id: user.id,
  }

  const { error } = await supabase.from('clients').insert(data)
  if (error) {
    console.error('createClientAction error:', error)
    throw new Error(error.message)
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
    console.error('updateClientAction error:', error)
    throw new Error(error.message)
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
    console.error('toggleClientActiveAction error:', error)
    throw new Error(error.message)
  }

  revalidatePath('/clients')
}