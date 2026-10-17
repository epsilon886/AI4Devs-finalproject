import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'

const candidateId = '018f0f64-2d8a-7f0b-8000-000000000010'
const secondCandidateId = '018f0f64-2d8a-7f0b-8000-000000000011'
const firstVacancyId = '018f0f64-2d8a-7f0b-8000-000000000020'
const secondVacancyId = '018f0f64-2d8a-7f0b-8000-000000000021'

interface CandidateFixture {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

interface VacancyFixture {
  id: string
  title: string
  companyName: string
  createdAt: string
  status: 'OPEN'
  pipelineName: string
}

interface CandidatePageFixture {
  candidates: CandidateFixture[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface VacancyPageFixture {
  vacancies: VacancyFixture[]
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

const designVacancy: VacancyFixture = {
  id: firstVacancyId,
  title: 'Diseñador de producto',
  companyName: 'Acme',
  createdAt: '2026-10-01T10:00:00.000Z',
  status: 'OPEN',
  pipelineName: 'Default',
}

const engineeringVacancy: VacancyFixture = {
  id: secondVacancyId,
  title: 'Ingeniero de plataforma',
  companyName: 'Globex',
  createdAt: '2026-10-02T10:00:00.000Z',
  status: 'OPEN',
  pipelineName: 'Default',
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

function candidatePage(candidates: CandidateFixture[]): CandidatePageFixture {
  return {
    candidates,
    page: 1,
    pageSize: 12,
    totalItems: candidates.length,
    totalPages: candidates.length ? 1 : 0,
  }
}

function vacancyPage(
  vacancies: VacancyFixture[],
  options: { page?: number; totalItems?: number; totalPages?: number } = {},
): VacancyPageFixture {
  const totalItems = options.totalItems ?? vacancies.length

  return {
    vacancies,
    page: options.page ?? 1,
    pageSize: 100,
    totalItems,
    totalPages: options.totalPages ?? (totalItems ? 1 : 0),
  }
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

  await screen.findByText('Ada Lovelace')

  return { fetchMock, router }
}

function isOpenVacanciesRequest(path: string, page: number): boolean {
  const requestUrl = new URL(path, 'http://localhost')

  return (
    requestUrl.pathname === '/api/vacancies' &&
    requestUrl.searchParams.get('page') === String(page) &&
    requestUrl.searchParams.get('pageSize') === '100' &&
    requestUrl.searchParams.getAll('status').length === 1 &&
    requestUrl.searchParams.get('status') === 'OPEN'
  )
}

function countVacancyRequests(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([path]) =>
    typeof path === 'string' ? new URL(path, 'http://localhost').pathname === '/api/vacancies' : false,
  ).length
}

async function openAddToVacancyModal(candidateName = 'Ada Lovelace'): Promise<HTMLElement> {
  const candidateHeading = await screen.findByRole('heading', { name: candidateName })
  const candidateCard = candidateHeading.closest('article')
  if (!candidateCard) {
    throw new Error(`No se encontró la card de ${candidateName}.`)
  }
  fireEvent.click(within(candidateCard).getByRole('button', { name: 'Agregar a vacante' }))

  return screen.findByRole('dialog', { name: 'Agregar a vacante' })
}

async function vacancyCombobox(dialog: HTMLElement): Promise<HTMLInputElement> {
  return (await within(dialog).findByRole('combobox', { name: 'Vacante' })) as HTMLInputElement
}

async function selectVacancy(dialog: HTMLElement): Promise<HTMLInputElement> {
  const combobox = await vacancyCombobox(dialog)
  fireEvent.focus(combobox)
  fireEvent.click(await within(dialog).findByRole('option', { name: /Diseñador de producto/ }))

  return combobox
}

function submitApplicationButton(dialog: HTMLElement): HTMLButtonElement {
  return within(dialog).getByRole('button', { name: 'Agregar a vacante' }) as HTMLButtonElement
}

describe('Candidates 8.2 — Add to vacancy', () => {
  it('offers the action on every Candidate card, opens its modal, and loads Vacancies only then', async () => {
    const { fetchMock } = await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada, grace]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([designVacancy]))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    expect(screen.getAllByRole('button', { name: 'Agregar a vacante' })).toHaveLength(2)
    expect(countVacancyRequests(fetchMock)).toBe(0)

    const dialog = await openAddToVacancyModal()
    expect(dialog).toBeTruthy()
    await waitFor(() => expect(countVacancyRequests(fetchMock)).toBe(1))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('loads every OPEN Vacancy page in blocks of 100 and filters the loaded options locally', async () => {
    const { fetchMock } = await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([designVacancy], { totalItems: 101, totalPages: 2 }))
      }
      if (isOpenVacanciesRequest(path, 2)) {
        return jsonResponse(
          vacancyPage([engineeringVacancy], { page: 2, totalItems: 101, totalPages: 2 }),
        )
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    const combobox = await vacancyCombobox(dialog)
    fireEvent.focus(combobox)
    expect(await within(dialog).findByRole('option', { name: /Diseñador de producto/ })).toBeTruthy()
    expect(await within(dialog).findByRole('option', { name: /Ingeniero de plataforma/ })).toBeTruthy()
    expect(countVacancyRequests(fetchMock)).toBe(2)

    const requestCountBeforeFilter = countVacancyRequests(fetchMock)
    fireEvent.change(combobox, {
      target: { value: 'globex' },
    })

    expect(await within(dialog).findByRole('option', { name: /Ingeniero de plataforma/ })).toBeTruthy()
    expect(within(dialog).queryByRole('option', { name: /Diseñador de producto/ })).toBeNull()
    expect(countVacancyRequests(fetchMock)).toBe(requestCountBeforeFilter)
  })

  it('shows a loading state while the OPEN Vacancies are being loaded', async () => {
    let resolveVacancies: ((response: Response) => void) | undefined
    await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return new Promise((resolve) => {
          resolveVacancies = resolve
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    expect(await within(dialog).findByRole('status')).toBeTruthy()

    resolveVacancies?.(jsonResponse(vacancyPage([])))
  })

  it('shows an error when OPEN Vacancies cannot be loaded', async () => {
    await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(
          {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Unexpected error',
          },
          500,
        )
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
  })

  it('explains when there are no OPEN Vacancies available', async () => {
    await renderCandidatesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([]))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    expect(await within(dialog).findByText('No hay vacantes abiertas disponibles.')).toBeTruthy()
  })

  it('requires selecting a Vacancy and posts only the contractual application identifiers before closing on success', async () => {
    const { fetchMock, router } = await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([designVacancy]))
      }
      if (path === '/api/applications' && options?.method === 'POST') {
        return jsonResponse({ id: '018f0f64-2d8a-7f0b-8000-000000000030' }, 201)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    const combobox = await vacancyCombobox(dialog)
    fireEvent.focus(combobox)
    await within(dialog).findByRole('option', { name: /Diseñador de producto/ })

    fireEvent.click(submitApplicationButton(dialog))
    expect(await within(dialog).findByText('Selecciona una vacante.')).toBeTruthy()

    await selectVacancy(dialog)
    fireEvent.click(submitApplicationButton(dialog))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/candidates')
    const applicationCall = fetchMock.mock.calls.find(
      ([path, options]) => path === '/api/applications' && options?.method === 'POST',
    )
    expect(applicationCall).toBeTruthy()
    if (!applicationCall) {
      throw new Error('Se esperaba la solicitud POST de Application.')
    }
    expect(JSON.parse((applicationCall[1] as RequestInit).body as string)).toEqual({
      candidateId,
      vacancyId: firstVacancyId,
    })
  })

  it('disables submission, exposes progress, and prevents duplicate Application creation while pending', async () => {
    let resolveApplication: ((response: Response) => void) | undefined
    const { fetchMock } = await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([designVacancy]))
      }
      if (path === '/api/applications' && options?.method === 'POST') {
        return new Promise((resolve) => {
          resolveApplication = resolve
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    await selectVacancy(dialog)

    const submitButton = submitApplicationButton(dialog)
    fireEvent.click(submitButton)
    fireEvent.click(submitButton)

    await waitFor(() => expect(submitButton.disabled).toBe(true))
    expect(await within(dialog).findByRole('status')).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter(
        ([path, options]) => path === '/api/applications' && options?.method === 'POST',
      ),
    ).toHaveLength(1)

    resolveApplication?.(jsonResponse({ id: '018f0f64-2d8a-7f0b-8000-000000000030' }, 201))
  })

  it('keeps the selected Vacancy after APPLICATION_ALREADY_EXISTS and provides feedback', async () => {
    await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([designVacancy]))
      }
      if (path === '/api/applications' && options?.method === 'POST') {
        return jsonResponse(
          {
            statusCode: 409,
            code: 'APPLICATION_ALREADY_EXISTS',
            message: 'An active application already exists for this candidate and vacancy',
          },
          409,
        )
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    const combobox = await selectVacancy(dialog)
    fireEvent.click(submitApplicationButton(dialog))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'El candidato ya está asociado a esta vacante.',
    )
    expect(combobox.value).toBe('Diseñador de producto — Acme')
    expect(screen.getByRole('dialog', { name: 'Agregar a vacante' })).toBeTruthy()
  })

  it('keeps the selected Vacancy and form context for the other contractual creation errors', async () => {
    let attempts = 0
    await renderCandidatesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }
      if (path === '/api/candidates?page=1&pageSize=12') {
        return jsonResponse(candidatePage([ada]))
      }
      if (isOpenVacanciesRequest(path, 1)) {
        return jsonResponse(vacancyPage([designVacancy]))
      }
      if (path === '/api/applications' && options?.method === 'POST') {
        attempts += 1
        if (attempts === 1) {
          return jsonResponse(
            {
              statusCode: 409,
              code: 'VACANCY_NOT_OPEN',
              message: 'The vacancy does not allow this operation',
            },
            409,
          )
        }
        if (attempts === 2) {
          return jsonResponse(
            { statusCode: 404, code: 'VACANCY_NOT_FOUND', message: 'Vacancy not found' },
            404,
          )
        }
        return jsonResponse(
          { statusCode: 404, code: 'CANDIDATE_NOT_FOUND', message: 'Candidate not found' },
          404,
        )
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const dialog = await openAddToVacancyModal()
    const combobox = await selectVacancy(dialog)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(submitApplicationButton(dialog))
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      expect(combobox.value).toBe('Diseñador de producto — Acme')
      expect(screen.getByRole('dialog', { name: 'Agregar a vacante' })).toBeTruthy()
    }
  })
})
