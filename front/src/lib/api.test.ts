import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiHttpError,
  ApiNetworkError,
  apiRequest,
  setUnauthorizedHandler,
} from './api.ts'

const fetchMock = vi.fn()

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function mockFetch(response: Response): void {
  vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestHeaders(): Headers {
  const [, options] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return new Headers(options.headers)
}

describe('apiRequest', () => {
  it('uses the relative /api URL, includes credentials and omits CSRF for GET', async () => {
    const user = {
      id: '018f0f64-2d8a-7f0b-8000-000000000001',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    }
    mockFetch(jsonResponse(user))

    await expect(apiRequest<typeof user>('/auth/me')).resolves.toEqual(user)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
    expect(requestHeaders().get('X-CSRF-Protection')).toBeNull()
  })

  it.each(['POST', 'PATCH', 'DELETE'] as const)(
    'adds CSRF without setting Origin for %s',
    async (method) => {
      mockFetch(jsonResponse({}))

      await apiRequest('/candidates/018f0f64-2d8a-7f0b-8000-000000000001', {
        method,
      })

      const headers = requestHeaders()
      expect(headers.get('X-CSRF-Protection')).toBe('1')
      expect(headers.get('Origin')).toBeNull()
    },
  )

  it('serializes JSON and sets Content-Type only when a body exists', async () => {
    mockFetch(jsonResponse({}))

    await apiRequest('/candidates', {
      method: 'POST',
      body: { firstName: 'Ada' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/candidates',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ firstName: 'Ada' }),
      }),
    )
    expect(requestHeaders()).toEqual(
      new Headers({
        'Content-Type': 'application/json',
        'X-CSRF-Protection': '1',
      }),
    )

    mockFetch(jsonResponse({}))

    await apiRequest('/auth/logout', { method: 'POST' })

    const headers = requestHeaders()
    expect(headers.get('Content-Type')).toBeNull()
    expect(headers.get('X-CSRF-Protection')).toBe('1')
  })

  it('returns undefined for 204 without parsing JSON', async () => {
    mockFetch(new Response(null, { status: 204 }))

    await expect(
      apiRequest<void>('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined()
  })

  it('normalizes contractual HTTP errors', async () => {
    mockFetch(
      jsonResponse(
        {
          statusCode: 409,
          code: 'REGISTRATION_CONFLICT',
          message: 'Unable to create account with the provided information',
        },
        409,
      ),
    )

    await expect(apiRequest('/auth/register', { method: 'POST' })).rejects.toMatchObject(
      {
        name: 'ApiHttpError',
        status: 409,
        code: 'REGISTRATION_CONFLICT',
        message: 'Unable to create account with the provided information',
      },
    )
  })

  it('preserves validation errors by field, including dot notation', async () => {
    const errors = [
      { field: 'stages.1.position', message: 'position must be unique' },
      { field: 'body', message: 'body must not be empty' },
    ]
    mockFetch(
      jsonResponse(
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors,
        },
        400,
      ),
    )

    await expect(apiRequest('/pipelines', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 400,
      code: 'VALIDATION_ERROR',
      errors,
    })
  })

  it('notifies UNAUTHORIZED while preserving the original rejection', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(
      jsonResponse(
        {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        401,
      ),
    )

    await expect(apiRequest('/auth/me')).rejects.toBeInstanceOf(ApiHttpError)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'UNAUTHORIZED' }),
    )
  })

  it('does not notify the session handler for INVALID_CREDENTIALS', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(
      jsonResponse(
        {
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
        401,
      ),
    )

    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('distinguishes network failures from HTTP errors', async () => {
    vi.stubGlobal('fetch', fetchMock.mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiRequest('/auth/me')).rejects.toBeInstanceOf(ApiNetworkError)
  })

  it('keeps malformed error responses as generic HTTP errors without leaking parser errors', async () => {
    mockFetch(new Response('upstream failure', { status: 502 }))

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 502,
    })
    await expect(apiRequest('/auth/me')).rejects.not.toBeInstanceOf(SyntaxError)
  })
})
