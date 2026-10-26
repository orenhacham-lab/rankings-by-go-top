'use client'

/**
 * "Writing guidelines": the owner's word on how the business's articles are
 * written (lib/content/writing-guidance). Standing instructions, what the
 * business does not offer, and the rules kept from notes left on articles.
 * Its own load and its own save; nothing here touches the article design.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { NotebookPen, Plus, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Switch from '@/components/ui/Switch'
import Segmented from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import SettingsCard, { FieldLabel, fieldClass } from './SettingsCard'
import SaveBar, { showSaveBar, type SaveState } from './SaveBar'
import Notice from './Notice'
import { bidiField } from './copy'
import { SECTION } from './anchors'
import {
  deleteAuthorPhotoAction, loadWritingGuidanceAction, previewAuthorBoxAction, saveWritingGuidanceAction, uploadAuthorPhotoAction,
} from '@/app/(dashboard)/settings/writing-guidance-actions'
import { AUTHOR_PHOTO_ACCEPT, AUTHOR_PHOTO_MAX_BYTES } from '@/lib/content/author-box/photo-file'
import {
  AUTHOR_BOX_HEADINGS, AUTHOR_BOX_IMAGE_CHOICES, AUTHOR_BOX_IMAGE_SIZE, AUTHOR_BOX_LIMITS, authorBoxContent, normalizeAuthorBoxUrl, resolveAuthorName,
  type AuthorBoxImageChoice,
} from '@/lib/content/author-box/box'
import type { AuthorBoxPreview } from '@/lib/content/author-box/preview'
import { readArticleSettings } from './article-settings-load'
import { cleanLine, GUIDANCE_LIMITS, sameGuidance, type WritingGuidance } from '@/lib/content/writing-guidance/guidance'
import type { GuidanceView } from '@/lib/content/writing-guidance/data'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

type Props = { projectId: string; t: DashboardDictionary['projectSettings'] }

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))

export function useWritingGuidance(projectId: string) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; data: GuidanceView } | { status: 'failed' }>({ status: 'loading' })
  const latest = useRef(0)
  const load = useCallback(() => {
    const mine = ++latest.current
    return readArticleSettings(() => loadWritingGuidanceAction(projectId), { stale: () => mine !== latest.current }).then((res) => {
      if (mine !== latest.current) return
      setState((prev) => (res?.ok ? { status: 'ready', data: res.data } : prev.status === 'ready' ? prev : { status: 'failed' }))
    })
  }, [projectId])
  useEffect(() => { void load() }, [load])
  const setData = useCallback((data: GuidanceView) => { latest.current++; setState({ status: 'ready', data }) }, [])
  return { state, reload: () => { setState({ status: 'loading' }); return load() }, setData }
}

export default function WritingGuidanceCard({ projectId, t }: Props) {
  const w = t.writingGuidance
  const { state, reload, setData } = useWritingGuidance(projectId)

  if (state.status === 'failed') {
    return (
      <section id={SECTION.writingGuidance} className="scroll-mt-20">
        <Notice tone="bad" action={{ label: w.retry, onClick: () => void reload() }}>{w.loadFailed}</Notice>
      </section>
    )
  }
  if (state.status === 'loading') {
    return (
      <div id={SECTION.writingGuidance} aria-busy="true" data-writing-guidance="loading" className="scroll-mt-20 rounded-card border border-line bg-surface p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
        <Skeleton className="mt-5 h-24 w-full" />
      </div>
    )
  }
  return <GuidanceForm key={projectId} projectId={projectId} view={state.data} onData={setData} t={t} />
}

function GuidanceForm({ projectId, view, onData, t }: { projectId: string; view: GuidanceView; onData: (v: GuidanceView) => void; t: Props['t'] }) {
  const w = t.writingGuidance
  const saved = view.guidance
  const [draft, setDraft] = useState<WritingGuidance>(saved)
  const [pending, setPending] = useState('')
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [tooLong, setTooLong] = useState(false)
  const [authorBox, setAuthorBox] = useState(view.authorBox)
  const [boxName, setBoxName] = useState(view.authorBoxName)
  const [boxLine, setBoxLine] = useState(view.authorBoxLine)
  const [boxUrl, setBoxUrl] = useState(view.authorBoxUrl)
  const [boxImage, setBoxImage] = useState<AuthorBoxImageChoice>(view.authorBoxImage)
  const [urlInvalid, setUrlInvalid] = useState(false)
  const boxDirty = authorBox !== view.authorBox || boxName !== view.authorBoxName || boxLine !== view.authorBoxLine || boxUrl !== view.authorBoxUrl || boxImage !== view.authorBoxImage
  const dirty = !sameGuidance(draft, saved) || boxDirty
  const disabled = !view.editable

  const addExclusion = () => {
    const item = cleanLine(pending, GUIDANCE_LIMITS.exclusion)
    if (!item) return
    if (!draft.exclusions.some((x) => x.toLocaleLowerCase() === item.toLocaleLowerCase()) && draft.exclusions.length < GUIDANCE_LIMITS.exclusions) {
      setDraft({ ...draft, exclusions: [...draft.exclusions, item] })
    }
    setPending('')
  }

  const onSave = async () => {
    setTooLong(false)
    // The same check the server makes (normalizeAuthorBoxUrl): http(s) only.
    if (view.authorBoxOverridesEditable && boxUrl.trim() && !normalizeAuthorBoxUrl(boxUrl)) {
      setUrlInvalid(true)
      setSave({ kind: 'error', code: 'invalid_request' })
      return
    }
    setUrlInvalid(false)
    setSave({ kind: 'saving' })
    const res = await saveWritingGuidanceAction(projectId, {
      mentionBusiness: draft.mentionBusiness,
      instructions: draft.instructions,
      exclusions: draft.exclusions,
      rules: draft.rules.map((r) => ({ text: r.text })),
      ...(view.authorBoxEditable ? { authorBox } : {}),
      // 'upload' is set by the upload itself; chosen without a photo, the saved choice stays.
      ...(view.authorBoxLineEditable ? { authorBoxLine: boxLine } : {}),
      ...(view.authorBoxOverridesEditable ? { authorBoxName: boxName, authorBoxUrl: boxUrl, authorBoxImage: boxImage === 'upload' && !view.authorBoxPhoto ? view.authorBoxImage : boxImage } : {}),
    })
    if (res.ok) {
      setSave({ kind: 'saved' })
      setDraft(res.data.guidance)
      setAuthorBox(res.data.authorBox)
      setBoxName(res.data.authorBoxName)
      setBoxLine(res.data.authorBoxLine)
      setBoxUrl(res.data.authorBoxUrl)
      setBoxImage(res.data.authorBoxImage)
      onData(res.data)
      return
    }
    if (res.code === 'invalid_author_link') {
      setUrlInvalid(true)
      setSave({ kind: 'error', code: 'invalid_request' })
      return
    }
    if (res.code === 'invalid_guidance') {
      setTooLong(true)
      setSave({ kind: 'error', code: 'invalid_request' })
      return
    }
    setSave({ kind: 'error', code: res.code })
  }

  return (
    <SettingsCard
      id={SECTION.writingGuidance}
      icon={NotebookPen}
      title={w.title}
      description={w.body}
      footer={showSaveBar(dirty, save) ? (
        <SaveBar
          dirty={dirty}
          state={save}
          note={tooLong ? w.errors.invalid_guidance : null}
          onSave={() => void onSave()}
          onDiscard={() => {
            setDraft(saved); setAuthorBox(view.authorBox); setBoxName(view.authorBoxName); setBoxLine(view.authorBoxLine); setBoxUrl(view.authorBoxUrl); setBoxImage(view.authorBoxImage)
            setSave({ kind: 'idle' }); setTooLong(false); setUrlInvalid(false)
          }}
          t={t}
        />
      ) : undefined}
    >
      <div className="space-y-6" data-writing-guidance="">
        {disabled && <Notice tone="info">{w.readOnly}</Notice>}

        <div data-writing-mention="">
          <Switch
            checked={draft.mentionBusiness}
            disabled={disabled}
            onChange={(next) => setDraft({ ...draft, mentionBusiness: next })}
            label={w.mentionLabel}
            description={w.mentionHint}
          />
        </div>

        <div data-writing-author-box="">
          <Switch
            checked={authorBox}
            disabled={disabled || !view.authorBoxEditable}
            onChange={setAuthorBox}
            label={w.authorBoxLabel}
            description={w.authorBoxHint}
          />
          <AuthorBoxFields
            projectId={projectId}
            disabled={disabled || !view.authorBoxOverridesEditable}
            unavailable={!disabled && !view.authorBoxOverridesEditable}
            name={boxName}
            line={boxLine}
            lineDisabled={disabled || !view.authorBoxLineEditable}
            url={boxUrl}
            image={boxImage}
            urlInvalid={urlInvalid}
            onName={setBoxName}
            onLine={setBoxLine}
            onUrl={(v) => { setBoxUrl(v); setUrlInvalid(false) }}
            onImage={setBoxImage}
            photo={{ stored: view.authorBoxPhoto, editable: view.authorBoxPhotoEditable, savedImage: view.authorBoxImage }}
            onPhotoView={(next) => { onData(next); setBoxImage(next.authorBoxImage) }}
            w={w}
          />
        </div>

        <div>
          <FieldLabel htmlFor="writing-instructions" aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: draft.instructions.length, max: GUIDANCE_LIMITS.instructions })}</span>}>
            {w.instructionsLabel}
          </FieldLabel>
          <p id="writing-instructions-hint" className="mb-2 text-caption text-muted">{w.instructionsHint}</p>
          <textarea
            id="writing-instructions"
            aria-describedby="writing-instructions-hint"
            className={fieldClass}
            rows={5}
            maxLength={GUIDANCE_LIMITS.instructions}
            disabled={disabled}
            value={draft.instructions}
            placeholder={w.instructionsPlaceholder}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            {...bidiField(draft.instructions)}
          />
        </div>

        <div>
          <FieldLabel htmlFor="writing-exclusion" aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: draft.exclusions.length, max: GUIDANCE_LIMITS.exclusions })}</span>}>
            {w.exclusionsLabel}
          </FieldLabel>
          <p id="writing-exclusion-hint" className="mb-2 text-caption text-muted">{w.exclusionsHint}</p>
          {draft.exclusions.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" data-writing-exclusions="">
              {draft.exclusions.map((item) => (
                <li key={item} className="inline-flex items-center gap-1 rounded-pill border border-line bg-sunk py-1 ps-3 pe-1 text-copy text-ink">
                  <bdi>{item}</bdi>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={fill(w.remove, { item })}
                    onClick={() => setDraft({ ...draft, exclusions: draft.exclusions.filter((x) => x !== item) })}
                    className="grid size-6 place-items-center rounded-pill text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              id="writing-exclusion"
              aria-describedby="writing-exclusion-hint"
              className={fieldClass}
              maxLength={GUIDANCE_LIMITS.exclusion}
              disabled={disabled || draft.exclusions.length >= GUIDANCE_LIMITS.exclusions}
              value={pending}
              placeholder={w.exclusionsPlaceholder}
              onChange={(e) => setPending(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExclusion() } }}
              {...bidiField(pending)}
            />
            <Button type="button" variant="secondary" disabled={disabled || !pending.trim()} onClick={addExclusion}>
              <Plus aria-hidden className="size-4" />
              {w.add}
            </Button>
          </div>
        </div>

        <div>
          <FieldLabel aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: draft.rules.length, max: GUIDANCE_LIMITS.rules })}</span>}>
            {w.rulesLabel}
          </FieldLabel>
          <p className="mb-2 text-caption text-muted">{w.rulesHint}</p>
          {draft.rules.length === 0 ? (
            <p className="rounded-inset border border-dashed border-line px-4 py-3 text-copy text-muted" data-writing-rules="empty">{w.rulesEmpty}</p>
          ) : (
            <ul className="divide-y divide-line rounded-inset border border-line" data-writing-rules="">
              {draft.rules.map((r) => (
                <li key={r.text} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-copy text-ink" {...bidiField(r.text)}>{r.text}</p>
                    {r.articleId && <p className="mt-0.5 text-caption text-muted">{w.ruleFromArticle}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={fill(w.remove, { item: r.text })}
                    onClick={() => setDraft({ ...draft, rules: draft.rules.filter((x) => x.text !== r.text) })}
                    className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-caption text-muted">{w.appliesNext}</p>
      </div>
    </SettingsCard>
  )
}

type Copy = Props['t']['writingGuidance']

/**
 * The author box as it will be published, and the owner's own name, link and
 * image for it. The preview draws the inputs the publisher reads
 * (previewAuthorBoxAction → lib/content/author-box/preview.ts) with the
 * publisher's own resolver (authorBoxContent, resolveAuthorName), the unsaved
 * fields in place of the saved ones. React escapes every text and attribute.
 */
