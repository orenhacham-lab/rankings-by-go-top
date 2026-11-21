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
 * WHAT IT SKIPS. Two kinds of PREVIEW build, both measured against the last
 * successful deployment of the same branch:
 *   1. a tree identical to that deployment's tree (the empty merge above);
 *   2. a diff that touches only files which never reach a deployment at all —
 *      QA suites, probe SQL, the QA runner, GitHub workflows and documentation.
 * Nothing else:
 *   - production always builds, so `main` stays one deployment per commit and a
 *     "is my merge live" check can keep reading list_deployments by sha;
 *   - a branch's first deployment always builds (there is no previous sha yet);
 *   - anything this script cannot determine builds. Every unknown fails OPEN,
 *     because a redundant build costs storage while a missing one costs a
 *     deployment somebody is waiting for.
 *
 * WHY (2), ADDED 21 NOVEMBER 2026. Four days of Pro billing came to $4.49, and
 * the single largest line was Build CPU Minutes at $1.02 — more than Active CPU,
 * memory, invocations and bandwidth together ($0.32). The pass gate fixed the
 * runtime; what costs money now is BUILDS, and builds come from pushes. Oren
 * intends to leave Pro at the end of the paid period and stay off it, so the
 * build count has to come down in the code rather than in somebody's habits. A
 * push that only adds a QA suite or rewrites a comment produces a preview whose
 * deployed output is byte-for-byte the previous one; building it buys nothing.
 *
 * `content/**` IS DEPLOYED, markdown included: the legal pages read
 * content/legal/<locale>/*.md at request time (see outputFileTracingIncludes in
 * next.config.ts). So markdown is irrelevant to a build ONLY outside content/.
 * Getting that backwards would stop a legal-text correction from ever going
 * live, which is why it is a named case in the QA suite.
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
  const { vercelEnv, previousSha, previousTree, headTree, changedPaths } = input
  if (vercelEnv !== 'preview') return { build: true, reason: `target is ${vercelEnv || 'unknown'}, not preview` }
  if (!previousSha) return { build: true, reason: 'no previous successful deployment on this branch' }
  if (!previousTree) return { build: true, reason: `tree of previous deployment ${previousSha} is not in this clone` }
  if (!headTree) return { build: true, reason: 'the tree of HEAD could not be read' }
  if (previousTree === headTree) return { build: false, reason: `tree ${headTree} is already deployed as ${previousSha}` }
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    return { build: true, reason: 'the tree changed and the changed paths could not be listed' }
  }
  const deployed = changedPaths.filter((path) => !isBuildIrrelevant(path))
  if (deployed.length === 0) {
    return { build: false, reason: `${changedPaths.length} changed file(s), none of which reach a deployment` }
  }
  return { build: true, reason: `${deployed.length} deployed file(s) changed, starting with ${deployed[0]}` }
}

/**
 * True when a path cannot change what a deployment serves.
 *
 * Deliberately a closed list of shapes rather than a guess about each file: an
 * unrecognised path is treated as deployed, so a new kind of file builds until
 * somebody adds it here on purpose.
 */
export function isBuildIrrelevant(path) {
  if (typeof path !== 'string' || path.length === 0) return false
  // The legal pages read content/legal/<locale>/*.md at request time, so
  // nothing under content/ is ever irrelevant, markdown included.
  if (path === 'content' || path.startsWith('content/')) return false
  if (path.includes('__qa__/')) return true
  if (path.endsWith('.qa.ts') || path.endsWith('.probe.sql')) return true
  if (path.startsWith('scripts/qa/')) return true
  if (path.startsWith('.github/')) return true
  if (path.endsWith('.md')) return true
  return false
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

/**
 * The files that differ between the previous deployment and HEAD, or null when
 * this clone cannot answer — which builds.
 */
function changedPathsSince(sha) {
  try {
    const out = git(['diff', '--name-only', `${sha}`, 'HEAD'])
    return out ? out.split('\n').map((line) => line.trim()).filter(Boolean) : null
  } catch {
    return null
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
  const verdict = decide({
    vercelEnv,
    previousSha,
    previousTree,
    headTree: treeOf('HEAD'),
    changedPaths: previousTree ? changedPathsSince(previousSha) : null,
  })
  console.log(`${verdict.build ? 'BUILD' : 'SKIP'}: ${verdict.reason}`)
  process.exit(verdict.build ? 1 : 0)
}

// Only when run as the command, so the QA suite can import `decide` directly.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main()
