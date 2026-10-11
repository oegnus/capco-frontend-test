import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '../test/server'

import {
  deleteCurrentApplicantSession,
  getApplicantSessionStatus,
} from './applicant-sessions'
import { JsonApiRequestError } from './json-api'

const endpoint = '/api/v1/applicant-sessions/current'

function errorResponse(status: number, code: string) {
  return HttpResponse.json(
    { errors: [{ status: String(status), code, title: code, detail: code }] },
    { status, headers: { 'Content-Type': 'application/vnd.api+json' } },
  )
}

describe('deleteCurrentApplicantSession', () => {
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('sends DELETE with the CSRF token from the XSRF-TOKEN cookie', async () => {
    document.cookie = 'XSRF-TOKEN=token%20value'
    let request: Request | undefined
    server.use(
      http.delete(endpoint, ({ request: received }) => {
        request = received
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteCurrentApplicantSession()

    expect(request?.method).toBe('DELETE')
    expect(request?.headers.get('Accept')).toBe('application/vnd.api+json')
    expect(request?.headers.get('X-XSRF-TOKEN')).toBe('token value')
    expect(request?.headers.has('Content-Type')).toBe(false)
  })

  it('omits the CSRF header when there is no token cookie', async () => {
    let request: Request | undefined
    server.use(
      http.delete(endpoint, ({ request: received }) => {
        request = received
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await deleteCurrentApplicantSession()

    expect(request?.headers.has('X-XSRF-TOKEN')).toBe(false)
  })

  it('treats a missing session (401) as already logged out', async () => {
    server.use(
      http.delete(endpoint, () =>
        errorResponse(401, 'authentication-required'),
      ),
    )

    await expect(deleteCurrentApplicantSession()).resolves.toBeUndefined()
  })

  it('rejects when the request is denied (403)', async () => {
    server.use(http.delete(endpoint, () => errorResponse(403, 'access-denied')))

    await expect(deleteCurrentApplicantSession()).rejects.toBeInstanceOf(
      JsonApiRequestError,
    )
  })
})

describe('getApplicantSessionStatus', () => {
  const currentApplication = '/api/v1/applicant-applications/current'

  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it.each([
    [
      'a current draft (200)',
      () =>
        HttpResponse.json(
          { data: {} },
          {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.api+json' },
          },
        ),
    ],
    ['no draft yet (204)', () => new HttpResponse(null, { status: 204 })],
  ])('is signed in when the API returns %s', async (_case, resolver) => {
    server.use(http.get(currentApplication, resolver))

    await expect(getApplicantSessionStatus()).resolves.toBe('signed-in')
  })

  it('is signed out when the API requires authentication (401)', async () => {
    server.use(
      http.get(currentApplication, () =>
        errorResponse(401, 'authentication-required'),
      ),
    )

    await expect(getApplicantSessionStatus()).resolves.toBe('signed-out')
  })

  it('rejects when the session state is unknown (500)', async () => {
    server.use(
      http.get(currentApplication, () => errorResponse(500, 'internal-error')),
    )

    await expect(getApplicantSessionStatus()).rejects.toBeInstanceOf(
      JsonApiRequestError,
    )
  })

  it('sends a plain JSON:API read without the CSRF token', async () => {
    document.cookie = 'XSRF-TOKEN=token'
    let request: Request | undefined
    server.use(
      http.get(currentApplication, ({ request: received }) => {
        request = received
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await getApplicantSessionStatus()

    expect(request?.headers.get('Accept')).toBe('application/vnd.api+json')
    expect(request?.headers.has('X-XSRF-TOKEN')).toBe(false)
  })
})
