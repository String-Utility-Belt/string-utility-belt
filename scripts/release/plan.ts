import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { affectedBy, type ChangeSet } from './changes'
import type { Git } from './git'
import { importGraph } from './imports'
import { bumpVersion, compareVersions, isVersion, maxLevel, type BumpLevel } from './semver'
import { LEVEL_LABELS, RELEASE_COMMIT_PREFIX, releaseTag, type Target, type TargetId } from './targets'
import { formatPointer, promoteUnreleased, readJsonVersion, writeJsonVersion } from './version-files'

/** What one release run does with one target. */
export interface TargetPlan {
  id: TargetId
  title: string
  /** Version of the last release tag, or `null` before the target's first tagged release. */
  previous: string | null
  /** Version in the version files before this run. */
  current: string
  /** Version this run releases (`current` unless it bumps). */
  next: string
  release: boolean
  /** The bump this run applies, or `null` when the version stays as it is. */
  bump: BumpLevel | null
  reason: string
  /** The changes that affect the target (paths, or a summary of a manifest change). */
  changes: string[]
  /** A manual target with changes this run doesn't release: they wait for a run that asks for it. */
  waiting: boolean
}

export interface PlanOptions {
  targets: readonly Target[]
  git: Git
  /** Repository root the version files are read from (the checked-out HEAD). */
  root: string
  /**
   * The commit CI verified. HEAD is this commit plus, at most, release commits an
   * earlier run of this release pushed on top of it. Defaults to HEAD.
   */
  tested?: string
  /** Labels of the pull request(s) that produced a commit. */
  labels(sha: string): Promise<readonly string[]>
  /** The `manual` targets this run releases (when they changed); the others only report what waits. */
  manual?: ReadonlySet<TargetId>
}

/**
 * Decides, per target, whether to release and at which version:
 *
 * - no `<id>-v*` tag yet → release, bumping the version CI tested by its pull
 *   request's labels (patch by default): a store may already hold that version
 *   with older content, so it is never reused
 * - version files below the last release → refuse (an error, not a guess)
 * - version files above the last release → release that version as it is
 *   ("already incremented" by hand in the pull request, or by an earlier run) —
 *   unless shipped files changed after the commit that set it, which bump it again
 * - shipped files changed since the last release → release, bumping the version
 *   by the highest `release:*` label among the merged pull requests that touched it
 * - otherwise → nothing to release
 *
 * A `manual` target goes through the same decision, but only releases when the
 * run asks for it (`manual`); otherwise its plan reports the changes waiting.
 */
