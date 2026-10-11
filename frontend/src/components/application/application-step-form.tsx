import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import {
  saveApplicationForm,
  type ApplicationForm,
  type ApplicationFormUpdate,
  type ApplicationStep,
} from '../../api/applicant-applications'
import { useFieldErrors } from '../../hooks/use-field-errors'

import {
  answersForStep,
  blankRequiredFields,
  formValuesFrom,
  saveErrorMessage,
  stepTextFields,
  toSaveError,
  type AnswerKey,
  type FormValues,
  type SaveError,
} from './application-step'
import styles from './application-step-form.module.css'
import { DocumentEvidenceField } from './document-evidence-field'

/** Fields that can show an error; the document is only on step 2. */
type StepFieldKey = AnswerKey | 'documentEvidence'

export interface ApplicationStepFormProps {
  applicationId: string
  step: ApplicationStep
  /** Form state loaded from the API; its answers fill the fields. */
  form: ApplicationForm
  onContinue: () => void
  onBack: () => void
  /** Reloads the latest saved form from the API, discarding local edits. */
  onReload: () => void
}

const stepCopy = {
  'personal-details': {
    eyebrow: 'STEP 1 OF 2',
    heading: 'Personal details',
    continueLabel: 'Continue',
  },
  'identity-and-address': {
    eyebrow: 'STEP 2 OF 2',
    heading: 'Identity and address',
    continueLabel: 'Save and review',
  },
} as const

const consentErrorId = 'consent-confirmed-error'

