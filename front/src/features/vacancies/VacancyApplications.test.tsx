import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'

const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000010'
const otherVacancyId = '018f0f64-2d8a-7f0b-8000-000000000011'

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
    stages: Stage[]
  }
}

interface Stage {
  id: string
  name: string
  position: number
}

interface ApplicationSummary {
  id: string
  createdAt: string
  candidate: {
    id: string
    firstName: string
    lastName: string
  }
  vacancy: {
    id: string
    title: string
  }
  currentStage: Stage
}

interface ApplicationPage {
  applications: ApplicationSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

type Responder = (path: string, options?: RequestInit) => Response | Promise<Response>

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Recruiter',
  lastName: 'Test',
  email: 'recruiter@example.com',
}

const stages: Stage[] = [
  { id: '018f0f64-2d8a-7f0b-8000-000000000031', name: 'Postulación', position: 1 },
  { id: '018f0f64-2d8a-7f0b-8000-000000000032', name: 'Entrevista', position: 2 },
  { id: '018f0f64-2d8a-7f0b-8000-000000000033', name: 'Oferta', position: 3 },
]

function vacancy(status: VacancyStatus, id = vacancyId): VacancyDetailFixture {
  return {
    id,
    title: id === vacancyId ? 'Desarrollador frontend' : 'Diseñador de producto',
    companyName: 'Acme',
    description: 'Construye una experiencia de selección clara.',
    createdAt: '2026-10-01T10:00:00.000Z',
    status,
    pipeline: {
      name: 'Proceso de selección',
      stages: [...stages].reverse(),
    },
  }
}

function application(
  id: string,
  candidate: string,
  createdAt: string,
  currentStage: Stage,
  applicationVacancyId = vacancyId,
): ApplicationSummary {
  const [firstName, lastName] = candidate.split(' ')

  return {
    id,
    createdAt,
    candidate: {
      id: `${id}-candidate`,
      firstName,
      lastName,
    },
    vacancy: {
      id: applicationVacancyId,
      title: applicationVacancyId === vacancyId ? 'Desarrollador frontend' : 'Diseñador de producto',
    },
    currentStage,
  }
}

