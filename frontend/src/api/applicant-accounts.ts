import { postJsonApi } from './json-api'

export interface ApplicantAccountCredentials {
  email: string
  password: string
}

/** Registers an Applicant. Resolves on 201; does not establish a session. */
export async function createApplicantAccount({
  email,
  password,
}: ApplicantAccountCredentials): Promise<void> {
  await postJsonApi('/api/v1/applicant-accounts', {
    data: { type: 'applicant-accounts', attributes: { email, password } },
  })
}
