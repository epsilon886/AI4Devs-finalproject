import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../routes/router.tsx'

const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000102'
const firstStageId = '018f0f64-2d8a-7f0b-8000-000000000201'
const secondStageId = '018f0f64-2d8a-7f0b-8000-000000000202'
const thirdStageId = '018f0f64-2d8a-7f0b-8000-000000000203'

const authenticatedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Recruiter',
  lastName: 'Test',
  email: 'recruiter@example.com',
}

const editablePipeline = {
  id: pipelineId,
  name: 'Selección técnica',
  isDefault: false,
  isEditable: true,
  stages: [
    { id: firstStageId, name: 'CV', position: 1 },
    { id: secondStageId, name: 'Entrevista', position: 2 },
    { id: thirdStageId, name: 'Oferta', position: 3 },
  ],
}

const editablePipelineWithOptionalStage = {
  ...editablePipeline,
  stages: [
    ...editablePipeline.stages,
    {
      id: '018f0f64-2d8a-7f0b-8000-000000000204',
      name: 'Contratación',
      position: 4,
    },
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

function pipelinePage(pipelines = [editablePipeline]) {
  return { pipelines, page: 1, pageSize: 10, totalItems: pipelines.length, totalPages: 1 }
}

async function renderPipelineList(
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

function respondToSessionAndList(path: string): Response {
  if (path === '/api/auth/me') {
    return jsonResponse(authenticatedUser)
  }

  if (path === '/api/pipelines?page=1&pageSize=10') {
    return jsonResponse(pipelinePage())
  }

  if (path === `/api/pipelines/${pipelineId}`) {
    return jsonResponse(editablePipeline)
  }

  throw new Error(`Unexpected request: ${path}`)
}

function fillRequiredStages(): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 1' }), {
    target: { value: 'Postulación' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 2' }), {
    target: { value: 'Entrevista' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 3' }), {
    target: { value: 'Oferta' },
  })
}

describe('Pipelines 9.2 — creación y edición', () => {
  it('navega desde el listado a una página dedicada de creación y vuelve al listado al cancelar', async () => {
    const { router } = await renderPipelineList(respondToSessionAndList)

    fireEvent.click(await screen.findByRole('button', { name: 'Crear pipeline' }))
    expect(await screen.findByRole('heading', { name: 'Crear pipeline' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/pipelines'))
    expect(await screen.findByRole('heading', { name: 'Flujos de selección' })).toBeTruthy()
  })

  it('presenta las diez posiciones: tres obligatorias y las restantes activables como prefijo continuo', async () => {
    await renderPipelineList(respondToSessionAndList)
    fireEvent.click(await screen.findByRole('button', { name: 'Crear pipeline' }))

    for (let position = 1; position <= 10; position += 1) {
      expect(await screen.findByRole('textbox', { name: `Etapa ${position}` })).toBeTruthy()
    }

    expect(screen.getByRole('textbox', { name: 'Etapa 1' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('textbox', { name: 'Etapa 2' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('textbox', { name: 'Etapa 3' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('textbox', { name: 'Etapa 4' })).toMatchObject({ disabled: true })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar etapa 4' }))
    expect(screen.getByRole('textbox', { name: 'Etapa 4' })).toMatchObject({ disabled: false })
    expect(screen.getByRole('textbox', { name: 'Etapa 5' })).toMatchObject({ disabled: true })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar etapa 5' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar etapa 4' }))
    expect(screen.getByRole('textbox', { name: 'Etapa 4' })).toMatchObject({ disabled: true })
    expect(screen.getByRole('textbox', { name: 'Etapa 5' })).toMatchObject({ disabled: true })
  })

  it('valida nombre y stages antes de enviar: requerido, trim, máximo y unicidad normalizada', async () => {
    const { fetchMock } = await renderPipelineList(respondToSessionAndList)
    fireEvent.click(await screen.findByRole('button', { name: 'Crear pipeline' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('El nombre del pipeline es obligatorio.')).toBeTruthy()
    expect(screen.getByText('La etapa 1 es obligatoria.')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del pipeline' }), {
      target: { value: '  ' },
    })
    fillRequiredStages()
    fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 2' }), {
      target: { value: ' entrevista ' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 3' }), {
      target: { value: 'Entrevista' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El nombre del pipeline es obligatorio.')).toBeTruthy()
    expect(screen.getByText('Las etapas deben tener nombres únicos.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del pipeline' }), {
      target: { value: 'a'.repeat(101) },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 3' }), {
      target: { value: 'b'.repeat(101) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('El nombre del pipeline no puede superar 100 caracteres.')).toBeTruthy()
    expect(screen.getByText('La etapa 3 no puede superar 100 caracteres.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/pipelines',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('crea con POST usando solo stages activas, posiciones continuas y sin IDs', async () => {
    let postBody: unknown
    const { fetchMock, router } = await renderPipelineList((path, options) => {
      if (path === '/api/auth/me' || path === '/api/pipelines?page=1&pageSize=10') {
        return respondToSessionAndList(path)
      }

      if (path === '/api/pipelines' && options?.method === 'POST') {
        postBody = JSON.parse(String(options.body))
        return jsonResponse(editablePipeline, 201)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Crear pipeline' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del pipeline' }), {
      target: { value: '  Selección técnica  ' },
    })
    fillRequiredStages()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar etapa 4' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 4' }), {
      target: { value: 'Contratación' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/pipelines'))
    expect(postBody).toEqual({
      name: 'Selección técnica',
      stages: [
        { name: 'Postulación', position: 1 },
        { name: 'Entrevista', position: 2 },
        { name: 'Oferta', position: 3 },
        { name: 'Contratación', position: 4 },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pipelines',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(screen.getByText('Pipeline creado correctamente.')).toBeTruthy()
  })

  it('edita con la colección final: conserva IDs existentes e incorpora stages nuevas sin IDs', async () => {
    let patchBody: unknown
    const { router } = await renderPipelineList((path, options) => {
      if (path === '/api/auth/me' || path === '/api/pipelines?page=1&pageSize=10') {
        return respondToSessionAndList(path)
      }

      if (path === `/api/pipelines/${pipelineId}` && options?.method === 'GET') {
        return jsonResponse(editablePipeline)
      }

      if (path === `/api/pipelines/${pipelineId}` && options?.method === 'PATCH') {
        patchBody = JSON.parse(String(options.body))
        return jsonResponse(editablePipeline)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('heading', { name: 'Editar pipeline' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Etapa 1' }) as HTMLInputElement).value).toBe('CV')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar etapa 4' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Etapa 4' }), {
      target: { value: 'Contratación' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/pipelines'))
    expect(patchBody).toEqual({
      name: 'Selección técnica',
      stages: [
        { id: firstStageId, name: 'CV', position: 1 },
        { id: secondStageId, name: 'Entrevista', position: 2 },
        { id: thirdStageId, name: 'Oferta', position: 3 },
        { name: 'Contratación', position: 4 },
      ],
    })
  })

  it('omite de la colección PATCH una etapa opcional desactivada', async () => {
    let patchBody: unknown
    const { router } = await renderPipelineList((path, options) => {
      if (path === '/api/auth/me') {
        return jsonResponse(authenticatedUser)
      }

      if (path === '/api/pipelines?page=1&pageSize=10') {
        return jsonResponse(pipelinePage([editablePipelineWithOptionalStage]))
      }

      if (path === `/api/pipelines/${pipelineId}` && options?.method === 'GET') {
        return jsonResponse(editablePipelineWithOptionalStage)
      }

      if (path === `/api/pipelines/${pipelineId}` && options?.method === 'PATCH') {
        patchBody = JSON.parse(String(options.body))
        return jsonResponse(editablePipeline)
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    await screen.findByRole('heading', { name: 'Editar pipeline' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activar etapa 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/pipelines'))
    expect(patchBody).toEqual({
      name: 'Selección técnica',
      stages: [
        { id: firstStageId, name: 'CV', position: 1 },
        { id: secondStageId, name: 'Entrevista', position: 2 },
        { id: thirdStageId, name: 'Oferta', position: 3 },
      ],
    })
  })

  it('deshabilita Guardar mientras está pendiente, evita doble envío, actualiza el listado y confirma el éxito', async () => {
    let resolvePost: ((response: Response) => void) | undefined
    let postRequests = 0
    let listRequests = 0
    const { router } = await renderPipelineList((path, options) => {
      if (path === '/api/auth/me') {
        return respondToSessionAndList(path)
      }

      if (path === '/api/pipelines?page=1&pageSize=10') {
        listRequests += 1
        return jsonResponse(pipelinePage(listRequests === 1 ? [] : [editablePipeline]))
      }

      if (path === '/api/pipelines' && options?.method === 'POST') {
        postRequests += 1
        return new Promise<Response>((resolve) => {
          resolvePost = resolve
        })
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Crear pipeline' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del pipeline' }), {
      target: { value: 'Selección técnica' },
    })
    fillRequiredStages()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('button', { name: 'Guardar' })).toMatchObject({ disabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(postRequests).toBe(1)

    resolvePost?.(jsonResponse(editablePipeline, 201))
    await waitFor(() => expect(router.state.location.pathname).toBe('/pipelines'))
    expect(await screen.findByText('Selección técnica')).toBeTruthy()
    expect(listRequests).toBe(2)
    expect(screen.getByText('Pipeline creado correctamente.')).toBeTruthy()
  })

  it.each([
    ['VALIDATION_ERROR', 400, 'Corrige los campos marcados e inténtalo nuevamente.'],
    ['PIPELINE_NAME_CONFLICT', 409, 'Ya existe un pipeline con ese nombre.'],
    ['PIPELINE_NOT_EDITABLE', 409, 'Este pipeline ya no se puede modificar.'],
    ['PIPELINE_NOT_FOUND', 404, 'El pipeline no existe o ya no está disponible.'],
    ['PIPELINE_STAGE_NOT_FOUND', 404, 'Una etapa del pipeline ya no existe o no está disponible.'],
  ])('muestra feedback en español y conserva el formulario ante %s', async (code, status, message) => {
    const { router } = await renderPipelineList((path, options) => {
      if (path === '/api/auth/me' || path === '/api/pipelines?page=1&pageSize=10') {
        return respondToSessionAndList(path)
      }

      if (path === `/api/pipelines/${pipelineId}` && options?.method === 'GET') {
        return jsonResponse(editablePipeline)
      }

      if (path === `/api/pipelines/${pipelineId}` && options?.method === 'PATCH') {
        return jsonResponse(
          {
            statusCode: status,
            code,
            message: 'Contractual error',
            errors:
              code === 'VALIDATION_ERROR'
                ? [{ field: 'stages.1.name', message: 'Stage name is required' }]
                : undefined,
          },
          status,
        )
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    await screen.findByRole('heading', { name: 'Editar pipeline' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del pipeline' }), {
      target: { value: 'Nombre conservado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(message)).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: 'Nombre del pipeline' }) as HTMLInputElement).value,
    ).toBe('Nombre conservado')
    expect(router.state.location.pathname).not.toBe('/pipelines')
    if (code === 'VALIDATION_ERROR') {
      expect(screen.getByText('El nombre de la etapa 2 es obligatorio.')).toBeTruthy()
    }
  })
})
