import { Alert, Button, Link, Stack, TextField, Typography } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { createApplicantSession } from '../../api/applicant-sessions'
import { useFieldErrors } from '../../hooks/use-field-errors'
import styles from '../account-access.module.css'
import { AccountPageLayout } from '../account-page-layout/account-page-layout'

import { signInErrorMessage, toSignInErrors, validateSignIn } from './sign-in'

enum FieldName {
  Email = 'email',
  Password = 'password',
}

const fieldNames = Object.values(FieldName)

export interface SignInFormProps {
  createAccountHref: string
  onNavigate?: (href: string) => void
  /** Receives the journey URL returned by the API after a successful sign-in. */
  onSignedIn: (href: string) => void
}

export function SignInForm({
  createAccountHref,
  onNavigate,
  onSignedIn,
}: SignInFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { fieldErrors, fieldRef, showFieldErrors, clearFieldError } =
    useFieldErrors(fieldNames)

  const signIn = useMutation({
    mutationFn: createApplicantSession,
    // Attempt the request even when the browser reports it is offline, so a
    // network failure is reported instead of leaving the form pending.
    networkMode: 'always',
    onSuccess: ({ href }) => onSignedIn(href),
    // Field errors also move focus, so they are applied once per failure.
    onError: (error) => {
      const { fieldErrors, formError } = toSignInErrors(error)
      showFieldErrors(fieldErrors)
      if (formError?.kind === 'invalid-credentials') {
        setPassword('')
      }
    },
  })

  const formError = signIn.error
    ? toSignInErrors(signIn.error).formError
    : undefined
  // Stay busy after success while navigation to the journey takes over.
  const isBusy = signIn.isPending || signIn.isSuccess

  function submit() {
    // The pending button blocks clicks, but Enter in a field still submits.
    if (isBusy) {
      return
    }
    signIn.reset()
    const trimmedEmail = email.trim()
    const errors = validateSignIn({ email: trimmedEmail, password })
    showFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    signIn.mutate({ email: trimmedEmail, password })
  }

  return (
    <AccountPageLayout>
      <Stack
        aria-busy={isBusy}
        aria-labelledby="sign-in-heading"
        component="form"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        spacing={3}
      >
        <Stack spacing={1}>
          <Typography component="h1" variant="heading" id="sign-in-heading">
            Welcome back
          </Typography>
          <Typography tone="muted">
            Sign in to continue your KYC application.
          </Typography>
        </Stack>
        {formError ? (
          <Alert severity="error">{signInErrorMessage(formError)}</Alert>
        ) : null}
        <p className="sr-only" role="status">
          {isBusy ? 'Signing in…' : ''}
        </p>
        <TextField
          autoComplete="email"
          error={Boolean(fieldErrors[FieldName.Email])}
          fullWidth
          helperText={fieldErrors[FieldName.Email]}
          id="applicant-email"
          inputRef={fieldRef(FieldName.Email)}
          label="Email address"
          name={FieldName.Email}
          onChange={(event) => {
            setEmail(event.target.value)
            clearFieldError(FieldName.Email)
          }}
          required
          spellCheck={false}
          type="email"
          value={email}
        />
        <TextField
          autoComplete="current-password"
          error={Boolean(fieldErrors[FieldName.Password])}
          fullWidth
          helperText={fieldErrors[FieldName.Password]}
          id="applicant-password"
          inputRef={fieldRef(FieldName.Password)}
          label="Password"
          name={FieldName.Password}
          onChange={(event) => {
            setPassword(event.target.value)
            clearFieldError(FieldName.Password)
          }}
          required
          type="password"
          value={password}
        />
        <Button
          className={styles.submit}
          fullWidth
          isPending={isBusy}
          size="large"
          type="submit"
        >
          {isBusy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Typography className={styles.footer} align="center" variant="caption">
          <span>New to KYC? </span>
          <Link
            href={createAccountHref}
            onClick={(event) => {
              if (onNavigate) {
                event.preventDefault()
                onNavigate(createAccountHref)
              }
            }}
          >
            Create account
          </Link>
        </Typography>
      </Stack>
    </AccountPageLayout>
  )
}
