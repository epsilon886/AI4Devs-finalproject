import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'

const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000010'
const secondVacancyId = '018f0f64-2d8a-7f0b-8000-000000000011'
const draftPipelineId = '018f0f64-2d8a-7f0b-8000-000000000020'
const customPipelineId = '018f0f64-2d8a-7f0b-8000-000000000021'

type VacancyStatus = 'DRAFT' | 'OPEN' | 'FILLED' | 'CANCELLED'

interface VacancySummaryFixture {
  id: string
  title: string
  companyName: string
  createdAt: string
  status: VacancyStatus
  pipelineName: string
}

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

interface VacancyPageFixture {
  vacancies: VacancySummaryFixture[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface PipelineFixture {
  id: string
  name: string
  isDefault: boolean
  isEditable: boolean
  stages: Array<{ id: string; name: string; position: number }>
}

interface PipelinePageFixture {
  pipelines: PipelineFixture[]
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

const draftVacancy: VacancySummaryFixture = {
  id: vacancyId,
  title: 'Desarrollador frontend',
  companyName: 'Acme',
  createdAt: '2026-10-01T10:00:00.000Z',
  status: 'DRAFT',
  pipelineName: 'Default',
}

const openVacancy: VacancySummaryFixture = {
  id: secondVacancyId,
  title: 'Analista de datos',
  companyName: 'Globex',
  createdAt: '2026-10-02T10:00:00.000Z',
  status: 'OPEN',
  pipelineName: 'Especialista',
}

const filledVacancy: VacancySummaryFixture = {
  ...openVacancy,
  id: '018f0f64-2d8a-7f0b-8000-000000000012',
  status: 'FILLED',
  title: 'Diseñador de producto',
}

const cancelledVacancy: VacancySummaryFixture = {
  ...openVacancy,
  id: '018f0f64-2d8a-7f0b-8000-000000000013',
  status: 'CANCELLED',
  title: 'Especialista QA',
}

const draftVacancyDetail: VacancyDetailFixture = {
  ...draftVacancy,
  description: 'Construye una experiencia de selección clara.',
  pipeline: {
    name: 'Default',
    stages: [
      { id: '018f0f64-2d8a-7f0b-8000-000000000031', name: 'Applied', position: 1 },
      { id: '018f0f64-2d8a-7f0b-8000-000000000032', name: 'Screening', position: 2 },
      { id: '018f0f64-2d8a-7f0b-8000-000000000033', name: 'Interview', position: 3 },
    ],
  },
}

const defaultPipeline: PipelineFixture = {
  id: draftPipelineId,
  name: 'Default',
  isDefault: true,
  isEditable: false,
  stages: [
    { id: '018f0f64-2d8a-7f0b-8000-000000000041', name: 'Applied', position: 1 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000042', name: 'Screening', position: 2 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000043', name: 'Interview', position: 3 },
  ],
}

const specialistPipeline: PipelineFixture = {
  id: customPipelineId,
  name: 'Especialista',
  isDefault: false,
  isEditable: true,
  stages: [
    { id: '018f0f64-2d8a-7f0b-8000-000000000052', name: 'Entrevista', position: 2 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000051', name: 'Revisión', position: 1 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000053', name: 'Oferta', position: 3 },
  ],
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

function vacancyPage(
  vacancies: VacancySummaryFixture[],
  options: { page?: number; totalItems?: number; totalPages?: number } = {},
): VacancyPageFixture {
  const totalItems = options.totalItems ?? vacancies.length

  return {
    vacancies,
    page: options.page ?? 1,
    pageSize: 10,
    totalItems,
    totalPages: options.totalPages ?? (totalItems ? 1 : 0),
  }
}

function pipelinePage(
  pipelines: PipelineFixture[],
  options: { page?: number; totalItems?: number; totalPages?: number } = {},
): PipelinePageFixture {
  const totalItems = options.totalItems ?? pipelines.length

  return {
    pipelines,
    page: options.page ?? 1,
    pageSize: 100,
    totalItems,
    totalPages: options.totalPages ?? (totalItems ? 1 : 0),
  }
}

type Responder = (path: string, options?: RequestInit) => Promise<Response> | Response

async function renderVacanciesRoute(respond: Responder) {
  const fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/vacancies'] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await screen.findByRole('heading', { name: 'Vacantes' })

  return { fetchMock, queryClient, router }
}

function isVacanciesRequest(
  path: string,
  { page, statuses = [], title }: { page: number; statuses?: VacancyStatus[]; title?: string },
): boolean {
  const url = new URL(path, 'http://localhost')

  return (
    url.pathname === '/api/vacancies' &&
    url.searchParams.get('page') === String(page) &&
    url.searchParams.get('pageSize') === '10' &&
    [...url.searchParams.getAll('status')].sort().join(',') === [...statuses].sort().join(',') &&
    url.searchParams.get('title') === (title ?? null)
  )
}

function isPipelinesRequest(path: string, page: number): boolean {
  const url = new URL(path, 'http://localhost')

  return (
    url.pathname === '/api/pipelines' &&
    url.searchParams.get('page') === String(page) &&
    url.searchParams.get('pageSize') === '100'
  )
}

function respondToSessionAndVacancies(page: VacancyPageFixture): Responder {
  return (path) => {
    if (path === '/api/auth/me') {
      return jsonResponse(authenticatedUser)
    }

    if (isVacanciesRequest(path, { page: 1 })) {
      return jsonResponse(page)
    }

    throw new Error(`Unexpected request: ${path}`)
  }
}

async function openCreateModal(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Crear vacante' }))

  return screen.findByRole('dialog', { name: 'Crear vacante' })
}

function inputByLabel(dialog: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement {
  return within(dialog).getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement
}

async function selectPipeline(dialog: HTMLElement, name = 'Especialista'): Promise<void> {
  const combobox = within(dialog).getByRole('combobox', { name: 'Pipeline' })
  fireEvent.focus(combobox)
  fireEvent.click(await within(dialog).findByRole('option', { name }))
}

function fillVacancyForm(
  dialog: HTMLElement,
  {
    title = 'Desarrollador frontend',
    companyName = 'Acme',
    description = 'Construye una experiencia de selección clara.',
  }: Partial<Pick<VacancyDetailFixture, 'title' | 'companyName' | 'description'>> = {},
): void {
  fireEvent.change(inputByLabel(dialog, 'Título'), { target: { value: title } })
  fireEvent.change(inputByLabel(dialog, 'Empresa'), { target: { value: companyName } })
  fireEvent.change(inputByLabel(dialog, 'Descripción'), { target: { value: description } })
}

function saveVacancyButton(dialog: HTMLElement): HTMLButtonElement {
  return within(dialog).getByRole('button', { name: 'Guardar vacante' }) as HTMLButtonElement
}

describe('Vacancies 10.1 — listado', () => {
  it('solicita la colección paginada con pageSize 10 y presenta summaries en una tabla con acciones explícitas', async () => {
    const { fetchMock } = await renderVacanciesRoute(
      respondToSessionAndVacancies(vacancyPage([draftVacancy, openVacancy])),
    )

    const table = await screen.findByRole('table', { name: 'Listado de vacantes' })
    expect(within(table).getByRole('columnheader', { name: 'Título' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Empresa' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Fecha de creación' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Estado' })).toBeTruthy()
    expect(within(table).getByText(draftVacancy.title)).toBeTruthy()
    expect(within(table).getByText(draftVacancy.companyName)).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Editar' })).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Ver' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vacancies?page=1&pageSize=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('distingue visual y semánticamente los badges de los cuatro estados contractuales', async () => {
    await renderVacanciesRoute(
      respondToSessionAndVacancies(
        vacancyPage([draftVacancy, openVacancy, filledVacancy, cancelledVacancy]),
      ),
    )

    expect(await screen.findByLabelText('Estado: DRAFT')).toBeTruthy()
    expect(screen.getByLabelText('Estado: OPEN')).toBeTruthy()
    expect(screen.getByLabelText('Estado: FILLED')).toBeTruthy()
    expect(screen.getByLabelText('Estado: CANCELLED')).toBeTruthy()
  })

  it('envía status repetido para filtros múltiples, omite el filtro al limpiar y vuelve a la primera página', async () => {
    await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        return jsonResponse(vacancyPage([draftVacancy], { totalItems: 11, totalPages: 2 }))
      }

      if (isVacanciesRequest(path, { page: 2 })) {
        return jsonResponse(vacancyPage([openVacancy], { page: 2, totalItems: 11, totalPages: 2 }))
      }

      if (isVacanciesRequest(path, { page: 1, statuses: ['DRAFT'] })) {
        return jsonResponse(vacancyPage([draftVacancy]))
      }

      if (isVacanciesRequest(path, { page: 1, statuses: ['DRAFT', 'OPEN'] })) {
        return jsonResponse(vacancyPage([draftVacancy, openVacancy], { totalItems: 2 }))
      }

      if (isVacanciesRequest(path, { page: 1, statuses: ['OPEN'] })) {
        return jsonResponse(vacancyPage([openVacancy]))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByText(draftVacancy.title)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText(openVacancy.title)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'DRAFT' }))
    expect(await screen.findByText(draftVacancy.title)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'OPEN' }))

    expect(await screen.findByText(draftVacancy.title)).toBeTruthy()
    expect(screen.getByText(openVacancy.title)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Anterior' })).toMatchObject({ disabled: true })

    fireEvent.click(screen.getByRole('button', { name: 'DRAFT' }))
    expect(await screen.findByText(openVacancy.title)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'OPEN' }))
    await waitFor(() => {
      expect(screen.getByText(draftVacancy.title)).toBeTruthy()
    })
  })

  it('respeta Previous y Next según la metadata y conserva una página vacía recuperable', async () => {
    await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        return jsonResponse(vacancyPage([draftVacancy], { totalItems: 11, totalPages: 2 }))
      }

      if (isVacanciesRequest(path, { page: 2 })) {
        return jsonResponse(vacancyPage([], { page: 2, totalItems: 1, totalPages: 1 }))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('No hay vacantes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Anterior' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toMatchObject({ disabled: true })
  })

  it('muestra carga, un error recuperable con reintento y un empty state con CTA', async () => {
    let requests = 0
    await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        requests += 1
        return requests === 1
          ? jsonResponse(
              {
                statusCode: 500,
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred',
              },
              500,
            )
          : jsonResponse(vacancyPage([]))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('No hay vacantes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Crear vacante' })).toBeTruthy()
  })

  it('muestra un estado de carga mientras espera el listado inicial', async () => {
    await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        return new Promise<Response>(() => undefined)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('envía la búsqueda por título solo al confirmarla, la combina con estados y la conserva al paginar', async () => {
    let filteredRequests = 0
    const { fetchMock } = await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (isVacanciesRequest(path, { page: 1 })) {
        return jsonResponse(vacancyPage([draftVacancy], { totalItems: 11, totalPages: 2 }))
      }
      if (isVacanciesRequest(path, { page: 1, statuses: ['DRAFT'] })) {
        return jsonResponse(vacancyPage([draftVacancy]))
      }
      if (isVacanciesRequest(path, { page: 1, statuses: ['DRAFT'], title: 'frontend' })) {
        filteredRequests += 1
        return jsonResponse(vacancyPage([openVacancy], { totalItems: 2, totalPages: 2 }))
      }
      if (isVacanciesRequest(path, { page: 2, statuses: ['DRAFT'], title: 'frontend' })) {
        return jsonResponse(vacancyPage([draftVacancy], { page: 2, totalItems: 2, totalPages: 2 }))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText(draftVacancy.title)
    fireEvent.click(screen.getByRole('button', { name: 'DRAFT' }))
    await screen.findByText(draftVacancy.title)

    const searchInput = screen.getByRole('textbox', { name: 'Buscar por título' })
    fireEvent.change(searchInput, { target: { value: '  frontend  ' } })
    expect(filteredRequests).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText(openVacancy.title)).toBeTruthy()
    expect(screen.queryByText(draftVacancy.title)).toBeNull()
    expect(filteredRequests).toBe(1)
    expect(
      fetchMock.mock.calls.some(([path]) =>
        typeof path === 'string'
          ? isVacanciesRequest(path, { page: 1, statuses: ['DRAFT'], title: 'frontend' })
          : false,
      ),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText(draftVacancy.title)).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([path]) =>
        typeof path === 'string'
          ? isVacanciesRequest(path, { page: 2, statuses: ['DRAFT'], title: 'frontend' })
          : false,
      ),
    ).toBe(true)
  })

  it('muestra un empty state específico, reintenta con la búsqueda aplicada y permite limpiarla', async () => {
    let matchingRequests = 0
    await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (isVacanciesRequest(path, { page: 1 })) return jsonResponse(vacancyPage([draftVacancy]))
      if (isVacanciesRequest(path, { page: 1, title: 'sin coincidencias' })) {
        matchingRequests += 1
        return matchingRequests === 1
          ? jsonResponse({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'Error' }, 500)
          : jsonResponse(vacancyPage([]))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText(draftVacancy.title)
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por título' }), {
      target: { value: ' sin coincidencias ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('No hay vacantes que coincidan con la búsqueda')).toBeTruthy()
    expect(matchingRequests).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(await screen.findByText(draftVacancy.title)).toBeTruthy()
  })
})

describe('Vacancies 10.1 — Create/Edit', () => {
  it('abre y cierra explícitamente el modal compartido de creación con sus cuatro campos', async () => {
    await renderVacanciesRoute(respondToSessionAndVacancies(vacancyPage([])))

    const dialog = await openCreateModal()
    expect(inputByLabel(dialog, 'Título')).toBeTruthy()
    expect(inputByLabel(dialog, 'Empresa')).toBeTruthy()
    expect(inputByLabel(dialog, 'Descripción')).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Pipeline' })).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('valida required tras trim, máximos contractuales y conserva whitespace interno de la descripción', async () => {
    await renderVacanciesRoute(respondToSessionAndVacancies(vacancyPage([])))
    const dialog = await openCreateModal()

    fireEvent.click(saveVacancyButton(dialog))
    expect(await within(dialog).findByText('El título es obligatorio.')).toBeTruthy()
    expect(within(dialog).getByText('La empresa es obligatoria.')).toBeTruthy()
    expect(within(dialog).getByText('La descripción es obligatoria.')).toBeTruthy()

    fillVacancyForm(dialog, {
      title: 'a'.repeat(201),
      companyName: 'b'.repeat(201),
      description: 'c'.repeat(1501),
    })
    fireEvent.click(saveVacancyButton(dialog))

    expect(await within(dialog).findByText('El título debe tener como máximo 200 caracteres.')).toBeTruthy()
    expect(within(dialog).getByText('La empresa debe tener como máximo 200 caracteres.')).toBeTruthy()
    expect(within(dialog).getByText('La descripción debe tener como máximo 1500 caracteres.')).toBeTruthy()

    fireEvent.change(inputByLabel(dialog, 'Descripción'), {
      target: { value: '  Primera línea\n  Segunda línea  ' },
    })
    expect(inputByLabel(dialog, 'Descripción').value).toBe('  Primera línea\n  Segunda línea  ')
  })

  it('carga todos los Pipelines activos en páginas de 100, filtra localmente y previsualiza stages por posición', async () => {
    const { fetchMock } = await renderVacanciesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        return jsonResponse(vacancyPage([]))
      }

      if (isPipelinesRequest(path, 1)) {
        return jsonResponse(pipelinePage([defaultPipeline], { totalItems: 101, totalPages: 2 }))
      }

      if (isPipelinesRequest(path, 2)) {
        return jsonResponse(pipelinePage([specialistPipeline], { page: 2, totalItems: 101, totalPages: 2 }))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/pipelines'))).toBe(false)
    const dialog = await openCreateModal()
    const combobox = within(dialog).getByRole('combobox', { name: 'Pipeline' })
    fireEvent.focus(combobox)

    expect(await within(dialog).findByRole('option', { name: 'Default' })).toBeTruthy()
    expect(await within(dialog).findByRole('option', { name: 'Especialista' })).toBeTruthy()
    fireEvent.change(combobox, { target: { value: 'especial' } })
    expect(await within(dialog).findByRole('option', { name: 'Especialista' })).toBeTruthy()
    expect(within(dialog).queryByRole('option', { name: 'Default' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('option', { name: 'Especialista' }))
    expect(await within(dialog).findByText('Revisión')).toBeTruthy()
    expect(within(dialog).getByText('Entrevista')).toBeTruthy()
    expect(within(dialog).getByText('Oferta')).toBeTruthy()
    const preview = within(dialog)
      .getAllByRole('list')
      .find((list) => list.textContent?.includes('Revisión'))
    expect(preview?.textContent).toMatch(/Revisión.*Entrevista.*Oferta/)
  })

  it('crea una Vacancy DRAFT con el POST contractual y actualiza el listado sin recargar el navegador', async () => {
    let listRequests = 0
    const created: VacancyDetailFixture = {
      ...draftVacancyDetail,
      pipeline: {
        name: specialistPipeline.name,
        stages: [...specialistPipeline.stages].sort((left, right) => left.position - right.position),
      },
    }
    const { fetchMock, router } = await renderVacanciesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        listRequests += 1
        return jsonResponse(vacancyPage(listRequests === 1 ? [] : [draftVacancy]))
      }

      if (isPipelinesRequest(path, 1)) {
        return jsonResponse(pipelinePage([specialistPipeline]))
      }

      if (path === '/api/vacancies' && options?.method === 'POST') {
        return jsonResponse(created, 201)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openCreateModal()
    fillVacancyForm(dialog, {
      title: '  Desarrollador frontend  ',
      companyName: '  Acme  ',
      description: '  Primera línea\n  Segunda línea  ',
    })
    await selectPipeline(dialog)
    fireEvent.click(saveVacancyButton(dialog))

    expect(await screen.findByText(draftVacancy.title)).toBeTruthy()
    expect(screen.getByLabelText('Estado: DRAFT')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/vacancies')
    const createCall = fetchMock.mock.calls.find(
      ([path, options]) => path === '/api/vacancies' && options?.method === 'POST',
    )
    expect(createCall).toBeTruthy()
    if (!createCall) {
      throw new Error('Se esperaba la solicitud POST de Vacancy.')
    }
    expect(JSON.parse((createCall[1] as RequestInit).body as string)).toEqual({
      title: draftVacancy.title,
      companyName: draftVacancy.companyName,
      description: 'Primera línea\n  Segunda línea',
      pipelineId: specialistPipeline.id,
    })
  })

  it('resuelve el detalle antes de editar, muestra el Pipeline inmutable y hace PATCH solo descriptivo', async () => {
    const updated: VacancyDetailFixture = {
      ...draftVacancyDetail,
      title: 'Desarrollador frontend senior',
      companyName: 'Acme actualizado',
      description: 'Descripción actualizada',
    }
    const { fetchMock } = await renderVacanciesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        return jsonResponse(vacancyPage([draftVacancy]))
      }

      if (path === `/api/vacancies/${vacancyId}` && options?.method === 'GET') {
        return jsonResponse(draftVacancyDetail)
      }

      if (path === `/api/vacancies/${vacancyId}` && options?.method === 'PATCH') {
        return jsonResponse(updated)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar vacante' })
    expect(inputByLabel(dialog, 'Título').value).toBe(draftVacancy.title)
    expect(inputByLabel(dialog, 'Descripción').value).toBe(draftVacancyDetail.description)
    expect(within(dialog).getByRole('combobox', { name: 'Pipeline' })).toMatchObject({
      disabled: true,
    })
    expect(within(dialog).getByDisplayValue('Default')).toBeTruthy()

    fillVacancyForm(dialog, updated)
    fireEvent.click(saveVacancyButton(dialog))
    expect(await screen.findByText(updated.title)).toBeTruthy()

    const patchCall = fetchMock.mock.calls.find(
      ([path, options]) => path === `/api/vacancies/${vacancyId}` && options?.method === 'PATCH',
    )
    expect(patchCall).toBeTruthy()
    if (!patchCall) {
      throw new Error('Se esperaba la solicitud PATCH de Vacancy.')
    }
    const body = JSON.parse((patchCall[1] as RequestInit).body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      title: updated.title,
      companyName: updated.companyName,
      description: updated.description,
    })
    expect(body).not.toHaveProperty('pipelineId')
    expect(body).not.toHaveProperty('status')
  })

  it('deshabilita el submit pendiente, evita doble envío y conserva el formulario ante errores contractuales o técnicos', async () => {
    let createAttempts = 0
    let resolveFirstCreate: ((response: Response) => void) | undefined
    const { fetchMock } = await renderVacanciesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (isVacanciesRequest(path, { page: 1 })) {
        return jsonResponse(vacancyPage([]))
      }

      if (isPipelinesRequest(path, 1)) {
        return jsonResponse(pipelinePage([specialistPipeline]))
      }

      if (path === '/api/vacancies' && options?.method === 'POST') {
        createAttempts += 1
        if (createAttempts === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirstCreate = resolve
          })
        }
        if (createAttempts === 2) {
          return jsonResponse(
            {
              statusCode: 404,
              code: 'PIPELINE_NOT_FOUND',
              message: 'Pipeline not found',
            },
            404,
          )
        }
        throw new Error('Network unavailable')
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openCreateModal()
    fillVacancyForm(dialog)
    await selectPipeline(dialog)
    fireEvent.click(saveVacancyButton(dialog))
    fireEvent.click(saveVacancyButton(dialog))

    expect(await within(dialog).findByRole('status')).toBeTruthy()
    expect(saveVacancyButton(dialog)).toMatchObject({ disabled: true })
    expect(
      fetchMock.mock.calls.filter(
        ([path, options]) => path === '/api/vacancies' && options?.method === 'POST',
      ),
    ).toHaveLength(1)

    resolveFirstCreate?.(
      jsonResponse(
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors: [{ field: 'title', message: 'title must be shorter than or equal to 200 characters' }],
        },
        400,
      ),
    )
    expect(await within(dialog).findByText('Revisa el título.')).toBeTruthy()
    expect(inputByLabel(dialog, 'Título').value).toBe('Desarrollador frontend')

    fireEvent.click(saveVacancyButton(dialog))
    expect(await screen.findByText('El pipeline seleccionado ya no está disponible.')).toBeTruthy()
    expect(screen.queryByText('PIPELINE_NOT_FOUND')).toBeNull()
    expect(inputByLabel(dialog, 'Empresa').value).toBe('Acme')

    fireEvent.click(saveVacancyButton(dialog))
    expect(await screen.findByText('No pudimos guardar la vacante. Inténtalo de nuevo.')).toBeTruthy()
    expect(inputByLabel(dialog, 'Descripción').value).toBe('Construye una experiencia de selección clara.')
  })
})
