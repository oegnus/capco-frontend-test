import { z } from 'zod'

import { deleteJsonApi, JsonApiRequestError, postJsonApi } from './json-api'

export interface ApplicantSessionCredentials {
  email: string
  password: string
}

export interface ApplicantSession {
  /** Application-local journey URL the Applicant should continue from. */
  href: string
}

const sessionDocumentSchema = z.object({
  data: z.object({
    type: z.literal('applicant-sessions'),
    attributes: z.object({ href: z.string() }),
  }),
})

/**
 * Signs an Applicant in. The session itself is carried by HttpOnly cookies the
 * browser stores from the response.
 */
export async function createApplicantSession({
  email,
  password,
}: ApplicantSessionCredentials): Promise<ApplicantSession> {
  const response = await postJsonApi('/api/v1/applicant-sessions', {
    data: { type: 'applicant-sessions', attributes: { email, password } },
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const parsed = sessionDocumentSchema.safeParse(body)
  if (!parsed.success) {
    throw new JsonApiRequestError({
      kind: 'unexpected',
      status: response.status,
    })
  }
  return { href: parsed.data.data.attributes.href }
}

/** Logs the Applicant out by revoking the session behind the cookie. */
export async function deleteCurrentApplicantSession(): Promise<void> {
  try {
    await deleteJsonApi('/api/v1/applicant-sessions/current')
  } catch (error) {
    // 401 means there was no session to revoke: the Applicant is logged out.
    if (
      error instanceof JsonApiRequestError &&
      error.failure.kind === 'http' &&
      error.failure.status === 401
    ) {
      return
    }
    throw error
  }
}
