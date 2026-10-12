import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../routes/router.tsx'

const fetchMock = vi.fn()

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockAuthenticatedSession(logoutResponse: () => Promise<Response>): void {
  vi.stubGlobal(
    'fetch',
    fetchMock.mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve(jsonResponse(authenticatedUser, 200))
      }

      if (path === '/api/auth/logout') {
        return logoutResponse()
      }

      throw new Error(`Unexpected request: ${path}`)
    }),
  )
}

function renderProtectedRoute(initialPath = '/vacancies') {
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

  return router
}

describe('AppShell', () => {
  it.each([
    ['/vacancies', 'Vacantes'],
    ['/candidates', 'Candidatos'],
    ['/pipelines', 'Flujos de selección'],
  ])('shows the authenticated shell with %s as the active section', async (path, activeLabel) => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))

    renderProtectedRoute(path)

    expect((await screen.findByRole('banner')).textContent).toContain('RecruitLane')
    expect(screen.getByRole('banner').textContent).toContain('Ada Lovelace')

    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(
      Array.from(navigation.querySelectorAll('a')).map((link) => link.textContent),
    ).toEqual(['Vacantes', 'Candidatos', 'Flujos de selección'])
    expect(screen.getByRole('link', { name: activeLabel }).getAttribute('aria-current')).toBe(
      'page',
    )
    for (const label of ['Vacantes', 'Candidatos', 'Flujos de selección']) {
      if (label !== activeLabel) {
        expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBeNull()
      }
    }
  })

  it('disables Logout and shows progress while logout is pending', async () => {
    let resolveLogout: ((response: Response) => void) | undefined
    mockAuthenticatedSession(
      () =>
        new Promise((resolve) => {
          resolveLogout = resolve
        }),
    )
    renderProtectedRoute()

    const logoutButton = (await screen.findByRole('button', {
      name: 'Cerrar sesión',
    })) as HTMLButtonElement
    fireEvent.click(logoutButton)

    await waitFor(() => {
      expect(logoutButton.disabled).toBe(true)
      expect(logoutButton.textContent).toContain('Cerrando sesión...')
    })

    resolveLogout?.(new Response(null, { status: 204 }))
  })

  it('navigates to /login after successful logout', async () => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))
    const router = renderProtectedRoute()

    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), {
      timeout: 500,
    })
  })

  it('keeps the current screen, announces a logout failure and allows retrying', async () => {
    let logoutAttempts = 0
    mockAuthenticatedSession(() => {
      logoutAttempts += 1

      if (logoutAttempts === 1) {
        return Promise.resolve(
          jsonResponse(
            {
              statusCode: 500,
              code: 'INTERNAL_SERVER_ERROR',
              message: 'An unexpected error occurred',
            },
            500,
          ),
        )
      }

      return Promise.resolve(new Response(null, { status: 204 }))
    })
    const router = renderProtectedRoute('/candidates')

    const logoutButton = (await screen.findByRole('button', {
      name: 'Cerrar sesión',
    })) as HTMLButtonElement
    fireEvent.click(logoutButton)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/candidates')
    expect(logoutButton.disabled).toBe(false)

    fireEvent.click(logoutButton)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'), {
      timeout: 500,
    })
  })

  it('opens and closes the mobile navigation with accessible state', async () => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))
    renderProtectedRoute()

    const navigationToggle = (await screen.findByRole('button', {
      name: 'Abrir navegación',
    })) as HTMLButtonElement

    expect(navigationToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog', { name: 'Navegación móvil' })).toBeNull()

    fireEvent.click(navigationToggle)

    expect(navigationToggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Navegación móvil' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar navegación' }))

    expect(navigationToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog', { name: 'Navegación móvil' })).toBeNull()
  })

  it('shows only the main destinations and active section in the mobile drawer', async () => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))
    renderProtectedRoute('/candidates')

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir navegación' }))

    const drawer = screen.getByRole('dialog', { name: 'Navegación móvil' })
    const navigation = within(drawer).getByRole('navigation', { name: 'Navegación móvil' })
    expect(
      Array.from(navigation.querySelectorAll('a')).map((link) => link.textContent),
    ).toEqual(['Vacantes', 'Candidatos', 'Flujos de selección'])
    expect(within(navigation).getByRole('link', { name: 'Candidatos' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('closes the mobile drawer after navigating to another section', async () => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))
    const router = renderProtectedRoute()

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir navegación' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Navegación móvil' })).getByRole('link', {
        name: 'Candidatos',
      }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/candidates'), {
      timeout: 500,
    })
    expect(screen.queryByRole('dialog', { name: 'Navegación móvil' })).toBeNull()
  })

  it('keeps focus in the drawer when tabbing forward from its last focusable element', async () => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))
    renderProtectedRoute()

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir navegación' }))

    const drawer = screen.getByRole('dialog', { name: 'Navegación móvil' })
    const closeButton = within(drawer).getByRole('button', { name: 'Cerrar navegación' })
    const lastLink = within(drawer).getByRole('link', { name: 'Flujos de selección' })
    lastLink.focus()

    fireEvent.keyDown(lastLink, { key: 'Tab' })

    expect(document.activeElement).toBe(closeButton)
  })

  it('keeps focus in the drawer when shift-tabbing from its first focusable element', async () => {
    mockAuthenticatedSession(() => Promise.resolve(new Response(null, { status: 204 })))
    renderProtectedRoute()

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir navegación' }))

    const drawer = screen.getByRole('dialog', { name: 'Navegación móvil' })
    const firstButton = within(drawer).getByRole('button', { name: 'Cerrar navegación' })
    const lastLink = within(drawer).getByRole('link', { name: 'Flujos de selección' })
    firstButton.focus()

    fireEvent.keyDown(firstButton, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(lastLink)
  })
})
