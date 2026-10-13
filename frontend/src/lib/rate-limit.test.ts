import { describe, expect, it } from 'vitest'

import { rateLimitMessage } from './rate-limit'

describe('rateLimitMessage', () => {
  it('describes the rate-limit wait time', () => {
    expect(rateLimitMessage(1)).toBe(
      'Too many attempts. Try again in 1 second.',
    )
    expect(rateLimitMessage(45)).toBe(
      'Too many attempts. Try again in 45 seconds.',
    )
    expect(rateLimitMessage(90)).toBe(
      'Too many attempts. Try again in 2 minutes.',
    )
    expect(rateLimitMessage()).toBe(
      'Too many attempts. Wait a moment, then try again.',
    )
  })
})
