import { describe, expect, it } from 'vitest'

import { JsonApiRequestError } from '../../api/json-api'

import {
  meetsPasswordPolicy,
  rateLimitMessage,
  toRegistrationErrors,
  validateRegistration,
} from './create-account'

const valid = {
  email: 'ada@example.com',
  password: 'Secret!',
  confirmPassword: 'Secret!',
}

describe('registration validation', () => {
  it('accepts values that satisfy the API contract', () => {
    expect(validateRegistration(valid)).toEqual({})
  })

  it('requires every field', () => {
    expect(
      validateRegistration({ email: ' ', password: '', confirmPassword: '' }),
    ).toEqual({
      email: 'Enter your email address.',
      password: 'Enter a password.',
      confirmPassword: 'Confirm your password.',
    })
  })

  it.each(['ada', 'ada@example', 'ada @example.com', '@example.com'])(
    'rejects the malformed email %s',
    (email) => {
      expect(validateRegistration({ ...valid, email }).email).toMatch(
        /format name@example\.com/,
      )
    },
  )

  it.each([
    ['Abcd!1', true],
    ['Ab!', false],
    ['abcdef!', false],
    ['Abcdef1', false],
    ['Abc def', true],
    ['Ünïcø!', true],
  ])('applies the password policy to %s', (password, expected) => {
    expect(meetsPasswordPolicy(password)).toBe(expected)
  })

  it('requires the confirmation to match', () => {
    expect(
      validateRegistration({ ...valid, confirmPassword: 'Secret?' }),
    ).toEqual({ confirmPassword: 'Passwords do not match.' })
  })
})

describe('registration API errors', () => {
  const httpError = (status: number, errors: unknown[] = []) =>
    new JsonApiRequestError({
      kind: 'http',
      status,
      errors: errors as never,
    })

  it('maps field validation errors by JSON pointer', () => {
    expect(
      toRegistrationErrors(
        httpError(400, [
          {
            status: '400',
            code: 'validation-failed',
            title: 'Invalid attribute',
            detail: 'Enter a valid email address.',
            source: { pointer: '/data/attributes/email' },
          },
          {
            status: '400',
            code: 'validation-failed',
            title: 'Invalid attribute',
            detail: 'Use at least 6 characters.',
            source: { pointer: '/data/attributes/password' },
          },
        ]),
      ),
    ).toEqual({
      fieldErrors: {
        email: 'Enter a valid email address.',
        password: 'Use at least 6 characters.',
      },
    })
  })

  it('treats 400 errors without a field pointer as unexpected', () => {
    expect(
      toRegistrationErrors(
        httpError(400, [
          {
            status: '400',
            code: 'malformed-document',
            title: 'Malformed',
            detail: 'Bad document.',
          },
        ]),
      ).formError,
    ).toEqual({ kind: 'unexpected' })
  })

  it.each([
    [httpError(409), { kind: 'duplicate-email' }],
    [
      new JsonApiRequestError({
        kind: 'http',
        status: 429,
        errors: [],
        retryAfterSeconds: 30,
      }),
      { kind: 'rate-limited', retryAfterSeconds: 30 },
    ],
    [new JsonApiRequestError({ kind: 'network' }), { kind: 'network' }],
    [httpError(500), { kind: 'unexpected' }],
    [new Error('boom'), { kind: 'unexpected' }],
  ])('maps %o to a form-level error', (error, formError) => {
    expect(toRegistrationErrors(error)).toEqual({ fieldErrors: {}, formError })
  })

  it('describes the rate-limit wait time', () => {
    expect(rateLimitMessage(1)).toBe(
      'Too many attempts. Try again in 1 second.',
    )
    expect(rateLimitMessage(45)).toBe(
      'Too many attempts. Try again in 45 seconds.',
    )
    expect(rateLimitMessage(90)).toBe(
      'Too many attempts. Try again in 2 minutes.',
    )
    expect(rateLimitMessage()).toBe(
      'Too many attempts. Wait a moment, then try again.',
    )
  })
})
