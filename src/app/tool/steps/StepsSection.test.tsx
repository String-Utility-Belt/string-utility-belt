import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToolProvider } from '@/app/ToolContext'
import StepsSection from './StepsSection'

describe('StepsSection', () => {
  // the first import of the chunk transforms the whole step editor and framer-motion: allow for it
  it('shows a loading line until the step list chunk arrives, then the steps', async () => {
    render(
      <ToolProvider initialSteps={[{ id: 's1', utilityId: 'trim', enabled: true, params: {} }]} persist={false}>
        <StepsSection />
      </ToolProvider>,
    )
    expect(screen.getByText('Loading steps…')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^reorder step 1/ }, { timeout: 15000 })).toBeInTheDocument()
    expect(screen.queryByText('Loading steps…')).not.toBeInTheDocument()
  }, 20000)
})
