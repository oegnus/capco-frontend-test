import { describe, expect, it } from 'vitest'

import { journeyDestination } from './-return-target'

describe('journeyDestination', () => {
  it.each([
    '/applications/current',
    '/applications/0199a8bb-8687-7c22-aed5-55d432f50f23/personal-details',
  ])('uses the local journey path %s', (href) => {
    expect(journeyDestination(href)).toBe(href)
  })

  it.each(['//evil.example', 'https://evil.example', '/reviewer', ''])(
    'falls back to the current application for %j',
    (href) => {
      expect(journeyDestination(href)).toBe('/applications/current')
    },
  )
})