type PhotoState = { stored: boolean; editable: boolean; savedImage: AuthorBoxImageChoice }

function AuthorBoxFields({ projectId, disabled, unavailable, name, line, lineDisabled, url, image, urlInvalid, onName, onLine, onUrl, onImage, photo, onPhotoView, w }: {
  projectId: string; disabled: boolean; unavailable: boolean; name: string; line: string; lineDisabled: boolean
  url: string; image: AuthorBoxImageChoice; urlInvalid: boolean
  onName: (v: string) => void; onLine: (v: string) => void; onUrl: (v: string) => void; onImage: (v: AuthorBoxImageChoice) => void
  photo: PhotoState; onPhotoView: (v: GuidanceView) => void; w: Copy
}) {
  const [preview, setPreview] = useState<{ status: 'loading' } | { status: 'ready'; data: AuthorBoxPreview } | { status: 'failed' }>({ status: 'loading' })
  // Read again after an upload or a delete, so the preview shows what is stored now.
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    previewAuthorBoxAction(projectId)
      .then((res) => { if (live) setPreview(res.ok ? { status: 'ready', data: res.data } : { status: 'failed' }) })
      .catch(() => { if (live) setPreview({ status: 'failed' }) })
    return () => { live = false }
  }, [projectId, round])

  const iconOffered = preview.status === 'ready' && preview.data.siteIconAvailable
  // The photo only where a copy can be placed in the site (WordPress with an application password), never on Shopify.
  const photoOffered = preview.status === 'ready' && preview.data.photoUploadAvailable && photo.editable
  const offered = (c: AuthorBoxImageChoice) => c === 'none' || (c === 'site_icon' && iconOffered) || (c === 'upload' && photoOffered)
  const choices = AUTHOR_BOX_IMAGE_CHOICES.filter(offered)
  const imageLabel: Record<AuthorBoxImageChoice, string> = { none: w.authorBoxImageNone, site_icon: w.authorBoxImageSiteIcon, upload: w.authorBoxImageUpload }
  const shown: AuthorBoxImageChoice = offered(image) ? image : 'none'
  // WHY THERE IS NOTHING TO CHOOSE. Both images live in the customer's own site:
  // the site icon is read from it and an uploaded photo is copied into its media
  // library at publish time, so neither is possible before the site is connected.
  // With only "no image" left, the whole fieldset used to disappear and the owner
  // was left looking for an upload that no screen mentioned (be-cln.co.il, 26 Oct
  // 2026: "it will not let me upload my own photo, something here is really broken").
  // So the section stays, and says which case this is.
  const imageNote = preview.status !== 'ready' || choices.length > 1 ? null
    : preview.data.platform === 'shopify' ? w.authorBoxImageNotOnStore
    : preview.data.platform === 'wordpress' ? w.authorBoxImageMissing
    : w.authorBoxImageNeedsSite
  const photoUrl = preview.status === 'ready' ? preview.data.photoPreviewUrl : null

  return (
    <div className="mt-4 space-y-4 rounded-inset border border-line p-4" data-author-box-fields="">
      <AuthorBoxPreviewPane preview={preview} name={name} line={line} url={url} image={shown} photoUrl={photoUrl} w={w} />
      {unavailable && <p className="text-caption text-muted">{w.authorBoxOverridesUnavailable}</p>}
      <div>
        <FieldLabel htmlFor="author-box-name">{w.authorBoxNameLabel}</FieldLabel>
        <p id="author-box-name-hint" className="mb-2 text-caption text-muted">{w.authorBoxNameHint}</p>
        <input
          id="author-box-name"
          aria-describedby="author-box-name-hint"
          className={fieldClass}
          maxLength={AUTHOR_BOX_LIMITS.name}
          disabled={disabled}
          value={name}
          onChange={(e) => onName(e.target.value)}
          {...bidiField(name)}
        />
      </div>
      <div>
        <FieldLabel
          htmlFor="author-box-line"
          aside={<span className="text-caption text-muted tabular-nums">{fill(w.count, { n: line.length, max: AUTHOR_BOX_LIMITS.ownLine })}</span>}
        >
          {w.authorBoxLineLabel}
        </FieldLabel>
        <p id="author-box-line-hint" className="mb-2 text-caption text-muted">{w.authorBoxLineHint}</p>
        <textarea
          id="author-box-line"
          rows={2}
          aria-describedby="author-box-line-hint"
          className={fieldClass}
          maxLength={AUTHOR_BOX_LIMITS.ownLine}
          disabled={lineDisabled}
          value={line}
          onChange={(e) => onLine(e.target.value)}
          {...bidiField(line)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="author-box-url">{w.authorBoxUrlLabel}</FieldLabel>
        <p id="author-box-url-hint" className="mb-2 text-caption text-muted">{w.authorBoxUrlHint}</p>
        <input
          id="author-box-url"
          type="url"
          dir="ltr"
          inputMode="url"
          aria-describedby={urlInvalid ? 'author-box-url-hint author-box-url-error' : 'author-box-url-hint'}
          aria-invalid={urlInvalid || undefined}
          className={fieldClass}
          maxLength={AUTHOR_BOX_LIMITS.url}
          disabled={disabled}
          value={url}
          onChange={(e) => onUrl(e.target.value)}
        />
        {urlInvalid && <p id="author-box-url-error" role="alert" className="mt-1 text-caption text-bad">{w.authorBoxUrlInvalid}</p>}
      </div>
      {(choices.length > 1 || imageNote) && (
        <fieldset data-author-box-image="">
          <legend className="mb-1 text-copy font-semibold text-ink">{w.authorBoxImageLabel}</legend>
          {choices.length > 1 && shown !== 'upload' && <p className="mb-2 text-caption text-muted">{w.authorBoxImageHint}</p>}
          {imageNote && <p className="mb-2 text-caption text-muted" data-author-box-image-note="">{imageNote}</p>}
          {choices.length > 1 && (
            <Segmented
              ariaLabel={w.authorBoxImageLabel}
              value={image}
              onChange={onImage}
              options={choices.map((c) => ({ value: c, label: imageLabel[c], disabled }))}
            />
          )}
          {shown === 'upload' && (
            <AuthorPhotoControls projectId={projectId} disabled={disabled} stored={photo.stored} photoUrl={photoUrl}
              onView={(v) => { onPhotoView(v); setRound((n) => n + 1) }} w={w} />
          )}
          {photo.stored && photo.savedImage === 'upload' && image !== 'upload' && (
            <p className="mt-2 text-caption text-muted" data-author-photo-will-delete="">{w.authorBoxPhotoWillDelete}</p>
          )}
        </fieldset>
      )}
    </div>
  )
}

