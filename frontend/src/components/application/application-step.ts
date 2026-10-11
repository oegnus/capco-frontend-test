import { JsonApiRequestError } from '../../api/json-api'

import type {
  ApplicationAnswers,
  ApplicationStep,
} from '../../api/applicant-applications'

export type TextFieldKey =
  | 'name'
  | 'dateOfBirth'
  | 'country'
  | 'nationality'
  | 'email'
  | 'phone'
  | 'documentType'
  | 'documentNumber'
  | 'documentCountry'
  | 'expiry'
  | 'street'
  | 'city'
  | 'postal'
  | 'residentialCountry'

export type AnswerKey = TextFieldKey | 'consentConfirmed'

/** Every answer the form edits, with missing values filled in as empty. */
export type FormValues = Record<TextFieldKey, string> & {
  consentConfirmed: boolean
}

/** Text fields per step, in display order, with their existing labels. */
export const stepTextFields: Record<
  ApplicationStep,
  readonly { key: TextFieldKey; label: string }[]
> = {
  'personal-details': [
    { key: 'name', label: 'Name' },
    { key: 'dateOfBirth', label: 'Date of birth' },
    { key: 'country', label: 'Country' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
  ],
  'identity-and-address': [
    { key: 'documentType', label: 'Document type' },
    { key: 'documentNumber', label: 'Document number' },
    { key: 'documentCountry', label: 'Document country' },
    { key: 'expiry', label: 'Expiry' },
    { key: 'street', label: 'Street' },
    { key: 'city', label: 'City' },
    { key: 'postal', label: 'Postal code' },
    { key: 'residentialCountry', label: 'Residential country' },
  ],
}

/** Keys the API accepts for each step; only these may be sent when saving. */
const stepAnswerKeys: Record<ApplicationStep, readonly AnswerKey[]> = {
  'personal-details': [
    ...stepTextFields['personal-details'].map(({ key }) => key),
    'consentConfirmed',
  ],
  'identity-and-address': stepTextFields['identity-and-address'].map(
    ({ key }) => key,
  ),
}

const textFieldKeys = Object.values(stepTextFields).flatMap((fields) =>
  fields.map(({ key }) => key),
)

/** Maps saved answers onto every form field, using empty values for gaps. */
export function formValuesFrom(answers: ApplicationAnswers): FormValues {
  const values = {
    consentConfirmed: answers.consentConfirmed === true,
  } as FormValues
  for (const key of textFieldKeys) {
    const value = answers[key]
    values[key] = typeof value === 'string' ? value : ''
  }
  return values
}

/** The selected step's answers, as entered, so cleared fields are cleared. */
export function answersForStep(
  step: ApplicationStep,
  values: FormValues,
): ApplicationAnswers {
  const answers: ApplicationAnswers = {}
  for (const key of stepAnswerKeys[step]) {
    answers[key] = values[key]
  }
  return answers
}

/**
 * Required text fields of a step that are empty once trimmed. The browser's
 * `required` check accepts whitespace, but the API treats it as blank, so the
 * step would not count as complete.
 */
export function blankRequiredFields(
  step: ApplicationStep,
  values: FormValues,
): Partial<Record<TextFieldKey, string>> {
  const errors: Partial<Record<TextFieldKey, string>> = {}
  for (const { key, label } of stepTextFields[step]) {
    if (values[key].trim() === '') {
      errors[key] = `Enter ${label.toLowerCase()}.`
    }
  }
  return errors
}

/** Matches the contract: one JPG or PNG image, at most 10 MiB. */
export const maxDocumentBytes = 10 * 1024 * 1024
const acceptedDocumentTypes = ['image/jpeg', 'image/png']

/** Checks a chosen document before uploading it. */
export function documentFileError(file: File): string | undefined {
  if (file.size === 0) {
    return 'Choose a file that is not empty.'
  }
  if (!acceptedDocumentTypes.includes(file.type)) {
    return 'Choose a JPG or PNG image.'
  }
  if (file.size > maxDocumentBytes) {
    return 'Choose an image no larger than 10 MB.'
  }
  return undefined
}

export type UploadError =
  | { kind: 'invalid'; detail?: string }
  | { kind: 'session-expired' }
  | { kind: 'not-found' }
  | { kind: 'network' }
  | { kind: 'unexpected' }

export function toUploadError(error: unknown): UploadError {
  if (!(error instanceof JsonApiRequestError)) {
    return { kind: 'unexpected' }
  }
  const { failure } = error
  if (failure.kind === 'network') {
    return { kind: 'network' }
  }
  if (failure.kind === 'unexpected') {
    return { kind: 'unexpected' }
  }
  switch (failure.status) {
    case 401:
      return { kind: 'session-expired' }
    case 404:
      return { kind: 'not-found' }
    case 422:
      return { kind: 'invalid', detail: failure.errors[0]?.detail }
    default:
      return { kind: 'unexpected' }
  }
}

export function uploadErrorMessage(error: UploadError): string {
  switch (error.kind) {
    case 'invalid':
      return (
        error.detail ??
        'This file could not be accepted. Choose a JPG or PNG image no larger than 10 MB.'
      )
    case 'session-expired':
      return 'Your session has expired, so your document was not uploaded. Sign in again, then upload it.'
    case 'not-found':
      return 'This application is no longer available.'
    case 'network':
      return "Your document was not uploaded because we couldn't reach the server. Check your connection and try again."
    case 'unexpected':
      return 'Your document was not uploaded. Try again.'
    default:
      return 'Your document was not uploaded. Try again.'
  }
}

export type SaveError =
  | { kind: 'session-expired' }
  | { kind: 'conflict' }
  | {
      kind: 'invalid'
      detail?: string
      fieldErrors: Partial<Record<AnswerKey, string>>
    }
  | { kind: 'not-found' }
  | { kind: 'network' }
  | { kind: 'unexpected' }

const answerPointerPrefix = '/data/attributes/answers/'

export function toSaveError(error: unknown): SaveError {
  if (!(error instanceof JsonApiRequestError)) {
    return { kind: 'unexpected' }
  }
  const { failure } = error
  if (failure.kind === 'network') {
    return { kind: 'network' }
  }
  if (failure.kind === 'unexpected') {
    return { kind: 'unexpected' }
  }
  switch (failure.status) {
    case 401:
      return { kind: 'session-expired' }
    case 404:
      return { kind: 'not-found' }
    case 409:
      return { kind: 'conflict' }
    case 422: {
      const fieldErrors: Partial<Record<AnswerKey, string>> = {}
      let detail: string | undefined
      for (const apiError of failure.errors) {
        const pointer = apiError.source?.pointer
        const key = pointer?.startsWith(answerPointerPrefix)
          ? pointer.slice(answerPointerPrefix.length)
          : undefined
        if (key && isAnswerKey(key)) {
          fieldErrors[key] ??= apiError.detail
        } else {
          detail ??= apiError.detail
        }
      }
      return { kind: 'invalid', detail, fieldErrors }
    }
    default:
      return { kind: 'unexpected' }
  }
}

function isAnswerKey(key: string): key is AnswerKey {
  return (
    key === 'consentConfirmed' ||
    (textFieldKeys as readonly string[]).includes(key)
  )
}

export function saveErrorMessage(error: SaveError): string {
  switch (error.kind) {
    case 'session-expired':
      return 'Your session has expired, so your answers were not saved. Sign in again, then save.'
    case 'conflict':
      return 'These answers were changed somewhere else since you opened this page, so they were not saved. Reload to see the latest saved answers.'
    case 'invalid':
      return (
        error.detail ??
        'Some answers could not be accepted. Check them and try again.'
      )
    case 'not-found':
      return 'This application is no longer available.'
    case 'network':
      return "Your answers were not saved because we couldn't reach the server. Check your connection and try again."
    case 'unexpected':
      return 'Your answers were not saved. Try again.'
    default:
      return 'Your answers were not saved. Try again.'
  }
}
