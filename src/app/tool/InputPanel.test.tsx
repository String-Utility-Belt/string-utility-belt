import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolProvider, useTool } from '@/app/ToolContext'
import * as fetchInput from '@/app/io/fetchInput'
import * as fileInput from '@/app/io/fileInput'
import * as history from '@/app/io/history'
import InputPanel from './InputPanel'

function RunProbe() {
  const { run, setInput } = useTool()
  return (
    <>
      <div data-testid="run-state">{run.result ? 'ran' : 'idle'}</div>
      <button type="button" onClick={() => run.runNow()}>probe: run</button>
      <button type="button" onClick={() => setInput(new Uint8Array([9, 9, 9]))}>probe: external bytes</button>
    </>
  )
}

function Harness() {
  return (
    <ToolProvider initialSteps={[]} initialInput="" persist={false}>
      <RunProbe />
      <InputPanel />
    </ToolProvider>
  )
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const textarea = () => screen.getByPlaceholderText(/type or paste/i) as HTMLTextAreaElement

describe('InputPanel — text editing basics', () => {
  it('keeps the textarea id/placeholder App.test.jsx relies on', () => {
    render(<Harness />)
    const textarea = screen.getByPlaceholderText(/type or paste text here, or drop a file/i)
    expect(textarea.id).toBe('pipeline-input')
  })

  it('shows Ln 1, Col 1 initially and tracks the caret afterwards', () => {
    render(<Harness />)
    expect(screen.getByText('Ln 1, Col 1')).toBeTruthy()
    const textarea = screen.getByPlaceholderText(/type or paste/i)
    fireEvent.change(textarea, { target: { value: 'ab\ncd', selectionStart: 4, selectionEnd: 4 } })
    expect(screen.getByText('Ln 2, Col 2')).toBeTruthy()
  })
})

describe('InputPanel — go to line', () => {
  it('Ctrl+G opens a field that moves the caret to the target line on Enter', () => {
    render(<Harness />)
    const textarea = screen.getByPlaceholderText(/type or paste/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'aaa\nbbb\nccc' } })
    fireEvent.keyDown(textarea, { key: 'g', ctrlKey: true })
    const goToInput = screen.getByLabelText(/go to line/i) as HTMLInputElement
    fireEvent.change(goToInput, { target: { value: '3' } })
    fireEvent.keyDown(goToInput, { key: 'Enter' })
    expect(textarea.selectionStart).toBe(8)
    expect(screen.queryByLabelText(/go to line/i)).toBeNull()
  })

  it('Escape cancels without moving the caret', () => {
    render(<Harness />)
    const textarea = screen.getByPlaceholderText(/type or paste/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'aaa\nbbb', selectionStart: 0, selectionEnd: 0 } })
    fireEvent.keyDown(textarea, { key: 'g', ctrlKey: true })
    fireEvent.keyDown(screen.getByLabelText(/go to line/i), { key: 'Escape' })
    expect(screen.queryByLabelText(/go to line/i)).toBeNull()
    expect(textarea.selectionStart).toBe(0)
  })
})

describe('InputPanel — files (open/drag-drop/paste)', () => {
  it('decodes a small text file dropped onto the panel', async () => {
    render(<Harness />)
    // the textarea's parent IS the panel's drop-zone div (no wrapping DOM node in between)
    const dropzone = screen.getByPlaceholderText(/type or paste/i).parentElement as HTMLElement
    const file = new File(['hello file'], 'a.txt', { type: 'text/plain' })
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(screen.getByPlaceholderText(/type or paste/i)).toHaveValue('hello file'))
  })

  it('shows a binary panel (name/size/mime/hex) for non-UTF-8 bytes, with treat-as-text', async () => {
    render(<Harness />)
    const dropzone = screen.getByPlaceholderText(/type or paste/i).parentElement as HTMLElement
    const invalid = new Uint8Array([0xff, 0xfe, 0x00, 0x01])
    const file = new File([invalid], 'blob.bin', { type: 'application/octet-stream' })
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })

    const nameEl = await screen.findByText('blob.bin')
    const summary = nameEl.parentElement as HTMLElement
    expect(summary.textContent).toContain('4 bytes')
    expect(summary.textContent).toContain('application/octet-stream')
    expect(screen.getByText(/ff fe 00 01/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /treat as text/i }))
    expect(screen.getByText(/replacement character/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/type or paste/i)).toBeTruthy()
  })

  it('clear resets a binary input back to an empty text field', async () => {
    render(<Harness />)
    const dropzone = screen.getByPlaceholderText(/type or paste/i).parentElement as HTMLElement
    const file = new File([new Uint8Array([0xff, 0xfe])], 'x.bin', { type: 'application/octet-stream' })
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })
    await screen.findByText('x.bin')
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }))
    expect(screen.getByPlaceholderText(/type or paste/i)).toHaveValue('')
  })

  it('treats a pasted file as file input', async () => {
    render(<Harness />)
    const textarea = screen.getByPlaceholderText(/type or paste/i)
    const file = new File(['pasted contents'], 'note.txt', { type: 'text/plain' })
    fireEvent.paste(textarea, { clipboardData: { files: [file], getData: () => '' } })
    await waitFor(() => expect(screen.getByPlaceholderText(/type or paste/i)).toHaveValue('pasted contents'))
  })
})

