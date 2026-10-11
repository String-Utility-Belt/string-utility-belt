import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolProvider } from '@/app/ToolContext'
import ToolPage from './ToolPage'
import { HOME_HEADING } from '@/app/pages/seo'

// CodeMirror and its language packs are dynamically imported by the I/O panels;
// mock them the same way IOSection.test.tsx does so this test doesn't pull in a
// real editor instance.
vi.mock('@uiw/react-codemirror', () => ({
  default: (props: any) => <div data-testid="mock-codemirror">{props.value}</div>,
}))
vi.mock('@codemirror/lang-json', () => ({ json: () => null }))
vi.mock('@codemirror/lang-xml', () => ({ xml: () => null }))
vi.mock('@codemirror/lang-html', () => ({ html: () => null }))
vi.mock('@codemirror/lang-sql', () => ({ sql: () => null }))
vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => null }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: () => null }))

// Feature-slot children belong to other workstreams; stub them so this test
// stays focused on ToolPage's own layout/wiring.
vi.mock('@/app/commands/ToolCommandBridge', () => ({ default: () => null }))
vi.mock('@/app/magic/MagicButton', () => ({ default: () => null }))
vi.mock('@/app/share/ShareButton', () => ({ default: () => null }))
vi.mock('@/app/library/LibraryButton', () => ({ default: () => null }))
vi.mock('@/app/library/PresetsButton', () => ({ default: () => null }))
vi.mock('@/app/extension/SaveToExtensionButton', () => ({ default: () => null }))
vi.mock('@/app/sponsors/ToolPromo', () => ({ default: () => null }))
vi.mock('@/app/engine/EngineControls', () => ({ default: () => null }))
vi.mock('./steps/BulkToggle', () => ({ default: () => null }))
vi.mock('@/components/UtilityPicker', () => ({
  default: ({ onPick }: { onPick: (id: string) => void }) => (
    <div data-testid="picker-stub"><button onClick={() => onPick('case')}>pick case</button></div>
  ),
}))

function Harness() {
  return (
    <ToolProvider initialSteps={[]} initialInput="" persist={false}>
      <ToolPage />
    </ToolProvider>
  )
}

/** The add row's picker toggle. */
const pickerToggle = () => screen.getAllByRole('button', { name: /^add (a )?(utility|step)$/i })
  .find(b => b.hasAttribute('aria-expanded'))!

describe('ToolPage utility picker layout', () => {
  it('opens the picker in the steps section, after the steps and the add row', () => {
    render(<Harness />)
    fireEvent.click(pickerToggle())
    const picker = screen.getByTestId('picker-stub')
    expect(picker.closest('section')).toHaveAccessibleName('Pipeline steps')
    // the empty state (in place of the step list) and the toggle both come before the picker
    const empty = screen.getByText('Paste something and we’ll suggest a pipeline.')
    expect(empty.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pickerToggle().compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('closes on the toolbar button (a real toggle)', () => {
    render(<Harness />)
    const toggle = pickerToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByTestId('picker-stub')).toBeTruthy()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(screen.queryByTestId('picker-stub')).toBeNull()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('ToolPage title row', () => {
  it('keeps a page heading for assistive tech', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeInTheDocument()
  })

  it('names the pipeline from its editable title', () => {
    render(<Harness />)
    const name = screen.getByRole('textbox', { name: 'Pipeline name' })
    expect(name).toHaveValue('')
    expect(name).toHaveAttribute('placeholder', 'Untitled pipeline')
    fireEvent.change(name, { target: { value: 'Decode JWT' } })
    expect(name).toHaveValue('Decode JWT')
    fireEvent.change(name, { target: { value: '' } })
    expect(name).toHaveValue('')
  })

  it('starts from the loaded pipeline\'s name', () => {
    render(
      <ToolProvider initialSteps={[]} initialInput="" initialName="My pipeline" persist={false}>
        <ToolPage />
      </ToolProvider>,
    )
    expect(screen.getByRole('textbox', { name: 'Pipeline name' })).toHaveValue('My pipeline')
  })
})

describe('ToolPage toolbar accessibility', () => {
  it('gives the quick-add select an accessible name and adds the picked utility', () => {
    render(<Harness />)
    const quick = screen.getByRole('combobox', { name: 'quick add a utility' })
    fireEvent.change(quick, { target: { value: 'case' } })
    expect(document.querySelectorAll('[data-step-id]')).toHaveLength(1)
  })
})