export async function planRelease(opts: PlanOptions): Promise<TargetPlan[]> {
  const head = opts.git.revParse('HEAD')
  const tested = opts.tested === undefined ? head : opts.git.revParse(opts.tested)
  const commitChanges = new Map<string, ChangeSet>()
  const commitLevels = new Map<string, BumpLevel | null>()
  const changeOf = (sha: string) => {
    let change = commitChanges.get(sha)
    if (!change) commitChanges.set(sha, change = opts.git.commitDiff(sha))
    return change
  }
  const levelOf = async (sha: string) => {
    if (!commitLevels.has(sha)) commitLevels.set(sha, levelFromLabels(await opts.labels(sha)))
    return commitLevels.get(sha) ?? null
  }

  const plans: TargetPlan[] = []
  for (const target of opts.targets) {
    const plan = await decide(target)
    // a manual target's changes wait for a run that asks for it
    plans.push(target.trigger === 'manual' && plan.release && !opts.manual?.has(target.id)
      ? {
        ...plan, release: false, waiting: true, next: plan.current, bump: null,
        reason: `waiting for a manual release (would be ${plan.next}: ${plan.reason})`,
      }
      : plan)
  }
  return plans

  async function decide(target: Target): Promise<TargetPlan> {
    const bundled = target.rootManifest === 'bundled' ? importGraph(opts.root, target.entries).packages : undefined
    const affected = (change: ChangeSet) => affectedBy(target, change, bundled)
    const current = readTargetVersion(target, file => readFileSync(path.join(opts.root, file), 'utf8'))
    const lastTag = opts.git.nearestTag(`${target.id}-v*`)

    if (!lastTag) {
      // an earlier run may have pushed this target's bump on top of `tested` and then failed to
      // deploy it: measure from the version CI tested, so a retry doesn't bump a second time
      const testedVersion = tested === head ? current : readTargetVersion(target, file => {
        const text = opts.git.show(tested, file)
        if (text === null) throw new Error(`${file} does not exist at ${tested}`)
        return text
      })
      const base = { id: target.id, title: target.title, previous: null, current, changes: [], waiting: false }
      if (compareVersions(current, testedVersion) > 0) {
        return { ...base, next: current, release: true, bump: null, reason: 'first tagged release (version already raised)' }
      }
      // a release run already chose this version and failed before tagging it, and pull requests
      // merged since: if none of them changed what the target ships, retry that version (a store
      // that already has it skips it); otherwise it may hold other content, so bump again
      const setAt = versionSetAt(opts.git, target, null)
      if (setAt && opts.git.subject(setAt).startsWith(RELEASE_COMMIT_PREFIX) && !affected(opts.git.diff(setAt, 'HEAD')).length) {
        return { ...base, next: current, release: true, bump: null, reason: `first tagged release (retrying ${current}, set by ${setAt.slice(0, 12)})` }
      }
      const level = (await levelOf(tested)) ?? 'patch'
      return {
        ...base, next: bumpVersion(current, level), release: true, bump: level,
        reason: `first tagged release (no ${target.id}-v* tag yet)`,
      }
    }

    const previous = versionFromTag(target.id, lastTag)
    const order = compareVersions(current, previous)
    if (order < 0) {
      throw new Error(`${target.id}: the version files say ${current}, lower than the last release ${lastTag}`)
    }
    const changes = affected(opts.git.diff(lastTag, 'HEAD'))
    const base = { id: target.id, title: target.title, previous, current, changes, waiting: false }
    if (order > 0) {
      // a version only ever ships the content it was set for: an earlier run may already have
      // published it before failing, so anything shipped since then gets a version of its own
      const setAt = versionSetAt(opts.git, target, lastTag)
      if (!setAt || !affected(opts.git.diff(setAt, 'HEAD')).length) {
        return { ...base, next: current, release: true, bump: null, reason: `version already raised from ${previous}` }
      }
      const level = await levelSince(setAt, affected)
      return {
        ...base, next: bumpVersion(current, level), release: true, bump: level,
        reason: `changed since ${current} was set (${setAt.slice(0, 12)})`,
      }
    }
    if (!changes.length) {
      return { ...base, next: current, release: false, bump: null, reason: `unchanged since ${lastTag}` }
    }
    const level = await levelSince(lastTag, affected)
    return { ...base, next: bumpVersion(current, level), release: true, bump: level, reason: `changed since ${lastTag}` }
  }

  /** The highest label among the merged commits after `rev` that changed what a target ships; patch by default. */
  async function levelSince(rev: string, affected: (change: ChangeSet) => string[]): Promise<BumpLevel> {
    const levels: BumpLevel[] = []
    for (const sha of opts.git.firstParentCommits(rev)) {
      if (!affected(changeOf(sha)).length) continue
      const level = await levelOf(sha)
      if (level) levels.push(level)
    }
    return maxLevel(levels)
  }
}

/**
 * The newest commit after `since` (anywhere in its history for `null`) on HEAD's first-parent line
 * that changed `target`'s version, or `null`.
 */
function versionSetAt(git: Git, target: Target, since: string | null): string | null {
  const file = target.versionFiles[0]
  const versionAt = (rev: string) => {
    const text = git.show(rev, file.path)
    try {
      return text === null ? null : readJsonVersion(text, file.pointer, file.prefix)
    } catch {
      return null
    }
  }
  for (const sha of git.firstParentCommits(since, 'HEAD', [file.path])) {
    if (versionAt(sha) !== versionAt(`${sha}^1`)) return sha
  }
  return null
}

/** The newest commit on `rev`'s first-parent line that a release run didn't push. */
export function lastNonReleaseCommit(git: Git, rev = 'HEAD'): string {
  let sha = git.revParse(rev)
  while (git.subject(sha).startsWith(RELEASE_COMMIT_PREFIX)) sha = git.revParse(`${sha}^1`)
  return sha
}

/**
 * Why a release run for `tested` must stand down, or `null` when HEAD is `tested`
 * plus nothing but release commits. Anything newer on main has a CI run, and a
 * release run, of its own that includes these changes.
 */