export function ApplicationStepForm({
  applicationId,
  step,
  form,
  onContinue,
  onBack,
  onReload,
}: ApplicationStepFormProps) {
  const [values, setValues] = useState<FormValues>(() =>
    formValuesFrom(form.answers),
  )
  const [version, setVersion] = useState(form.version)
  const [showSaved, setShowSaved] = useState(false)
  const [documentPresent, setDocumentPresent] = useState(
    form.documentEvidencePresent,
  )
  const [uploading, setUploading] = useState(false)
  const fieldOrder: readonly StepFieldKey[] = [
    ...stepTextFields[step].map(({ key }) => key),
    step === 'personal-details' ? 'consentConfirmed' : 'documentEvidence',
  ]
  const { fieldErrors, fieldRef, showFieldErrors, clearFieldError } =
    useFieldErrors(fieldOrder)

  const save = useMutation({
    mutationFn: (update: ApplicationFormUpdate) =>
      saveApplicationForm(applicationId, update),
    // Attempt the request even when the browser reports it is offline, so a
    // network failure is reported instead of leaving the save pending.
    networkMode: 'always',
    onSuccess: (saved) => {
      setVersion(saved.version)
      setShowSaved(true)
    },
    // Field errors also move focus, so they are applied once per failure.
    onError: (error) => {
      const saveError = toSaveError(error)
      showFieldErrors(saveError.kind === 'invalid' ? saveError.fieldErrors : {})
    },
  })
  const saveError = save.error ? toSaveError(save.error) : undefined

  function submitSave(afterSave?: () => void) {
    // Saving while an upload is running would race on the form version.
    if (save.isPending || uploading) {
      return
    }
    save.reset()
    setShowSaved(false)
    showFieldErrors({})
    save.mutate(
      { step, answers: answersForStep(step, values), version },
      { onSuccess: () => afterSave?.() },
    )
  }

  function change<Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }))
    // A saved confirmation must never describe edits made after it.
    setShowSaved(false)
    clearFieldError(key)
  }

  const copy = stepCopy[step]

  return (
    <main className={styles.page}>
      <Box component="div" className={styles.stepContent}>
        <Stack spacing={3}>
          <Typography component="p" variant="eyebrow" tone="accent">
            {copy.eyebrow}
          </Typography>
          <Typography component="h1" variant="heading">
            {copy.heading}
          </Typography>
          <Typography tone="muted">
            Save your answers at any time and come back to finish later.
          </Typography>
          <Stack
            component="form"
            className={styles.stepForm}
            onSubmit={(event) => {
              event.preventDefault()
              const missingFields: Partial<Record<StepFieldKey, string>> =
                blankRequiredFields(step, values)
              if (step === 'identity-and-address' && !documentPresent) {
                missingFields.documentEvidence =
                  'Upload your identity document.'
              }
              if (Object.keys(missingFields).length > 0) {
                save.reset()
                setShowSaved(false)
                showFieldErrors(missingFields)
                return
              }
              if (event.currentTarget.reportValidity()) {
                submitSave(onContinue)
              }
            }}
            spacing={2}
          >
            {stepTextFields[step].map(({ key, label }) => (
              <TextField
                error={Boolean(fieldErrors[key])}
                helperText={fieldErrors[key]}
                inputRef={fieldRef(key)}
                key={key}
                label={`${label} (required)`}
                name={key}
                onChange={(event) => change(key, event.target.value)}
                required
                value={values[key]}
              />
            ))}
            {step === 'personal-details' ? (
              <>
                <label>
                  <input
                    aria-describedby={
                      fieldErrors.consentConfirmed ? consentErrorId : undefined
                    }
                    aria-invalid={Boolean(fieldErrors.consentConfirmed)}
                    checked={values.consentConfirmed}
                    name="consentConfirmed"
                    onChange={(event) =>
                      change('consentConfirmed', event.target.checked)
                    }
                    ref={fieldRef('consentConfirmed')}
                    required
                    type="checkbox"
                  />{' '}
                  I confirm these details are accurate and belong to me.
                </label>
                {fieldErrors.consentConfirmed ? (
                  <Typography id={consentErrorId}>
                    {fieldErrors.consentConfirmed}
                  </Typography>
                ) : null}
              </>
            ) : (
              <DocumentEvidenceField
                applicationId={applicationId}
                disabled={save.isPending}
                inputRef={fieldRef('documentEvidence')}
                onUploaded={(refreshed) => {
                  setDocumentPresent(true)
                  clearFieldError('documentEvidence')
                  // Keep the entered answers; only adopt the bumped version.
                  if (refreshed) {
                    setVersion(refreshed.version)
                  }
                }}
                onUploadingChange={setUploading}
                present={documentPresent}
                requiredError={fieldErrors.documentEvidence}
              />
            )}
            {saveError ? (
              <Alert severity="error">
                <SaveErrorContent error={saveError} onReload={onReload} />
              </Alert>
            ) : null}
            {showSaved ? (
              <Alert severity="success">Your answers were saved.</Alert>
            ) : null}
            <Stack
              component="div"
              className={styles.formActions}
              direction="row"
              spacing={2}
            >
              <Button type="button" variant="quiet" onPress={onBack}>
                Back
              </Button>
              <Stack component="div" direction="row" spacing={2}>
                <Button
                  isDisabled={uploading}
                  isPending={save.isPending}
                  onPress={() => submitSave()}
                  type="button"
                  variant="secondary"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  isDisabled={uploading}
                  isPending={save.isPending}
                  type="submit"
                >
                  {copy.continueLabel}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </main>
  )
}

function SaveErrorContent({
  error,
  onReload,
}: {
  error: SaveError
  onReload: () => void
}) {
  const message = saveErrorMessage(error)
  switch (error.kind) {
    case 'session-expired':
      return (
        <>
          {message} <Link href="/sign-in">Sign in</Link>
        </>
      )
    case 'conflict':
      return (
        <Stack spacing={1}>
          <span>{message}</span>
          <Button type="button" variant="secondary" onPress={onReload}>
            Reload saved answers
          </Button>
        </Stack>
      )
    case 'not-found':
      return (
        <>
          {message}{' '}
          <Link href="/applications/current">Go to your application</Link>
        </>
      )
    default:
      return message
  }
}
