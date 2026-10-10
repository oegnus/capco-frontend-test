import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useFieldErrors } from './use-field-errors'

const fields = ['first', 'second'] as const

function Harness() {
  const { fieldErrors, fieldRef, showFieldErrors, clearFieldError } =
    useFieldErrors(fields)
  return (
    <>
      <input aria-label="first" ref={fieldRef('first')} />
      <input aria-label="second" ref={fieldRef('second')} />
      <button
        onClick={() => showFieldErrors({ second: 'B', first: 'A' })}
        type="button"
      >
        Both invalid
      </button>
      <button onClick={() => showFieldErrors({ second: 'B' })} type="button">
        Second invalid
      </button>
      <button onClick={() => clearFieldError('first')} type="button">
        Clear first
      </button>
      <output>{JSON.stringify(fieldErrors)}</output>
    </>
  )
}

describe('useFieldErrors', () => {
  it('focuses the first invalid field in field order', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Both invalid' }))
    expect(screen.getByLabelText('first')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Second invalid' }))
    expect(screen.getByLabelText('second')).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('{"second":"B"}')
  })

  it('clears only the requested fields', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Both invalid' }))
    await user.click(screen.getByRole('button', { name: 'Clear first' }))

    expect(screen.getByRole('status')).toHaveTextContent('{"second":"B"}')
  })
})
