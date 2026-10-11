import { z } from 'zod'

export const JSON_API_MEDIA_TYPE = 'application/vnd.api+json'

const errorObjectSchema = z.object({
  status: z.string(),
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  source: z.object({ pointer: z.string() }).optional(),
})

const errorDocumentSchema = z.object({
  errors: z.array(errorObjectSchema).min(1),
})

export type JsonApiError = z.infer<typeof errorObjectSchema>

export type JsonApiFailure =
  | {
      kind: 'http'
      status: number
      errors: JsonApiError[]
      retryAfterSeconds?: number
    }
  | { kind: 'network' }
  | { kind: 'unexpected'; status?: number }

/** Thrown for any non-2xx response or transport failure, with a typed reason. */
export class JsonApiRequestError extends Error {
  readonly failure: JsonApiFailure

  constructor(failure: JsonApiFailure) {
    super(`JSON:API request failed: ${failure.kind}`)
    this.name = 'JsonApiRequestError'
    this.failure = failure
  }
}

export function getJsonApi(url: string): Promise<Response> {
  return sendJsonApi('GET', url)
}

export function postJsonApi(url: string, payload: unknown): Promise<Response> {
  return sendJsonApi('POST', url, payload)
}

export function patchJsonApi(url: string, payload: unknown): Promise<Response> {
  return sendJsonApi('PATCH', url, payload)
}

/** Posts a multipart body; the browser sets its Content-Type and boundary. */
export function postMultipartJsonApi(
  url: string,
  formData: FormData,
): Promise<Response> {
  return sendJsonApi('POST', url, formData)
}

export function deleteJsonApi(url: string): Promise<Response> {
  return sendJsonApi('DELETE', url)
}

/**
 * Parses a successful response body with `schema`. A body that does not match
 * the contract is reported as an unexpected response.
 */
export async function readJsonApi<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new JsonApiRequestError({
      kind: 'unexpected',
      status: response.status,
    })
  }
  return parsed.data
}

async function sendJsonApi(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<Response> {
  const isMultipart = payload instanceof FormData
  const headers: Record<string, string> = { Accept: JSON_API_MEDIA_TYPE }
  if (payload !== undefined && !isMultipart) {
    headers['Content-Type'] = JSON_API_MEDIA_TYPE
  }
  // The API requires the CSRF token from sign-in on authenticated writes.
  const csrfToken = method === 'GET' ? undefined : readCookie('XSRF-TOKEN')
  if (csrfToken) {
    headers['X-XSRF-TOKEN'] = csrfToken
  }
  let body: BodyInit | undefined
  if (isMultipart) {
    body = payload
  } else if (payload !== undefined) {
    body = JSON.stringify(payload)
  }
  let response: Response
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers,
      body,
    })
  } catch {
    throw new JsonApiRequestError({ kind: 'network' })
  }
  if (response.ok) {
    return response
  }
  throw new JsonApiRequestError(await readFailure(response))
}

function readCookie(name: string): string | undefined {
  for (const cookie of document.cookie.split(';')) {
    const [key, ...value] = cookie.trim().split('=')
    if (key === name) {
      return decodeURIComponent(value.join('='))
    }
  }
  return undefined
}

async function readFailure(response: Response): Promise<JsonApiFailure> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { kind: 'unexpected', status: response.status }
  }
  const parsed = errorDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return { kind: 'unexpected', status: response.status }
  }
  return {
    kind: 'http',
    status: response.status,
    errors: parsed.data.errors,
    retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return undefined
  }
  const seconds = Number(value)
  return seconds >= 1 ? seconds : undefined
}