describe('InputPanel — clipboard paste button', () => {
  const originalClipboard = navigator.clipboard

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
  })

  it('pastes clipboard text into the input', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn().mockResolvedValue('clip text') },
      configurable: true,
    })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    await waitFor(() => expect(screen.getByPlaceholderText(/type or paste/i)).toHaveValue('clip text'))
  })

  it('shows an error when clipboard permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/denied/i)
  })
})

describe('InputPanel — auto-run on paste (manual mode)', () => {
  beforeEach(() => {
    localStorage.setItem('sub:pref:liveRun', 'false')
  })

  it('runs once after a text paste lands, since autoRunOnPaste defaults on', async () => {
    render(<Harness />)
    expect(screen.getByTestId('run-state').textContent).toBe('idle')
    const textarea = screen.getByPlaceholderText(/type or paste/i)
    fireEvent.paste(textarea, { clipboardData: { files: [], getData: () => 'pasted text' } })
    fireEvent.change(textarea, { target: { value: 'pasted text' } })
    await waitFor(() => expect(screen.getByTestId('run-state').textContent).toBe('ran'))
  })

  it('does not run on plain typing (no paste) in manual mode', async () => {
    render(<Harness />)
    const textarea = screen.getByPlaceholderText(/type or paste/i)
    fireEvent.change(textarea, { target: { value: 'typed text' } })
    await new Promise(r => setTimeout(r, 50))
    expect(screen.getByTestId('run-state').textContent).toBe('idle')
  })
})

describe('InputPanel — review regressions', () => {
  it('lets a plain-text drag-and-drop reach the textarea (only file drops are intercepted)', () => {
    render(<Harness />)
    const notPrevented = fireEvent.drop(textarea(), { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(notPrevented).toBe(true)
  })

  it('shows an error instead of an unhandled rejection when a file cannot be read', async () => {
    vi.spyOn(fileInput, 'readFileAsInput').mockRejectedValue(new Error('NotReadableError'))
    render(<Harness />)
    fireEvent.drop(textarea().parentElement as HTMLElement, { dataTransfer: { files: [new File(['x'], 'x.txt')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't read x\.txt/i)
  })

  it('applies the most recently dropped file even when an earlier read finishes last', async () => {
    const pending: Record<string, (v: fileInput.FileInputResult) => void> = {}
    vi.spyOn(fileInput, 'readFileAsInput').mockImplementation(file => new Promise(r => { pending[file.name] = r }))
    render(<Harness />)
    const zone = textarea().parentElement as HTMLElement
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['old'], 'old.txt')] } })
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['new'], 'new.txt')] } })
    const meta = (name: string) => ({ name, size: 3, mime: 'text/plain' })
    pending['new.txt']({ kind: 'text', value: 'new', meta: meta('new.txt') })
    await waitFor(() => expect(textarea()).toHaveValue('new'))
    pending['old.txt']({ kind: 'text', value: 'old', meta: meta('old.txt') })
    await new Promise(r => setTimeout(r, 20))
    expect(textarea()).toHaveValue('new')
  })

  it("does not label unrelated bytes with a previously opened file's name", async () => {
    render(<Harness />)
    fireEvent.drop(textarea().parentElement as HTMLElement, {
      dataTransfer: { files: [new File([new Uint8Array([0xff, 0xfe])], 'first.bin', { type: 'application/octet-stream' })] },
    })
    await screen.findByText('first.bin')
    fireEvent.click(screen.getByRole('button', { name: 'probe: external bytes' }))
    expect(screen.queryByText('first.bin')).toBeNull()
    expect(screen.getByText('Binary input')).toBeTruthy()
  })

  it('accepts a pasted file while the binary panel (no textarea) has focus', async () => {
    render(<Harness />)
    fireEvent.drop(textarea().parentElement as HTMLElement, {
      dataTransfer: { files: [new File([new Uint8Array([0xff])], 'b.bin')] },
    })
    const clear = await screen.findByRole('button', { name: /^clear$/i })
    fireEvent.paste(clear, { clipboardData: { files: [new File(['from clipboard'], 'c.txt', { type: 'text/plain' })], getData: () => '' } })
    await waitFor(() => expect(textarea()).toHaveValue('from clipboard'))
  })

  it("shows the fetched URL's file name and content type for a binary fetch", async () => {
    vi.spyOn(fetchInput, 'fetchAsInput').mockResolvedValue({
      value: new Uint8Array([0x89, 0x50]), contentType: 'image/png', finalUrl: 'https://example.com/img/logo.png?v=2',
    })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /fetch url/i }))
    fireEvent.change(screen.getByLabelText('URL to fetch'), { target: { value: 'https://example.com/img/logo.png?v=2' } })
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }))
    const name = await screen.findByText('logo.png')
    expect((name.parentElement as HTMLElement).textContent).toContain('image/png')
    // binary input has no textarea, so focus goes back to the button (in an effect after the row closes)
    expect(screen.queryByLabelText('URL to fetch')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: /fetch url/i })).toHaveFocus())
  })

  it('says the clipboard is unavailable (not "denied") when the Clipboard API is missing', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    try {
      render(<Harness />)
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/isn't available/i)
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as any).clipboard
    }
  })

  it('go to line scrolls the target line into view', () => {
    render(<Harness />)
    const el = textarea()
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
    fireEvent.change(el, { target: { value: lines } })
    // jsdom does no layout: model 20px per line and a 100px-tall viewport
    let scrollTop = 0
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get() { return this.value.split('\n').length * 20 } })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 })
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => scrollTop, set: v => { scrollTop = v } })
    fireEvent.keyDown(el, { key: 'g', ctrlKey: true })
    const field = screen.getByLabelText(/go to line/i)
    fireEvent.change(field, { target: { value: '60' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(el.value).toBe(lines) // the measuring trick must restore the text
    expect(el.selectionStart).toBe(lines.indexOf('line 60'))
    expect(scrollTop).toBeGreaterThan(900)
    expect(scrollTop).toBeLessThan(1200)
    expect(screen.getByText('Ln 60, Col 1')).toBeTruthy()
  })

  it('keeps Ln/Col within the text when the input is replaced from outside', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { value: { readText: vi.fn().mockResolvedValue('x') }, configurable: true })
    try {
      render(<Harness />)
      fireEvent.change(textarea(), { target: { value: 'aaa\nbbb\nccc', selectionStart: 11, selectionEnd: 11 } })
      expect(screen.getByText('Ln 3, Col 4')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
      await waitFor(() => expect(textarea()).toHaveValue('x'))
      expect(screen.getByText('Ln 1, Col 2')).toBeTruthy()
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else delete (navigator as any).clipboard
    }
  })
})

