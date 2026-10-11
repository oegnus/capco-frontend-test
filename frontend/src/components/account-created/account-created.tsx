import { Link, Stack, Typography } from '@kyc/ui'
import { useEffect } from 'react'

import styles from './account-created.module.css'

export interface AccountCreatedProps {
  email: string
  signInHref: string
  onSignIn?: (event: { preventDefault: () => void }) => void
}

const headingId = 'account-created-heading'

/** Confirms registration and points the Applicant to sign-in; does not sign them in. */
export function AccountCreated({
  email,
  signInHref,
  onSignIn,
}: AccountCreatedProps) {
  // Move focus to the confirmation so screen reader and keyboard users land on it.
  useEffect(() => {
    document.getElementById(headingId)?.focus()
  }, [])

  return (
    <Stack className={styles.content} spacing={3}>
      <Stack spacing={1}>
        <Typography
          className={styles.focusTarget}
          component="h1"
          id={headingId}
          tabIndex={-1}
          variant="heading"
        >
          Account created
        </Typography>
        <Typography>
          Your account for <strong>{email}</strong> is ready. Sign in to start
          your KYC application.
        </Typography>
      </Stack>
      <Link className={styles.primaryLink} href={signInHref} onClick={onSignIn}>
        Sign in
      </Link>
    </Stack>
  )
}
