import { Alert, Button, Link, Stack, TextField, Typography } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { createApplicantAccount } from '../../api/applicant-accounts'
import { useFieldErrors } from '../../hooks/use-field-errors'
import styles from '../account-access.module.css'
import { AccountCreated } from '../account-created/account-created'
import { AccountPageLayout } from '../account-page-layout/account-page-layout'

import {
  formErrorMessage,
  passwordGuidance,
  toRegistrationErrors,
  validateRegistration,
} from './create-account'

enum FieldName {
  Email = 'email',
  Password = 'password',
  ConfirmPassword = 'confirmPassword',
}

const fieldNames = Object.values(FieldName)

export interface CreateAccountFormProps {
  onNavigate?: (href: string) => void
  signInHref: string
}

export function CreateAccountForm({
  onNavigate,
  signInHref,
}: CreateAccountFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { fieldErrors, fieldRef, showFieldErrors, clearFieldError } =
    useFieldErrors(fieldNames)

  const registration = useMutation({
    mutationFn: createApplicantAccount,
    networkMode: 'always',
    onSuccess: () => {
      setPassword('')
      setConfirmPassword('')
    },
    // Field errors also move focus, so they are applied once per failure.
    onError: (error) => {
      showFieldErrors(toRegistrationErrors(error).fieldErrors)
    },
  })

  const registeredEmail = registration.isSuccess
    ? registration.variables.email
    : undefined

  const formError = registration.error
    ? toRegistrationErrors(registration.error).formError
    : undefined

  function submit() {
    if (registration.isPending) {
      return
    }
    registration.reset()
    const trimmedEmail = email.trim()
    const errors = validateRegistration({
      email: trimmedEmail,
      password,
      confirmPassword,
    })
    showFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    registration.mutate({ email: trimmedEmail, password })
  }

  function navigateToSignIn(event: { preventDefault: () => void }) {
    if (onNavigate) {
      event.preventDefault()
      onNavigate(signInHref)
    }
  }

  return (
    <AccountPageLayout>
      {registeredEmail === undefined ? (
        <Stack
          aria-labelledby="create-account-heading"
          component="form"
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          spacing={3}
        >
          <Stack spacing={1}>
            <Typography
              component="h1"
              variant="heading"
              id="create-account-heading"
            >
              Create your account
            </Typography>
            <Typography tone="muted">
              Create credentials to begin your KYC application. All fields are
              required.
            </Typography>
          </Stack>
          {formError ? (
            <Alert severity="error">{formErrorMessage(formError)}</Alert>
          ) : null}
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
            autoComplete="new-password"
            error={Boolean(fieldErrors[FieldName.Password])}
            fullWidth
            helperText={fieldErrors[FieldName.Password] ?? passwordGuidance}
            id="applicant-password"
            inputRef={fieldRef(FieldName.Password)}
            label="Password"
            name={FieldName.Password}
            onChange={(event) => {
              setPassword(event.target.value)
              clearFieldError(FieldName.Password, FieldName.ConfirmPassword)
            }}
            required
            type="password"
            value={password}
          />
          <TextField
            autoComplete="new-password"
            error={Boolean(fieldErrors[FieldName.ConfirmPassword])}
            fullWidth
            helperText={fieldErrors[FieldName.ConfirmPassword]}
            id="applicant-password-confirmation"
            inputRef={fieldRef(FieldName.ConfirmPassword)}
            label="Confirm password"
            name={FieldName.ConfirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value)
              clearFieldError(FieldName.ConfirmPassword)
            }}
            required
            type="password"
            value={confirmPassword}
          />
          <Button
            className={styles.submit}
            fullWidth
            isPending={registration.isPending}
            size="large"
            type="submit"
          >
            {registration.isPending ? 'Creating account…' : 'Create account'}
          </Button>
          <Typography
            className={styles.footer}
            align="center"
            variant="caption"
          >
            <span>Already have an account? </span>
            <Link href={signInHref} onClick={navigateToSignIn}>
              Sign in
            </Link>
          </Typography>
        </Stack>
      ) : (
        <AccountCreated
          email={registeredEmail}
          onSignIn={navigateToSignIn}
          signInHref={signInHref}
        />
      )}
    </AccountPageLayout>
  )
}
