import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../test/server'

import { SignInForm, type SignInFormProps } from './sign-in-form'

const endpoint = '/api/v1/applicant-sessions'
const jsonApi = { 'Content-Type': 'application/vnd.api+json' }
const journeyHref =
  '/applications/0199a8bb-8687-7c22-aed5-55d432f50f23/personal-details'

function sessionResponse() {
  return HttpResponse.json(
    {
      data: {
        type: 'applicant-sessions',
        id: '7a1c3d2e-0000-4000-8000-000000000000',
        attributes: { href: journeyHref },
      },
    },
    { status: 201, headers: jsonApi },
  )
}

function errorResponse(status: number, errors: unknown[], headers = {}) {
  return HttpResponse.json(
    { errors },
    { status, headers: { ...jsonApi, ...headers } },
  )
}

function renderForm(props: Partial<SignInFormProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const onSignedIn = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SignInForm
        createAccountHref="/create-account"
        onSignedIn={onSignedIn}
        {...props}
      />
    </QueryClientProvider>,
  )
  return { user, onSignedIn, ...view }
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  { email = 'ada@example.com', password = 'Secret!' } = {},
) {
  if (email) {
    await user.type(screen.getByLabelText('Email address'), email)
  }
  if (password) {
    await user.type(screen.getByLabelText('Password'), password)
  }
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignInForm', () => {
  it('has no detectable accessibility violations', async () => {
    const { container } = renderForm()
    expect((await axe(container)).violations).toEqual([])
  })

  it('submits a JSON:API document and hands over the journey URL', async () => {
    let request: Request | undefined
    server.use(
      http.post(endpoint, ({ request: received }) => {
        request = received.clone()
        return sessionResponse()
      }),
    )
    const { user, onSignedIn } = renderForm()

    await fillAndSubmit(user, { email: '  ada@example.com ' })

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(journeyHref))
    expect(request?.headers.get('Content-Type')).toBe(
      'application/vnd.api+json',
    )
    expect(request?.headers.get('Accept')).toBe('application/vnd.api+json')
    expect(request?.credentials).toBe('same-origin')
    expect(await request?.json()).toEqual({
      data: {
        type: 'applicant-sessions',
        attributes: { email: 'ada@example.com', password: 'Secret!' },
      },
    })
  })

  it('requires both fields before calling the API', async () => {
    const request = vi.fn()
    server.use(http.post(endpoint, request))
    const { user, container } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const email = screen.getByLabelText('Email address')
    expect(email).toHaveFocus()
    expect(email).toHaveAccessibleDescription('Enter your email address.')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Enter your password.',
    )
    expect(request).not.toHaveBeenCalled()
    expect((await axe(container)).violations).toEqual([])
  })

  it('checks the email format before calling the API', async () => {
    const request = vi.fn()
    server.use(http.post(endpoint, request))
    const { user } = renderForm()

    await fillAndSubmit(user, { email: 'not-an-email' })

    const email = screen.getByLabelText('Email address')
    expect(email).toHaveFocus()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription(
      'Enter an email address in the format name@example.com.',
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('shows one generic error for invalid credentials, keeping the email', async () => {
    server.use(
      http.post(endpoint, () =>
        errorResponse(401, [
          {
            status: '401',
            code: 'invalid-credentials',
            title: 'Authentication failed',
            detail: 'Invalid email or password',
          },
        ]),
      ),
    )
    const { user, onSignedIn, container } = renderForm()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email address or password is incorrect.',
    )
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'ada@example.com',
    )
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(onSignedIn).not.toHaveBeenCalled()
    expect((await axe(container)).violations).toEqual([])
  })

  it('shows malformed-input errors next to the matching field', async () => {
    server.use(
      http.post(endpoint, () =>
        errorResponse(400, [
          {
            status: '400',
            code: 'validation-failed',
            title: 'Invalid attribute',
            detail: 'Enter a valid email address.',
            source: { pointer: '/data/attributes/email' },
          },
        ]),
      ),
    )
    const { user } = renderForm()

    await fillAndSubmit(user)

    const email = await screen.findByLabelText('Email address', {
      selector: '[aria-invalid="true"]',
    })
    expect(email).toHaveFocus()
    expect(email).toHaveAccessibleDescription('Enter a valid email address.')
    expect(email).toHaveValue('ada@example.com')
  })

  it.each([
    [
      'rate limiting',
      () =>
        errorResponse(
          429,
          [
            {
              status: '429',
              code: 'rate-limited',
              title: 'Too many requests',
              detail: 'Too many attempts. Try again later.',
            },
          ],
          { 'Retry-After': '30' },
        ),
      'Too many attempts. Try again in 30 seconds.',
    ],
    [
      'a network failure',
      () => HttpResponse.error(),
      "We couldn't reach the server. Check your connection and try again.",
    ],
    [
      'an unexpected server error',
      () => new HttpResponse('Internal error', { status: 500 }),
      "Something went wrong and you weren't signed in. Try again.",
    ],
    [
      'a success response without a journey URL',
      () => HttpResponse.json({ data: {} }, { status: 201, headers: jsonApi }),
      "Something went wrong and you weren't signed in. Try again.",
    ],
  ])('explains %s, keeping the email', async (_case, resolver, message) => {
    server.use(http.post(endpoint, resolver))
    const { user, onSignedIn } = renderForm()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'ada@example.com',
    )
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('reports a network error instead of waiting while the browser is offline', async () => {
    server.use(http.post(endpoint, () => HttpResponse.error()))
    onlineManager.setOnline(false)
    try {
      const { user } = renderForm()

      await fillAndSubmit(user)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't reach the server. Check your connection and try again.",
      )
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('announces the pending state and ignores repeated submits', async () => {
    let requests = 0
    server.use(
      http.post(endpoint, async () => {
        requests += 1
        await delay(100)
        return sessionResponse()
      }),
    )
    const { user, onSignedIn } = renderForm()

    await fillAndSubmit(user)
    const pending = screen.getByRole('button', { name: 'Signing in…' })
    expect(screen.getByRole('status')).toHaveTextContent('Signing in…')
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true')

    await user.click(pending)
    await user.type(screen.getByLabelText('Password'), '{Enter}')

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1))
    expect(requests).toBe(1)
  })
})
