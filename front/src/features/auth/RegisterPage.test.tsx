import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'
import { sessionQueryKey } from './session.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderRegisterPage(fetchMock = vi.fn(() => new Promise<Response>(() => undefined))) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(sessionQueryKey, null)
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/register'] }),
  })
  vi.stubGlobal('fetch', fetchMock)

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await screen.findByRole('form', { name: 'Crear cuenta' })

  return { fetchMock, router }
}

function firstNameInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: /Nombre/ }) as HTMLInputElement
}

function lastNameInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: /Apellido/ }) as HTMLInputElement
}

function emailInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: /Correo electrónico/ }) as HTMLInputElement
}

function passwordInput(): HTMLInputElement {
  return screen.getByLabelText(/^Contraseña/) as HTMLInputElement
}

function confirmPasswordInput(): HTMLInputElement {
  return screen.getByLabelText(/Confirmar contraseña/) as HTMLInputElement
}

function registerButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Crear cuenta' }) as HTMLButtonElement
}

function fillValidForm() {
  fireEvent.change(firstNameInput(), { target: { value: 'Ada' } })
  fireEvent.change(lastNameInput(), { target: { value: 'Lovelace' } })
  fireEvent.change(emailInput(), { target: { value: 'ada@example.com' } })
  fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(15) } })
  fireEvent.change(confirmPasswordInput(), { target: { value: 'a'.repeat(15) } })
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RegisterPage', () => {
  it('shows the required public registration form controls and required indicators', async () => {
    await renderRegisterPage()

    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeTruthy()
    expect(firstNameInput()).toBeTruthy()
    expect(lastNameInput()).toBeTruthy()
    expect(emailInput()).toBeTruthy()
    expect(passwordInput()).toBeTruthy()
    expect(confirmPasswordInput()).toBeTruthy()
    expect(registerButton()).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()

    for (const label of ['Nombre', 'Apellido', 'Correo electrónico', 'Contraseña', 'Confirmar contraseña']) {
      expect(screen.getByText(new RegExp(label), { selector: 'label' }).textContent).toContain('*')
    }
  })

  it('shows accessible local errors for missing, whitespace-only, and overlong names', async () => {
    await renderRegisterPage()

    fireEvent.click(registerButton())
    expect(await screen.findByText('El nombre es obligatorio.')).toBeTruthy()
    expect(await screen.findByText('El apellido es obligatorio.')).toBeTruthy()
    expect(await screen.findByText('El correo electrónico es obligatorio.')).toBeTruthy()
    expect(await screen.findByText('La contraseña es obligatoria.')).toBeTruthy()
    expect(await screen.findByText('La confirmación de contraseña es obligatoria.')).toBeTruthy()

    fillValidForm()
    fireEvent.change(firstNameInput(), { target: { value: '   ' } })
    fireEvent.change(lastNameInput(), { target: { value: '   ' } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('El nombre no puede estar vacío.')).toBeTruthy()
    expect(await screen.findByText('El apellido no puede estar vacío.')).toBeTruthy()

    fireEvent.change(firstNameInput(), { target: { value: 'a'.repeat(101) } })
    fireEvent.change(lastNameInput(), { target: { value: 'a'.repeat(101) } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('El nombre debe tener como máximo 100 caracteres.')).toBeTruthy()
    expect(await screen.findByText('El apellido debe tener como máximo 100 caracteres.')).toBeTruthy()
  })

  it('validates email, literal password limits, and matching required confirmation', async () => {
    await renderRegisterPage()

    fireEvent.change(firstNameInput(), { target: { value: 'Ada' } })
    fireEvent.change(lastNameInput(), { target: { value: 'Lovelace' } })
    fireEvent.change(emailInput(), { target: { value: 'not-an-email' } })
    fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(15) } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeTruthy()
    expect(await screen.findByText('La confirmación de contraseña es obligatoria.')).toBeTruthy()

    fireEvent.change(emailInput(), { target: { value: `${'a'.repeat(190)}@example.com` } })
    fireEvent.change(confirmPasswordInput(), { target: { value: 'a'.repeat(15) } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('El correo electrónico debe tener como máximo 200 caracteres.')).toBeTruthy()

    fireEvent.change(emailInput(), { target: { value: 'ada@example.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(14) } })
    fireEvent.change(confirmPasswordInput(), { target: { value: 'a'.repeat(14) } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('La contraseña debe tener al menos 15 caracteres.')).toBeTruthy()

    fireEvent.change(passwordInput(), { target: { value: 'a'.repeat(129) } })
    fireEvent.change(confirmPasswordInput(), { target: { value: 'a'.repeat(129) } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('La contraseña debe tener como máximo 128 caracteres.')).toBeTruthy()

    const passwordWithWhitespace = `${' '.repeat(14)}a`
    fireEvent.change(passwordInput(), { target: { value: passwordWithWhitespace } })
    fireEvent.change(confirmPasswordInput(), { target: { value: passwordWithWhitespace } })
    fireEvent.click(registerButton())
    await waitFor(() => {
      expect(passwordInput().value).toBe(passwordWithWhitespace)
      expect(screen.queryByText('La contraseña debe tener al menos 15 caracteres.')).toBeNull()
      expect(screen.queryByText('La contraseña debe tener como máximo 128 caracteres.')).toBeNull()
    })

    fireEvent.change(confirmPasswordInput(), { target: { value: 'b'.repeat(15) } })
    fireEvent.click(registerButton())
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy()
  })

  it('toggles password and confirmation visibility without changing values or submitting', async () => {
    await renderRegisterPage()

    const form = screen.getByRole('form', { name: 'Crear cuenta' })
    let submitCount = 0
    form.addEventListener('submit', () => {
      submitCount += 1
    })
    fireEvent.change(passwordInput(), { target: { value: 'password value' } })
    fireEvent.change(confirmPasswordInput(), { target: { value: 'confirmation value' } })

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar confirmación de contraseña' }))

    expect(passwordInput().type).toBe('text')
    expect(confirmPasswordInput().type).toBe('text')
    expect(passwordInput().value).toBe('password value')
    expect(confirmPasswordInput().value).toBe('confirmation value')
    expect(submitCount).toBe(0)
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ocultar confirmación de contraseña' })).toBeTruthy()
  })

  it('returns to Login from Cancel without submitting a registration request', async () => {
    const { fetchMock, router } = await renderRegisterPage()

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits only the contractual registration payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Account created successfully' }, 201))
    await renderRegisterPage(fetchMock)

    fillValidForm()
    fireEvent.click(registerButton())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [path, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/auth/register')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'a'.repeat(15),
    })
  })

  it('keeps Register and presents safe Toast feedback for conflicts and rate limits', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            statusCode: 409,
            code: 'REGISTRATION_CONFLICT',
            message: 'Unable to create account with the provided information',
          },
          409,
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
    const { router } = await renderRegisterPage(fetchMock)

    fillValidForm()
    fireEvent.click(registerButton())

    expect(
      (await screen.findByRole('alert')).textContent,
    ).toContain('No fue posible crear la cuenta con los datos proporcionados.')
    expect(emailInput().value).toBe('ada@example.com')
    expect(passwordInput().value).toBe('a'.repeat(15))
    expect(router.state.location.pathname).toBe('/register')

    fireEvent.click(registerButton())

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Demasiados intentos. Inténtalo de nuevo más tarde.',
      ),
    )
    expect(router.state.location.pathname).toBe('/register')
  })

  it('maps contractual validation errors to fields and shows body errors in a Toast', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors: [
            { field: 'firstName', message: 'First name could not be accepted' },
            { field: 'lastName', message: 'Last name could not be accepted' },
            { field: 'email', message: 'Email could not be accepted' },
            { field: 'password', message: 'Password could not be accepted' },
            { field: 'body', message: 'Please correct the request data' },
          ],
        },
        400,
      ),
    )
    await renderRegisterPage(fetchMock)

    fillValidForm()
    fireEvent.click(registerButton())

    const fieldErrors = await Promise.all([
      screen.findByText('Revisa el nombre.'),
      screen.findByText('Revisa el apellido.'),
      screen.findByText('Revisa el correo electrónico.'),
      screen.findByText('Revisa la contraseña.'),
    ])
    const fields = [firstNameInput(), lastNameInput(), emailInput(), passwordInput()]

    for (const [field, error] of fields.map((field, index) => [field, fieldErrors[index]])) {
      expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')).toBe(error)
    }
    const bodyToast = await screen.findByText('Revisa los datos ingresados.')
    expect(bodyToast.closest('[role="alert"]')).toBeTruthy()
    expect(firstNameInput().value).toBe('Ada')
    expect(lastNameInput().value).toBe('Lovelace')
    expect(emailInput().value).toBe('ada@example.com')
    expect(passwordInput().value).toBe('a'.repeat(15))
  })

  it('shows a safe Toast and preserves Register after technical failures so it can be retried', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
          },
          500,
        ),
      )
    const { router } = await renderRegisterPage(fetchMock)

    fillValidForm()
    fireEvent.click(registerButton())

    const networkToast = await screen.findByRole('alert')
    expect(networkToast.textContent).toContain('No pudimos crear la cuenta. Inténtalo de nuevo.')
    expect(emailInput().value).toBe('ada@example.com')
    expect(passwordInput().value).toBe('a'.repeat(15))
    expect(registerButton().disabled).toBe(false)
    expect(router.state.location.pathname).toBe('/register')

    fireEvent.click(registerButton())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert').textContent).toContain(
      'No pudimos crear la cuenta. Inténtalo de nuevo.',
    )
    expect(router.state.location.pathname).toBe('/register')
  })

  it('disables submission, exposes progress, and blocks Cancel while registration is pending', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    const { router } = await renderRegisterPage(fetchMock)

    fillValidForm()
    fireEvent.click(registerButton())

    expect((await screen.findByRole('status')).textContent).toContain('Creando cuenta...')
    expect(registerButton().disabled).toBe(true)
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement
    expect(cancelButton.disabled).toBe(true)
    fireEvent.click(registerButton())
    fireEvent.click(cancelButton)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/register')
  })
})
