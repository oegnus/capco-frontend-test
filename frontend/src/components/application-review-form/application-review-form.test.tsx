import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { ApplicationReviewForm } from './application-review-form'

function renderReview() {
  const onSubmit = vi.fn()
  const onReturnToForm = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <ApplicationReviewForm
      onSubmit={onSubmit}
      onReturnToForm={onReturnToForm}
    />,
  )
  return { user, onSubmit, onReturnToForm, ...view }
}

describe('ApplicationReviewForm', () => {
  it('shows the review with its confirmation', async () => {
    const { container } = renderReview()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Review application' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', {
        name: 'I confirm the information is complete and accurate.',
      }),
    ).toBeInTheDocument()
    expect((await axe(container)).violations).toEqual([])
  })

  it('hands each action to the caller', async () => {
    const { user, onSubmit, onReturnToForm } = renderReview()

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await user.click(screen.getByRole('button', { name: 'Return to form' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onReturnToForm).toHaveBeenCalledTimes(1)
  })

  it('requires the confirmation before submitting', async () => {
    const { user, onSubmit } = renderReview()

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    // The browser reports the missing confirmation, as on Personal details.
    expect(screen.getByRole('checkbox')).toBeInvalid()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits once confirmed', async () => {
    const { user, onSubmit } = renderReview()

    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getByRole('checkbox')).toBeValid()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('returns to the form without confirming', async () => {
    const { user, onReturnToForm } = renderReview()

    await user.click(screen.getByRole('button', { name: 'Return to form' }))

    expect(onReturnToForm).toHaveBeenCalledTimes(1)
  })
})
