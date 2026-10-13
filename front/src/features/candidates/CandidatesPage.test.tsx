import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'

const candidateId = '018f0f64-2d8a-7f0b-8000-000000000010'
const secondCandidateId = '018f0f64-2d8a-7f0b-8000-000000000011'
interface CandidateFixture {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

interface CandidatePageFixture {
  candidates: CandidateFixture[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Recruiter',
  lastName: 'Test',
  email: 'recruiter@example.com',
}
const ada: CandidateFixture = {
  id: candidateId,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+123456',
}
const grace: CandidateFixture = {
  id: secondCandidateId,
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@example.com',
  phone: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function candidatePage(
  candidates: CandidateFixture[],
  options: { page?: number; totalItems?: number; totalPages?: number } = {},
): CandidatePageFixture {
  const page = options.page ?? 1
  const totalItems = options.totalItems ?? candidates.length
  const totalPages = options.totalPages ?? (totalItems ? 1 : 0)

  return { candidates, page, pageSize: 10, totalItems, totalPages }
}

async function renderCandidatesRoute(
  respond: (path: string, options?: RequestInit) => Promise<Response> | Response,
) {
  const fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/candidates'] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await screen.findByRole('heading', { name: 'Candidatos' })

  return { fetchMock, router }
}

function respondToSessionAndCandidates(
  page: ReturnType<typeof candidatePage>,
): (path: string) => Response {
  return (path) => {
    if (path === '/api/auth/me') {
      return jsonResponse(authenticatedUser)
    }

    if (path === '/api/candidates?page=1&pageSize=10') {
      return jsonResponse(page)
    }

    throw new Error(`Unexpected request: ${path}`)
  }
}

async function openCreateModal(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Crear candidato' }))
  await screen.findByRole('dialog', { name: 'Crear candidato' })
}

function candidateFormInput(label: string): HTMLInputElement {
  return screen.getByRole('textbox', { name: label }) as HTMLInputElement
}

function fillCandidateForm({
  firstName = 'Ada',
  lastName = 'Lovelace',
  email = 'ada@example.com',
  phone = '+123456',
}: Partial<Omit<CandidateFixture, 'id'>> = {}): void {
  fireEvent.change(candidateFormInput('Nombre'), { target: { value: firstName } })
  fireEvent.change(candidateFormInput('Apellido'), { target: { value: lastName } })
  fireEvent.change(candidateFormInput('Correo electrónico'), { target: { value: email } })
  fireEvent.change(candidateFormInput('Teléfono'), { target: { value: phone } })
}

function saveCandidateButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Guardar/ }) as HTMLButtonElement
}

