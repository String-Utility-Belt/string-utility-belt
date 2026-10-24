import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolProvider, useTool } from '@/app/ToolContext'
import { listEntries } from '@/app/library/storage'
import BulkToggle from './steps/BulkToggle'
import StepsSection from './steps/StepsSection'
import { StepList } from './stepListChunk'

// StepsSection loads the list as a chunk of its own: loaded up front, it renders on the first pass
beforeAll(() => StepList.preload())

// Real framer-motion drag physics can't be simulated in jsdom (no real layout).
// The stub keeps the same prop contract StepList relies on — `values`/`onReorder`
// (live order) and each Item's `onDragEnd` (commit) — as clickable test hooks, so
// the tests exercise StepList's own commit-on-end logic rather than the library's.
vi.mock('framer-motion', () => ({
  Reorder: {
    Group: ({ children, values, onReorder }) => (
      <div data-testid="reorder-group">
        <button type="button" data-testid="simulate-live-reorder" onClick={() => onReorder([...values].reverse())} />
        {children}
      </div>
    ),
    Item: ({ children, value, onDragEnd, layout }) => (
      <div data-testid={`reorder-item-${value}`} data-layout={String(layout)}>
        {children}
        <button type="button" data-testid={`simulate-drag-end-${value}`} onClick={() => onDragEnd?.()} />
      </div>
    ),
  },
  AnimatePresence: ({ children }) => children,
  useDragControls: () => ({ start: () => {} }),
  useReducedMotion: () => false,
}))

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const step = (id, utilityId = 'trim') => ({ id, utilityId, enabled: true, params: {} })

/** The store's step ids as a nested tree: branches as arrays of lanes, macro and each bodies as {id: [...]}. */
const idTree = steps => steps.map(s => (s.type === 'branch' ? { [s.id]: s.branches.map(idTree) } : s.type === 'macro' || s.type === 'each' ? { [s.id]: idTree(s.steps) } : s.id))

function Harness() {
  const { state, canUndo } = useTool()
  return (
    <>
      <div data-testid="can-undo">{String(canUndo)}</div>
      <div data-testid="store">{JSON.stringify(idTree(state.steps))}</div>
      <div data-testid="enabled">{JSON.stringify(flatEnabled(state.steps))}</div>
      <StepsSection />
    </>
  )
}

const flatEnabled = steps => steps.flatMap(s => [s.enabled !== false, ...(s.type === 'branch' ? s.branches.flatMap(flatEnabled) : s.type === 'macro' || s.type === 'each' ? flatEnabled(s.steps) : [])])
const storeTree = () => JSON.parse(screen.getByTestId('store').textContent)

function renderTool(initialSteps) {
  return render(
    <ToolProvider initialSteps={initialSteps} persist={false}>
      <Harness />
    </ToolProvider>,
  )
}

/** The top-level steps' ids in display order (rows nested in a lane or body are left out). */
const stepOrder = () => [...document.querySelectorAll('[data-testid^="reorder-item-"]')]
  .filter(el => !el.parentElement.closest('[data-testid^="reorder-item-"]'))
  .map(el => el.getAttribute('data-testid').slice('reorder-item-'.length))

/**
 * Browsers apply the HTML focus-fixup rule when a node *containing* the focused element
 * is moved or removed (React moves a keyed row with insertBefore/appendChild), so focus
 * drops to <body>. jsdom only does that when the moved node IS the focused element, which
 * hides focus loss on reorder. Emulate the browser behaviour for the tests that need it.
 */
function emulateBrowserFocusFixup() {
  for (const name of ['insertBefore', 'appendChild']) {
    const original = Node.prototype[name]
    vi.spyOn(Node.prototype, name).mockImplementation(function (node, ...rest) {
      const active = document.activeElement
      if (node instanceof Node && node.isConnected && active && active !== document.body && node.contains(active)) active.blur()
      return original.call(this, node, ...rest)
    })
  }
}

// This file mounts a real ToolProvider (reducer + pipeline runner) and drives
// several userEvent interactions per test, which can run well past vitest's 5s
// default on a loaded machine.
vi.setConfig({ testTimeout: 20000 })

