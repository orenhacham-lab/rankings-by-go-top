/**
 * POST creates drafts, PATCH edits a draft, DELETE cancels what has not gone out.
 * Nothing here publishes: only /api/meta/approve does. 404 unless META_POSTS_ENABLED.
 */
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import { handleCreateDrafts, handleEditDraft, handleCancel } from '@/lib/meta-posts/http'
import { realMetaDeps } from '@/lib/meta-posts/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const off = () => Response.json({ error: 'Not found' }, { status: 404 })

export async function POST(req: Request) { return isMetaPostsEnabled() ? handleCreateDrafts(req, realMetaDeps) : off() }
export async function PATCH(req: Request) { return isMetaPostsEnabled() ? handleEditDraft(req, realMetaDeps) : off() }
export async function DELETE(req: Request) { return isMetaPostsEnabled() ? handleCancel(req, realMetaDeps) : off() }
