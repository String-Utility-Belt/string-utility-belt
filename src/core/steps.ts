import type { BranchStep, EachStep, MacroStep, PipelineStep, UtilityStep } from '../types/utility'

export const isUtilityStep = (s: PipelineStep): s is UtilityStep =>
  (s.type === undefined || s.type === 'utility') && typeof (s as UtilityStep).utilityId === 'string'
export const isBranchStep = (s: PipelineStep): s is BranchStep => s.type === 'branch'
export const isMacroStep = (s: PipelineStep): s is MacroStep => s.type === 'macro'
export const isEachStep = (s: PipelineStep): s is EachStep => s.type === 'each'

export type StepType = 'utility' | 'branch' | 'macro' | 'each'

/** Every step type this build can read and run. */
export const STEP_TYPES: readonly StepType[] = ['utility', 'branch', 'macro', 'each']

export const stepTypeOf = (s: PipelineStep): StepType => (s.type === undefined ? 'utility' : s.type)

let counter = 0
/** Unique enough for step ids: random UUID where available, else time + counter. */
export function stepId(prefix = 'step'): string {
  const c = (globalThis as any).crypto
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID().slice(0, 13)}`
  return `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`
}

/**
 * The default of a switch over every step type, where `step` is `never`: a type added to
 * PipelineStep fails to compile until the switch handles it, so no tree walk can treat a
 * new container as a leaf by omission. At run time a type this build does not know (a
 * newer document, not yet sanitised) still lands here, and is handled as a leaf.
 */
function unknownStepType(step: never): PipelineStep {
  return step
}

/**
 * Direct children of a step (branch lanes flattened, a macro's or an each step's
 * body). Tolerates a malformed container (a sequence that is not an array) by
 * reporting no children: callers include walkers over not-yet-sanitised trees.
 */
export function childSequences(step: PipelineStep): PipelineStep[][] {
  switch (step.type) {
    case undefined:
    case 'utility':
      return []
    case 'branch':
      return Array.isArray(step.branches) ? step.branches.filter(Array.isArray) : []
    case 'macro':
    case 'each':
      return Array.isArray(step.steps) ? [step.steps] : []
    default:
      unknownStepType(step)
      return []
  }
}

/**
 * `step` with each direct child sequence replaced by `fn(sequence, index)`. Returns
 * `step` itself when `fn` hands back every sequence unchanged, so immutable updates
 * can tell "nothing changed" by identity. The one place that knows where each step
 * type keeps its children: tree rebuilds go through here rather than switching on type.
 */
export function mapChildSequences(step: PipelineStep, fn: (seq: PipelineStep[], index: number) => PipelineStep[]): PipelineStep {
  switch (step.type) {
    case undefined:
    case 'utility':
      return step
    case 'branch': {
      if (!Array.isArray(step.branches)) return step
      const branches = step.branches.map((b, i) => (Array.isArray(b) ? fn(b, i) : b))
      return branches.some((b, i) => b !== step.branches[i]) ? { ...step, branches } : step
    }
    case 'macro':
    case 'each': {
      if (!Array.isArray(step.steps)) return step
      const steps = fn(step.steps, 0)
      return steps !== step.steps ? { ...step, steps } : step
    }
    default:
      return unknownStepType(step)
  }
}

/** Depth-first visit of every step, nested ones included. Return false to stop. */
export function walkSteps(steps: PipelineStep[], fn: (s: PipelineStep, parents: PipelineStep[]) => void | false,
  parents: PipelineStep[] = []): boolean {
  for (const s of steps) {
    if (fn(s, parents) === false) return false
    for (const seq of childSequences(s)) {
      if (!walkSteps(seq, fn, [...parents, s])) return false
    }
  }
  return true
}

export function findStep(steps: PipelineStep[], id: string): PipelineStep | undefined {
  let found: PipelineStep | undefined
  walkSteps(steps, s => { if (s.id === id) { found = s; return false } })
  return found
}

/** Every utility id used anywhere in the tree. */
export function utilityIds(steps: PipelineStep[]): string[] {
  const ids = new Set<string>()
  walkSteps(steps, s => { if (isUtilityStep(s)) ids.add(s.utilityId) })
  return [...ids]
}

/** True when any step in the tree, nested or disabled, satisfies `pred`. */
export function someStep(steps: PipelineStep[], pred: (s: PipelineStep) => boolean): boolean {
  return !walkSteps(steps, s => (pred(s) ? false : undefined))
}

/**
 * Immutably replace the step with `id` by `fn(step)`. `fn` may return an array
 * (splice in several), or null (remove). Nested sequences are searched too.
 */
export function updateStep(steps: PipelineStep[], id: string,
  fn: (s: PipelineStep) => PipelineStep | PipelineStep[] | null): PipelineStep[] {
  let changed = false
  const out: PipelineStep[] = []
  for (const s of steps) {
    if (s.id === id) {
      changed = true
      const r = fn(s)
      if (r === null) continue
      if (Array.isArray(r)) out.push(...r); else out.push(r)
      continue
    }
    const next = mapChildSequences(s, seq => updateStep(seq, id, fn))
    if (next !== s) changed = true
    out.push(next)
  }
  return changed ? out : steps
}

/** Deep copy with fresh ids everywhere, so a duplicate never collides with its source. */
export function cloneWithNewIds<T extends PipelineStep>(step: T): T {
  const base = { ...step, id: stepId() } as PipelineStep
  if (isUtilityStep(base)) return { ...base, params: structuredCloneSafe(base.params ?? {}) } as T
  return mapChildSequences(base, seq => seq.map(cloneWithNewIds)) as T
}

function structuredCloneSafe<T>(v: T): T {
  try { return JSON.parse(JSON.stringify(v)) } catch { return v }
}

/** Number of steps in the tree, nested included. */
export function countSteps(steps: PipelineStep[]): number {
  let n = 0
  walkSteps(steps, () => { n++ })
  return n
}
