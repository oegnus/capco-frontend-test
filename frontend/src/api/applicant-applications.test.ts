import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'

import {
  getApplicationForm,
  getCurrentApplication,
  saveApplicationForm,
  startApplication,
  uploadDocumentEvidence,
} from './applicant-applications'
import { JsonApiRequestError } from './json-api'

const jsonApi = { 'Content-Type': 'application/vnd.api+json' }
const applicationId = '0199a8bb-8687-7c22-aed5-55d432f50f23'
const formUrl = `/api/v1/applicant-applications/${applicationId}/form`

const applicationDocument = {
  data: {
    type: 'applicant-applications',
    id: applicationId,
    attributes: {
      status: 'draft',
      currentStep: 'personal-details',
      href: `/applications/${applicationId}/personal-details`,
      progress: [
        { step: 'personal-details', state: 'current' },
        { step: 'identity-and-address', state: 'not-started' },
      ],
    },
  },
}

function formDocument(answers: Record<string, unknown>, version = 3) {
  return {
    data: {
      type: 'applicant-application-forms',
      id: applicationId,
      attributes: {
        status: 'draft',
        currentStep: 'personal-details',
        steps: [],
        answers,
        documentEvidence: { present: false },
        version,
      },
    },
  }
}

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('getCurrentApplication', () => {
  it('returns the draft with its journey URL and progress', async () => {
    server.use(
      http.get('/api/v1/applicant-applications/current', () =>
        HttpResponse.json(applicationDocument, { headers: jsonApi }),
      ),
    )

    await expect(getCurrentApplication()).resolves.toEqual({
      id: applicationId,
      href: `/applications/${applicationId}/personal-details`,
      progress: applicationDocument.data.attributes.progress,
    })
  })

  it('returns null when no draft has been started (204)', async () => {
    server.use(
      http.get(
        '/api/v1/applicant-applications/current',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    await expect(getCurrentApplication()).resolves.toBeNull()
  })

  it('reports a response that does not match the contract', async () => {
    server.use(
      http.get('/api/v1/applicant-applications/current', () =>
        HttpResponse.json({ data: {} }, { headers: jsonApi }),
      ),
    )

    await expect(getCurrentApplication()).rejects.toMatchObject({
      failure: { kind: 'unexpected', status: 200 },
    })
  })
})

describe('startApplication', () => {
  it('posts without a body and with the CSRF token', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-token'
    let request: Request | undefined
    server.use(
      http.post('/api/v1/applicant-applications', ({ request: received }) => {
        request = received.clone()
        return HttpResponse.json(applicationDocument, {
          status: 201,
          headers: jsonApi,
        })
      }),
    )

    const started = await startApplication()

    expect(started.id).toBe(applicationId)
    expect(request?.headers.get('X-XSRF-TOKEN')).toBe('csrf-token')
    expect(await request?.text()).toBe('')
  })
})

describe('application form', () => {
  it('loads saved answers, dropping unanswered (null) fields', async () => {
    server.use(
      http.get(formUrl, () =>
        HttpResponse.json(
          formDocument({ name: 'Ada', phone: null, consentConfirmed: true }),
          { headers: jsonApi },
        ),
      ),
    )

    await expect(getApplicationForm(applicationId)).resolves.toEqual({
      id: applicationId,
      currentStep: 'personal-details',
      steps: [],
      answers: { name: 'Ada', consentConfirmed: true },
      version: 3,
      documentEvidencePresent: false,
    })
  })

  it('keeps the step completion the form reports', async () => {
    const steps = [
      { step: 'personal-details', state: 'complete' },
      { step: 'identity-and-address', state: 'complete' },
    ]
    server.use(
      http.get(formUrl, () => {
        const form = formDocument({})
        return HttpResponse.json(
          {
            data: {
              ...form.data,
              attributes: { ...form.data.attributes, steps },
            },
          },
          { headers: jsonApi },
        )
      }),
    )

    await expect(getApplicationForm(applicationId)).resolves.toMatchObject({
      steps,
    })
  })

  it('saves one step with its version and the CSRF token', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-token'
    let request: Request | undefined
    server.use(
      http.patch(formUrl, ({ request: received }) => {
        request = received.clone()
        return HttpResponse.json(formDocument({ name: 'Ada' }, 4), {
          headers: jsonApi,
        })
      }),
    )

    const saved = await saveApplicationForm(applicationId, {
      step: 'personal-details',
      answers: { name: 'Ada' },
      version: 3,
    })

    expect(saved.version).toBe(4)
    expect(request?.headers.get('Content-Type')).toBe(
      'application/vnd.api+json',
    )
    expect(request?.headers.get('X-XSRF-TOKEN')).toBe('csrf-token')
    expect(await request?.json()).toEqual({
      data: {
        type: 'applicant-application-forms',
        id: applicationId,
        attributes: {
          step: 'personal-details',
          answers: { name: 'Ada' },
          version: 3,
        },
      },
    })
  })

  it('rejects with the API error when saving fails', async () => {
    server.use(
      http.patch(formUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '409',
                code: 'form-version-conflict',
                title: 'Form changed',
                detail: 'Reload the form and try again.',
              },
            ],
          },
          { status: 409, headers: jsonApi },
        ),
      ),
    )

    await expect(
      saveApplicationForm(applicationId, {
        step: 'personal-details',
        answers: {},
        version: 1,
      }),
    ).rejects.toBeInstanceOf(JsonApiRequestError)
  })
})

describe('uploadDocumentEvidence', () => {
  const uploadUrl = `/api/v1/applicant-applications/${applicationId}/document-evidence`

  it('posts the image as a multipart file part with the CSRF token', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-token'
    let request: Request | undefined
    server.use(
      http.post(uploadUrl, ({ request: received }) => {
        request = received.clone()
        return HttpResponse.json(
          {
            data: {
              type: 'applicant-application-document-evidence',
              id: applicationId,
              attributes: { present: true },
            },
          },
          { status: 201, headers: jsonApi },
        )
      }),
    )
    // Parsing a jsdom multipart body inside MSW hangs, so the FormData handed
    // to fetch is inspected instead.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const file = new File(['png-bytes'], 'passport.png', { type: 'image/png' })

    try {
      await expect(
        uploadDocumentEvidence(applicationId, file),
      ).resolves.toEqual({ present: true })
      const body = fetchSpy.mock.calls[0]?.[1]?.body
      expect(body).toBeInstanceOf(FormData)
      expect((body as FormData).get('file')).toBe(file)
    } finally {
      fetchSpy.mockRestore()
    }
    expect(request?.headers.get('Content-Type')).toMatch(
      /^multipart\/form-data; boundary=/,
    )
    expect(request?.headers.get('Accept')).toBe('application/vnd.api+json')
    expect(request?.headers.get('X-XSRF-TOKEN')).toBe('csrf-token')
  })

  it('rejects with the API reason when the image is not accepted', async () => {
    server.use(
      http.post(uploadUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '422',
                code: 'unprocessable-form',
                title: 'Form could not be saved',
                detail: 'Document size is not accepted.',
              },
            ],
          },
          { status: 422, headers: jsonApi },
        ),
      ),
    )
    const file = new File(['x'], 'id.jpg', { type: 'image/jpeg' })

    await expect(
      uploadDocumentEvidence(applicationId, file),
    ).rejects.toMatchObject({
      failure: {
        kind: 'http',
        status: 422,
        errors: [{ detail: 'Document size is not accepted.' }],
      },
    })
  })
})
