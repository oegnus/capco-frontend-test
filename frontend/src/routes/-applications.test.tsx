import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import ApplicationsLayout from './applications'

describe('Applications layout', () => {
  it('logs out from the account bar and returns to sign-in', async () => {
    server.use(
      http.delete(
        '/api/v1/applicant-sessions/current',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const Stub = createRoutesStub([
      {
        path: '/applications',
        Component: ApplicationsLayout,
        children: [
          { path: 'current', Component: () => <main>Journey page</main> },
        ],
      },
      { path: '/sign-in', Component: () => <h1>Sign-in page</h1> },
    ])
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Stub initialEntries={['/applications/current']} />
      </QueryClientProvider>,
    )

    const accountNav = screen.getByRole('navigation', { name: 'Account' })
    expect(screen.getByRole('main')).toHaveTextContent('Journey page')

    await user.click(within(accountNav).getByRole('link', { name: 'Log out' }))

    expect(
      await screen.findByRole('heading', { name: 'Sign-in page' }),
    ).toBeInTheDocument()
  })
})
