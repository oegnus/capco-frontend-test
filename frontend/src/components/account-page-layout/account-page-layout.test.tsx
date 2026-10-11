import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { AccountPageLayout } from './account-page-layout'

describe('AccountPageLayout', () => {
  it('renders its content inside the page main landmark', async () => {
    const { container } = render(
      <AccountPageLayout>
        <h1>Welcome back</h1>
      </AccountPageLayout>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Welcome back' }),
    )
    expect((await axe(container)).violations).toEqual([])
  })
})
