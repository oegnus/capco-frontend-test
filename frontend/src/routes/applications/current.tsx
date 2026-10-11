import { Alert, Stack } from '@kyc/ui'
import { useMutation } from '@tanstack/react-query'
import { redirect, useNavigate } from 'react-router'

import { journeyDestination } from '../-return-target'
import {
  getApplicationForm,
  getCurrentApplication,
  startApplication,
  type ApplicationForm,
  type CurrentApplication,
} from '../../api/applicant-applications'
import { JsonApiRequestError } from '../../api/json-api'
import {
  ApplicantJourneyPresentation,
  applicantJourneyFixtures,
  type ApplicantJourneyPresentationFixture,
} from '../../components/applicant-journey-presentation/applicant-journey-presentation'

import type { Route } from './+types/current'

function isSessionExpired(error: unknown): boolean {
  return (
    error instanceof JsonApiRequestError &&
    error.failure.kind === 'http' &&
    error.failure.status === 401
  )
}

export async function clientLoader() {
  try {
    const application = await getCurrentApplication()
    let formSteps: ApplicationForm['steps'] | undefined
    if (application) {
      try {
        // The form reports true step completion; the journey progress does not.
        formSteps = (await getApplicationForm(application.id)).steps
      } catch (error) {
        if (isSessionExpired(error)) {
          throw error
        }
        // Fall back to the journey progress rather than failing the page.
      }
    }
    return { application, formSteps }
  } catch (error) {
    // The session expired after the layout guard checked it.
    if (isSessionExpired(error)) {
      throw redirect('/sign-in')
    }
    throw error
  }
}

export default function CurrentApplicationJourneyPage({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const { application, formSteps } = loaderData
  const start = useMutation({
    mutationFn: startApplication,
    // Attempt the request even when the browser reports it is offline, so a
    // network failure is reported instead of leaving the action pending.
    networkMode: 'always',
    onSuccess: (started) => {
      void navigate(journeyDestination(started.href))
    },
  })

  return (
    <Stack spacing={2}>
      {start.error ? (
        <Alert severity="error">
          Your application could not be started. Try again.
        </Alert>
      ) : null}
      <ApplicantJourneyPresentation
        {...journeyPresentation(application, formSteps)}
        onPrimaryAction={() => {
          if (application) {
            void navigate(journeyDestination(application.href))
          } else if (!start.isPending) {
            start.mutate()
          }
        }}
      />
    </Stack>
  )
}

/**
 * Builds the journey screen's progress. The current-application endpoint
 * never reports the last step as complete, so the form's own step states are
 * preferred; the journey progress is only a fallback when they are missing.
 */
export function journeyPresentation(
  application: CurrentApplication | null,
  formSteps?: ApplicationForm['steps'],
): ApplicantJourneyPresentationFixture {
  if (!application) {
    return applicantJourneyFixtures.start
  }
  if (formSteps && formSteps.length > 0) {
    return { entryState: 'resume', progress: formSteps }
  }
  return {
    entryState: 'resume',
    progress: application.progress.map(({ step, state }) => ({
      step,
      state: state === 'not-started' ? 'remaining' : state,
    })),
  }
}
