import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { ApiHttpError, apiRequest, setUnauthorizedHandler } from '../../lib/api.ts'

export interface AuthenticatedUser {
  id: string
  firstName: string
  lastName: string
  email: string
}

export type Session = AuthenticatedUser | null

export interface SessionUnauthorizedHandlerOptions {
  queryClient: QueryClient
  onSessionExpired: () => void
}

export interface LogoutOptions {
  queryClient: QueryClient
  onSessionEnded: () => void
}

export const sessionQueryKey = ['auth', 'me'] as const

export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: resolveSession,
  retry: false,
})

let installedUnauthorizedHandler: (() => void) | undefined

export async function resolveSession(): Promise<Session> {
  try {
    return await apiRequest<AuthenticatedUser>('/auth/me')
  } catch (error) {
    if (
      error instanceof ApiHttpError &&
      error.status === 401 &&
      error.code === 'UNAUTHORIZED'
    ) {
      return null
    }

    throw error
  }
}

export function installSessionUnauthorizedHandler(
  options: SessionUnauthorizedHandlerOptions,
): () => void {
  const handler = () => {
    const sessionExpired = hasAuthenticatedSession(options.queryClient)
    clearSessionData(options.queryClient)

    if (sessionExpired) {
      options.onSessionExpired()
    }
  }

  installedUnauthorizedHandler = handler
  setUnauthorizedHandler(handler)

  return () => {
    if (installedUnauthorizedHandler === handler) {
      installedUnauthorizedHandler = undefined
      setUnauthorizedHandler()
    }
  }
}

export async function logout({ queryClient, onSessionEnded }: LogoutOptions): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
  clearSessionData(queryClient)
  onSessionEnded()
}

function hasAuthenticatedSession(queryClient: QueryClient): boolean {
  const session = queryClient.getQueryData<Session>(sessionQueryKey)

  return session !== null && session !== undefined
}

function clearSessionData(queryClient: QueryClient): void {
  const privateQueries = {
    predicate: (query: { queryKey: readonly unknown[] }) => !isSessionQuery(query.queryKey),
  }

  void queryClient.cancelQueries(privateQueries)
  queryClient.removeQueries(privateQueries)
  queryClient.setQueryData(sessionQueryKey, null)
}

function isSessionQuery(queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length === sessionQueryKey.length &&
    queryKey.every((part, index) => part === sessionQueryKey[index])
  )
}
