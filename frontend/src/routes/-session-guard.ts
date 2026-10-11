import { redirect } from 'react-router'

import { getApplicantSessionStatus } from '../api/applicant-sessions'

/**
 * Sends signed-out visitors to sign-in. An unknown session state (network or
 * server failure) is rethrown so the error boundary shows instead of the page.
 */
export async function requireSignedIn(): Promise<void> {
  if ((await getApplicantSessionStatus()) === 'signed-out') {
    throw redirect('/sign-in')
  }
}

/**
 * Sends signed-in Applicants to their current application. If the session
 * state cannot be determined, the account pages stay reachable.
 */
export async function redirectIfSignedIn(): Promise<void> {
  let status
  try {
    status = await getApplicantSessionStatus()
  } catch {
    return
  }
  if (status === 'signed-in') {
    throw redirect('/applications/current')
  }
}
