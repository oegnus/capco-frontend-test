import { Stack, Typography } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { useState, type Ref } from 'react'

import {
  getApplicationForm,
  uploadDocumentEvidence,
  type ApplicationForm,
} from '../../api/applicant-applications'

import {
  documentFileError,
  toUploadError,
  uploadErrorMessage,
} from './application-step'

export interface DocumentEvidenceFieldProps {
  applicationId: string
  /** Whether the API already stores a document for this draft. */
  present: boolean
  /** Shown when continuing without a stored document. */
  requiredError?: string
  inputRef?: Ref<HTMLInputElement>
  /** Blocks new uploads while the rest of the form is being saved. */
  disabled?: boolean
  onUploadingChange: (uploading: boolean) => void
  /**
   * Called after a successful upload with the refreshed form, whose version
   * the upload bumped. `undefined` when the refresh itself failed.
   */
  onUploaded: (form: ApplicationForm | undefined) => void
}

const inputId = 'document-evidence'
const hintId = 'document-evidence-hint'
const errorId = 'document-evidence-error'

export function DocumentEvidenceField({
  applicationId,
  present,
  requiredError,
  inputRef,
  disabled = false,
  onUploadingChange,
  onUploaded,
}: DocumentEvidenceFieldProps) {
  const [fileError, setFileError] = useState<string>()
  const [uploadedName, setUploadedName] = useState<string>()

  const upload = useMutation({
    mutationFn: async (file: File) => {
      await uploadDocumentEvidence(applicationId, file)
      // The upload bumps the form version; re-read it so the next save is
      // not rejected as a conflict. The upload itself already succeeded.
      return getApplicationForm(applicationId).catch(() => undefined)
    },
    // Attempt the request even when the browser reports it is offline, so a
    // network failure is reported instead of leaving the upload pending.
    networkMode: 'always',
    onMutate: () => onUploadingChange(true),
    onSettled: () => onUploadingChange(false),
    onSuccess: (form, file) => {
      setUploadedName(file.name)
      onUploaded(form)
    },
  })

  const uploadError = upload.error ? toUploadError(upload.error) : undefined
  const error =
    fileError ??
    (uploadError ? uploadErrorMessage(uploadError) : undefined) ??
    requiredError

  let status = ''
  if (upload.isPending) {
    status = 'Uploading document…'
  } else if (uploadedName) {
    status = `Your identity document (${uploadedName}) was uploaded.`
  } else if (present) {
    status =
      'Your identity document is uploaded. Choose a new file to replace it.'
  }

  return (
    <Stack spacing={1}>
      <label htmlFor={inputId}>Document evidence (required)</label>
      <Typography id={hintId} tone="muted" variant="caption">
        JPG or PNG, up to 10 MB.
      </Typography>
      <input
        accept="image/jpeg,image/png"
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={Boolean(error)}
        aria-required="true"
        disabled={disabled}
        id={inputId}
        name="documentEvidence"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Clear the input so choosing the same file again still uploads.
          event.target.value = ''
          if (!file || upload.isPending) {
            return
          }
          upload.reset()
          setUploadedName(undefined)
          const problem = documentFileError(file)
          setFileError(problem)
          if (!problem) {
            upload.mutate(file)
          }
        }}
        ref={inputRef}
        type="file"
      />
      <Typography role="status">{status}</Typography>
      {error ? (
        <Typography id={errorId} role="alert">
          {error}
        </Typography>
      ) : null}
    </Stack>
  )
}