describe('InputPanel — paste and dialog edge cases', () => {
  const clipboard = (files: File[], text: string) => ({
    files,
    types: [...(text ? ['text/plain'] : []), ...(files.length ? ['Files'] : [])],
    getData: (type: string) => (type === 'text/plain' || type === 'text' ? text : ''),
  })

  it('pastes the text, not the snapshot image, when the clipboard holds both (Excel/Word copies)', async () => {
    const read = vi.spyOn(fileInput, 'readFileAsInput')
    render(<Harness />)
    const image = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'image.png', { type: 'image/png' })
    const notPrevented = fireEvent.paste(textarea(), { clipboardData: clipboard([image], 'a\tb\n1\t2') })
    expect(notPrevented).toBe(true) // the browser inserts the text itself
    await new Promise(r => setTimeout(r, 20))
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByText('image.png')).toBeNull()
  })

  it('still takes the file when the clipboard text is only its name (a file copied in the OS file manager)', async () => {
    render(<Harness />)
    const file = new File(['file body'], 'note.txt', { type: 'text/plain' })
    fireEvent.paste(textarea(), { clipboardData: clipboard([file], 'note.txt') })
    await waitFor(() => expect(textarea()).toHaveValue('file body'))
  })

  it('ignores a file pasted into the URL field', async () => {
    const read = vi.spyOn(fileInput, 'readFileAsInput')
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /fetch url/i }))
    const file = new File(['sneaky'], 's.txt', { type: 'text/plain' })
    fireEvent.paste(screen.getByLabelText('URL to fetch'), { clipboardData: clipboard([file], '') })
    await new Promise(r => setTimeout(r, 20))
    expect(read).not.toHaveBeenCalled()
    expect(textarea()).toHaveValue('')
  })
})

