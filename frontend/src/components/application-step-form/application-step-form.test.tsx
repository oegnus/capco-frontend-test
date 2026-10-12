import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../test/server'

import {
  ApplicationStepForm,
  type ApplicationStepFormProps,
} from './application-step-form'

import type { ApplicationForm } from '../../api/applicant-applications'

const applicationId = '0199a8bb-8687-7c22-aed5-55d432f50f23'
const formUrl = `/api/v1/applicant-applications/${applicationId}/form`
const jsonApi = { 'Content-Type': 'application/vnd.api+json' }

const savedForm: ApplicationForm = {
  id: applicationId,
  currentStep: 'personal-details',
  steps: [
    { step: 'personal-details', state: 'current' },
    { step: 'identity-and-address', state: 'remaining' },
  ],
  answers: { name: 'Ada Lovelace', email: 'ada@example.com' },
  version: 3,
  documentEvidencePresent: false,
}

function savedResponse(version = 4) {
  return HttpResponse.json(
    {
      data: {
        type: 'applicant-application-forms',
        id: applicationId,
        attributes: {
          status: 'draft',
          currentStep: 'personal-details',
          steps: [],
          answers: {},
          documentEvidence: { present: false },
          version,
        },
      },
    },
    { headers: jsonApi },
  )
}

function errorResponse(status: number, errors: unknown[]) {
  return HttpResponse.json({ errors }, { status, headers: jsonApi })
}

function renderForm(props: Partial<ApplicationStepFormProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const handlers = {
    onBack: vi.fn(),
    onContinue: vi.fn(),
    onReload: vi.fn(),
  }
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ApplicationStepForm
        applicationId={applicationId}
        form={savedForm}
        step="personal-details"
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  )
  return { user, ...handlers, ...view }
}