function applicationPage(
  applications: ApplicationSummary[],
  options: Partial<Omit<ApplicationPage, 'applications'>> = {},
): ApplicationPage {
  return {
    applications,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 100,
    totalItems: options.totalItems ?? applications.length,
    totalPages: options.totalPages ?? (applications.length ? 1 : 0),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function detailRequest(path: string, id: string): boolean {
  return path === `/api/vacancies/${id}`
}

function applicationRequest(path: string, id: string, page: number): boolean {
  const url = new URL(path, 'http://localhost')

  return (
    url.pathname === '/api/applications' &&
    url.searchParams.get('vacancyId') === id &&
    url.searchParams.get('page') === String(page) &&
    url.searchParams.get('pageSize') === '100'
  )
}

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

  return { fetchMock, router }
}

function kanban() {
  return screen.getByRole('region', { name: 'Postulaciones por etapa' })
}

function stageColumn(stage: Stage) {
  return within(kanban()).getByRole('region', { name: `Etapa ${stage.name}` })
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(value))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Vacancies 11.1 — Kanban de postulaciones', () => {
  it('consulta la primera página contractual y presenta stages ordenadas, cards agrupadas, cantidades y fechas cortas', async () => {
    const newestInFirstStage = application(
      '018f0f64-2d8a-7f0b-8000-000000000101',
      'Ada Lovelace',
      '2026-10-10T10:00:00.000Z',
      stages[0],
    )
    const olderInFirstStage = application(
      '018f0f64-2d8a-7f0b-8000-000000000102',
      'Grace Hopper',
      '2026-10-08T10:00:00.000Z',
      stages[0],
    )
    const inSecondStage = application(
      '018f0f64-2d8a-7f0b-8000-000000000103',
      'Margaret Hamilton',
      '2026-10-09T10:00:00.000Z',
      stages[1],
    )

    const { fetchMock } = await renderVacancyRoute(`/vacancies/${vacancyId}`, (path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (detailRequest(path, vacancyId)) return jsonResponse(vacancy('OPEN'))
      if (applicationRequest(path, vacancyId, 1)) {
        return jsonResponse(applicationPage([newestInFirstStage, inSecondStage, olderInFirstStage]))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    const firstColumn = await screen.findByRole('region', { name: `Etapa ${stages[0].name}` })
    const allColumnNames = within(kanban())
      .getAllByRole('region')
      .map((column) => column.getAttribute('aria-label'))
    expect(allColumnNames).toEqual(stages.map((stage) => `Etapa ${stage.name}`))

    expect(within(firstColumn).getByText('2 postulaciones')).toBeTruthy()
    expect(within(stageColumn(stages[1])).getByText('1 postulación')).toBeTruthy()
    expect(within(stageColumn(stages[2])).getByText('0 postulaciones')).toBeTruthy()
    expect(within(stageColumn(stages[2])).getByText('No hay postulaciones')).toBeTruthy()

    expect(within(firstColumn).getByText('Ada Lovelace')).toBeTruthy()
    expect(within(firstColumn).getByText('Grace Hopper')).toBeTruthy()
    expect(within(firstColumn).getByText(shortDate(newestInFirstStage.createdAt))).toBeTruthy()
    expect(within(stageColumn(stages[1])).getByText('Margaret Hamilton')).toBeTruthy()
    expect(within(stageColumn(stages[1])).queryByText('Ada Lovelace')).toBeNull()
    expect(firstColumn.textContent?.indexOf('Ada Lovelace')).toBeLessThan(
      firstColumn.textContent?.indexOf('Grace Hopper') ?? -1,
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([path]) =>
          typeof path === 'string' ? applicationRequest(path, vacancyId, 1) : false,
        ),
      ).toBe(true)
    })
  })

  it.each(['DRAFT', 'OPEN', 'FILLED', 'CANCELLED'] as const)(
    'muestra el Kanban de lectura para una Vacancy %s y no presenta acciones mutantes de Applications fuera de OPEN',
    async (status) => {
      await renderVacancyRoute(`/vacancies/${vacancyId}`, (path) => {
        if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
        if (detailRequest(path, vacancyId)) return jsonResponse(vacancy(status))
        if (applicationRequest(path, vacancyId, 1)) {
          return jsonResponse(
            applicationPage([
              application(
                '018f0f64-2d8a-7f0b-8000-000000000104',
                'Linus Torvalds',
                '2026-10-09T10:00:00.000Z',
                stages[1],
              ),
            ]),
          )
        }
        throw new Error(`Unexpected request: ${path}`)
      })

      expect(await screen.findByRole('region', { name: 'Postulaciones por etapa' })).toBeTruthy()
      expect(within(stageColumn(stages[1])).getByText('Linus Torvalds')).toBeTruthy()

      if (status !== 'OPEN') {
        expect(screen.queryByRole('button', { name: 'Agregar postulación' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Mover' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
      }
    },
  )

  it('conserva todas las columnas cuando la Vacancy no tiene postulaciones', async () => {
    await renderVacancyRoute(`/vacancies/${vacancyId}`, (path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (detailRequest(path, vacancyId)) return jsonResponse(vacancy('DRAFT'))
      if (applicationRequest(path, vacancyId, 1)) return jsonResponse(applicationPage([]))
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByRole('region', { name: 'Postulaciones por etapa' })
    for (const stage of stages) {
      const column = stageColumn(stage)
      expect(within(column).getByText('0 postulaciones')).toBeTruthy()
      expect(within(column).getByText('No hay postulaciones')).toBeTruthy()
    }
  })

  it('muestra carga del Kanban, un error recuperable y vuelve a consultar al reintentar', async () => {
    let applicationRequests = 0
    let resolveFirstRequest: ((response: Response) => void) | undefined
    await renderVacancyRoute(`/vacancies/${vacancyId}`, (path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (detailRequest(path, vacancyId)) return jsonResponse(vacancy('OPEN'))
      if (applicationRequest(path, vacancyId, 1)) {
        applicationRequests += 1
        if (applicationRequests === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirstRequest = resolve
          })
        }
        return jsonResponse(applicationPage([]))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByRole('status', { name: 'Cargando postulaciones...' })).toBeTruthy()
    resolveFirstRequest?.(
      jsonResponse(
        {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
        500,
      ),
    )
    expect(await screen.findByText('No pudimos cargar las postulaciones.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(applicationRequests).toBe(2))
    expect(await screen.findByRole('region', { name: 'Postulaciones por etapa' })).toBeTruthy()
  })

  it('acumula páginas de 100 sin duplicar las ya cargadas e informa el progreso hasta no tener más páginas', async () => {
    const firstPageApplications = Array.from({ length: 100 }, (_, index) =>
      application(
        `018f0f64-2d8a-7f0b-8000-${String(200 + index).padStart(12, '0')}`,
        `Candidata ${index + 1}`,
        `2026-10-${String(28 - Math.floor(index / 4)).padStart(2, '0')}T10:00:00.000Z`,
        stages[0],
      ),
    )
    const lastApplication = application(
      '018f0f64-2d8a-7f0b-8000-000000000301',
      'Candidata 101',
      '2026-09-01T10:00:00.000Z',
      stages[1],
    )

    await renderVacancyRoute(`/vacancies/${vacancyId}`, (path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (detailRequest(path, vacancyId)) return jsonResponse(vacancy('OPEN'))
      if (applicationRequest(path, vacancyId, 1)) {
        return jsonResponse(
          applicationPage(firstPageApplications, { totalItems: 101, totalPages: 2 }),
        )
      }
      if (applicationRequest(path, vacancyId, 2)) {
        return jsonResponse(
          applicationPage([lastApplication], { page: 2, totalItems: 101, totalPages: 2 }),
        )
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Candidata 1')
    expect(screen.getByText('Mostrando 100 de 101')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más postulaciones' }))

    expect(await screen.findByText('Candidata 101')).toBeTruthy()
    expect(screen.getByText('Mostrando 101 de 101')).toBeTruthy()
    expect(screen.getAllByText('Candidata 1')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Cargar más postulaciones' })).toBeNull()
  })

  it('no conserva Applications de una Vacancy anterior al navegar a otro detalle', async () => {
    const firstVacancyApplication = application(
      '018f0f64-2d8a-7f0b-8000-000000000401',
      'Ada Lovelace',
      '2026-10-10T10:00:00.000Z',
      stages[0],
    )
    const secondVacancyApplication = application(
      '018f0f64-2d8a-7f0b-8000-000000000402',
      'Grace Hopper',
      '2026-10-11T10:00:00.000Z',
      stages[1],
      otherVacancyId,
    )
    const { router } = await renderVacancyRoute(`/vacancies/${vacancyId}`, (path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (detailRequest(path, vacancyId)) return jsonResponse(vacancy('OPEN'))
      if (detailRequest(path, otherVacancyId)) return jsonResponse(vacancy('OPEN', otherVacancyId))
      if (applicationRequest(path, vacancyId, 1)) return jsonResponse(applicationPage([firstVacancyApplication]))
      if (applicationRequest(path, otherVacancyId, 1)) {
        return jsonResponse(applicationPage([secondVacancyApplication]))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Ada Lovelace')
    await router.navigate({ to: '/vacancies/$vacancyId', params: { vacancyId: otherVacancyId } })

    expect(await screen.findByText('Grace Hopper')).toBeTruthy()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
  })
})
