import { describe, expect, it } from 'vitest'

import { JsonApiRequestError, type JsonApiError } from '../../api/json-api'

import {
  answersForStep,
  blankRequiredFields,
  documentFileError,
  formValuesFrom,
  maxDocumentBytes,
  toUploadError,
  uploadErrorMessage,
  saveErrorMessage,
  toSaveError,
} from './application-step'

describe('form values', () => {
  it('fills every field, using empty values for unanswered ones', () => {
    const values = formValuesFrom({ name: 'Ada', postal: 'N1 9GU' })

    expect(values.name).toBe('Ada')
    expect(values.postal).toBe('N1 9GU')
    expect(values.email).toBe('')
    expect(values.consentConfirmed).toBe(false)
  })

  it('sends only the selected step, keeping cleared fields as empty', () => {
    const values = formValuesFrom({
      name: 'Ada',
      consentConfirmed: true,
      city: 'London',
    })

    expect(answersForStep('personal-details', values)).toEqual({
      name: 'Ada',
      dateOfBirth: '',
      country: '',
      nationality: '',
      email: '',
      phone: '',
      consentConfirmed: true,
    })
    expect(answersForStep('identity-and-address', values)).toEqual({
      documentType: '',
      documentNumber: '',
      documentCountry: '',
      expiry: '',
      street: '',
      city: 'London',
      postal: '',
      residentialCountry: '',
    })
  })
})

describe('required fields', () => {
  it('treats whitespace-only answers as blank, like the API', () => {
    const values = formValuesFrom({
      name: '   ',
      dateOfBirth: '1815-12-10',
      country: 'United Kingdom',
      nationality: ' British ',
      email: 'ada@example.com',
    })

    expect(blankRequiredFields('personal-details', values)).toEqual({
      name: 'Enter name.',
      phone: 'Enter phone.',
    })
  })

  it('checks only the selected step', () => {
    const values = formValuesFrom({})

    expect(
      Object.keys(blankRequiredFields('personal-details', values)),
    ).toEqual([
      'name',
      'dateOfBirth',
      'country',
      'nationality',
      'email',
      'phone',
    ])
    expect(
      blankRequiredFields('identity-and-address', values),
    ).not.toHaveProperty('name')
  })
})

describe('save errors', () => {
  const httpError = (status: number, errors: JsonApiError[] = []) =>
    new JsonApiRequestError({ kind: 'http', status, errors })

  it.each([
    [httpError(401), { kind: 'session-expired' }],
    [httpError(404), { kind: 'not-found' }],
    [httpError(409), { kind: 'conflict' }],
    [httpError(403), { kind: 'unexpected' }],
    [httpError(503), { kind: 'unexpected' }],
    [new JsonApiRequestError({ kind: 'network' }), { kind: 'network' }],
    [new Error('boom'), { kind: 'unexpected' }],
  ])('maps %o', (error, saveError) => {
    expect(toSaveError(error)).toEqual(saveError)
  })

  it('keeps the API detail and field errors from a 422', () => {
    expect(
      toSaveError(
        httpError(422, [
          {
            status: '422',
            code: 'unprocessable-form',
            title: 'Form could not be saved',
            detail: 'Enter a valid email address.',
            source: { pointer: '/data/attributes/answers/email' },
          },
          {
            status: '422',
            code: 'unprocessable-form',
            title: 'Form could not be saved',
            detail: 'The submitted form could not be accepted.',
          },
        ]),
      ),
    ).toEqual({
      kind: 'invalid',
      detail: 'The submitted form could not be accepted.',
      fieldErrors: { email: 'Enter a valid email address.' },
    })
  })

  it('never claims the answers were saved', () => {
    for (const error of [
      { kind: 'session-expired' },
      { kind: 'conflict' },
      { kind: 'network' },
      { kind: 'unexpected' },
    ] as const) {
      expect(saveErrorMessage(error)).toMatch(/not saved/)
    }
    expect(saveErrorMessage({ kind: 'invalid', fieldErrors: {} })).toBe(
      'Some answers could not be accepted. Check them and try again.',
    )
  })
})

describe('document evidence', () => {
  const file = (size: number, type: string) =>
    new File([new Uint8Array(size)], 'document', { type })

  it.each([
    [
      'an empty file',
      () => file(0, 'image/png'),
      'Choose a file that is not empty.',
    ],
    ['a PDF', () => file(10, 'application/pdf'), 'Choose a JPG or PNG image.'],
    [
      'an image over 10 MB',
      () => file(maxDocumentBytes + 1, 'image/jpeg'),
      'Choose an image no larger than 10 MB.',
    ],
  ])('rejects %s before uploading', (_case, makeFile, message) => {
    expect(documentFileError(makeFile())).toBe(message)
  })

  it.each(['image/png', 'image/jpeg'])('accepts a %s image', (type) => {
    expect(documentFileError(file(10, type))).toBeUndefined()
  })

  it('keeps the API reason for a rejected upload', () => {
    const error = toUploadError(
      new JsonApiRequestError({
        kind: 'http',
        status: 422,
        errors: [
          {
            status: '422',
            code: 'unprocessable-form',
            title: 'Form could not be saved',
            detail: 'Document media type is not accepted.',
          },
        ],
      }),
    )

    expect(uploadErrorMessage(error)).toBe(
      'Document media type is not accepted.',
    )
  })

  it.each([
    [new JsonApiRequestError({ kind: 'network' }), /couldn't reach the server/],
    [
      new JsonApiRequestError({ kind: 'http', status: 500, errors: [] }),
      /not uploaded\. Try again/,
    ],
    [
      new JsonApiRequestError({ kind: 'http', status: 401, errors: [] }),
      /session has expired/,
    ],
  ])('explains %o without claiming success', (error, message) => {
    expect(uploadErrorMessage(toUploadError(error))).toMatch(message)
  })
})
