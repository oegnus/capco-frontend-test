import { z } from 'zod'

import {
  deleteJsonApi,
  getJsonApi,
  JsonApiRequestError,
  postJsonApi,
  readJsonApi,
} from './json-api'

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
  const session = await readJsonApi(response, sessionDocumentSchema)
  return { href: session.data.attributes.href }
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

export type ApplicantSessionStatus = 'signed-in' | 'signed-out'

/**
 * Reports whether the browser holds a valid Applicant session. The API has no
 * session read endpoint and the cookie is HttpOnly, so this asks for the
 * current application: any success (200 draft, 204 none) means signed in and
 * 401 means signed out. Other failures are rethrown as unknown.
 */
export async function getApplicantSessionStatus(): Promise<ApplicantSessionStatus> {
  try {
    await getJsonApi('/api/v1/applicant-applications/current')
    return 'signed-in'
  } catch (error) {
    if (
      error instanceof JsonApiRequestError &&
      error.failure.kind === 'http' &&
      error.failure.status === 401
    ) {
      return 'signed-out'
    }
    throw error
  }
}