describe('<StepList /> reordering', () => {
  it('Alt+ArrowDown on a focused drag handle moves the step down and keeps focus', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b')])
    expect(stepOrder()).toEqual(['a', 'b'])

    const handle = screen.getByRole('button', { name: /reorder step 1/i })
    handle.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    expect(stepOrder()).toEqual(['b', 'a'])
    expect(document.activeElement).toBe(handle)
    expect(screen.getByTestId('can-undo').textContent).toBe('true')
  })

  it('keeps focus on the moved card\'s handle even when the browser drops focus on DOM moves', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])
    emulateBrowserFocusFixup()

    // moving the first row down: React re-inserts that row's DOM node
    const handleA = screen.getByRole('button', { name: /reorder step 1/i })
    handleA.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(stepOrder()).toEqual(['b', 'a', 'c'])
    expect(document.activeElement).toBe(handleA)

    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(stepOrder()).toEqual(['b', 'c', 'a'])
    expect(document.activeElement).toBe(handleA)

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(stepOrder()).toEqual(['b', 'a', 'c'])
    expect(document.activeElement).toBe(handleA)
    // the new position is announced for screen-reader users
    expect(screen.getByText('moved step to position 2 of 3')).toBeTruthy()
  })

  it('returns focus to the moved card\'s menu button after "Move down" from its menu', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b')])
    emulateBrowserFocusFixup()
    const trigger = screen.getByRole('button', { name: 'step 1 menu' })
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(stepOrder()).toEqual(['b', 'a'])
    expect(document.activeElement).toBe(trigger)
  })

  it('moves focus to the next card\'s handle when a focused card is deleted', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])
    screen.getByRole('button', { name: 'delete step 2' }).focus()
    await user.keyboard('{Enter}')
    expect(stepOrder()).toEqual(['a', 'c'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /reorder step 2/i }))
    // deleting the last card lands on the new last card
    screen.getByRole('button', { name: 'delete step 2' }).focus()
    await user.keyboard('{Enter}')
    expect(stepOrder()).toEqual(['a'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /reorder step 1/i }))
  })

  it('keeps keyboard focus in the list when a macro is unwrapped', async () => {
    const user = userEvent.setup()
    const macro = { id: 'm', type: 'macro', enabled: true, name: 'mac', steps: [step('x'), step('y')] }
    renderTool([step('a'), macro])
    screen.getByRole('button', { name: 'Unwrap' }).focus()
    await user.keyboard('{Enter}')
    expect(stepOrder()).toEqual(['a', 'x', 'y'])
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /reorder step 2/i }))
  })

  it('Alt+ArrowUp does nothing on the first step', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b')])
    const handle = screen.getByRole('button', { name: /reorder step 1/i })
    handle.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(stepOrder()).toEqual(['a', 'b'])
  })

  it('dispatches REORDER once on drag end, not on every live-reorder frame', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])
    expect(screen.getByTestId('can-undo').textContent).toBe('false')

    // live drag frames update the visual order only
    await user.click(screen.getByTestId('simulate-live-reorder'))
    expect(stepOrder()).toEqual(['c', 'b', 'a'])
    expect(screen.getByTestId('can-undo').textContent).toBe('false')

    expect(storeTree()).toEqual(['a', 'b', 'c'])

    // ending the drag commits it to the store exactly once
    await user.click(screen.getByTestId('simulate-drag-end-c'))
    expect(screen.getByTestId('can-undo').textContent).toBe('true')
    expect(stepOrder()).toEqual(['c', 'b', 'a'])
    expect(storeTree()).toEqual(['c', 'b', 'a'])
  })

  it('commits a drag inside a branch lane to that lane only (REORDER with parentId + lane)', async () => {
    const user = userEvent.setup()
    const branch = { id: 'br', type: 'branch', enabled: true, branches: [[step('x'), step('y')], [step('z'), step('w')]], merge: { mode: 'concat', separator: '\n' } }
    renderTool([step('a'), branch])
    // groups in document order: the top level, then lane 1, then lane 2
    const groups = screen.getAllByTestId('simulate-live-reorder')
    expect(groups).toHaveLength(3)
    await user.click(groups[2])
    await user.click(screen.getByTestId('simulate-drag-end-w'))
    expect(storeTree()).toEqual(['a', { br: [['x', 'y'], ['w', 'z']] }])
  })
})

