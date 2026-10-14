import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSessionUnauthorizedHandler } from '../auth/session.ts'
import { createAppRouter } from '../../routes/router.tsx'

const defaultPipelineId = '018f0f64-2d8a-7f0b-8000-000000000101'
const editablePipelineId = '018f0f64-2d8a-7f0b-8000-000000000102'
const lockedPipelineId = '018f0f64-2d8a-7f0b-8000-000000000103'

interface PipelineFixture {
  id: string
  name: string
  isDefault: boolean
  isEditable: boolean
  stages: Array<{ id: string; name: string; position: number }>
}

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Recruiter',
  lastName: 'Test',
  email: 'recruiter@example.com',
}

const defaultPipeline: PipelineFixture = {
  id: defaultPipelineId,
  name: 'Default',
  isDefault: true,
  isEditable: false,
  stages: [
    { id: '018f0f64-2d8a-7f0b-8000-000000000201', name: 'Applied', position: 1 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000202', name: 'Interview', position: 3 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000203', name: 'Screening', position: 2 },
  ],
}

const editablePipeline: PipelineFixture = {
  id: editablePipelineId,
  name: 'Selección técnica',
  isDefault: false,
  isEditable: true,
  stages: [
    { id: '018f0f64-2d8a-7f0b-8000-000000000204', name: 'CV', position: 1 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000205', name: 'Entrevista', position: 2 },
    { id: '018f0f64-2d8a-7f0b-8000-000000000206', name: 'Oferta', position: 3 },
  ],
}

const lockedPipeline: PipelineFixture = {
  id: lockedPipelineId,
  name: 'Usado',
  isDefault: false,
  isEditable: false,
  stages: editablePipeline.stages,
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

function pipelinePage(
  pipelines: PipelineFixture[],
  options: { page?: number; totalItems?: number; totalPages?: number } = {},
) {
  const page = options.page ?? 1
  const totalItems = options.totalItems ?? pipelines.length
  const totalPages = options.totalPages ?? (totalItems === 0 ? 0 : 1)

  return { pipelines, page, pageSize: 10, totalItems, totalPages }
}

async function renderPipelinesRoute(
  respond: (path: string, options?: RequestInit) => Promise<Response> | Response,
) {
  const fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: ['/pipelines'] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await screen.findByRole('heading', { name: 'Flujos de selección' })

  return { fetchMock, queryClient, router }
}

function respondToSessionAndPipelines(
  page: ReturnType<typeof pipelinePage>,
): (path: string) => Response {
  return (path) => {
    if (path === '/api/auth/me') {
      return jsonResponse(authenticatedUser)
    }

    if (path === '/api/pipelines?page=1&pageSize=10') {
      return jsonResponse(page)
    }

    throw new Error(`Unexpected request: ${path}`)
  }
}

describe('Pipelines 9.1 — listado y acciones', () => {
  it('solicita la colección paginada con pageSize 10 y presenta el orden contractual sin columnas técnicas', async () => {
    const { fetchMock } = await renderPipelinesRoute(
      respondToSessionAndPipelines(
        pipelinePage([defaultPipeline, editablePipeline, lockedPipeline]),
      ),
    )

    expect(await screen.findByText('Default')).toBeTruthy()
    expect(screen.getByText('Selección técnica')).toBeTruthy()
    expect(screen.getByText('Usado')).toBeTruthy()
    expect(screen.queryByText('isDefault')).toBeNull()
    expect(screen.queryByText('isEditable')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pipelines?page=1&pageSize=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('muestra el badge Default y expande las stages por posición con sus etiquetas visibles', async () => {
    await renderPipelinesRoute(
      respondToSessionAndPipelines(pipelinePage([defaultPipeline, editablePipeline])),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Default.*etapas/i }))

    expect(screen.getByText('Etapa 1')).toBeTruthy()
    expect(screen.getByText('Applied')).toBeTruthy()
    expect(screen.getByText('Etapa 2')).toBeTruthy()
    expect(screen.getByText('Screening')).toBeTruthy()
    expect(screen.getByText('Etapa 3')).toBeTruthy()
    expect(screen.getByText('Interview')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Default.*etapas/i }))
    await waitFor(() => expect(screen.queryByText('Etapa 1')).toBeNull())
  })

  it('ofrece Editar y Eliminar solo a pipelines editables, pero Copiar también a Default y no editables', async () => {
    await renderPipelinesRoute(
      respondToSessionAndPipelines(
        pipelinePage([defaultPipeline, editablePipeline, lockedPipeline]),
      ),
    )

    const defaultRow = (await screen.findByText('Default')).closest('tr')
    const editableRow = screen.getByText('Selección técnica').closest('tr')
    const lockedRow = screen.getByText('Usado').closest('tr')

    expect(defaultRow).not.toBeNull()
    expect(editableRow).not.toBeNull()
    expect(lockedRow).not.toBeNull()
    expect(defaultRow?.textContent).toContain('Copiar')
    expect(defaultRow?.textContent).not.toContain('Editar')
    expect(defaultRow?.textContent).not.toContain('Eliminar')
    expect(editableRow?.textContent).toContain('Copiar')
    expect(editableRow?.textContent).toContain('Editar')
    expect(editableRow?.textContent).toContain('Eliminar')
    expect(lockedRow?.textContent).toContain('Copiar')
    expect(lockedRow?.textContent).not.toContain('Editar')
    expect(lockedRow?.textContent).not.toContain('Eliminar')
  })

  it('muestra carga, permite reintentar un error inicial y mantiene paginación recuperable', async () => {
    let requests = 0
    const { fetchMock } = await renderPipelinesRoute((path) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/pipelines?page=1&pageSize=10') {
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
          : jsonResponse(pipelinePage([defaultPipeline], { totalItems: 11, totalPages: 2 }))
      }

      if (path === '/api/pipelines?page=2&pageSize=10') {
        return jsonResponse(pipelinePage([], { page: 2, totalItems: 1, totalPages: 1 }))
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    expect(await screen.findByRole('status')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Default')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('No hay pipelines')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Anterior' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toMatchObject({ disabled: true })
    expect(
      fetchMock.mock.calls.filter(([path]) => path === '/api/pipelines?page=1&pageSize=10'),
    ).toHaveLength(2)
  })

  it('copia hacia el formulario de creación el nombre y stages sin conservar IDs', async () => {
    let postBody: unknown
    await renderPipelinesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/pipelines?page=1&pageSize=10') {
        return jsonResponse(pipelinePage([defaultPipeline, editablePipeline]))
      }

      if (path === '/api/pipelines' && options?.method === 'POST') {
        postBody = JSON.parse(String(options.body))
        return jsonResponse(defaultPipeline, 201)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const defaultRow = (await screen.findByText('Default')).closest('tr')
    fireEvent.click(within(defaultRow!).getByRole('button', { name: 'Copiar' }))

    expect(await screen.findByRole('heading', { name: 'Crear pipeline' })).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: 'Nombre del pipeline' }) as HTMLInputElement).value,
    ).toBe('Default - Copy')
    expect((screen.getByRole('textbox', { name: 'Etapa 1' }) as HTMLInputElement).value).toBe(
      'Applied',
    )
    expect((screen.getByRole('textbox', { name: 'Etapa 2' }) as HTMLInputElement).value).toBe(
      'Screening',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(postBody).toEqual({
      name: 'Default - Copy',
      stages: [
        { name: 'Applied', position: 1 },
        { name: 'Screening', position: 2 },
        { name: 'Interview', position: 3 },
      ],
    }))
  })

  it('pide confirmación, no muta al cancelar y elimina con 204 actualizando la colección', async () => {
    let deleteRequests = 0
    const { fetchMock } = await renderPipelinesRoute((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/pipelines?page=1&pageSize=10') {
        return jsonResponse(
          pipelinePage(deleteRequests === 0 ? [defaultPipeline, editablePipeline] : [defaultPipeline]),
        )
      }

      if (path === `/api/pipelines/${editablePipelineId}` && options?.method === 'DELETE') {
        deleteRequests += 1
        return new Response(null, { status: 204 })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    const row = (await screen.findByText('Selección técnica')).closest('tr')
    fireEvent.click(within(row!).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByRole('dialog', { name: 'Eliminar pipeline' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(deleteRequests).toBe(0)

    fireEvent.click(within(row!).getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar eliminación' }))

    await waitFor(() => expect(screen.queryByText('Selección técnica')).toBeNull())
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/pipelines/${editablePipelineId}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(screen.getByText('Pipeline eliminado correctamente.')).toBeTruthy()
  })

  it('redirige ante un 401 transversal durante una consulta privada de Pipelines', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createAppRouter({
      queryClient,
      history: createMemoryHistory({ initialEntries: ['/pipelines'] }),
    })
    const cleanup = installSessionUnauthorizedHandler({
      queryClient,
      onSessionExpired: () => {
        void router.navigate({ to: '/login', replace: true })
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        if (path === '/api/auth/me') {
          return Promise.resolve(jsonResponse(authenticatedUser))
        }

        if (path === '/api/pipelines?page=1&pageSize=10') {
          return Promise.resolve(
            jsonResponse(
              { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
              401,
            ),
          )
        }

        throw new Error(`Unexpected request: ${path}`)
      }),
    )

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    cleanup()
  })
})
