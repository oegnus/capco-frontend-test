import { Link } from '@kyc/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteCurrentApplicantSession } from '../../api/applicant-sessions'
import { JsonApiRequestError } from '../../api/json-api'

export interface LogOutLinkProps {
  onLoggedOut: () => void
}

export function LogOutLink({ onLoggedOut }: LogOutLinkProps) {
  const queryClient = useQueryClient()
  const logOut = useMutation({
    mutationFn: deleteCurrentApplicantSession,
    // Attempt the request even when the browser reports it is offline, so a
    // network failure is reported instead of leaving the link pending.
    networkMode: 'always',
    onSuccess: () => {
      // Drop any cached applicant data before leaving the signed-in pages.
      queryClient.clear()
      onLoggedOut()
    },
  })
  const isBusy = logOut.isPending || logOut.isSuccess

  return (
    <>
      <Link
        href="/sign-in"
        onClick={(event) => {
          event.preventDefault()
          if (!isBusy) {
            logOut.mutate()
          }
        }}
      >
        {isBusy ? 'Logging out…' : 'Log out'}
      </Link>
      {logOut.error ? (
        <p role="alert">{logOutErrorMessage(logOut.error)}</p>
      ) : null}
    </>
  )
}

function logOutErrorMessage(error: unknown): string {
  return error instanceof JsonApiRequestError &&
    error.failure.kind === 'network'
    ? "We couldn't reach the server. Check your connection and try again."
    : "Something went wrong and you weren't logged out. Try again."
}
