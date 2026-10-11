import { redirect, useNavigate, useRevalidator } from 'react-router'

import {
  getApplicationForm,
  type ApplicationStep,
} from '../../../api/applicant-applications'
import { JsonApiRequestError } from '../../../api/json-api'
import { ApplicationReviewForm } from '../../../components/application-review-form/application-review-form'
import { ApplicationStepForm } from '../../../components/application-step-form/application-step-form'

import type { Route } from './+types/$step'

function formStep(step: string): ApplicationStep | undefined {
  return step === 'personal-details' || step === 'identity-and-address'
    ? step
    : undefined
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (params.step === 'review') {
    return { form: null }
  }
  if (!formStep(params.step)) {
    throw new Response('Not found', { status: 404 })
  }
  try {
    return { form: await getApplicationForm(params.applicationId) }
  } catch (error) {
    if (error instanceof JsonApiRequestError && error.failure.kind === 'http') {
      // The session expired after the layout guard checked it.
      if (error.failure.status === 401) {
        throw redirect('/sign-in')
      }
      if (error.failure.status === 404) {
        throw new Response('Not found', { status: 404 })
      }
    }
    throw error
  }
}

export default function CurrentApplicationStepPage({
  loaderData,
  params,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const step = formStep(params.step)

  if (!step || !loaderData.form) {
    return (
      <ApplicationReviewForm
        onSubmit={() =>
          void navigate(`/applications/${params.applicationId}/submitted`)
        }
        onReturnToForm={() =>
          void navigate(
            `/applications/${params.applicationId}/identity-and-address`,
          )
        }
      />
    )
  }

  return (
    <ApplicationStepForm
      // Remount with fresh values when the step or the loaded form changes.
      key={`${params.applicationId}/${step}/${loaderData.form.version ?? ''}`}
      applicationId={params.applicationId}
      form={loaderData.form}
      step={step}
      onBack={() =>
        void navigate(
          step === 'personal-details'
            ? '/applications/current'
            : `/applications/${params.applicationId}/personal-details`,
        )
      }
      onContinue={() =>
        void navigate(
          step === 'personal-details'
            ? `/applications/${params.applicationId}/identity-and-address`
            : `/applications/${params.applicationId}/review`,
        )
      }
      onReload={() => void revalidator.revalidate()}
    />
  )
}
