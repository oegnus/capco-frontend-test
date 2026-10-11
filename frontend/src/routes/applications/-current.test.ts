import { describe, expect, it } from 'vitest'

import { applicantJourneyFixtures } from '../../components/applicant-journey-presentation/applicant-journey-presentation'

import { journeyPresentation } from './current'

import type { CurrentApplication } from '../../api/applicant-applications'

// The current-application endpoint reports this even for a finished draft.
const finishedDraft: CurrentApplication = {
  id: '0199a8bb-8687-7c22-aed5-55d432f50f23',
  href: '/applications/0199a8bb-8687-7c22-aed5-55d432f50f23/identity-and-address',
  progress: [
    { step: 'personal-details', state: 'complete' },
    { step: 'identity-and-address', state: 'current' },
  ],
}

describe('journeyPresentation', () => {
  it('starts a new application when there is no draft', () => {
    expect(journeyPresentation(null)).toBe(applicantJourneyFixtures.start)
  })

  it('shows both steps complete when the form says the draft is finished', () => {
    const presentation = journeyPresentation(finishedDraft, [
      { step: 'personal-details', state: 'complete' },
      { step: 'identity-and-address', state: 'complete' },
    ])

    expect(presentation.entryState).toBe('resume')
    expect(presentation.progress).toEqual([
      { step: 'personal-details', state: 'complete' },
      { step: 'identity-and-address', state: 'complete' },
    ])
    expect(presentation.progress.some(({ state }) => state === 'current')).toBe(
      false,
    )
  })

  it('uses the form steps while the second step is still in progress', () => {
    expect(
      journeyPresentation(finishedDraft, [
        { step: 'personal-details', state: 'complete' },
        { step: 'identity-and-address', state: 'current' },
      ]).progress,
    ).toEqual([
      { step: 'personal-details', state: 'complete' },
      { step: 'identity-and-address', state: 'current' },
    ])
  })

  it('falls back to the journey progress when the form steps are unavailable', () => {
    expect(
      journeyPresentation({
        ...finishedDraft,
        progress: [
          { step: 'personal-details', state: 'current' },
          { step: 'identity-and-address', state: 'not-started' },
        ],
      }),
    ).toEqual({
      entryState: 'resume',
      progress: [
        { step: 'personal-details', state: 'current' },
        { step: 'identity-and-address', state: 'remaining' },
      ],
    })
  })
})
