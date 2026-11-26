/** GET (list the Pages this person manages) and POST (pick one for the project). 404 unless META_POSTS_ENABLED. */
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import { handleListPages, handleSelectPage } from '@/lib/meta-posts/http'
import { realMetaDeps } from '@/lib/meta-posts/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const off = () => Response.json({ error: 'Not found' }, { status: 404 })

export async function GET(req: Request) { return isMetaPostsEnabled() ? handleListPages(req, realMetaDeps) : off() }
export async function POST(req: Request) { return isMetaPostsEnabled() ? handleSelectPage(req, realMetaDeps) : off() }
