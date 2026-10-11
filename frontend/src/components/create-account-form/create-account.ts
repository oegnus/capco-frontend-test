import { JsonApiRequestError } from '../../api/json-api'

export interface RegistrationValues {
  email: string
  password: string
  confirmPassword: string
}

export type RegistrationField = keyof RegistrationValues
export type RegistrationFieldErrors = Partial<Record<RegistrationField, string>>

export type RegistrationFormError =
  | { kind: 'duplicate-email' }
  | { kind: 'rate-limited'; retryAfterSeconds?: number }
  | { kind: 'network' }
  | { kind: 'unexpected' }

export const passwordGuidance =
  'Use at least 6 characters, including an uppercase letter and a special character (anything other than a letter or number).'

// Mirrors the backend rules in the API contract for POST /api/v1/applicant-accounts.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uppercasePattern = /\p{Lu}/u
const specialCharacterPattern = /[^\p{L}\p{N}]/u

export function meetsPasswordPolicy(password: string): boolean {
  return (
    password.length >= 6 &&
    uppercasePattern.test(password) &&
    specialCharacterPattern.test(password)
  )
}

/** Validates an already trimmed email address against the API's rule. */
export function validateEmail(email: string): string | undefined {
  if (email === '') {
    return 'Enter your email address.'
  }
  if (!emailPattern.test(email)) {
    return 'Enter an email address in the format name@example.com.'
  }
  return undefined
}

export function validateRegistration(
  values: RegistrationValues,
): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {}
  const emailError = validateEmail(values.email.trim())
  if (emailError) {
    errors.email = emailError
  }
  if (values.password.trim() === '') {
    errors.password = 'Enter a password.'
  } else if (!meetsPasswordPolicy(values.password)) {
    errors.password = `Password does not meet the requirements. ${passwordGuidance}`
  }
  if (values.confirmPassword === '') {
    errors.confirmPassword = 'Confirm your password.'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match.'
  }
  return errors
}

const pointerFields: Record<string, RegistrationField> = {
  '/data/attributes/email': 'email',
  '/data/attributes/password': 'password',
}

/** Translates an API failure into field errors and/or a single form-level error. */
export function toRegistrationErrors(error: unknown): {
  fieldErrors: RegistrationFieldErrors
  formError?: RegistrationFormError
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
  if (failure.status === 409) {
    return { fieldErrors: {}, formError: { kind: 'duplicate-email' } }
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
  const fieldErrors: RegistrationFieldErrors = {}
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

export function rateLimitMessage(retryAfterSeconds?: number): string {
  if (retryAfterSeconds === undefined) {
    return 'Too many attempts. Wait a moment, then try again.'
  }
  const minutes = Math.ceil(retryAfterSeconds / 60)
  const wait =
    retryAfterSeconds < 60
      ? `${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'second' : 'seconds'}`
      : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  return `Too many attempts. Try again in ${wait}.`
}

export function formErrorMessage(error: RegistrationFormError) {
  switch (error.kind) {
    case 'duplicate-email':
      return 'An account already exists for this email address. Sign in instead, or use a different email.'
    case 'rate-limited':
      return rateLimitMessage(error.retryAfterSeconds)
    case 'network':
      return "We couldn't reach the server. Check your connection and try again."
    case 'unexpected':
      return "Something went wrong and your account wasn't created. Try again."
    default:
      return null
  }
}
