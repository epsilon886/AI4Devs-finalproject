import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'

const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000010'

interface Stage {
  id: string
  name: string
  position: number
}

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

interface ApplicationSummary {
  id: string
  createdAt: string
  candidate: Pick<Candidate, 'id' | 'firstName' | 'lastName'>
  vacancy: { id: string; title: string }
  currentStage: Stage
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

const ada: Candidate = {
  id: '018f0f64-2d8a-7f0b-8000-000000000101',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
}

const barbara: Candidate = {
  id: '018f0f64-2d8a-7f0b-8000-000000000102',
  firstName: 'Bárbara',
  lastName: 'Liskov',
  email: 'barbara@example.com',
  phone: '+5493885550102',
}

function vacancy() {
  return {
    id: vacancyId,
    title: 'Desarrollador frontend',
    companyName: 'Acme',
    description: 'Construye una experiencia de selección clara.',
    createdAt: '2026-10-01T10:00:00.000Z',
    status: 'OPEN' as const,
    pipeline: { name: 'Proceso de selección', stages: [...stages].reverse() },
  }
}

function application(
  id: string,
  candidate: Candidate,
  currentStage: Stage,
  createdAt = '2026-10-10T10:00:00.000Z',
): ApplicationSummary {
  return {
    id,
    createdAt,
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
    },
    vacancy: { id: vacancyId, title: 'Desarrollador frontend' },
    currentStage,
  }
}

function applicationDetail(summary: ApplicationSummary, candidate: Candidate) {
  return {
    ...summary,
    candidate,
    vacancy: { ...summary.vacancy, companyName: 'Acme' },
    pipeline: { name: 'Proceso de selección' },
  }
}

function applicationPage(
  applications: ApplicationSummary[],
  options: Partial<{ page: number; pageSize: number; totalItems: number; totalPages: number }> = {},
) {
  return {
    applications,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 100,
    totalItems: options.totalItems ?? applications.length,
    totalPages: options.totalPages ?? (applications.length ? 1 : 0),
  }
}

