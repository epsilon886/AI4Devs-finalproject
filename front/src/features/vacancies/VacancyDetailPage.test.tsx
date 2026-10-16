import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSessionUnauthorizedHandler } from '../auth/session.ts'
import { createAppRouter } from '../../routes/router.tsx'

const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000010'

type VacancyStatus = 'DRAFT' | 'OPEN' | 'FILLED' | 'CANCELLED'

interface VacancyDetailFixture {
  id: string
  title: string
  companyName: string
  description: string
  createdAt: string
  status: VacancyStatus
  pipeline: {
    name: string
    stages: Array<{ id: string; name: string; position: number }>
  }
}

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Recruiter',
  lastName: 'Test',
  email: 'recruiter@example.com',
}

const draftVacancy: VacancyDetailFixture = {
  id: vacancyId,
  title: 'Desarrollador frontend',
  companyName: 'Acme',
  description: 'Construye una experiencia de selección clara.',
  createdAt: '2026-10-01T10:00:00.000Z',
  status: 'DRAFT',
  pipeline: {
    name: 'Default',
    stages: [
      { id: '018f0f64-2d8a-7f0b-8000-000000000031', name: 'Applied', position: 1 },
      { id: '018f0f64-2d8a-7f0b-8000-000000000032', name: 'Screening', position: 2 },
      { id: '018f0f64-2d8a-7f0b-8000-000000000033', name: 'Interview', position: 3 },
    ],
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function vacancyPage(status: VacancyStatus) {
  return {
    vacancies: [
      {
        id: vacancyId,
        title: draftVacancy.title,
        companyName: draftVacancy.companyName,
        createdAt: draftVacancy.createdAt,
        status,
        pipelineName: draftVacancy.pipeline.name,
      },
    ],
    page: 1,
    pageSize: 10,
    totalItems: 1,
    totalPages: 1,
  }
}

type Responder = (path: string, options?: RequestInit) => Response | Promise<Response>

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function renderVacancyRoute(initialPath: string, respond: Responder) {
  const fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { fetchMock, queryClient, router }
}

function detailRequest(path: string, options?: RequestInit): boolean {
  return path === `/api/vacancies/${vacancyId}` && options?.method === 'GET'
}

function statusPatchRequest(path: string, options?: RequestInit): boolean {
  return path === `/api/vacancies/${vacancyId}` && options?.method === 'PATCH'
}

function updatedVacancy(status: VacancyStatus): VacancyDetailFixture {
  return { ...draftVacancy, status }
}

describe('Vacancies 10.2 — detalle y navegación', () => {
  it('navega desde Ver al detalle, obtiene la Vacancy y presenta sus datos', async () => {
    const { fetchMock, router } = await renderVacancyRoute('/vacancies', (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/vacancies?page=1&pageSize=10') {
        return jsonResponse(vacancyPage('DRAFT'))
      }
      if (detailRequest(path, options)) {
        return jsonResponse({
          ...draftVacancy,
          pipeline: {
            ...draftVacancy.pipeline,
            stages: [...draftVacancy.pipeline.stages].reverse(),
          },
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Ver' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/vacancies/${vacancyId}`))
    expect(await screen.findByRole('heading', { name: draftVacancy.title })).toBeTruthy()
    expect(screen.getByText(draftVacancy.companyName)).toBeTruthy()
    expect(screen.getByLabelText('Estado: DRAFT')).toBeTruthy()
    expect(screen.getByText(/2026/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/vacancies/${vacancyId}`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('permite acceso directo autenticado, muestra carga, reintenta un error técnico y presenta el formulario Editar con Pipeline inmutable', async () => {
    let detailRequests = 0
    await renderVacancyRoute(`/vacancies/${vacancyId}`, (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (detailRequest(path, options)) {
        detailRequests += 1
        return detailRequests === 1
          ? jsonResponse(
              {
                statusCode: 500,
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred',
              },
              500,
            )
          : jsonResponse(draftVacancy)
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByRole('status')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: draftVacancy.title })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar vacante' })
    expect(within(dialog).getByLabelText('Título')).toMatchObject({ value: draftVacancy.title })
    expect(within(dialog).getByRole('combobox', { name: 'Pipeline' })).toMatchObject({
      disabled: true,
      value: draftVacancy.pipeline.name,
    })
  })

  it('presenta una Vacancy ausente sin exponer VACANCY_NOT_FOUND', async () => {
    await renderVacancyRoute(`/vacancies/${vacancyId}`, (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (detailRequest(path, options)) {
        return jsonResponse(
          { statusCode: 404, code: 'VACANCY_NOT_FOUND', message: 'Vacancy not found' },
          404,
        )
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByText('No pudimos encontrar esta vacante.')).toBeTruthy()
    expect(screen.queryByText('VACANCY_NOT_FOUND')).toBeNull()
  })

  it('redirige a Login ante UNAUTHORIZED transversal al cargar el detalle protegido', async () => {
    const { queryClient, router } = await renderVacancyRoute(`/vacancies/${vacancyId}`, (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (detailRequest(path, options)) {
        return jsonResponse(
          { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        )
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const dispose = installSessionUnauthorizedHandler({
      queryClient,
      onSessionExpired: () => {
        void router.navigate({ to: '/login', replace: true })
      },
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    dispose()
  })
})

describe('Vacancies 10.2 — ciclo de vida', () => {
  it('abre una DRAFT solo tras confirmación, bloquea el doble envío y actualiza detalle y listado sin recargar', async () => {
    let currentStatus: VacancyStatus = 'DRAFT'
    let resolvePatch: ((response: Response) => void) | undefined
    const { fetchMock, router } = await renderVacancyRoute('/vacancies', (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/vacancies?page=1&pageSize=10') {
        return jsonResponse(vacancyPage(currentStatus))
      }
      if (detailRequest(path, options)) {
        return jsonResponse(updatedVacancy(currentStatus))
      }
      if (statusPatchRequest(path, options)) {
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Ver' }))
    await screen.findByRole('heading', { name: draftVacancy.title })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir vacante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Abrir vacante' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(fetchMock.mock.calls.filter(([path, options]) => statusPatchRequest(path, options))).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir vacante' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Abrir vacante' })).getByRole('button', { name: 'Confirmar apertura' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar apertura' }))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter(([path, options]) => statusPatchRequest(path, options)),
    ).toHaveLength(1)

    currentStatus = 'OPEN'
    resolvePatch?.(jsonResponse(updatedVacancy('OPEN')))
    expect(await screen.findByLabelText('Estado: OPEN')).toBeTruthy()
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cerrar vacante' })).toBeTruthy()

    await router.navigate({ to: '/vacancies' })
    expect(await screen.findByLabelText('Estado: OPEN')).toBeTruthy()
    const patch = fetchMock.mock.calls.find(([path, options]) => statusPatchRequest(path, options))
    expect(patch).toBeTruthy()
    if (!patch) {
      throw new Error('Se esperaba PATCH de apertura.')
    }
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ status: 'OPEN' })
  })

  it('permite cerrar una OPEN solo eligiendo FILLED o CANCELLED y no muta al cancelar', async () => {
    const { fetchMock } = await renderVacancyRoute(`/vacancies/${vacancyId}`, (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (detailRequest(path, options)) {
        return jsonResponse(updatedVacancy('OPEN'))
      }
      if (statusPatchRequest(path, options)) {
        return jsonResponse(updatedVacancy('CANCELLED'))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByRole('heading', { name: draftVacancy.title })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vacante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cerrar vacante' })
    expect(within(dialog).getByRole('radio', { name: 'Cubierta' })).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: 'Cancelada' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(fetchMock.mock.calls.filter(([path, options]) => statusPatchRequest(path, options))).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vacante' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Cerrar vacante' })).getByRole('radio', { name: 'Cancelada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    expect(await screen.findByLabelText('Estado: CANCELLED')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reabrir vacante' })).toBeTruthy()

    const patch = fetchMock.mock.calls.find(([path, options]) => statusPatchRequest(path, options))
    expect(patch).toBeTruthy()
    if (!patch) {
      throw new Error('Se esperaba PATCH de cierre.')
    }
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ status: 'CANCELLED' })
  })

  it.each(['FILLED', 'CANCELLED'] as const)('reabre una Vacancy %s con confirmación y PATCH de estado exclusivo', async (status) => {
    const { fetchMock } = await renderVacancyRoute(`/vacancies/${vacancyId}`, (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (detailRequest(path, options)) {
        return jsonResponse(updatedVacancy(status))
      }
      if (statusPatchRequest(path, options)) {
        return jsonResponse(updatedVacancy('OPEN'))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByRole('heading', { name: draftVacancy.title })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir vacante' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Reabrir vacante' })).getByRole('button', { name: 'Confirmar reapertura' }))
    expect(await screen.findByLabelText('Estado: OPEN')).toBeTruthy()

    const patch = fetchMock.mock.calls.find(([path, options]) => statusPatchRequest(path, options))
    expect(patch).toBeTruthy()
    if (!patch) {
      throw new Error('Se esperaba PATCH de reapertura.')
    }
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ status: 'OPEN' })
  })

  it('muestra feedback español y conserva el contexto ante errores contractuales o técnicos de transición', async () => {
    let attempts = 0
    await renderVacancyRoute(`/vacancies/${vacancyId}`, (path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (detailRequest(path, options)) {
        return jsonResponse(draftVacancy)
      }
      if (statusPatchRequest(path, options)) {
        attempts += 1
        if (attempts === 1) {
          return jsonResponse(
            { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Invalid request data' },
            400,
          )
        }
        if (attempts === 2) {
          return jsonResponse(
            { statusCode: 404, code: 'VACANCY_NOT_FOUND', message: 'Vacancy not found' },
            404,
          )
        }
        if (attempts === 3) {
          return jsonResponse(
            { statusCode: 409, code: 'VACANCY_NOT_OPEN', message: 'The vacancy does not allow this operation' },
            409,
          )
        }
        throw new Error('Network unavailable')
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByRole('heading', { name: draftVacancy.title })
    for (const code of ['VALIDATION_ERROR', 'VACANCY_NOT_FOUND', 'VACANCY_NOT_OPEN', 'Network unavailable']) {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir vacante' }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Abrir vacante' })).getByRole('button', { name: 'Confirmar apertura' }))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).not.toContain(code)
      expect(screen.getByLabelText('Estado: DRAFT')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Abrir vacante' })).toBeTruthy()
    }
  })
})
