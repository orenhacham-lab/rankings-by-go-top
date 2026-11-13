#!/usr/bin/env node
/**
 * Vercel's Ignored Build Step for this project.
 *
 * EXIT CODES ARE INVERTED and easy to get backwards:
 *   exit 0 -> Vercel SKIPS the build
 *   exit 1 -> Vercel BUILDS
 * lib/__qa__/vercel-build-skip.qa.ts runs this file for real against a throwaway
 * git repository, so the two directions are locked by a test and not by a comment.
 *
 * WHY. On 13 November 2026 the team crossed 75% of the free 10 GB of Vercel
 * function storage. One half of the bill is what each deployment traces (a
 * separate matter, see next.config.ts); the other half is how many deployments
 * exist: 131 retained, 100 of them built in four days, 68 of those previews,
 * because every push to a claude/project-thread-* branch builds. One branch
 * produced 18 preview builds and about eight of those commits changed no file at
 * all — merges of already-merged history, whose tree is byte-for-byte the tree
 * that was already deployed. Building them produces a second copy of an output
 * that already exists.
 *
 * WHAT IT SKIPS. Only a PREVIEW build whose tree is identical to the tree of the
 * last successful deployment of the same branch. Nothing else:
 *   - production always builds, so `main` stays one deployment per commit and a
 *     "is my merge live" check can keep reading list_deployments by sha;
 *   - a branch's first deployment always builds (there is no previous sha yet);
 *   - anything this script cannot determine builds. Every unknown fails OPEN,
 *     because a redundant build costs storage while a missing one costs a
 *     deployment somebody is waiting for.
 *
 * Node builtins only, and no imports outside them: the Ignored Build Step runs
 * BEFORE the install step, so node_modules does not exist yet.
 */
import { execFileSync } from 'node:child_process'

/**
 * The whole decision, as a pure function of what the environment and git say.
 * `build: true` means Vercel must build.
 */
export function decide(input) {
  const { vercelEnv, previousSha, previousTree, headTree } = input
  if (vercelEnv !== 'preview') return { build: true, reason: `target is ${vercelEnv || 'unknown'}, not preview` }
  if (!previousSha) return { build: true, reason: 'no previous successful deployment on this branch' }
  if (!previousTree) return { build: true, reason: `tree of previous deployment ${previousSha} is not in this clone` }
  if (!headTree) return { build: true, reason: 'the tree of HEAD could not be read' }
  if (previousTree === headTree) return { build: false, reason: `tree ${headTree} is already deployed as ${previousSha}` }
  return { build: true, reason: 'the tree changed since the last deployment of this branch' }
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/** The tree a revision points at, or null when this clone cannot answer. */
function treeOf(rev) {
  try {
    return git(['rev-parse', `${rev}^{tree}`]) || null
  } catch {
    return null
  }
}

/** Vercel clones shallowly, so a previous deployment's commit may be absent. */
function fetchCommit(sha) {
  try {
    git(['fetch', '--depth=1', 'origin', sha])
    return true
  } catch {
    return false
  }
}

function main() {
  const vercelEnv = process.env.VERCEL_ENV
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA
  // Resolved whatever the target is, so `decide` is the only place the policy
  // lives and a guard there cannot be quietly duplicated here.
  let previousTree = null
  if (previousSha) {
    previousTree = treeOf(previousSha)
    if (!previousTree && fetchCommit(previousSha)) previousTree = treeOf(previousSha)
  }
  const verdict = decide({ vercelEnv, previousSha, previousTree, headTree: treeOf('HEAD') })
  console.log(`${verdict.build ? 'BUILD' : 'SKIP'}: ${verdict.reason}`)
  process.exit(verdict.build ? 1 : 0)
}

// Only when run as the command, so the QA suite can import `decide` directly.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main()