describe('Candidates 8.1', () => {
  it('renders the paginated Candidate collection as cards and omits a null phone', async () => {
    const { fetchMock } = await renderCandidatesRoute(
      respondToSessionAndCandidates(candidatePage([ada, grace], { totalItems: 2 })),
    )

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('ada@example.com')).toBeTruthy()
    expect(screen.getByText('+123456')).toBeTruthy()
    expect(screen.getByText('Grace Hopper')).toBeTruthy()
    expect(screen.getByText('grace@example.com')).toBeTruthy()
    expect(screen.queryByText('null')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/candidates?page=1&pageSize=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('shows a loading state while the initial Candidate collection is pending', async () => {
    await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        return new Promise<Response>(() => undefined)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('offers a retry after an initial Candidate loading error', async () => {
    let candidateRequests = 0
    const { fetchMock } = await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        candidateRequests += 1
        return candidateRequests === 1
          ? jsonResponse(
              {
                statusCode: 500,
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred',
              },
              500,
            )
          : jsonResponse(candidatePage([ada]))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter(
        ([path]) => path === '/api/candidates?page=1&pageSize=10',
      ),
    ).toHaveLength(2)
  })

  it('shows an empty state with the Candidate creation CTA', async () => {
    await renderCandidatesRoute(respondToSessionAndCandidates(candidatePage([])))

    expect(await screen.findByText('No hay candidatos')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Crear candidato' })).toBeTruthy()
  })

  it('uses pageSize 10 and navigates previous and next according to page metadata', async () => {
    const { fetchMock } = await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        return jsonResponse(candidatePage([ada], { totalItems: 11, totalPages: 2 }))
      }

      if (path === '/api/candidates?page=2&pageSize=10') {
        return jsonResponse(candidatePage([grace], { page: 2, totalItems: 11, totalPages: 2 }))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Grace Hopper')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/candidates?page=2&pageSize=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('keeps a recoverable empty page when a previously valid next page becomes out of range', async () => {
    await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        return jsonResponse(candidatePage([ada], { totalItems: 11, totalPages: 2 }))
      }

      if (path === '/api/candidates?page=2&pageSize=10') {
        return jsonResponse(candidatePage([], { page: 2, totalItems: 1, totalPages: 1 }))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('No hay candidatos')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Anterior' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toMatchObject({ disabled: true })
  })

  it('opens and closes the shared Create/Edit Candidate modal', async () => {
    await renderCandidatesRoute(respondToSessionAndCandidates(candidatePage([ada])))

    await openCreateModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('dialog', { name: 'Editar candidato' })).toBeTruthy()
    expect(candidateFormInput('Teléfono').value).toBe('+123456')
  })

  it('validates required, trimmed, length, email, and phone constraints before submitting', async () => {
    await renderCandidatesRoute(respondToSessionAndCandidates(candidatePage([])))
    await openCreateModal()

    fireEvent.click(saveCandidateButton())
    expect(await screen.findByText('El nombre es obligatorio.')).toBeTruthy()
    expect(await screen.findByText('El apellido es obligatorio.')).toBeTruthy()
    expect(await screen.findByText('El correo electrónico es obligatorio.')).toBeTruthy()

    fillCandidateForm({
      firstName: '   ',
      lastName: 'a'.repeat(101),
      email: 'not-an-email',
      phone: '123-456',
    })
    fireEvent.click(saveCandidateButton())

    expect(await screen.findByText('El nombre no puede estar vacío.')).toBeTruthy()
    expect(await screen.findByText('El apellido debe tener como máximo 100 caracteres.')).toBeTruthy()
    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeTruthy()
    expect(await screen.findByText('Ingresa un teléfono válido.')).toBeTruthy()
  })

  it('creates a Candidate with the contractual POST body and refreshes the visible list', async () => {
    let candidateGets = 0
    const { fetchMock, router } = await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        candidateGets += 1
        return jsonResponse(candidatePage(candidateGets === 1 ? [] : [ada]))
      }

      if (path === '/api/candidates' && options?.method === 'POST') {
        return jsonResponse(ada, 201)
      }

      throw new Error(`Unexpected request: ${path}`)
    })
    await openCreateModal()
    fillCandidateForm()

    fireEvent.click(saveCandidateButton())

    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/candidates')
    const createCall = fetchMock.mock.calls.find(
      ([path, options]) => path === '/api/candidates' && options?.method === 'POST',
    )
    expect(createCall).toBeTruthy()
    if (!createCall) {
      throw new Error('Se esperaba la solicitud POST de Candidate.')
    }
    expect(JSON.parse((createCall[1] as RequestInit).body as string)).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+123456',
    })
  })

  it('sends null for an empty edit phone instead of an empty string', async () => {
    const updatedAda = {
      ...ada,
      email: 'ada.updated@example.com',
      phone: null,
    }
    let candidateGets = 0
    const { fetchMock } = await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        candidateGets += 1
        return jsonResponse(candidatePage(candidateGets === 1 ? [ada] : [updatedAda]))
      }

      if (path === `/api/candidates/${candidateId}` && options?.method === 'PATCH') {
        return jsonResponse(updatedAda)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(candidateFormInput('Correo electrónico'), {
      target: { value: updatedAda.email },
    })
    fireEvent.change(candidateFormInput('Teléfono'), { target: { value: '   ' } })
    fireEvent.click(saveCandidateButton())

    await waitFor(() => {
      const updateCall = fetchMock.mock.calls.find(
        ([path, options]) =>
          path === `/api/candidates/${candidateId}` && options?.method === 'PATCH',
      )
      expect(updateCall).toBeTruthy()
      if (!updateCall) {
        throw new Error('Se esperaba la solicitud PATCH de Candidate.')
      }
      expect(JSON.parse((updateCall[1] as RequestInit).body as string)).toMatchObject({
        email: updatedAda.email,
        phone: null,
      })
    })
    expect(await screen.findByText(updatedAda.email)).toBeTruthy()
  })

  it('maps field validation, email conflict, and technical failures without discarding the form', async () => {
    let createAttempts = 0
    await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        return jsonResponse(candidatePage([]))
      }

      if (path === '/api/candidates' && options?.method === 'POST') {
        createAttempts += 1
        if (createAttempts === 1) {
          return jsonResponse(
            {
              statusCode: 400,
              code: 'VALIDATION_ERROR',
              message: 'Invalid request data',
              errors: [{ field: 'email', message: 'email must be an email' }],
            },
            400,
          )
        }
        if (createAttempts === 2) {
          return jsonResponse(
            {
              statusCode: 409,
              code: 'CANDIDATE_EMAIL_CONFLICT',
              message: 'A candidate with this email already exists',
            },
            409,
          )
        }
        throw new Error('Network unavailable')
      }

      throw new Error(`Unexpected request: ${path}`)
    })
    await openCreateModal()
    fillCandidateForm()

    fireEvent.click(saveCandidateButton())
    await waitFor(() =>
      expect(candidateFormInput('Correo electrónico').getAttribute('aria-invalid')).toBe('true'),
    )

    fireEvent.click(saveCandidateButton())
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Ya existe un candidato con este correo electrónico.',
      ),
    )
    expect(candidateFormInput('Correo electrónico').value).toBe('ada@example.com')

    fireEvent.click(saveCandidateButton())
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'No pudimos guardar el candidato. Inténtalo de nuevo.',
      ),
    )
    expect(candidateFormInput('Correo electrónico').value).toBe('ada@example.com')
  })

  it('disables submission, exposes progress, and prevents duplicate Candidate creation while pending', async () => {
    let resolveCreate: ((response: Response) => void) | undefined
    const { fetchMock } = await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/candidates?page=1&pageSize=10') {
        return jsonResponse(candidatePage([]))
      }

      if (path === '/api/candidates' && options?.method === 'POST') {
        return new Promise((resolve) => {
          resolveCreate = resolve
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })
    await openCreateModal()
    fillCandidateForm()

    const saveButton = saveCandidateButton()
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton.disabled).toBe(true))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter(
        ([path, options]) => path === '/api/candidates' && options?.method === 'POST',
      ),
    ).toHaveLength(1)

    resolveCreate?.(jsonResponse(ada, 201))
  })
})
