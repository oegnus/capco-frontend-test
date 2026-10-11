import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../test/server'

import {
  CreateAccountForm,
  type CreateAccountFormProps,
} from './create-account-form'

const endpoint = '/api/v1/applicant-accounts'
const jsonApi = { 'Content-Type': 'application/vnd.api+json' }

function renderForm(props: Partial<CreateAccountFormProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CreateAccountForm signInHref="/sign-in" {...props} />
    </QueryClientProvider>,
  )
  return { user, ...view }
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  values: { email?: string; password?: string; confirmPassword?: string } = {},
) {
  const {
    email = 'ada@example.com',
    password = 'Secret!',
    confirmPassword = password,
  } = values
  if (email) {
    await user.type(screen.getByLabelText('Email address'), email)
  }
  if (password) {
    await user.type(screen.getByLabelText('Password'), password)
  }
  if (confirmPassword) {
    await user.type(screen.getByLabelText('Confirm password'), confirmPassword)
  }
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

function errorResponse(status: number, errors: unknown[], headers = {}) {
  return HttpResponse.json(
    { errors },
    { status, headers: { ...jsonApi, ...headers } },
  )
}

describe('CreateAccountForm', () => {
  it('has no detectable accessibility violations', async () => {
    const { container } = renderForm()
    expect((await axe(container)).violations).toEqual([])
  })

  it('submits a JSON:API document and confirms account creation', async () => {
    const onNavigate = vi.fn()
    let request: Request | undefined
    server.use(
      http.post(endpoint, ({ request: received }) => {
        request = received.clone()
        return new HttpResponse(null, {
          status: 201,
          headers: { Location: '/api/v1/applicant-accounts/1' },
        })
      }),
    )
    const { user, container } = renderForm({
      onNavigate,
      signInHref: '/sign-in?returnTo=%2Fapplications%2Fcurrent',
    })

    await fillAndSubmit(user, { email: '  ada@example.com ' })

    const heading = await screen.findByRole('heading', {
      name: 'Account created',
    })
    expect(heading).toHaveFocus()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(request?.headers.get('Content-Type')).toBe(
      'application/vnd.api+json',
    )
    expect(request?.headers.get('Accept')).toBe('application/vnd.api+json')
    expect(await request?.json()).toEqual({
      data: {
        type: 'applicant-accounts',
        attributes: { email: 'ada@example.com', password: 'Secret!' },
      },
    })
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect((await axe(container)).violations).toEqual([])

    const signIn = screen.getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute(
      'href',
      '/sign-in?returnTo=%2Fapplications%2Fcurrent',
    )
    await user.click(signIn)
    expect(onNavigate).toHaveBeenCalledWith(
      '/sign-in?returnTo=%2Fapplications%2Fcurrent',
    )
  })

  it('validates on the client before calling the API', async () => {
    const request = vi.fn()
    server.use(http.post(endpoint, request))
    const { user, container } = renderForm()

    await fillAndSubmit(user, {
      email: 'not-an-email',
      password: 'weak',
      confirmPassword: 'other',
    })

    const email = screen.getByLabelText('Email address')
    expect(email).toHaveFocus()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription(
      'Enter an email address in the format name@example.com.',
    )
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      /Password does not meet the requirements/,
    )
    expect(
      screen.getByLabelText('Confirm password'),
    ).toHaveAccessibleDescription('Passwords do not match.')
    expect(request).not.toHaveBeenCalled()
    expect((await axe(container)).violations).toEqual([])

    await user.type(email, 'x')
    expect(email).not.toHaveAttribute('aria-invalid')
  })

  it('shows API field errors next to the matching fields', async () => {
    server.use(
      http.post(endpoint, () =>
        errorResponse(400, [
          {
            status: '400',
            code: 'validation-failed',
            title: 'Invalid attribute',
            detail: 'Use at least 6 characters including an uppercase letter.',
            source: { pointer: '/data/attributes/password' },
          },
        ]),
      ),
    )
    const { user } = renderForm()

    await fillAndSubmit(user)

    const password = await screen.findByLabelText('Password', {
      selector: '[aria-invalid="true"]',
    })
    expect(password).toHaveFocus()
    expect(password).toHaveAccessibleDescription(
      'Use at least 6 characters including an uppercase letter.',
    )
  })

  it('offers sign-in when the email is already registered', async () => {
    server.use(
      http.post(endpoint, () =>
        errorResponse(409, [
          {
            status: '409',
            code: 'email-already-registered',
            title: 'Account conflict',
            detail: 'An account already exists for this email address.',
          },
        ]),
      ),
    )
    const { user } = renderForm()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'An account already exists for this email address. Sign in instead, or use a different email.',
    )
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument()
  })

  it('clears a previous API error when the form is resubmitted', async () => {
    server.use(
      http.post(endpoint, () =>
        errorResponse(409, [
          {
            status: '409',
            code: 'email-already-registered',
            title: 'Account conflict',
            detail: 'An account already exists for this email address.',
          },
        ]),
      ),
    )
    const { user } = renderForm()
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Confirm password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('Confirm password'),
    ).toHaveAccessibleDescription('Passwords do not match.')
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
      "Something went wrong and your account wasn't created. Try again.",
    ],
  ])('explains %s', async (_case, resolver, message) => {
    server.use(http.post(endpoint, resolver))
    const { user } = renderForm()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Password')).toHaveValue('Secret!')
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
      expect(
        screen.getByRole('button', { name: 'Create account' }),
      ).toBeInTheDocument()
    } finally {
      onlineManager.setOnline(true)
    }
  })
})
