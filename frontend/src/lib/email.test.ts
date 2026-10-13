import { describe, expect, it } from 'vitest'

import { validateEmail } from './email'

describe('validateEmail', () => {
  it('requires an email address', () => {
    expect(validateEmail('')).toBe('Enter your email address.')
  })

  it.each(['ada', 'ada@example', 'ada lovelace@example.com'])(
    'rejects %s',
    (email) => {
      expect(validateEmail(email)).toBe(
        'Enter an email address in the format name@example.com.',
      )
    },
  )

  it('accepts a valid email address', () => {
    expect(validateEmail('ada@example.com')).toBeUndefined()
  })
})
