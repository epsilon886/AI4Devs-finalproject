import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

interface Application {
  id: string
  createdAt: string
  candidate: Pick<Candidate, 'id' | 'firstName' | 'lastName'>
  vacancy: { id: string; title: string }
  currentStage: Stage
}

interface ApplicationPage {
  applications: Application[]
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

const stages: Stage[] = [
  { id: '018f0f64-2d8a-7f0b-8000-000000000031', name: 'Postulación', position: 1 },
  { id: '018f0f64-2d8a-7f0b-8000-000000000032', name: 'Entrevista', position: 2 },
]

const ada: Candidate = {
  id: '018f0f64-2d8a-7f0b-8000-000000000101',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
}

function vacancy() {
  return {
    id: vacancyId,
    title: 'Desarrollador frontend',
    companyName: 'Acme',
    description: 'Construye una experiencia de selección clara.',
    createdAt: '2026-10-01T10:00:00.000Z',
    status: 'OPEN' as const,
    pipeline: { name: 'Proceso de selección', stages: [...stages] },
  }
}

function candidate(index: number): Candidate {
  return {
    id: `018f0f64-2d8a-7f0b-8000-${String(500 + index).padStart(12, '0')}`,
    firstName: 'Persona',
    lastName: String(index),
    email: `persona-${index}@example.com`,
    phone: null,
  }
}

function application(id: string, applicant: Candidate, currentStage = stages[0]): Application {
  return {
    id,
    createdAt: '2026-10-10T10:00:00.000Z',
    candidate: {
      id: applicant.id,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
    },
    vacancy: { id: vacancyId, title: 'Desarrollador frontend' },
    currentStage,
  }
}

function applicationDetail(summary: Application, applicant: Candidate) {
  return {
    ...summary,
    candidate: applicant,
    vacancy: { ...summary.vacancy, companyName: 'Acme' },
    pipeline: { name: 'Proceso de selección' },
  }
}

function applicationPage(
  applications: Application[],
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

function applicationRequest(path: string, page: number): boolean {
  const url = new URL(path, 'http://localhost')
  return (
    url.pathname === '/api/applications' &&
    url.searchParams.get('vacancyId') === vacancyId &&
    url.searchParams.get('page') === String(page) &&
    url.searchParams.get('pageSize') === '100'
  )
}

async function renderVacancyRoute(
  respond: (path: string, options?: RequestInit) => Response | Promise<Response>,
) {
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

  return { fetchMock, queryClient }
}

function cachedApplications(queryClient: QueryClient) {
  return queryClient.getQueryData<InfiniteData<ApplicationPage>>([
    'vacancy-applications',
    vacancyId,
  ])
}

async function openAddDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar postulación' }))
  return screen.findByRole('dialog', { name: 'Agregar postulación' })
}

async function addAda(dialog: HTMLElement) {
  const combobox = within(dialog).getByRole('combobox', { name: 'Candidato' })
  fireEvent.change(combobox, { target: { value: ada.email } })
  fireEvent.click(await within(dialog).findByRole('option', { name: new RegExp(ada.email) }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Agregar postulación' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Vacancies 11.2 — consistencia de postulaciones', () => {
  it('mantiene metadata contractual de dos páginas al agregar sobre el límite de 100', async () => {
    const loadedApplications = Array.from({ length: 100 }, (_, index) =>
      application(
        `018f0f64-2d8a-7f0b-8000-${String(600 + index).padStart(12, '0')}`,
        candidate(index + 1),
      ),
    )
    const created = application('018f0f64-2d8a-7f0b-8000-000000000901', ada)
    const { queryClient } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationRequest(path, 1)) {
        return jsonResponse(applicationPage(loadedApplications, { totalItems: 100, totalPages: 1 }))
      }
      if (path === '/api/candidates?page=1&pageSize=100') {
        return jsonResponse({ candidates: [ada], page: 1, pageSize: 100, totalItems: 1, totalPages: 1 })
      }
      if (path === '/api/applications' && options?.method === 'POST') {
        return jsonResponse(applicationDetail(created, ada), 201)
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Persona 1')
    await addAda(await openAddDialog())
    await screen.findByText('Ada Lovelace')

    const cached = cachedApplications(queryClient)
    expect(cached?.pages.every((page) => page.totalItems === 101)).toBe(true)
    expect(cached?.pages.every((page) => page.totalPages === 2)).toBe(true)
    expect(screen.getByText('Mostrando 101 de 101')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cargar más postulaciones' })).toBeNull()
  })

  it('elimina la metadata de la última página vacía al borrar la única Application de la página 2', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      application(
        `018f0f64-2d8a-7f0b-8000-${String(800 + index).padStart(12, '0')}`,
        candidate(index + 1),
      ),
    )
    const lastApplication = application('018f0f64-2d8a-7f0b-8000-000000000902', ada, stages[1])
    const { queryClient } = await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationRequest(path, 1)) {
        return jsonResponse(applicationPage(firstPage, { totalItems: 101, totalPages: 2 }))
      }
      if (applicationRequest(path, 2)) {
        return jsonResponse(applicationPage([lastApplication], { page: 2, totalItems: 101, totalPages: 2 }))
      }
      if (path === `/api/applications/${lastApplication.id}` && options?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Persona 1')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más postulaciones' }))
    const card = (await screen.findByText('Ada Lovelace')).closest('article')
    if (!card) throw new Error('Se esperaba la card de Ada Lovelace.')
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Eliminar postulación' })).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull())

    const cached = cachedApplications(queryClient)
    expect(cached?.pages).toHaveLength(1)
    expect(cached?.pageParams).toEqual([1])
    expect(cached?.pages[0]).toMatchObject({ page: 1, totalItems: 100, totalPages: 1 })
    expect(screen.getByText('Mostrando 100 de 100')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cargar más postulaciones' })).toBeNull()
  })

  it('no restaura una Application eliminada cuando llega después una página solicitada antes del DELETE', async () => {
    const target = application('018f0f64-2d8a-7f0b-8000-000000000903', ada)
    const firstPage = [
      target,
      ...Array.from({ length: 99 }, (_, index) =>
        application(
          `018f0f64-2d8a-7f0b-8000-${String(1000 + index).padStart(12, '0')}`,
          candidate(index + 1),
        ),
      ),
    ]
    const staleSecondPage = application(
      '018f0f64-2d8a-7f0b-8000-000000000904',
      candidate(101),
      stages[1],
    )
    let resolveSecondPage: ((response: Response) => void) | undefined
    await renderVacancyRoute((path, options) => {
      if (path === '/api/auth/me') return jsonResponse(authenticatedUser)
      if (path === `/api/vacancies/${vacancyId}`) return jsonResponse(vacancy())
      if (applicationRequest(path, 1)) {
        return jsonResponse(applicationPage(firstPage, { totalItems: 101, totalPages: 2 }))
      }
      if (applicationRequest(path, 2)) {
        return new Promise<Response>((resolve) => {
          resolveSecondPage = resolve
        })
      }
      if (path === `/api/applications/${target.id}` && options?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await screen.findByText('Ada Lovelace')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más postulaciones' }))
    await waitFor(() => expect(resolveSecondPage).toBeTypeOf('function'))

    const targetCard = screen.getByText('Ada Lovelace').closest('article')
    if (!targetCard) throw new Error('Se esperaba la card de Ada Lovelace.')
    fireEvent.click(within(targetCard).getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Eliminar postulación' })).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).toBeNull())

    resolveSecondPage?.(
      jsonResponse(applicationPage([staleSecondPage], { page: 2, totalItems: 101, totalPages: 2 })),
    )
    await screen.findByText('Persona 101')
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
  })
})