const PHOTO_ERRORS = ['photo_too_large', 'photo_type', 'photo_unreadable'] as const
type PhotoError = (typeof PHOTO_ERRORS)[number] | 'failed'

/**
 * The owner's author photo: upload (replaces the earlier one), delete. The file
 * is checked here for a quick answer and again, by its bytes, on the server
 * (lib/content/author-box/photo.ts). Every failure is one of our own sentences.
 */
function AuthorPhotoControls({ projectId, disabled, stored, photoUrl, onView, w }: {
  projectId: string; disabled: boolean; stored: boolean; photoUrl: string | null; onView: (v: GuidanceView) => void; w: Copy
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PhotoError | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const message: Record<PhotoError, string> = {
    photo_too_large: w.authorBoxPhotoTooLarge, photo_type: w.authorBoxPhotoType, photo_unreadable: w.authorBoxPhotoUnreadable, failed: w.authorBoxPhotoFailed,
  }
  const answer = (res: Awaited<ReturnType<typeof deleteAuthorPhotoAction>>) => {
    if (res.ok) { setError(null); onView(res.data); return }
    setError((PHOTO_ERRORS as readonly string[]).includes(res.code) ? (res.code as PhotoError) : 'failed')
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > AUTHOR_PHOTO_MAX_BYTES) { setError('photo_too_large'); return }
    if (!AUTHOR_PHOTO_ACCEPT.split(',').includes(file.type)) { setError('photo_type'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.set('photo', file)
      answer(await uploadAuthorPhotoAction(projectId, form))
    } catch { setError('failed') } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const remove = async () => {
    setBusy(true)
    try { answer(await deleteAuthorPhotoAction(projectId)) } catch { setError('failed') } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 space-y-2" data-author-photo="">
      <p className="text-caption text-muted">{w.authorBoxPhotoHint}</p>
      <p className="text-caption text-muted" data-author-photo-consent="">{w.authorBoxPhotoConsent}</p>
      <div className="flex flex-wrap items-center gap-3">
        {stored && photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- our stored photo, signed for a few minutes, for the owner only
          <img src={photoUrl} alt={w.authorBoxPhotoAlt} width={AUTHOR_BOX_IMAGE_SIZE} height={AUTHOR_BOX_IMAGE_SIZE} className="rounded-full object-cover" data-author-photo-thumb="" />
        ) : !stored ? <span className="text-caption text-muted" data-author-photo-empty="">{w.authorBoxPhotoEmpty}</span> : null}
        <input ref={input} id="author-box-photo" type="file" accept={AUTHOR_PHOTO_ACCEPT} className="sr-only" disabled={disabled || busy}
          onChange={(e) => void upload(e.target.files?.[0])} />
        <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>
          {busy ? w.authorBoxPhotoBusy : stored ? w.authorBoxPhotoReplace : w.authorBoxPhotoChoose}
        </Button>
        {stored && (
          <Button type="button" variant="ghost" disabled={disabled || busy} onClick={() => void remove()} data-author-photo-delete="">
            {w.authorBoxPhotoDelete}
          </Button>
        )}
      </div>
      {stored && <p className="text-caption text-muted">{w.authorBoxPhotoDeleteNote}</p>}
      {error && <p role="alert" className="text-caption text-bad" data-author-photo-error={error}>{message[error]}</p>}
    </div>
  )
}

function AuthorBoxPreviewPane({ preview, name, line, url, image, photoUrl, w }: {
  preview: { status: 'loading' } | { status: 'ready'; data: AuthorBoxPreview } | { status: 'failed' }
  name: string; line: string; url: string; image: AuthorBoxImageChoice; photoUrl: string | null; w: Copy
}) {
  if (preview.status === 'loading') return <Skeleton className="h-24 w-full" />
  if (preview.status === 'failed') return <p className="text-caption text-muted" data-author-box-preview="failed">{w.authorBoxPreviewFailed}</p>
  if (preview.data.platform === 'wix') return <p className="text-caption text-muted" data-author-box-preview="wix">{w.authorBoxPreviewWix}</p>
  // The draft in place of the saved choices; an invalid link is ignored here, exactly as it would be at publish time.
  const inputs = { ...preview.data.inputs, nameOverride: name, lineOverride: line, linkUrl: url, imageChoice: image }
  const content = authorBoxContent(inputs)
  const who = resolveAuthorName(inputs)
  const source = who.source === 'override' ? w.authorBoxSourceOverride
    : who.source === 'site_user' ? w.authorBoxSourceSiteUser
      : who.rejectedLogin ? fill(w.authorBoxSourceLogin, { login: who.rejectedLogin })
        : w.authorBoxSourceBusiness
  const rtl = content?.language === 'he'
  // The uploaded photo: publishing draws its copy in the site (known only then); the preview shows our stored file, signed.
  const img = content?.image ?? (image === 'upload' && photoUrl && content ? { url: photoUrl, alt: content.image?.alt ?? content.name } : null)
  return (
    <div data-author-box-preview="ready">
      <p className="mb-2 text-copy font-semibold text-ink">{w.authorBoxPreviewTitle}</p>
      {!content ? (
        <p className="text-caption text-muted" data-author-box-preview-empty="">{w.authorBoxPreviewNoName}</p>
      ) : (
        <>
          <div dir={rtl ? 'rtl' : 'ltr'} className="rounded-inset border border-line bg-sunk px-4 py-3" data-author-box-sample="">
            {img && (
              // eslint-disable-next-line @next/next/no-img-element -- the site's icon or the owner's photo, drawn as the published box draws it
              <img src={img.url} alt={img.alt} width={AUTHOR_BOX_IMAGE_SIZE} height={AUTHOR_BOX_IMAGE_SIZE} className="mb-2 rounded-full object-cover" data-author-box-image="" />
            )}
            <p className="text-caption font-bold text-ink">{AUTHOR_BOX_HEADINGS[content.language]}</p>
            {/* The name IS the link, as in the published box: no second line with the business name. */}
            <p className="text-copy font-bold text-ink" data-author-box-name="">
              {content.link ? <span className="underline" data-author-box-name-link="">{content.name}</span> : content.name}
            </p>
            {content.line && <p className="text-copy text-muted">{content.line}</p>}
          </div>
          <dl className="mt-2 space-y-1 text-caption text-muted">
            <div><dt className="inline font-semibold">{w.authorBoxNameSourceLabel}</dt> <dd className="inline" data-author-box-source={who.source ?? ''}>{source}</dd></div>
            <div>
              <dt className="inline font-semibold">{w.authorBoxLinkLabel}</dt>{' '}
              <dd className="inline" dir="ltr" data-author-box-link="">{content.link ? content.link.url : w.authorBoxNoLink}</dd>
            </div>
            {image === 'site_icon' && !content.image && <div data-author-box-image-missing="">{w.authorBoxImageMissing}</div>}
            {image === 'upload' && photoUrl && <div data-author-photo-publish-note="">{w.authorBoxPhotoPublishNote}</div>}
          </dl>
          <p className="mt-2 text-caption text-muted">{w.authorBoxPreviewNote}</p>
        </>
      )}
    </div>
  )
}
