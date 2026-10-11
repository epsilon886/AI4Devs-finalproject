import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, setUnauthorizedHandler } from '../../lib/api.ts'
import {
  installSessionUnauthorizedHandler,
  logout,
  resolveSession,
  sessionQueryKey,
  sessionQueryOptions,
} from './session.ts'

const fetchMock = vi.fn()

afterEach(() => {
  setUnauthorizedHandler()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function mockFetch(response: Response): void {
  vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response))
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
}

const privateQueryKey = ['vacancies', { page: 1 }] as const

describe('session query', () => {
  it('returns the contractual authenticated user from GET /auth/me', async () => {
    const user = {
      id: '018f0f64-2d8a-7f0b-8000-000000000001',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    }
    mockFetch(jsonResponse(user, 200))

    await expect(resolveSession()).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('interprets UNAUTHORIZED from GET /auth/me as an absent session', async () => {
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

    await expect(resolveSession()).resolves.toBeNull()
  })

  it('propagates unexpected HTTP errors instead of treating them as an absent session', async () => {
    mockFetch(
      jsonResponse(
        {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
        500,
      ),
    )

    await expect(resolveSession()).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    })
  })

  it('propagates network failures instead of treating them as logout', async () => {
    vi.stubGlobal('fetch', fetchMock.mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(resolveSession()).rejects.toMatchObject({
      name: 'ApiNetworkError',
      message: 'Network request failed',
    })
  })

  it('uses a stable session key and disables automatic retries', () => {
    expect(sessionQueryKey).toEqual(['auth', 'me'])
    expect(sessionQueryOptions.queryKey).toBe(sessionQueryKey)
    expect(sessionQueryOptions.retry).toBe(false)
  })

  it('clears the session and private cached data after a transversal UNAUTHORIZED', async () => {
    const queryClient = new QueryClient()
    const onSessionExpired = vi.fn()
    queryClient.setQueryData(sessionQueryKey, authenticatedUser)
    queryClient.setQueryData(privateQueryKey, { items: ['private vacancy'] })
    const dispose = installSessionUnauthorizedHandler({ queryClient, onSessionExpired })
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

    await expect(apiRequest('/vacancies')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })

    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull()
    expect(queryClient.getQueryData(privateQueryKey)).toBeUndefined()
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('does not treat the initial UNAUTHORIZED from /auth/me as a transversal expiry', async () => {
    const queryClient = new QueryClient()
    const onSessionExpired = vi.fn()
    const dispose = installSessionUnauthorizedHandler({ queryClient, onSessionExpired })
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

    await expect(queryClient.fetchQuery(sessionQueryOptions)).resolves.toBeNull()

    expect(onSessionExpired).not.toHaveBeenCalled()
    dispose()
  })

  it('does not invalidate the session for INVALID_CREDENTIALS', async () => {
    const queryClient = new QueryClient()
    const onSessionExpired = vi.fn()
    queryClient.setQueryData(sessionQueryKey, authenticatedUser)
    queryClient.setQueryData(privateQueryKey, { items: ['private vacancy'] })
    const dispose = installSessionUnauthorizedHandler({ queryClient, onSessionExpired })
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
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })

    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(authenticatedUser)
    expect(queryClient.getQueryData(privateQueryKey)).toEqual({
      items: ['private vacancy'],
    })
    expect(onSessionExpired).not.toHaveBeenCalled()
    dispose()
  })

  it('logs out, clears the session and private cached data after a successful response', async () => {
    const queryClient = new QueryClient()
    const onSessionEnded = vi.fn()
    queryClient.setQueryData(sessionQueryKey, authenticatedUser)
    queryClient.setQueryData(privateQueryKey, { items: ['private vacancy'] })
    mockFetch(new Response(null, { status: 204 }))

    await expect(logout({ queryClient, onSessionEnded })).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull()
    expect(queryClient.getQueryData(privateQueryKey)).toBeUndefined()
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
  })

  it('preserves the session and cached data when logout has a technical failure', async () => {
    const queryClient = new QueryClient()
    const onSessionEnded = vi.fn()
    queryClient.setQueryData(sessionQueryKey, authenticatedUser)
    queryClient.setQueryData(privateQueryKey, { items: ['private vacancy'] })
    mockFetch(
      jsonResponse(
        {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
        500,
      ),
    )

    await expect(logout({ queryClient, onSessionEnded })).rejects.toMatchObject({
      name: 'ApiHttpError',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
    })

    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(authenticatedUser)
    expect(queryClient.getQueryData(privateQueryKey)).toEqual({
      items: ['private vacancy'],
    })
    expect(onSessionEnded).not.toHaveBeenCalled()
  })
})
