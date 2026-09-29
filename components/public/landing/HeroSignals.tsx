/**
 * The home hero's "signal stack" (wave 8, UX decision D): three tilted cards in
 * the hero's end columns, each a still frame of what the live demo below plays:
 *   1. a keyword that climbed from position 18 to 3 in Google;
 *   2. a ChatGPT answer that recommends the business;
 *   3. the notification that an article went live on the site.
 * Built from the demo's own words (HeroDemoCopy) plus the one line of the toast,
 * so the stack and the demo can never tell two stories. Illustrative, like the
 * demo, whose caption says so; decoration for assistive tech (aria-hidden),
 * because the demo right under it describes the same three scenes in words.
 * A server component: still, complete at rest. Hidden below lg.
 */
import { ArrowRight, Bot, Check, Sparkles, TrendingUp } from 'lucide-react'
import type { HeroDemoCopy } from './HeroDemo'

export function HeroSignals({ demo, published }: { demo: HeroDemoCopy; published: string }) {
  const you = demo.ai.items.find((it) => it.you) ?? demo.ai.items[0]
  return (
    <div aria-hidden="true" className="relative mx-auto h-[26rem] w-full max-w-md" data-hero-signals>
      {/* 1. The climb */}
      <div className="absolute start-0 top-0 w-[19rem] -rotate-3 rounded-card bg-surface p-5 text-start shadow-pop ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption font-semibold text-muted">{demo.rank.positionLabel}</span>
          <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-ok-soft px-2 text-caption font-semibold tabular-nums text-ok">
            <TrendingUp className="size-3.5" />
            {demo.rank.from - demo.rank.to}
          </span>
        </div>
        <p className="mt-2 truncate text-section font-semibold text-ink">{demo.rank.keyword}</p>
        <div className="mt-3 flex items-baseline gap-3 tabular-nums">
          <span className="text-title font-bold text-muted line-through decoration-2">{demo.rank.from}</span>
          <ArrowRight className="size-5 self-center text-action rtl:-scale-x-100" />
          <span className="text-numeral text-action">{demo.rank.to}</span>
        </div>
      </div>

      {/* 2. The AI answer */}
      <div className="absolute end-0 top-[8.5rem] w-[21rem] rotate-2 rounded-card bg-surface p-5 text-start shadow-pop ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-pill bg-contrast text-contrast-ink">
            <Bot className="size-4" />
          </span>
          <span dir="ltr" className="text-copy font-semibold text-ink">{demo.ai.engines[0]?.name}</span>
        </div>
        <p className="mt-3 rounded-inset bg-action px-3 py-2 text-copy text-action-ink">{demo.ai.question}</p>
        <div className="mt-2 rounded-inset bg-action-soft px-3 py-2 ring-1 ring-action/25">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-copy font-semibold text-ink">{you.name}</span>
            <span className="inline-flex h-5 items-center gap-1 rounded-pill bg-action px-2 text-caption font-semibold text-action-ink">
              <Sparkles className="size-3" />
              {demo.ai.youTag}
            </span>
          </div>
          <p className="mt-1 text-caption text-body">{you.desc}</p>
        </div>
      </div>

      {/* 3. Published */}
      <div className="absolute bottom-0 start-6 flex w-[20rem] -rotate-[1.5deg] items-center gap-3 rounded-card bg-surface px-4 py-3.5 text-start shadow-pop ring-1 ring-white/10">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-ok-soft text-ok">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <span className="min-w-0">
          <span className="block text-copy font-semibold text-ink">{published}</span>
          <span className="block truncate text-caption text-muted">{demo.article.title}</span>
        </span>
      </div>
    </div>
  )
}