function candidatePage(
  candidates: Candidate[],
  options: Partial<{ page: number; pageSize: number; totalItems: number; totalPages: number }> = {},
) {
  return {
    candidates,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 100,
    totalItems: options.totalItems ?? candidates.length,
    totalPages: options.totalPages ?? (candidates.length ? 1 : 0),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function applicationListRequest(path: string, page: number): boolean {
  const url = new URL(path, 'http://localhost')
  return (
    url.pathname === '/api/applications' &&
    url.searchParams.get('vacancyId') === vacancyId &&
    url.searchParams.get('page') === String(page) &&
    url.searchParams.get('pageSize') === '100'
  )
}

function candidateListRequest(path: string, page: number): boolean {
  const url = new URL(path, 'http://localhost')
  return (
    url.pathname === '/api/candidates' &&
    url.searchParams.get('page') === String(page) &&
    url.searchParams.get('pageSize') === '100'
  )
}

function applicationPostRequest(path: string, options?: RequestInit): boolean {
  return path === '/api/applications' && options?.method === 'POST'
}

function applicationPatchRequest(path: string, applicationId: string, options?: RequestInit): boolean {
  return path === `/api/applications/${applicationId}` && options?.method === 'PATCH'
}

function applicationDeleteRequest(path: string, applicationId: string, options?: RequestInit): boolean {
  return path === `/api/applications/${applicationId}` && options?.method === 'DELETE'
}

async function renderVacancyRoute(respond: Responder) {
  const fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [`/vacancies/${vacancyId}`] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { fetchMock, router }
}

function applicationError(code: string, status: number) {
  return jsonResponse({ statusCode: status, code, message: 'Contractual error' }, status)
}

function stageColumn(stage: Stage) {
  return within(screen.getByRole('region', { name: 'Postulaciones por etapa' })).getByRole('region', {
    name: `Etapa ${stage.name}`,
  })
}

async function openAddDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar postulación' }))
  return screen.findByRole('dialog', { name: 'Agregar postulación' })
}

async function selectCandidate(dialog: HTMLElement, candidate: Candidate) {
  const combobox = within(dialog).getByRole('combobox', { name: 'Candidato' })
  fireEvent.change(combobox, { target: { value: candidate.email } })
  fireEvent.click(await within(dialog).findByRole('option', { name: new RegExp(candidate.email) }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Vacancies 11.2 — agregar postulaciones', () => {
  it('ofrece Agregar postulación en OPEN, carga todos los Candidates bajo demanda, busca localmente, exige selección y agrega a la primera stage', async () => {
    const created = application(
      '018f0f64-2d8a-7f0b-8000-000000000201',
      barbara,
      stages[0],
      '2026-10-11T10:00:00.000Z',
    )
    const { fetchMock } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage([]))
      if (candidateListRequest(path, 1)) return jsonResponse(candidatePage([ada], { totalItems: 2, totalPages: 2 }))
      if (candidateListRequest(path, 2)) return jsonResponse(candidatePage([barbara], { page: 2, totalItems: 2, totalPages: 2 }))
      if (applicationPostRequest(path, options)) return jsonResponse(applicationDetail(created, barbara), 201)
      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddDialog()
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([path]) => typeof path === 'string' && path.startsWith('/api/candidates?'))).toHaveLength(2)
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar postulación' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Selecciona un candidato.')

    const candidateRequestsBeforeSearch = fetchMock.mock.calls.filter(
      ([path]) => typeof path === 'string' && path.startsWith('/api/candidates?'),
    ).length
    await selectCandidate(dialog, barbara)
    expect(fetchMock.mock.calls.filter(([path]) => typeof path === 'string' && path.startsWith('/api/candidates?'))).toHaveLength(candidateRequestsBeforeSearch)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar postulación' }))
    expect(await within(stageColumn(stages[0])).findByText('Bárbara Liskov')).toBeTruthy()
    expect(within(stageColumn(stages[0])).getByText('1 postulación')).toBeTruthy()
    expect(screen.getByText('Mostrando 1 de 1')).toBeTruthy()

    const request = fetchMock.mock.calls.find(([path, options]) => applicationPostRequest(path, options))
    if (!request) {
      throw new Error('Se esperaba POST de Application.')
    }
    expect(JSON.parse((request[1] as RequestInit).body as string)).toEqual({
      candidateId: barbara.id,
      vacancyId,
    })
  })

  it.each([
    {
      code: 'APPLICATION_ALREADY_EXISTS',
      status: 409,
      message: 'El candidato ya está asociado a esta vacante.',
    },
    {
      code: 'CANDIDATE_NOT_FOUND',
      status: 404,
      message: 'El candidato seleccionado ya no está disponible.',
    },
  ])('conserva la selección y muestra un error de Add en español para $code', async ({ code, status, message }) => {
    const { fetchMock } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage([]))
      if (candidateListRequest(path, 1)) return jsonResponse(candidatePage([ada]))
      if (applicationPostRequest(path, options)) return applicationError(code, status)
      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddDialog()
    await selectCandidate(dialog, ada)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar postulación' }))

    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByText(code)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar postulación' }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([path, options]) => applicationPostRequest(path, options))).toHaveLength(2)
    })
    for (const [, options] of fetchMock.mock.calls.filter(([path, options]) => applicationPostRequest(path, options))) {
      expect(JSON.parse((options as RequestInit).body as string)).toEqual({ candidateId: ada.id, vacancyId })
    }
  })

  it('bloquea el doble envío de Add mientras la creación está pendiente', async () => {
    let resolvePost: ((response: Response) => void) | undefined
    const created = application('018f0f64-2d8a-7f0b-8000-000000000202', ada, stages[0])
    const { fetchMock } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage([]))
      if (candidateListRequest(path, 1)) return jsonResponse(candidatePage([ada]))
      if (applicationPostRequest(path, options)) {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddDialog()
    await selectCandidate(dialog, ada)
    const submit = within(dialog).getByRole('button', { name: 'Agregar postulación' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(await within(dialog).findByRole('status', { name: 'Agregando postulación...' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Agregando...' }).hasAttribute('disabled')).toBe(true)
    expect(fetchMock.mock.calls.filter(([path, options]) => applicationPostRequest(path, options))).toHaveLength(1)

    resolvePost?.(jsonResponse(applicationDetail(created, ada), 201))
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
  })
})

describe('Vacancies 11.2 — mover postulaciones', () => {
  it('mueve libremente una Application cargada en una página acumulada y conserva conteos y paginación', async () => {
    const firstPageApplications = Array.from({ length: 100 }, (_, index) =>
      application(
        `018f0f64-2d8a-7f0b-8000-${String(300 + index).padStart(12, '0')}`,
        {
          id: `018f0f64-2d8a-7f0b-8000-${String(500 + index).padStart(12, '0')}`,
          firstName: 'Candidata',
          lastName: String(index + 1),
          email: `candidate-${index + 1}@example.com`,
          phone: null,
        },
        stages[0],
      ),
    )
    const candidate101: Candidate = {
      id: '018f0f64-2d8a-7f0b-8000-000000000701',
      firstName: 'Candidata',
      lastName: '101',
      email: 'candidate-101@example.com',
      phone: null,
    }
    const application101 = application('018f0f64-2d8a-7f0b-8000-000000000702', candidate101, stages[0])
    let resolvePatch: ((response: Response) => void) | undefined
    const { fetchMock } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage(firstPageApplications, { totalItems: 101, totalPages: 2 }))
      if (applicationListRequest(path, 2)) return jsonResponse(applicationPage([application101], { page: 2, totalItems: 101, totalPages: 2 }))
      if (applicationPatchRequest(path, application101.id, options)) {
        return new Promise<Response>((resolve) => {
          resolvePatch = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Candidata 1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más postulaciones' }))
    const card = (await screen.findByText('Candidata 101')).closest('article')
    if (!card) throw new Error('Se esperaba la card de la candidata 101.')
    fireEvent.click(within(card).getByRole('button', { name: 'Mover' }))

    const dialog = await screen.findByRole('dialog', { name: 'Mover postulación' })
    expect(within(dialog).queryByRole('radio', { name: stages[0].name })).toBeNull()
    expect(within(dialog).getByRole('radio', { name: stages[2].name })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: stages[2].name }))
    const submit = within(dialog).getByRole('button', { name: 'Mover postulación' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(await within(dialog).findByRole('status', { name: 'Moviendo postulación...' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Moviendo...' }).hasAttribute('disabled')).toBe(true)
    expect(fetchMock.mock.calls.filter(([path, options]) => applicationPatchRequest(path, application101.id, options))).toHaveLength(1)

    resolvePatch?.(jsonResponse(applicationDetail({ ...application101, currentStage: stages[2] }, candidate101)))
    expect(await within(stageColumn(stages[2])).findByText('Candidata 101')).toBeTruthy()
    expect(within(stageColumn(stages[0])).queryByText('Candidata 101')).toBeNull()
    expect(screen.getByText('Mostrando 101 de 101')).toBeTruthy()

    const request = fetchMock.mock.calls.find(([path, options]) => applicationPatchRequest(path, application101.id, options))
    if (!request) {
      throw new Error('Se esperaba PATCH de Application.')
    }
    expect(JSON.parse((request[1] as RequestInit).body as string)).toEqual({ currentStageId: stages[2].id })
  })

  it.each([
    { code: 'VACANCY_NOT_OPEN', status: 409, message: 'La vacante ya no está abierta.' },
    { code: 'VALIDATION_ERROR', status: 400, message: 'No pudimos mover la postulación. Revisa los datos.' },
  ])('mantiene el contexto y no expone $code al fallar Move', async ({ code, status, message }) => {
    const existing = application('018f0f64-2d8a-7f0b-8000-000000000801', ada, stages[0])
    await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage([existing]))
      if (applicationPatchRequest(path, existing.id, options)) return applicationError(code, status)
      throw new Error(`Unexpected request: ${path}`)
    })

    const card = (await screen.findByText('Ada Lovelace')).closest('article')
    if (!card) throw new Error('Se esperaba la card de Ada Lovelace.')
    fireEvent.click(within(card).getByRole('button', { name: 'Mover' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mover postulación' })
    fireEvent.click(within(dialog).getByRole('radio', { name: stages[1].name }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover postulación' }))

    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByText(code)).toBeNull()
    expect(within(stageColumn(stages[0])).getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Mover postulación' })).toBeTruthy()
  })
})

describe('Vacancies 11.2 — eliminar postulaciones', () => {
  it('pide confirmación, no elimina al cancelar y elimina lógicamente una Application cargada en páginas acumuladas', async () => {
    const firstPageApplications = Array.from({ length: 100 }, (_, index) =>
      application(
        `018f0f64-2d8a-7f0b-8000-${String(900 + index).padStart(12, '0')}`,
        {
          id: `018f0f64-2d8a-7f0b-8000-${String(1100 + index).padStart(12, '0')}`,
          firstName: 'Persona',
          lastName: String(index + 1),
          email: `person-${index + 1}@example.com`,
          phone: null,
        },
        stages[0],
      ),
    )
    const targetCandidate: Candidate = {
      id: '018f0f64-2d8a-7f0b-8000-000000001301',
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan@example.com',
      phone: null,
    }
    const target = application('018f0f64-2d8a-7f0b-8000-000000001302', targetCandidate, stages[1])
    const { fetchMock } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage(firstPageApplications, { totalItems: 101, totalPages: 2 }))
      if (applicationListRequest(path, 2)) return jsonResponse(applicationPage([target], { page: 2, totalItems: 101, totalPages: 2 }))
      if (applicationDeleteRequest(path, target.id, options)) return new Response(null, { status: 204 })
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Persona 1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más postulaciones' }))
    const card = (await screen.findByText('Alan Turing')).closest('article')
    if (!card) throw new Error('Se esperaba la card de Alan Turing.')
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar' }))

    const dialog = await screen.findByRole('dialog', { name: 'Eliminar postulación' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(fetchMock.mock.calls.filter(([path, options]) => applicationDeleteRequest(path, target.id, options))).toHaveLength(0)

    fireEvent.click(within((await screen.findByText('Alan Turing')).closest('article') as HTMLElement).getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Eliminar postulación' })).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.queryByText('Alan Turing')).toBeNull())
    expect(within(stageColumn(stages[1])).getByText('0 postulaciones')).toBeTruthy()
    expect(screen.getByText('Mostrando 100 de 100')).toBeTruthy()
  })

  it.each([
    { code: 'APPLICATION_NOT_FOUND', status: 404, message: 'Esta postulación ya no está disponible.' },
    { code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'No pudimos eliminar la postulación. Inténtalo de nuevo.' },
  ])('bloquea el doble envío de Remove y mantiene la Application ante $code', async ({ code, status, message }) => {
    const existing = application('018f0f64-2d8a-7f0b-8000-000000001401', ada, stages[1])
    let resolveDelete: ((response: Response) => void) | undefined
    const { fetchMock } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationListRequest(path, 1)) return jsonResponse(applicationPage([existing]))
      if (applicationDeleteRequest(path, existing.id, options)) {
        return new Promise<Response>((resolve) => {
          resolveDelete = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    const card = (await screen.findByText('Ada Lovelace')).closest('article')
    if (!card) throw new Error('Se esperaba la card de Ada Lovelace.')
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar postulación' })
    const confirm = within(dialog).getByRole('button', { name: 'Eliminar' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(await within(dialog).findByRole('status', { name: 'Eliminando postulación...' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Eliminando...' }).hasAttribute('disabled')).toBe(true)
    expect(fetchMock.mock.calls.filter(([path, options]) => applicationDeleteRequest(path, existing.id, options))).toHaveLength(1)

    resolveDelete?.(applicationError(code, status))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByText(code)).toBeNull()
    expect(within(stageColumn(stages[1])).getByText('Ada Lovelace')).toBeTruthy()
  })
})

