import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../test/server'

import { LogOutLink } from './log-out-link'

const endpoint = '/api/v1/applicant-sessions/current'

function renderLink() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const onLoggedOut = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <LogOutLink onLoggedOut={onLoggedOut} />
    </QueryClientProvider>,
  )
  return { user, onLoggedOut, ...view }
}

describe('LogOutLink', () => {
  it('has no detectable accessibility violations', async () => {
    const { container } = renderLink()
    expect((await axe(container)).violations).toEqual([])
  })

  it('logs out once and shows the pending state meanwhile', async () => {
    let requests = 0
    server.use(
      http.delete(endpoint, async () => {
        requests += 1
        await delay(50)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user, onLoggedOut } = renderLink()

    await user.click(screen.getByRole('link', { name: 'Log out' }))
    await user.click(screen.getByRole('link', { name: 'Logging out…' }))

    await vi.waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1))
    expect(requests).toBe(1)
  })

  it.each([
    [
      'a network failure',
      () => HttpResponse.error(),
      "We couldn't reach the server. Check your connection and try again.",
    ],
    [
      'a rejected request',
      () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '403',
                code: 'access-denied',
                title: 'Access denied',
                detail: 'You do not have permission to access this resource.',
              },
            ],
          },
          {
            status: 403,
            headers: { 'Content-Type': 'application/vnd.api+json' },
          },
        ),
      "Something went wrong and you weren't logged out. Try again.",
    ],
  ])('explains %s and stays logged in', async (_case, resolver, message) => {
    server.use(http.delete(endpoint, resolver))
    const { user, onLoggedOut, container } = renderLink()

    await user.click(screen.getByRole('link', { name: 'Log out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('link', { name: 'Log out' })).toBeInTheDocument()
    expect(onLoggedOut).not.toHaveBeenCalled()
    expect((await axe(container)).violations).toEqual([])
  })
})
