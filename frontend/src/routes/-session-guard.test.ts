import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import { redirectIfSignedIn, requireSignedIn } from './-session-guard'

const currentApplication = '/api/v1/applicant-applications/current'

const signedIn = () => new HttpResponse(null, { status: 204 })
const signedOut = () =>
  HttpResponse.json(
    {
      errors: [
        {
          status: '401',
          code: 'authentication-required',
          title: 'Authentication required',
          detail: 'Sign in to continue.',
        },
      ],
    },
    { status: 401, headers: { 'Content-Type': 'application/vnd.api+json' } },
  )
const serverError = () => new HttpResponse('Internal error', { status: 500 })

async function thrownRedirect(guard: () => Promise<void>) {
  try {
    await guard()
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown.headers.get('Location')
    }
    throw thrown
  }
  return undefined
}

describe('requireSignedIn', () => {
  it('redirects a signed-out visitor to sign-in', async () => {
    server.use(http.get(currentApplication, signedOut))

    expect(await thrownRedirect(requireSignedIn)).toBe('/sign-in')
  })

  it('lets a signed-in Applicant through', async () => {
    server.use(http.get(currentApplication, signedIn))

    await expect(requireSignedIn()).resolves.toBeUndefined()
  })

  it('surfaces an unknown session state as an error', async () => {
    server.use(http.get(currentApplication, serverError))

    await expect(requireSignedIn()).rejects.not.toBeInstanceOf(Response)
  })
})

describe('redirectIfSignedIn', () => {
  it('sends a signed-in Applicant to the current application', async () => {
    server.use(http.get(currentApplication, signedIn))

    expect(await thrownRedirect(redirectIfSignedIn)).toBe(
      '/applications/current',
    )
  })

  it.each([
    ['signed out', signedOut],
    ['unknown because of a server error', serverError],
    ['unknown because of a network failure', () => HttpResponse.error()],
  ])('shows the page when the visitor is %s', async (_case, resolver) => {
    server.use(http.get(currentApplication, resolver))

    await expect(redirectIfSignedIn()).resolves.toBeUndefined()
  })
})
