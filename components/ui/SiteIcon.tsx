'use client'

/**
 * A project's site icon, loaded by the owner's browser straight from the site,
 * with the project's initial wherever there is no icon (lib/site-icon.ts says
 * where the icon comes from and what is accepted).
 *
 * The initial is what shows first, and stays when no icon loads: the <img>
 * sits invisible over it until the icon has really decoded, so a missing icon,
 * a 404 page served as /favicon.ico or a slow site never shows a broken image
 * or moves anything. An icon that failed once is not asked for again in this
 * tab. A plain <img>, not next/image: the optimizer would fetch the site's URL
 * from our server. No referrer is sent.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { siteIconCandidates } from '@/lib/site-icon'
import { cn } from '@/lib/utils'

/** URLs that did not load in this tab: never asked for twice. */
const failed = new Set<string>()

/** A real icon has some size: a 1x1 answer is a tracking pixel or a placeholder. */
export const isIconSize = (w: number, h: number) => w > 1 && h > 1
/** An SVG by its path (the query string aside). */
export const isSvg = (src: string | null) => !!src && /\.svg$/i.test(src.split(/[?#]/)[0])

/** What the mount check needs of an <img>. */
export type MountedImage = Pick<HTMLImageElement, 'complete' | 'naturalWidth' | 'naturalHeight'> & { decode?: () => Promise<void> }

/**
 * An <img> that may have finished before React attached its load and error
 * handlers (server-rendered markup that loaded or failed before hydration).
 * `complete` alone does not say it failed: a complete image with no size can be
 * one whose request never reached us, or one not decoded yet. So it is decoded
 * first, and decode() gives the real outcome: it resolves for an image that
 * loaded and rejects for a broken one (including one that errored before
 * hydration). The returned cleanup cancels a pending decode, so a candidate the
 * tile has already moved past, or an unmounted tile, can never advance it.
 */
export function checkMountedImage(img: MountedImage | null, on: { load: (img: MountedImage) => void; fail: () => void }): () => void {
  let cancelled = false
  const cancel = () => { cancelled = true }
  if (!img || !img.complete) return cancel
  if (img.naturalWidth > 0) { on.load(img); return cancel }
  if (typeof img.decode !== 'function') { on.fail(); return cancel }
  img.decode().then(
    () => { if (!cancelled) on.load(img) },
    () => { if (!cancelled) on.fail() },
  )
  return cancel
}

type Props = {
  /** The project's target_domain. */
  domain: string | null | undefined
  /** The icon its scan found in the HTML, when known. */
  icon?: string | null
  /** What shows without an icon: the project's initial, as before. */
  fallback: ReactNode
  /** The tile, as it looks with the initial. */
  className?: string
  /** The tile, as it looks with an icon in it (a light plate, so any icon reads). */
  iconClassName?: string
  imgClassName?: string
}

export default function SiteIcon(props: Props) {
  const candidates = siteIconCandidates(props.domain, props.icon).filter((u) => !failed.has(u))
  // A different project (or icon) starts over, from its first candidate.
  return <Tile key={candidates.join(' ')} {...props} candidates={candidates} />
}

function Tile({ candidates, fallback, className, iconClassName, imgClassName }: Props & { candidates: string[] }) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const src = candidates[index] ?? null
  const imgRef = useRef<HTMLImageElement>(null)

  // Each candidate is settled once: its load or error event and the mount
  // check below may both report it, and only the first may advance the index.
  const settled = useRef<string | null>(null)
  const next = () => {
    if (src) {
      if (settled.current === src) return
      settled.current = src
      failed.add(src)
    }
    setLoaded(false)
    setIndex((i) => i + 1)
  }
  const onLoad = (img: MountedImage) => {
    if (src && settled.current === src) return
    // A page served as an icon does not decode (it errors); a 1x1 answer is not
    // an icon either. An SVG icon with only a viewBox decodes with no intrinsic
    // size in some browsers (0x0): it loaded, so it is shown.
    if (isIconSize(img.naturalWidth, img.naturalHeight) || (isSvg(src) && img.naturalWidth === 0 && img.naturalHeight === 0)) {
      settled.current = src
      setLoaded(true)
    } else next()
  }

  // The image may have finished before React attached its handlers (server-rendered markup).
  useEffect(() => {
    if (loaded) return
    return checkMountedImage(imgRef.current, { load: onLoad, fail: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const shown = loaded && !!src
  return (
    <span
      aria-hidden="true"
      data-site-icon={shown ? 'icon' : 'initial'}
      className={cn('relative overflow-hidden', shown ? iconClassName ?? className : className)}
    >
      {!shown && fallback}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- the site's own icon, loaded by the browser; next/image would fetch it server-side
        <img
          ref={imgRef}
          key={src}
          src={src}
          alt=""
          width={32}
          height={32}
          referrerPolicy="no-referrer"
          decoding="async"
          draggable={false}
          onLoad={(e) => onLoad(e.currentTarget)}
          onError={next}
          className={cn(shown ? 'block size-full object-contain' : 'pointer-events-none absolute inset-0 size-full opacity-0', imgClassName)}
        />
      )}
    </span>
  )
}
