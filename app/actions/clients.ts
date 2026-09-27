'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { deleteOwnedRecord, type DeleteOwnedResult } from '@/lib/data/delete-owned-record'
import { actionMessages, asActionResult, type ActionResult } from '@/lib/i18n/action-messages'
import { UserFacingError } from '@/lib/i18n/user-facing-error'

// Note: createClientAction is deprecated - client creation now uses API route /api/clients/create
// Kept here for backwards compatibility if needed
export async function createClientAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  const { m } = await actionMessages(user?.user_metadata?.locale)
  if (userError) {
    throw new UserFacingError(m.userLookupFailed)
  }
  if (!user) {
    throw new UserFacingError(m.notSignedIn)
  }

  const name = formData.get('name') as string
  if (!name || !name.trim()) {
    throw new UserFacingError(m.clientNameRequired)
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
    // The database's own message is logged by name, never shown.
    console.error('[Clients] Create error:', error.code)
    throw new UserFacingError(m.clientCreateFailed)
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
    throw new UserFacingError((await actionMessages()).m.clientUpdateFailed)
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
    throw new UserFacingError((await actionMessages()).m.clientStatusFailed)
  }
  revalidatePath('/clients')
}

/**
 * Area I — PERMANENT delete of a client. Ownership-enforced; the DB's ON DELETE
 * CASCADE removes the client's projects and all their dependents. Reversible
 * deactivation stays a separate action (toggleClientActiveAction). Returns a typed
 * result (never throws) so the confirmation dialog can show a clear outcome.
 */
export async function deleteClientAction(id: string): Promise<DeleteOwnedResult | { ok: false; error: 'not_authenticated' }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }
  const res = await deleteOwnedRecord(supabase, 'clients', id, user.id)
  if (res.ok) {
    // A client delete cascades to its projects → refresh both lists.
    revalidatePath('/clients')
    revalidatePath('/projects')
  }
  return res
}

/** The client form's save: updateClientAction, with its refusal returned in the merchant's language. */
export async function saveClientAction(id: string, formData: FormData): Promise<ActionResult<object>> {
  return asActionResult(() => updateClientAction(id, formData), 'clients')
}
