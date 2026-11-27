/** POST /api/video-studio/generate — make one clip from photos. 404 unless VIDEO_STUDIO_ENABLED. */
import { handleGenerate } from '@/lib/video-studio/http'
import { realVideoDeps } from '@/lib/video-studio/route-deps'

export const runtime = 'nodejs'
// Generation takes well under a minute; 300 is the ceiling this project already uses.
export const maxDuration = 300

export async function POST(req: Request) {
  return handleGenerate(req, realVideoDeps)
}
