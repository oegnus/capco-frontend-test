import { z } from 'zod'

import {
  getJsonApi,
  patchJsonApi,
  postJsonApi,
  postMultipartJsonApi,
  readJsonApi,
} from './json-api'

export const applicationSteps = [
  'personal-details',
  'identity-and-address',
] as const
export type ApplicationStep = (typeof applicationSteps)[number]

export type ApplicationProgressState = 'not-started' | 'current' | 'complete'

export interface CurrentApplication {
  id: string
  /** Application-local URL of the earliest incomplete step. */
  href: string
  progress: { step: ApplicationStep; state: ApplicationProgressState }[]
}

/** Saved values keyed by form field name; unanswered fields may be absent. */
export type ApplicationAnswers = Partial<Record<string, string | boolean>>

export type FormStepState = 'current' | 'complete' | 'remaining'

export interface ApplicationForm {
  id: string
  currentStep: ApplicationStep
  /** Step completion judged from the saved answers and document evidence. */
  steps: { step: ApplicationStep; state: FormStepState }[]
  answers: ApplicationAnswers
  /** Optimistic-concurrency version to send back when saving. */
  version?: number
  documentEvidencePresent: boolean
}

export interface ApplicationFormUpdate {
  step: ApplicationStep
  answers: ApplicationAnswers
  version?: number
}

const stepSchema = z.enum(applicationSteps)

const applicationDocumentSchema = z.object({
  data: z.object({
    type: z.literal('applicant-applications'),
    id: z.string(),
    attributes: z.object({
      href: z.string(),
      progress: z.array(
        z.object({
          step: stepSchema,
          state: z.enum(['not-started', 'current', 'complete']),
        }),
      ),
    }),
  }),
})

const formDocumentSchema = z.object({
  data: z.object({
    type: z.literal('applicant-application-forms'),
    id: z.string(),
    attributes: z.object({
      currentStep: stepSchema,
      steps: z.array(
        z.object({
          step: stepSchema,
          state: z.enum(['current', 'complete', 'remaining']),
        }),
      ),
      answers: z
        .record(z.string(), z.union([z.string(), z.boolean(), z.null()]))
        .optional(),
      documentEvidence: z.object({ present: z.boolean() }),
      version: z.number().int().optional(),
    }),
  }),
})

const documentEvidenceDocumentSchema = z.object({
  data: z.object({
    type: z.literal('applicant-application-document-evidence'),
    attributes: z.object({ present: z.boolean() }),
  }),
})

const currentApplicationUrl = '/api/v1/applicant-applications/current'

function formUrl(applicationId: string): string {
  return `/api/v1/applicant-applications/${encodeURIComponent(applicationId)}/form`
}

function toCurrentApplication(
  document: z.infer<typeof applicationDocumentSchema>,
): CurrentApplication {
  const { id, attributes } = document.data
  return { id, href: attributes.href, progress: attributes.progress }
}

function toApplicationForm(
  document: z.infer<typeof formDocumentSchema>,
): ApplicationForm {
  const { id, attributes } = document.data
  const answers: ApplicationAnswers = {}
  for (const [key, value] of Object.entries(attributes.answers ?? {})) {
    if (value !== null) {
      answers[key] = value
    }
  }
  return {
    id,
    currentStep: attributes.currentStep,
    steps: attributes.steps,
    answers,
    version: attributes.version,
    documentEvidencePresent: attributes.documentEvidence.present,
  }
}

/** The signed-in Applicant's draft, or `null` when none has been started. */
export async function getCurrentApplication(): Promise<CurrentApplication | null> {
  const response = await getJsonApi(currentApplicationUrl)
  if (response.status === 204) {
    return null
  }
  return toCurrentApplication(
    await readJsonApi(response, applicationDocumentSchema),
  )
}

/** Starts a draft, or returns the existing one without creating a duplicate. */
export async function startApplication(): Promise<CurrentApplication> {
  // The contract defines no request body for starting a draft.
  const response = await postJsonApi(
    '/api/v1/applicant-applications',
    undefined,
  )
  return toCurrentApplication(
    await readJsonApi(response, applicationDocumentSchema),
  )
}

export async function getApplicationForm(
  applicationId: string,
): Promise<ApplicationForm> {
  const response = await getJsonApi(formUrl(applicationId))
  return toApplicationForm(await readJsonApi(response, formDocumentSchema))
}

/** Saves one step's answers and returns the form state the API persisted. */
export async function saveApplicationForm(
  applicationId: string,
  { step, answers, version }: ApplicationFormUpdate,
): Promise<ApplicationForm> {
  const response = await patchJsonApi(formUrl(applicationId), {
    data: {
      type: 'applicant-application-forms',
      id: applicationId,
      attributes: { step, answers, version },
    },
  })
  return toApplicationForm(await readJsonApi(response, formDocumentSchema))
}

/**
 * Uploads the identity document image. The API stores one document per draft
 * and bumps the form version, so callers should re-read the form afterwards.
 */
export async function uploadDocumentEvidence(
  applicationId: string,
  file: File,
): Promise<{ present: boolean }> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await postMultipartJsonApi(
    `/api/v1/applicant-applications/${encodeURIComponent(applicationId)}/document-evidence`,
    formData,
  )
  const evidence = await readJsonApi(response, documentEvidenceDocumentSchema)
  return { present: evidence.data.attributes.present }
}