describe('ApplicationStepForm', () => {
  it('fills the fields with the saved answers', async () => {
    const { container } = renderForm({
      form: {
        ...savedForm,
        answers: { ...savedForm.answers, consentConfirmed: true },
      },
    })

    expect(screen.getByLabelText('Name (required)')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Email (required)')).toHaveValue(
      'ada@example.com',
    )
    expect(screen.getByLabelText('Phone (required)')).toHaveValue('')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect((await axe(container)).violations).toEqual([])
  })

  it('saves only this step with the version and confirms after the API does', async () => {
    let body: unknown
    server.use(
      http.patch(formUrl, async ({ request }) => {
        body = await request.json()
        return savedResponse()
      }),
    )
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Phone (required)'), '0123')
    expect(screen.queryByText('Your answers were saved.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your answers were saved.',
    )
    expect(body).toEqual({
      data: {
        type: 'applicant-application-forms',
        id: applicationId,
        attributes: {
          step: 'personal-details',
          version: 3,
          answers: {
            name: 'Ada Lovelace',
            dateOfBirth: '',
            country: '',
            nationality: '',
            email: 'ada@example.com',
            phone: '0123',
            consentConfirmed: false,
          },
        },
      },
    })
  })

  it('sends the new version on the next save and hides the confirmation after edits', async () => {
    const versions: unknown[] = []
    server.use(
      http.patch(formUrl, async ({ request }) => {
        const { data } = (await request.json()) as {
          data: { attributes: { version: number } }
        }
        versions.push(data.attributes.version)
        return savedResponse(data.attributes.version + 1)
      }),
    )
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Your answers were saved.')
    await user.type(screen.getByLabelText('Name (required)'), '!')
    expect(screen.queryByText('Your answers were saved.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Your answers were saved.')

    expect(versions).toEqual([3, 4])
  })

  it('keeps the entered values after a failed save and lets the user retry', async () => {
    let attempts = 0
    server.use(
      http.patch(formUrl, () => {
        attempts += 1
        return attempts === 1 ? HttpResponse.error() : savedResponse()
      }),
    )
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Phone (required)'), '0123')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your answers were not saved because we couldn't reach the server.",
    )
    expect(screen.queryByText('Your answers were saved.')).toBeNull()
    expect(screen.getByLabelText('Phone (required)')).toHaveValue('0123')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your answers were saved.',
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks the user to sign in again when the session has expired', async () => {
    server.use(
      http.patch(formUrl, () =>
        errorResponse(401, [
          {
            status: '401',
            code: 'authentication-required',
            title: 'Authentication required',
            detail: 'Sign in to continue.',
          },
        ]),
      ),
    )
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has expired, so your answers were not saved.',
    )
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    )
    expect(screen.getByLabelText('Name (required)')).toHaveValue('Ada Lovelace')
  })

  it('offers to reload the saved answers after a version conflict', async () => {
    server.use(
      http.patch(formUrl, () =>
        errorResponse(409, [
          {
            status: '409',
            code: 'form-version-conflict',
            title: 'Form changed',
            detail: 'Reload the form and try again.',
          },
        ]),
      ),
    )
    const { user, onReload } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    await user.click(
      screen.getByRole('button', { name: 'Reload saved answers' }),
    )

    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('shows rejected answers beside their fields', async () => {
    server.use(
      http.patch(formUrl, () =>
        errorResponse(422, [
          {
            status: '422',
            code: 'unprocessable-form',
            title: 'Form could not be saved',
            detail: 'Enter a valid email address.',
            source: { pointer: '/data/attributes/answers/email' },
          },
        ]),
      ),
    )
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const email = await screen.findByLabelText('Email (required)', {
      selector: '[aria-invalid="true"]',
    })
    expect(email).toHaveFocus()
    expect(email).toHaveAccessibleDescription('Enter a valid email address.')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some answers could not be accepted.',
    )
  })

  it('saves before continuing to the next step', async () => {
    server.use(http.patch(formUrl, () => savedResponse()))
    const { user, onContinue } = renderForm({
      form: {
        ...savedForm,
        answers: {
          name: 'Ada Lovelace',
          dateOfBirth: '1815-12-10',
          country: 'United Kingdom',
          nationality: 'British',
          email: 'ada@example.com',
          phone: '0123',
          consentConfirmed: true,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await vi.waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1))
  })

  it('does not continue when a required answer is only whitespace', async () => {
    const request = vi.fn()
    server.use(http.patch(formUrl, request))
    const { user, onContinue } = renderForm({
      form: {
        ...savedForm,
        answers: {
          name: 'Ada Lovelace',
          dateOfBirth: '1815-12-10',
          country: 'United Kingdom',
          nationality: 'British',
          email: 'ada@example.com',
          phone: '   ',
          consentConfirmed: true,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const phone = screen.getByLabelText('Phone (required)')
    expect(phone).toHaveFocus()
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveAccessibleDescription('Enter phone.')
    expect(request).not.toHaveBeenCalled()
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('still saves a partial draft with blank answers', async () => {
    server.use(http.patch(formUrl, () => savedResponse()))
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your answers were saved.',
    )
  })

  it('stays on the page when saving before continuing fails', async () => {
    server.use(
      http.patch(formUrl, () => new HttpResponse('Error', { status: 500 })),
    )
    const { user, onContinue } = renderForm({
      form: {
        ...savedForm,
        answers: {
          name: 'Ada Lovelace',
          dateOfBirth: '1815-12-10',
          country: 'United Kingdom',
          nationality: 'British',
          email: 'ada@example.com',
          phone: '0123',
          consentConfirmed: true,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your answers were not saved. Try again.',
    )
    expect(onContinue).not.toHaveBeenCalled()
  })
})

describe('ApplicationStepForm document evidence', () => {
  const uploadUrl = `/api/v1/applicant-applications/${applicationId}/document-evidence`
  const identityAnswers = {
    documentType: 'Passport',
    documentNumber: 'X1234567',
    documentCountry: 'United Kingdom',
    expiry: '2030-01-01',
    street: '12 St James Square',
    city: 'London',
    postal: 'SW1Y 4JH',
    residentialCountry: 'United Kingdom',
  }
  const identityForm: ApplicationForm = {
    ...savedForm,
    currentStep: 'identity-and-address',
    answers: identityAnswers,
  }
  const png = () =>
    new File(['png-bytes'], 'passport.png', { type: 'image/png' })

  function uploaded() {
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
  }

  function renderStep(
    form: ApplicationForm = identityForm,
    options: Parameters<typeof userEvent.setup>[0] = {},
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const onContinue = vi.fn()
    const user = userEvent.setup(options)
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ApplicationStepForm
          applicationId={applicationId}
          form={form}
          step="identity-and-address"
          onBack={vi.fn()}
          onContinue={onContinue}
          onReload={vi.fn()}
        />
      </QueryClientProvider>,
    )
    return { user, onContinue, ...view }
  }

  it('uploads a chosen image and saves with the version the upload produced', async () => {
    const savedVersions: unknown[] = []
    server.use(
      http.post(uploadUrl, () => uploaded()),
      // The upload bumps the version; the form is re-read to pick it up.
      http.get(formUrl, () => savedResponse(4)),
      http.patch(formUrl, async ({ request }) => {
        const { data } = (await request.json()) as {
          data: { attributes: { version: number } }
        }
        savedVersions.push(data.attributes.version)
        return savedResponse(5)
      }),
    )
    const { user, container } = renderStep()

    await user.upload(
      screen.getByLabelText('Document evidence (required)'),
      png(),
    )

    expect(
      await screen.findByText(
        'Your identity document (passport.png) was uploaded.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Your answers were saved.')
    expect(savedVersions).toEqual([4])
    expect((await axe(container)).violations).toEqual([])
  })

  it('rejects a file that is not a JPG or PNG without uploading it', async () => {
    const request = vi.fn()
    server.use(http.post(uploadUrl, request))
    const { user } = renderStep(identityForm, { applyAccept: false })

    await user.upload(
      screen.getByLabelText('Document evidence (required)'),
      new File(['%PDF'], 'passport.pdf', { type: 'application/pdf' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a JPG or PNG image.',
    )
    expect(
      screen.getByLabelText('Document evidence (required)'),
    ).toHaveAttribute('aria-invalid', 'true')
    expect(request).not.toHaveBeenCalled()
  })

  it('shows why the API rejected the image', async () => {
    server.use(
      http.post(uploadUrl, () =>
        errorResponse(422, [
          {
            status: '422',
            code: 'unprocessable-form',
            title: 'Form could not be saved',
            detail: 'Document size is not accepted.',
          },
        ]),
      ),
    )
    const { user } = renderStep()

    await user.upload(
      screen.getByLabelText('Document evidence (required)'),
      png(),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Document size is not accepted.',
    )
    expect(screen.queryByText(/was uploaded/)).toBeNull()
  })

  it('reports a network failure and keeps the entered answers', async () => {
    server.use(http.post(uploadUrl, () => HttpResponse.error()))
    const { user } = renderStep()

    await user.upload(
      screen.getByLabelText('Document evidence (required)'),
      png(),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your document was not uploaded because we couldn't reach the server.",
    )
    expect(screen.getByLabelText('City (required)')).toHaveValue('London')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('does not ask again for a document that is already stored', async () => {
    server.use(http.patch(formUrl, () => savedResponse()))
    const { user, onContinue } = renderStep({
      ...identityForm,
      documentEvidencePresent: true,
    })

    expect(
      screen.getByText(
        'Your identity document is uploaded. Choose a new file to replace it.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save and review' }))

    await vi.waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1))
  })

  it('requires a document before continuing to review', async () => {
    const request = vi.fn()
    server.use(http.patch(formUrl, request))
    const { user, onContinue } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Save and review' }))

    const input = screen.getByLabelText('Document evidence (required)')
    expect(input).toHaveFocus()
    expect(input).toHaveAccessibleDescription(
      'JPG or PNG, up to 10 MB. Upload your identity document.',
    )
    expect(request).not.toHaveBeenCalled()
    expect(onContinue).not.toHaveBeenCalled()
  })
})

describe('ApplicationStepForm pending label', () => {
  it('shows "Saving…" on the button that started the save', async () => {
    server.use(
      http.patch(formUrl, async () => {
        await delay(50)
        return savedResponse()
      }),
    )
    const { user, onContinue } = renderForm({
      form: {
        ...savedForm,
        answers: {
          name: 'Ada Lovelace',
          dateOfBirth: '1815-12-10',
          country: 'United Kingdom',
          nationality: 'British',
          email: 'ada@example.com',
          phone: '0123',
          consentConfirmed: true,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute(
      'type',
      'submit',
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    await vi.waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1))
  })
})
