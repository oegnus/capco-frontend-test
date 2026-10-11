import { JsonApiRequestError } from '../../api/json-api'

import { rateLimitMessage, validateEmail } from './registration'

export interface SignInValues {
  email: string
  password: string
}

export type SignInField = keyof SignInValues
export type SignInFieldErrors = Partial<Record<SignInField, string>>

export type SignInFormError =
  | { kind: 'invalid-credentials' }
  | { kind: 'rate-limited'; retryAfterSeconds?: number }
  | { kind: 'network' }
  | { kind: 'unexpected' }

/**
 * Checks that both fields are filled in and that the email has a valid format,
 * using the same public rule as registration. Password-policy problems are
 * left to the API.
 */
export function validateSignIn(values: SignInValues): SignInFieldErrors {
  const errors: SignInFieldErrors = {}
  const emailError = validateEmail(values.email.trim())
  if (emailError) {
    errors.email = emailError
  }
  if (values.password === '') {
    errors.password = 'Enter your password.'
  }
  return errors
}

const pointerFields: Record<string, SignInField> = {
  '/data/attributes/email': 'email',
  '/data/attributes/password': 'password',
}

/** Translates an API failure into field errors and/or a single form-level error. */
export function toSignInErrors(error: unknown): {
  fieldErrors: SignInFieldErrors
  formError?: SignInFormError
} {
  if (!(error instanceof JsonApiRequestError)) {
    return { fieldErrors: {}, formError: { kind: 'unexpected' } }
  }
  const { failure } = error
  if (failure.kind === 'network') {
    return { fieldErrors: {}, formError: { kind: 'network' } }
  }
  if (failure.kind === 'unexpected') {
    return { fieldErrors: {}, formError: { kind: 'unexpected' } }
  }
  if (failure.status === 401) {
    return { fieldErrors: {}, formError: { kind: 'invalid-credentials' } }
  }
  if (failure.status === 429) {
    return {
      fieldErrors: {},
      formError: {
        kind: 'rate-limited',
        retryAfterSeconds: failure.retryAfterSeconds,
      },
    }
  }
  const fieldErrors: SignInFieldErrors = {}
  if (failure.status === 400) {
    for (const apiError of failure.errors) {
      const field = apiError.source && pointerFields[apiError.source.pointer]
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = apiError.detail
      }
    }
  }
  return Object.keys(fieldErrors).length > 0
    ? { fieldErrors }
    : { fieldErrors, formError: { kind: 'unexpected' } }
}

export function signInErrorMessage(error: SignInFormError) {
  switch (error.kind) {
    // Deliberately generic: never reveal whether the email is registered.
    case 'invalid-credentials':
      return 'The email address or password is incorrect.'
    case 'rate-limited':
      return rateLimitMessage(error.retryAfterSeconds)
    case 'network':
      return "We couldn't reach the server. Check your connection and try again."
    case 'unexpected':
      return "Something went wrong and you weren't signed in. Try again."
    default:
      return null
  }
}
