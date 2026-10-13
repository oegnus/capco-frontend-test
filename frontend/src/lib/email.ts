// Mirrors the backend email rule in the API contract for creating an
// applicant account and an applicant session.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
