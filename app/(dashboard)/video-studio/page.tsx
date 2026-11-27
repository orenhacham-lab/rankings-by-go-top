/** The video studio screen. A 404 unless VIDEO_STUDIO_ENABLED, whatever else is true. */
import { notFound } from 'next/navigation'
import { isVideoStudioEnabled } from '@/lib/video-studio/config'
import VideoStudioView from '@/components/video-studio/VideoStudioView'

export const dynamic = 'force-dynamic'

export default function VideoStudioPage() {
  if (!isVideoStudioEnabled()) notFound()
  return <VideoStudioView />
}
