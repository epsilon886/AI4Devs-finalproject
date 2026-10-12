import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, setUnauthorizedHandler } from '../lib/api.ts'
import {
  installSessionUnauthorizedHandler,
  logout,
  sessionQueryKey,
} from '../features/auth/session.ts'
import { createAppRouter, isAuthenticatedRoute } from './router.tsx'

const fetchMock = vi.fn()

afterEach(() => {
  setUnauthorizedHandler()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockSession(user: Record<string, string> | null): void {
  const response = user
    ? jsonResponse(user, 200)
    : jsonResponse(
        {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        401,
      )

  vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response))
}

function renderRouter(initialPath: string) {
  const queryClient = new QueryClient()
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router }
}

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
}

describe('session routing', () => {
  it('identifies only the implemented private routes as authenticated zones', () => {
    expect(isAuthenticatedRoute('/vacancies')).toBe(true)
    expect(isAuthenticatedRoute('/candidates')).toBe(true)
    expect(isAuthenticatedRoute('/pipelines')).toBe(true)
    expect(isAuthenticatedRoute('/login')).toBe(false)
    expect(isAuthenticatedRoute('/register')).toBe(false)
    expect(isAuthenticatedRoute('/not-found')).toBe(false)
  })

  it('shows a loading state while resolving the initial session', () => {
    vi.stubGlobal('fetch', fetchMock.mockImplementation(() => new Promise(() => undefined)))

    renderRouter('/')

    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('redirects / to /login without a session', async () => {
    mockSession(null)
    const { router } = renderRouter('/')

    await waitFor(
      () => expect(router.state.location.pathname).toBe('/login'),
      { timeout: 500 },
    )
  })

  it('redirects / to /vacancies with a session', async () => {
    mockSession(authenticatedUser)
    const { router } = renderRouter('/')

    await waitFor(
      () => expect(router.state.location.pathname).toBe('/vacancies'),
      { timeout: 500 },
    )
  })

  it.each([
    ['/vacancies', 'Vacancies'],
    ['/candidates', 'Candidates'],
    ['/pipelines', 'Pipelines'],
  ])('keeps the direct private route %s with a session', async (path, heading) => {
    mockSession(authenticatedUser)

    renderRouter(path)

    expect(await screen.findByRole('heading', { name: heading }, { timeout: 500 })).toBeTruthy()
  })

  it.each(['/vacancies', '/candidates', '/pipelines'])(
    'redirects the private route %s to /login without a session',
    async (path) => {
      mockSession(null)
      const { router } = renderRouter(path)

      await waitFor(
        () => expect(router.state.location.pathname).toBe('/login'),
        { timeout: 500 },
      )
    },
  )

  it.each(['/login', '/register'])(
    'redirects an authenticated visitor from %s to /vacancies',
    async (path) => {
      mockSession(authenticatedUser)
      const { router } = renderRouter(path)

      await waitFor(
        () => expect(router.state.location.pathname).toBe('/vacancies'),
        { timeout: 500 },
      )
    },
  )

  it.each(['/login', '/register'])(
    'does not render the authenticated shell on the public route %s',
    async (path) => {
      mockSession(null)

      renderRouter(path)

      expect(await screen.findByRole('heading')).toBeTruthy()
      expect(screen.queryByRole('banner')).toBeNull()
    },
  )

  it('renders the real LoginPage without the authenticated shell', async () => {
    mockSession(null)

    renderRouter('/login')

    expect(await screen.findByRole('form', { name: 'Login' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('renders the real RegisterPage without the authenticated shell', async () => {
    mockSession(null)

    renderRouter('/register')

    expect(await screen.findByRole('form', { name: 'Register' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /First name/ })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Last name/ })).toBeTruthy()
    expect(screen.queryByRole('banner')).toBeNull()
  })

  it('establishes the session from Login and enters Vacancies without refetching /auth/me', async () => {
    const email = 'ada@example.com'
    const password = 'a'.repeat(15)
    let sessionRequests = 0

    vi.stubGlobal(
      'fetch',
      fetchMock.mockImplementation((path: string) => {
        if (path === '/api/auth/me') {
          sessionRequests += 1
          return Promise.resolve(
            jsonResponse(
              {
                statusCode: 401,
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
              401,
            ),
          )
        }

        if (path === '/api/auth/login') {
          return Promise.resolve(jsonResponse(authenticatedUser, 200))
        }

        throw new Error('Unexpected request: ' + path)
      }),
    )
    const { queryClient, router } = renderRouter('/login')

    fireEvent.change(await screen.findByRole('textbox', { name: 'Email' }), {
      target: { value: email },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: password },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(
      () => expect(router.state.location.pathname).toBe('/vacancies'),
      { timeout: 500 },
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    )
    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(authenticatedUser)
    expect(await screen.findByRole('heading', { name: 'Vacancies' })).toBeTruthy()
    expect(sessionRequests).toBe(1)
  })

  it('returns to Login with success feedback after registration without creating a session', async () => {
    const email = 'ada@example.com'
    const password = 'a'.repeat(15)
    vi.stubGlobal(
      'fetch',
      fetchMock.mockImplementation((path: string) => {
        if (path === '/api/auth/me') {
          return Promise.resolve(
            jsonResponse(
              {
                statusCode: 401,
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
              },
              401,
            ),
          )
        }

        if (path === '/api/auth/register') {
          return Promise.resolve(jsonResponse({ message: 'Account created successfully' }, 201))
        }

        throw new Error('Unexpected request: ' + path)
      }),
    )
    const { queryClient, router } = renderRouter('/register')

    fireEvent.change(await screen.findByRole('textbox', { name: /First name/ }), {
      target: { value: 'Ada' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /Last name/ }), {
      target: { value: 'Lovelace' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /Email/ }), {
      target: { value: email },
    })
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: password },
    })
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: password },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))

    await waitFor(
      () => expect(router.state.location.pathname).toBe('/login'),
      { timeout: 500 },
    )
    const successFeedback = await screen.findByRole('status')
    expect(successFeedback.textContent).toContain('Account created successfully')
    expect(successFeedback.textContent).not.toContain(email)
    expect(successFeedback.textContent).not.toContain(password)
    expect(router.state.location.href).toBe('/login')
    expect(router.history.canGoBack()).toBe(false)
    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull()
  })

  it.each([
    [authenticatedUser, '/vacancies'],
    [null, '/login'],
  ])(
    'shows the contextual 404 CTA %s without redirecting an unknown URL',
    async (user, expectedDestination) => {
      mockSession(user)
      const { router } = renderRouter('/unknown-route')

      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
      expect(screen.getByRole('link').getAttribute('href')).toBe(expectedDestination)
      expect(router.state.location.pathname).toBe('/unknown-route')
    },
  )

  it('shows a recoverable error for an initial technical session failure', async () => {
    vi.stubGlobal(
      'fetch',
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
          },
          500,
        ),
      ),
    )

    renderRouter('/')

    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 500 })).toBeTruthy()
  })

  it('redirects once to /login with replacement after a protected request is UNAUTHORIZED', async () => {
    mockSession(authenticatedUser)
    const { queryClient, router } = renderRouter('/vacancies')
    const navigateToLogin = vi.fn(() => router.navigate({ to: '/login', replace: true }))
    const dispose = installSessionUnauthorizedHandler({
      queryClient,
      onSessionExpired: navigateToLogin,
    })

    await screen.findByRole('heading', { name: 'Vacancies' }, { timeout: 500 })
    vi.stubGlobal(
      'fetch',
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            {
              statusCode: 401,
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
            401,
          ),
        ),
      ),
    )

    await expect(apiRequest('/vacancies')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
    await expect(apiRequest('/vacancies')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })

    await waitFor(
      () => expect(router.state.location.pathname).toBe('/login'),
      { timeout: 500 },
    )
    expect(navigateToLogin).toHaveBeenCalledTimes(1)
    expect(router.history.canGoBack()).toBe(false)
    dispose()
  })

  it('does not navigate away from a public route after a transversal UNAUTHORIZED', async () => {
    mockSession(null)
    const { queryClient, router } = renderRouter('/login')
    const navigateToLogin = vi.fn(() => router.navigate({ to: '/login', replace: true }))
    const dispose = installSessionUnauthorizedHandler({
      queryClient,
      onSessionExpired: navigateToLogin,
    })

    expect(await screen.findByRole('heading', { name: 'Login' }, { timeout: 500 })).toBeTruthy()
    const privateQueryKey = ['vacancies', { page: 1 }] as const
    queryClient.setQueryData(privateQueryKey, { items: ['private vacancy'] })
    mockSession(null)

    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })

    expect(router.state.location.pathname).toBe('/login')
    expect(queryClient.getQueryData(privateQueryKey)).toBeUndefined()
    expect(navigateToLogin).not.toHaveBeenCalled()
    dispose()
  })

  it('navigates to /login after successful logout', async () => {
    mockSession(authenticatedUser)
    const { queryClient, router } = renderRouter('/candidates')

    await screen.findByRole('heading', { name: 'Candidates' }, { timeout: 500 })
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(new Response(null, { status: 204 })))

    await logout({
      queryClient,
      onSessionEnded: () => router.navigate({ to: '/login', replace: true }),
    })

    await waitFor(
      () => expect(router.state.location.pathname).toBe('/login'),
      { timeout: 500 },
    )
  })
})