describe('InputPanel — fetch URL row', () => {
  const button = () => screen.getByRole('button', { name: /fetch url/i })
  const url = () => screen.getByLabelText('URL to fetch')

  it('toggles an inline row under the header and focuses its field', () => {
    render(<Harness />)
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    expect(url()).toHaveFocus()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button())
    expect(screen.queryByLabelText('URL to fetch')).toBeNull()
    expect(button()).toHaveAttribute('aria-expanded', 'false')
  })

  it('loads fetched text, closes the row and focuses the textarea', async () => {
    vi.spyOn(fetchInput, 'fetchAsInput').mockResolvedValue({ value: 'hello', contentType: 'text/plain', finalUrl: 'https://example.com/a.txt' })
    render(<Harness />)
    fireEvent.click(button())
    fireEvent.change(url(), { target: { value: 'https://example.com/a.txt' } })
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }))
    await waitFor(() => expect(textarea()).toHaveValue('hello'))
    expect(screen.queryByLabelText('URL to fetch')).toBeNull()
    // focus moves in an effect after the commit that closes the row
    await waitFor(() => expect(textarea()).toHaveFocus())
    // a successful fetch starts the next one from an empty field
    fireEvent.click(button())
    expect(url()).toHaveValue('')
  })

  it("shows a failed fetch in the panel's alert strip and clears it when the row closes", async () => {
    vi.spyOn(fetchInput, 'fetchAsInput').mockRejectedValue(new Error('that host is blocked'))
    render(<Harness />)
    fireEvent.click(button())
    fireEvent.change(url(), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('that host is blocked')
    fireEvent.keyDown(url(), { key: 'Escape' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(button()).toHaveFocus()
  })

  it('keeps the URL when the row is closed without fetching', () => {
    render(<Harness />)
    fireEvent.click(button())
    fireEvent.change(url(), { target: { value: 'https://example.com/keep' } })
    fireEvent.keyDown(url(), { key: 'Escape' })
    fireEvent.click(button())
    expect(url()).toHaveValue('https://example.com/keep')
  })

  it('Cancel aborts the fetch in flight, closes the row and returns focus to the button', () => {
    let signal: AbortSignal | undefined
    vi.spyOn(fetchInput, 'fetchAsInput').mockImplementation((_u, opts) => {
      signal = opts?.signal
      return new Promise(() => {})
    })
    render(<Harness />)
    fireEvent.click(button())
    fireEvent.change(url(), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(signal?.aborted).toBe(true)
    expect(screen.queryByLabelText('URL to fetch')).toBeNull()
    expect(button()).toHaveFocus()
  })
})

describe('InputPanel — history saving', () => {
  beforeEach(() => localStorage.setItem('sub:pref:liveRun', 'false'))

  it('saves the input to history whenever a manual run completes', async () => {
    const save = vi.spyOn(history, 'saveHistory').mockResolvedValue(undefined)
    render(<Harness />)
    fireEvent.change(textarea(), { target: { value: 'run me' } })
    fireEvent.click(screen.getByRole('button', { name: 'probe: run' }))
    await waitFor(() => expect(screen.getByTestId('run-state').textContent).toBe('ran'))
    await waitFor(() => expect(save).toHaveBeenCalledWith('run me'))
  })

  it('saves nothing once the user turns input history off (secrets pasted in for decoding stay off disk)', async () => {
    localStorage.setItem('sub:pref:inputHistory', 'false')
    const save = vi.spyOn(history, 'saveHistory').mockResolvedValue(undefined)
    render(<Harness />)
    fireEvent.change(textarea(), { target: { value: 'eyJhbGciOi.secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'probe: run' }))
    await waitFor(() => expect(screen.getByTestId('run-state').textContent).toBe('ran'))
    await new Promise(r => setTimeout(r, 50))
    expect(save).not.toHaveBeenCalled()
  })

  it('does not reject unhandled when saving fails', async () => {
    vi.spyOn(history, 'saveHistory').mockRejectedValue(new Error('QuotaExceededError'))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      render(<Harness />)
      fireEvent.change(textarea(), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: 'probe: run' }))
      await waitFor(() => expect(screen.getByTestId('run-state').textContent).toBe('ran'))
      await new Promise(r => setTimeout(r, 20))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})

describe('InputPanel — auto-run on paste preference', () => {
  beforeEach(() => localStorage.setItem('sub:pref:liveRun', 'false'))

  it('offers a "run on paste" switch in manual mode that turns the behaviour off', async () => {
    render(<Harness />)
    const toggle = screen.getByRole('checkbox', { name: /run on paste/i })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(JSON.parse(localStorage.getItem('sub:pref:autoRunOnPaste') as string)).toBe(false)
    fireEvent.paste(textarea(), { clipboardData: { files: [], getData: () => 'p' } })
    fireEvent.change(textarea(), { target: { value: 'p' } })
    await new Promise(r => setTimeout(r, 50))
    expect(screen.getByTestId('run-state').textContent).toBe('idle')
  })

  it('does not treat a later keystroke as a paste when the paste itself changed nothing', async () => {
    render(<Harness />)
    fireEvent.paste(textarea(), { clipboardData: { files: [], getData: () => '' } })
    await new Promise(r => setTimeout(r, 10))
    fireEvent.change(textarea(), { target: { value: 'typed' } })
    await new Promise(r => setTimeout(r, 50))
    expect(screen.getByTestId('run-state').textContent).toBe('idle')
  })
})