export function supersededReason(git: Git, tested: string): string | null {
  const head = git.revParse('HEAD')
  if (!git.isAncestor(tested, head)) return `${tested.slice(0, 12)} is no longer on this branch`
  const newer = git.commitsBetween(tested, head).filter(sha => !git.subject(sha).startsWith(RELEASE_COMMIT_PREFIX))
  return newer.length ? `main has moved on to ${head.slice(0, 12)}; the release run for that commit includes these changes` : null
}

/** The highest bump a commit's pull request labels ask for, or `null` when none does. */
export function levelFromLabels(labels: readonly string[]): BumpLevel | null {
  const levels = labels.flatMap(label => LEVEL_LABELS.get(label.trim().toLowerCase()) ?? [])
  return levels.length ? maxLevel(levels) : null
}

function versionFromTag(id: TargetId, tag: string): string {
  const prefix = `${id}-v`
  const version = tag.startsWith(prefix) ? tag.slice(prefix.length) : ''
  if (!isVersion(version)) throw new Error(`release tag ${tag} does not carry a major.minor.patch version`)
  return version
}

/** The version every one of `target`'s version files carries; throws when they disagree. */
export function readTargetVersion(target: Target, read: (file: string) => string): string {
  const texts = new Map<string, string>()
  const found = target.versionFiles.map(f => {
    if (!texts.has(f.path)) texts.set(f.path, read(f.path))
    return { where: `${f.path}${formatPointer(f.pointer)}`, version: readJsonVersion(texts.get(f.path)!, f.pointer, f.prefix) }
  })
  const versions = new Set(found.map(f => f.version))
  if (versions.size !== 1) {
    throw new Error(`${target.id}: version files disagree — ${found.map(f => `${f.where} = ${f.version}`).join(', ')}`)
  }
  const [version] = versions
  if (!isVersion(version)) throw new Error(`${target.id}: "${version}" is not a major.minor.patch version`)
  return version
}

/**
 * Writes the plan into the working tree: bumped versions into every version
 * file, and `[Unreleased]` changelog entries under the released version.
 * Returns the files it changed.
 */
export function applyPlan(root: string, targets: readonly Target[], plans: readonly TargetPlan[], date: string): string[] {
  const changed = new Set<string>()
  for (const plan of plans.filter(p => p.release)) {
    const target = targets.find(t => t.id === plan.id)!
    if (plan.bump) {
      for (const file of target.versionFiles) {
        const full = path.join(root, file.path)
        writeFileSync(full, writeJsonVersion(readFileSync(full, 'utf8'), file.pointer, plan.next, file.prefix))
        changed.add(file.path)
      }
    }
    if (target.changelog) {
      const full = path.join(root, target.changelog)
      const promoted = promoteUnreleased(readFileSync(full, 'utf8'), plan.next, date)
      if (promoted !== null) {
        writeFileSync(full, promoted)
        changed.add(target.changelog)
      }
    }
  }
  return [...changed]
}

/** Subject of the commit that records a release run's edits. `[skip ci]`: CI already passed on its parent. */
export function releaseCommitMessage(plans: readonly TargetPlan[]): string {
  const released = plans.filter(p => p.release).map(p => `${p.id} ${p.next}`)
  return `${RELEASE_COMMIT_PREFIX}${released.join(', ')} [skip ci]`
}

/** Markdown table of the plan for the job summary / pull request preview. */
export function planSummary(plans: readonly TargetPlan[], heading: string): string {
  const rows = plans.map(p => {
    const version = p.release
      ? p.bump ? `${p.current} → **${p.next}** (${p.bump})` : `**${p.next}**`
      : p.current
    const changes = p.changes.length ? p.changes.map(c => `\`${c}\``).join('<br>') : ''
    const action = p.release ? '🚀 release' : p.waiting ? '⏸ manual' : '—'
    return `| ${p.title} | ${action} | ${version} | ${p.reason} | ${changes} |`
  })
  return [
    `### ${heading}`,
    '',
    '| Target | Action | Version | Why | Changes |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Tags: ${plans.filter(p => p.release).map(p => `\`${releaseTag(p.id, p.next)}\``).join(', ') || 'none'}`,
    '',
  ].join('\n')
}