describe('<StepList /> animation', () => {
  it('animates reorders by position only, so a card whose preview grows is not scale-distorted', () => {
    renderTool([step('a'), step('b')])
    expect(screen.getByTestId('reorder-item-a')).toHaveAttribute('data-layout', 'position')
  })
})

describe('<StepList /> selection mode', () => {
  const selectFirstTwo = async user => {
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByLabelText('select step 1'))
    await user.click(screen.getByLabelText('select step 2'))
  }

  it('groups a contiguous selection into a macro, named inline (no blocking window.prompt)', async () => {
    const user = userEvent.setup()
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('from-prompt')
    renderTool([step('a'), step('b'), step('c')])
    await selectFirstTwo(user)

    expect(screen.queryByText(/next to each other/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Group into macro' }))
    const name = screen.getByLabelText('name for the new macro')
    expect(name).toHaveFocus()
    await user.clear(name)
    await user.type(name, 'combo{Enter}')

    expect(prompt).not.toHaveBeenCalled()
    expect(await screen.findByLabelText('macro name')).toHaveValue('combo')
    // the macro (steps a+b) collapses to one row, leaving c as the only other step
    expect(stepOrder()).toHaveLength(2)
    expect(stepOrder()[1]).toBe('c')
  })

  it('Escape cancels naming without grouping and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b')])
    await selectFirstTwo(user)
    const trigger = screen.getByRole('button', { name: 'Group into macro' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('name for the new macro')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(stepOrder()).toEqual(['a', 'b'])
    expect(screen.getByTestId('can-undo').textContent).toBe('false')
  })

  it('explains why a non-contiguous selection cannot be grouped', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByLabelText('select step 1'))
    await user.click(screen.getByLabelText('select step 3'))

    expect(screen.getByText(/next to each other/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Group into macro' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Put in a branch' })).toBeDisabled()
    // saving a copy and deleting don't require contiguity
    expect(screen.getByRole('button', { name: 'Save as macro' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
  })

  it('saves a deep copy of a (non-contiguous) selection to the library and announces it', async () => {
    const user = userEvent.setup()
    renderTool([step('a', 'trim'), step('b'), step('c', 'reverse')])
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByLabelText('select step 1'))
    await user.click(screen.getByLabelText('select step 3'))
    await user.click(screen.getByRole('button', { name: 'Save as macro' }))
    await user.clear(screen.getByLabelText('name for the new macro'))
    await user.type(screen.getByLabelText('name for the new macro'), 'kept{Enter}')

    const live = await screen.findByText('saved "kept" to library')
    expect(live.closest('[aria-live]')).not.toBeNull()
    const [entry, ...rest] = listEntries('macro')
    expect(rest).toHaveLength(0)
    expect(entry.name).toBe('kept')
    expect(entry.steps.map(s => s.utilityId)).toEqual(['trim', 'reverse'])
    expect(entry.steps.some(s => ['a', 'b', 'c'].includes(s.id))).toBe(false)
    // the pipeline itself is untouched
    expect(stepOrder()).toEqual(['a', 'b', 'c'])
    expect(screen.getByTestId('can-undo').textContent).toBe('false')
  })

  it('deletes the selected steps', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])
    await selectFirstTwo(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(stepOrder()).toEqual(['c'])
    expect(screen.getByText('deleted 2 steps').closest('[aria-live]')).not.toBeNull()
    // the pressed button is now disabled (nothing selected): focus stays in the bar
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done selecting' }))
  })

  it('wraps a contiguous selection into a branch', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b')])
    await selectFirstTwo(user)
    await user.click(screen.getByRole('button', { name: 'Put in a branch' }))
    expect(await screen.findByText('parallel lanes')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done selecting' }))
    expect(document.querySelector('[data-step-id="a"]').closest('[data-step-id^="branch"]')).not.toBeNull()
  })

  it('makes a contiguous selection run on each line, as one undoable edit', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])
    await selectFirstTwo(user)
    await user.click(screen.getByRole('button', { name: 'Run on each line' }))
    expect(screen.getByText('2 steps now run on each line').closest('[aria-live]')).not.toBeNull()
    const [wrapper, last] = storeTree()
    expect(Object.values(wrapper)[0]).toEqual(['a', 'b'])
    expect(last).toBe('c')
    expect(screen.getByRole('combobox', { name: 'split the input into' })).toHaveValue('lines')
    expect(document.querySelector('[data-step-id="a"]').closest('[data-step-id^="each"]')).not.toBeNull()
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: 'Done selecting' })[0])
    await user.click(screen.getByRole('button', { name: 'Unwrap' }))
    expect(storeTree()).toEqual(['a', 'b', 'c'])
  })

  it('offers no selection mode for an empty sequence', () => {
    renderTool([])
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
  })

  it('gives each nested sequence its own, distinctly named selection toggle', () => {
    const branch = { id: 'br', type: 'branch', enabled: true, branches: [[step('x')], [step('y')]], merge: { mode: 'concat', separator: '\n' } }
    renderTool([branch])
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'select steps in lane 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'select steps in lane 2' })).toBeTruthy()
  })
})

