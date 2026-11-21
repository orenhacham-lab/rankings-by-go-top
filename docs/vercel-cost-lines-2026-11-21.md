# Where Vercel money actually goes (measured 17-21 November 2026)

Four days on Pro, 17.11 08:00 to 21.11 08:00 UTC, $4.49 of metered usage:

| Line | Cost | Share |
|---|---|---|
| Build CPU Minutes | $1.02 | largest single line, from 8 records |
| Image Optimization | $0.24 | |
| Active CPU + memory + invocations + bandwidth | $0.32 together | |

**The lesson: the resource that caused the pause notice of 17 November is no
longer the one that costs money.** `/api/content/automation/cron` was 97.5% of
all production log lines; the hourly pass gate
(`lib/content/automation/pass-gate.ts`) cut it from 1121 log lines a day to 382,
verified on 20.11. What costs money now is **builds**, and a build comes from a
push.

## What the Ignored Build Step skips, and what it must never skip

`scripts/vercel/ignore-build.mjs` decides, per deployment, whether Vercel builds.
Exit 0 skips and exit 1 builds — inverted, and locked by
`lib/__qa__/vercel-build-skip.qa.ts` rather than by a comment.

It skips a **preview** in two cases, both measured against the last successful
deployment of the same branch:

1. the tree is identical (an empty merge of already-merged history);
2. the diff touches only paths that never reach a deployment — a `__qa__/`
   directory, `*.qa.ts`, `*.probe.sql`, `scripts/qa/`, `.github/`, or `*.md`.

**`content/` is excluded from that markdown rule.** The legal pages read
`content/legal/<locale>/*.md` at request time, through a path built with
`join()`, which is why `next.config.ts` lists them in
`outputFileTracingIncludes`. Treating that markdown as irrelevant would stop a
legal-text correction from ever going live. Check `R7` runs the real script
against a commit that changes only `content/legal/es/terms.md` and proves it
builds.

Production is never skipped, so `main` stays one deployment per commit and "is
my merge live" can keep reading `list_deployments` by sha. A branch's first
deployment always builds. An unrecognised path counts as deployed, and a diff
the clone cannot list builds: the predicate is a closed list, not a guess.

## Image optimization: why the width list is the wrong lever

The billed unit is one transformation per source image per width actually
requested. Trimming `images.deviceSizes` mostly shrinks the `srcset` the browser
chooses from; the real driver is how many **distinct source images** exist, which
is a function of how many AI images get generated or replaced. A cheaper image
model was already rejected for producing blurry images, so quality is not
available to trade. Do not change widths without the per-transformation
breakdown.
