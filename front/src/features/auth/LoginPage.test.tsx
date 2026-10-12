import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setUnauthorizedHandler } from '../../lib/api.ts'
import { createAppRouter } from '../../routes/router.tsx'
import { sessionQueryKey } from './session.ts'

afterEach(() => {
  setUnauthorizedHandler()
  vi.unstubAllGlobals()
})

async function renderLoginPage() {
  const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
  return renderLoginPageWithFetch(fetchMock)
}

async function renderLoginPageWithFetch(fetchMock: ReturnType<typeof vi.fn>) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(sessionQueryKey, null)
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  })
  vi.stubGlobal('fetch', fetchMock)

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await screen.findByRole('form', { name: 'Login' })

  return { fetchMock, queryClient, router }
}

function emailInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement
}

function passwordInput(): HTMLInputElement {
  return screen.getByLabelText('Password') as HTMLInputElement
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Log in' }) as HTMLButtonElement
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function submitValidCredentials() {
  fireEvent.change(emailInput(), { target: { value: 'ada@example.com' } })
  fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(15) } })
  fireEvent.click(submitButton())
}

describe('LoginPage', () => {
  it('presents accessible email and password fields with a login action', async () => {
    await renderLoginPage()

    expect(screen.getByRole('heading', { name: 'Login' })).toBeTruthy()
    expect(emailInput().type).toBe('email')
    expect(passwordInput().type).toBe('password')
    expect(submitButton()).toBeTruthy()
  })

  it('links to Register without submitting Login or sending a request', async () => {
    const { fetchMock, router } = await renderLoginPage()
    const form = screen.getByRole('form', { name: 'Login' })
    let submitCount = 0
    form.addEventListener('submit', () => {
      submitCount += 1
    })

    fireEvent.click(screen.getByRole('link', { name: 'Register' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/register'))
    expect(submitCount).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows inline errors when submitting empty required fields without required asterisks', async () => {
    await renderLoginPage()

    fireEvent.click(submitButton())

    expect(await screen.findByText('Email is required')).toBeTruthy()
    expect(await screen.findByText('Password is required')).toBeTruthy()
    expect(screen.getByText('Email', { selector: 'label' }).textContent).toBe('Email')
    expect(screen.getByText('Password', { selector: 'label' }).textContent).toBe('Password')
  })

  it('rejects an invalid email format and emails longer than the contractual maximum', async () => {
    await renderLoginPage()

    fireEvent.change(emailInput(), { target: { value: 'not-an-email' } })
    fireEvent.click(submitButton())
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy()

    fireEvent.change(emailInput(), {
      target: { value: `${'a'.repeat(190)}@example.com` },
    })
    fireEvent.click(submitButton())
    expect(await screen.findByText('Email must be at most 200 characters')).toBeTruthy()
  })

  it('enforces password limits on the literal value without trimming it', async () => {
    await renderLoginPage()

    fireEvent.change(emailInput(), { target: { value: 'ada@example.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(14) } })
    fireEvent.click(submitButton())
    expect(await screen.findByText('Password must be at least 15 characters')).toBeTruthy()

    fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(129) } })
    fireEvent.click(submitButton())
    expect(await screen.findByText('Password must be at most 128 characters')).toBeTruthy()

    const passwordWithWhitespace = `${' '.repeat(14)}a`
    fireEvent.change(passwordInput(), { target: { value: passwordWithWhitespace } })
    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(passwordInput().value).toBe(passwordWithWhitespace)
      expect(screen.queryByText('Password must be at least 15 characters')).toBeNull()
      expect(screen.queryByText('Password must be at most 128 characters')).toBeNull()
    })
  })

  it('toggles password visibility without changing its value or submitting the form', async () => {
    await renderLoginPage()

    const password = passwordInput()
    const form = screen.getByRole('form', { name: 'Login' })
    let submitCount = 0
    form.addEventListener('submit', () => {
      submitCount += 1
    })
    fireEvent.change(password, { target: { value: 'password value' } })

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))

    expect(password.type).toBe('text')
    expect(password.value).toBe('password value')
    expect(submitCount).toBe(0)
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()
  })

  it('keeps Login and shows accessible generic feedback for invalid credentials and rate limits', async () => {
    const unauthorizedHandler = vi.fn()
    setUnauthorizedHandler(unauthorizedHandler)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
          401,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            statusCode: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
          429,
        ),
      )
    const { router } = await renderLoginPageWithFetch(fetchMock)

    submitValidCredentials()

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password')
    expect(emailInput().value).toBe('ada@example.com')
    expect(passwordInput().value).toBe('a'.repeat(15))
    expect(router.state.location.pathname).toBe('/login')
    expect(unauthorizedHandler).not.toHaveBeenCalled()

    fireEvent.click(submitButton())

    expect(await screen.findByText('Too many requests. Please try again later.')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('associates contractual field validation errors and presents body errors as general feedback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors: [
            { field: 'email', message: 'Email could not be accepted' },
            { field: 'password', message: 'Password could not be accepted' },
            { field: 'body', message: 'Please correct the request data' },
          ],
        },
        400,
      ),
    )
    await renderLoginPageWithFetch(fetchMock)

    submitValidCredentials()

    const emailError = await screen.findByText('Email could not be accepted')
    const passwordError = await screen.findByText('Password could not be accepted')
    expect(document.getElementById(emailInput().getAttribute('aria-describedby') ?? ''))
      .toBe(emailError)
    expect(document.getElementById(passwordInput().getAttribute('aria-describedby') ?? ''))
      .toBe(passwordError)
    expect(screen.getByText('Please correct the request data')).toBeTruthy()
  })

  it.each([
    ['a network failure', () => vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))],
    [
      'an unexpected HTTP error',
      () =>
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              statusCode: 500,
              code: 'INTERNAL_SERVER_ERROR',
              message: 'An unexpected error occurred',
            },
            500,
          ),
        ),
    ],
  ])('shows a safe Toast and preserves the form after %s so Login can be retried', async (_, createFetchMock) => {
    const fetchMock = createFetchMock()
    const { router } = await renderLoginPageWithFetch(fetchMock)

    submitValidCredentials()

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to log in. Try again.')
    expect(emailInput().value).toBe('ada@example.com')
    expect(passwordInput().value).toBe('a'.repeat(15))
    expect(submitButton().disabled).toBe(false)
    expect(router.state.location.pathname).toBe('/login')

    fireEvent.click(submitButton())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('disables Login and exposes textual progress while the request is pending', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    await renderLoginPageWithFetch(fetchMock)

    submitValidCredentials()

    expect((await screen.findByRole('status')).textContent).toContain('Logging in...')
    expect(submitButton().disabled).toBe(true)
    fireEvent.click(submitButton())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
