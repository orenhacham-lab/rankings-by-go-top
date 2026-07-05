/**
 * Shared helpers for content-automation pool/queue API routes (Phase 4).
 * Ownership is derived from the row's project_id via authContentProject. Every
 * route is additionally gated by isContentAutomationEnabled().
 */

import { authContentProject, type ContentAuthResult } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveIntervalDays, type Cadence } from '@/lib/content/automation/schedule'

/** Missing table / column / CHECK → the Phase-1 automation migration isn't applied. */
export function isMigrationMissing(code: string | undefined): boolean {
  return code === '42P01' || code === '42703' || code === '23514'
}

export interface PoolRow {
  id: string
  project_id: string
  name: string
  cadence: Cadence
  interval_days: number | null
  publish_time: string | null
  timezone: string
  is_active: boolean
  next_publish_at: string | null
  publish_days: number[] | null
}

export interface PoolDTO {
  id: string
  projectId: string
  name: string
  cadence: Cadence
  intervalDays: number
  publishTime: string | null
  timezone: string
  isActive: boolean
  nextPublishAt: string | null
  publishDays: number[]
}

export function toPoolDTO(row: PoolRow): PoolDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    cadence: row.cadence,
    intervalDays: resolveIntervalDays(row.cadence, row.interval_days),
    publishTime: row.publish_time,
    timezone: row.timezone,
    isActive: row.is_active,
    nextPublishAt: row.next_publish_at,
    publishDays: Array.isArray(row.publish_days) ? row.publish_days : [],
  }
}

type OwnedPool = { auth: Extract<ContentAuthResult, { user: unknown }>; pool: PoolRow }
type OwnedItem = { auth: Extract<ContentAuthResult, { user: unknown }>; item: { id: string; project_id: string; pool_id: string; status: string; topic_id: string | null } }

/** Load a pool + verify the caller owns its project. */
export async function authPool(poolId: string): Promise<OwnedPool | { error: string; status: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('article_pools')
    .select('id, project_id, name, cadence, interval_days, publish_time, timezone, is_active, next_publish_at, publish_days')
    .eq('id', poolId)
    .maybeSingle()
  if (error) {
    if (isMigrationMissing((error as { code?: string }).code)) return { error: 'automation_migration_required', status: 503 }
    return { error: 'Failed to load pool', status: 500 }
  }
  if (!data) return { error: 'Pool not found', status: 404 }
  const auth = await authContentProject((data as PoolRow).project_id)
  if ('error' in auth) return { error: auth.error, status: auth.status }
  return { auth, pool: data as PoolRow }
}

/** Load a queue item + verify the caller owns its project. */
export async function authItem(itemId: string): Promise<OwnedItem | { error: string; status: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('article_pool_items')
    .select('id, project_id, pool_id, status, topic_id')
    .eq('id', itemId)
    .maybeSingle()
  if (error) {
    if (isMigrationMissing((error as { code?: string }).code)) return { error: 'automation_migration_required', status: 503 }
    return { error: 'Failed to load item', status: 500 }
  }
  if (!data) return { error: 'Item not found', status: 404 }
  const auth = await authContentProject((data as { project_id: string }).project_id)
  if ('error' in auth) return { error: auth.error, status: auth.status }
  return { auth, item: data as OwnedItem['item'] }
}