describe('<StepList /> "run on each" bodies', () => {
  const each = (steps = [], id = 'ea') => ({ id, type: 'each', enabled: true, split: { mode: 'lines' }, skipEmpty: true, steps })

  it('renders the body as its own nested list, with its own add control and selection toggle', async () => {
    const user = userEvent.setup()
    renderTool([each([step('x')])])
    expect(screen.getByRole('group', { name: 'steps run on each line' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'select steps in run-on-each step' })).toBeTruthy()
    await user.selectOptions(screen.getByRole('combobox', { name: 'add a step to this run-on-each step' }), 'reverse')
    const [tree] = storeTree()
    expect(tree.ea).toHaveLength(2)
    expect(tree.ea[0]).toBe('x')
  })

  it('edits the split as undoable changes: mode, then a separator that can never be emptied', async () => {
    const user = userEvent.setup()
    renderTool([each([step('x')])])
    await user.selectOptions(screen.getByRole('combobox', { name: 'split the input into' }), 'delimiter')
    const sep = screen.getByRole('textbox', { name: 'item separator' })
    expect(sep).toHaveValue(',')
    await user.clear(sep)
    await user.tab()
    expect(sep).toHaveValue(',')
    await user.clear(sep)
    await user.type(sep, '\\t{Enter}')
    expect(sep).toHaveValue('\\t')
    expect(screen.getByTestId('can-undo').textContent).toBe('true')
  })

  it('bulk-toggles steps inside an each body', async () => {
    const user = userEvent.setup()
    renderTool([each([step('x')])])
    await user.click(screen.getByRole('button', { name: 'Turn all off' }))
    expect(JSON.parse(screen.getByTestId('enabled').textContent)).toEqual([false, false])
  })
})

describe('<BulkToggle /> through the real store', () => {
  it('turns every step off and on again, nested ones included', async () => {
    const user = userEvent.setup()
    const macro = { id: 'm', type: 'macro', enabled: true, name: 'mac', steps: [step('x')] }
    renderTool([step('a'), macro])
    expect(JSON.parse(screen.getByTestId('enabled').textContent)).toEqual([true, true, true])
    await user.click(screen.getByRole('button', { name: 'Turn all off' }))
    expect(JSON.parse(screen.getByTestId('enabled').textContent)).toEqual([false, false, false])
    expect(screen.getByLabelText('toggle step 1')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Turn all on' }))
    expect(JSON.parse(screen.getByTestId('enabled').textContent)).toEqual([true, true, true])
  })

  it('renders inert (disabled) outside a ToolProvider', () => {
    render(<BulkToggle />)
    expect(screen.getByRole('button', { name: 'Turn all off' })).toBeDisabled()
  })
})

describe('<StepList /> menu actions through the real store', () => {
  it('Solo disables every sibling; Rename labels the step', async () => {
    const user = userEvent.setup()
    renderTool([step('a'), step('b'), step('c')])
    await user.click(screen.getByRole('button', { name: 'step 2 menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Solo' }))
    expect(screen.getByLabelText('toggle step 1')).not.toBeChecked()
    expect(screen.getByLabelText('toggle step 2')).toBeChecked()
    expect(screen.getByLabelText('toggle step 3')).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'step 3 menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.type(screen.getByLabelText('step name'), 'tidy up{Enter}')
    expect(screen.getByText('tidy up').closest('[data-step-id]')).toHaveAttribute('data-step-id', 'c')
  })
})
