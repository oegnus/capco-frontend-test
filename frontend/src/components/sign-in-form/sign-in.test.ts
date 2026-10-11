import { describe, expect, it } from 'vitest'

import { JsonApiRequestError, type JsonApiError } from '../../api/json-api'

import { signInErrorMessage, toSignInErrors, validateSignIn } from './sign-in'

describe('sign-in validation', () => {
  it('requires both fields', () => {
    expect(validateSignIn({ email: '  ', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    })
  })

  it.each(['ada', 'ada@example', 'ada @example.com', '@example.com'])(
    'rejects the malformed email %s',
    (email) => {
      expect(validateSignIn({ email, password: 'Secret!' })).toEqual({
        email: 'Enter an email address in the format name@example.com.',
      })
    },
  )

  it('leaves password policy checks to the API', () => {
    expect(validateSignIn({ email: 'ada@example.com', password: 'x' })).toEqual(
      {},
    )
  })
})

describe('sign-in API errors', () => {
  const httpError = (
    status: number,
    errors: JsonApiError[] = [],
    retryAfterSeconds?: number,
  ) =>
    new JsonApiRequestError({
      kind: 'http',
      status,
      errors,
      retryAfterSeconds,
    })

  it('maps field validation errors by JSON pointer', () => {
    expect(
      toSignInErrors(
        httpError(400, [
          {
            status: '400',
            code: 'validation-failed',
            title: 'Invalid attribute',
            detail: 'Enter a valid email address.',
            source: { pointer: '/data/attributes/email' },
          },
        ]),
      ),
    ).toEqual({ fieldErrors: { email: 'Enter a valid email address.' } })
  })

  it.each([
    [httpError(401), { kind: 'invalid-credentials' }],
    [httpError(429, [], 30), { kind: 'rate-limited', retryAfterSeconds: 30 }],
    [httpError(429), { kind: 'rate-limited', retryAfterSeconds: undefined }],
    [
      httpError(400, [
        {
          status: '400',
          code: 'malformed-document',
          title: 'Malformed',
          detail: 'Bad document.',
        },
      ]),
      { kind: 'unexpected' },
    ],
    [httpError(500), { kind: 'unexpected' }],
    [new JsonApiRequestError({ kind: 'network' }), { kind: 'network' }],
    [new JsonApiRequestError({ kind: 'unexpected' }), { kind: 'unexpected' }],
    [new Error('boom'), { kind: 'unexpected' }],
  ])('maps %o to a form-level error', (error, formError) => {
    expect(toSignInErrors(error)).toEqual({ fieldErrors: {}, formError })
  })

  it('describes invalid credentials without revealing which one is wrong', () => {
    expect(signInErrorMessage({ kind: 'invalid-credentials' })).toBe(
      'The email address or password is incorrect.',
    )
  })

  it.each([
    [
      { kind: 'rate-limited', retryAfterSeconds: 45 } as const,
      'Too many attempts. Try again in 45 seconds.',
    ],
    [
      { kind: 'network' } as const,
      "We couldn't reach the server. Check your connection and try again.",
    ],
    [
      { kind: 'unexpected' } as const,
      "Something went wrong and you weren't signed in. Try again.",
    ],
  ])('describes %o', (error, message) => {
    expect(signInErrorMessage(error)).toBe(message)
  })
})
