import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '../../components/EmptyState.tsx'
import { LoadingState } from '../../components/LoadingState.tsx'
import { Modal } from '../../components/Modal.tsx'
import { Pagination } from '../../components/Pagination.tsx'
import { Toast, type ToastType } from '../../components/Toast.tsx'
import { apiRequest } from '../../lib/api.ts'

const pageSize = 10
export const pipelineQueryKey = ['pipelines'] as const

export interface PipelineStage {
  id: string
  name: string
  position: number
}

export interface Pipeline {
  id: string
  name: string
  isDefault: boolean
  isEditable: boolean
  stages: PipelineStage[]
}

interface PipelinePageResponse {
  pipelines: Pipeline[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface ToastState {
  type: ToastType
  message: string
}

interface PipelineCopyDraft {
  name: string
  stages: Array<{ name: string; position: number }>
}

let copyDraft: PipelineCopyDraft | null = null
let pendingToast: ToastState | null = null

export function preparePipelineCopy(pipeline: Pipeline): void {
  copyDraft = {
    name: `${pipeline.name} - Copy`,
    stages: [...pipeline.stages]
      .sort((left, right) => left.position - right.position)
      .map(({ name, position }) => ({ name, position })),
  }
}

export function clearPipelineCopy(): void {
  copyDraft = null
}

export function getPipelineCopy(): PipelineCopyDraft | null {
  return copyDraft
}

export function setPendingPipelineToast(toast: ToastState): void {
  pendingToast = toast
}

export function clearPendingPipelineToast(): void {
  pendingToast = null
}

export function PipelinesPage({
  onCreate,
  onEdit,
  onCopy,
}: {
  onCreate: () => void
  onEdit: (id: string) => void
  onCopy: () => void
}) {
  const [page, setPage] = useState(1)
  const [expandedPipelineId, setExpandedPipelineId] = useState<string | null>(null)
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null)
  const [toast, setToast] = useState<ToastState | null>(() => pendingToast)
  const queryClient = useQueryClient()
  const pipelinesQuery = useQuery({
    queryKey: [...pipelineQueryKey, { page, pageSize }],
    queryFn: () =>
      apiRequest<PipelinePageResponse>(`/pipelines?page=${page}&pageSize=${pageSize}`),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/pipelines/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pipelineQueryKey })
      setPipelineToDelete(null)
      setToast({ type: 'success', message: 'Pipeline eliminado correctamente.' })
    },
    onError: () => {
      setToast({ type: 'error', message: 'No pudimos eliminar el pipeline. Inténtalo de nuevo.' })
    },
  })

  useEffect(() => {
    clearPendingPipelineToast()
  }, [])

  function openCopy(pipeline: Pipeline) {
    preparePipelineCopy(pipeline)
    onCopy()
  }

  const data = pipelinesQuery.data

  return (
    <>
      <main className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Flujos de selección</h1>
          <button
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={onCreate}
            type="button"
          >
            Crear pipeline
          </button>
        </div>

        <section aria-label="Listado de pipelines" className="mt-6">
          {pipelinesQuery.isPending ? <LoadingState label="Cargando pipelines..." /> : null}

          {pipelinesQuery.isError ? (
            <div className="rounded-lg border border-red-200 bg-white px-6 py-8 text-center">
              <p className="text-slate-700">No pudimos cargar los pipelines.</p>
              <button
                className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void pipelinesQuery.refetch()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {data ? (
            <>
              {data.pipelines.length === 0 ? (
                <EmptyState
                  action={
                    <button
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      onClick={onCreate}
                      type="button"
                    >
                      Crear pipeline
                    </button>
                  }
                  description="Crea un pipeline personalizado para organizar tus procesos de selección."
                  title="No hay pipelines"
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-left text-sm text-slate-600">
                      <tr>
                        <th className="w-12 px-3 py-3" scope="col">
                          <span className="sr-only">Etapas</span>
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Pipeline
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-right font-medium" scope="col">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.pipelines.map((pipeline) => {
                        const isExpanded = expandedPipelineId === pipeline.id
                        return (
                          <PipelineRow
                            isExpanded={isExpanded}
                            key={pipeline.id}
                            onCopy={() => openCopy(pipeline)}
                            onDelete={() => setPipelineToDelete(pipeline)}
                            onEdit={() => onEdit(pipeline.id)}
                            onToggleStages={() =>
                              setExpandedPipelineId((current) =>
                                current === pipeline.id ? null : pipeline.id,
                              )
                            }
                            pipeline={pipeline}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {data.totalPages > 0 || data.page > 1 ? (
                <div className="mt-6">
                  <Pagination
                    onNext={() => setPage((currentPage) => currentPage + 1)}
                    onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                    page={data.page}
                    totalPages={data.totalPages}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </main>

      {pipelineToDelete ? (
        <Modal
          onClose={deleteMutation.isPending ? () => {} : () => setPipelineToDelete(null)}
          open
          primaryAction={{
            disabled: deleteMutation.isPending,
            label: 'Confirmar eliminación',
            onClick: () => deleteMutation.mutate(pipelineToDelete.id),
            pending: deleteMutation.isPending,
            pendingLabel: 'Eliminando...',
            variant: 'destructive',
          }}
          title="Eliminar pipeline"
        >
          <p>¿Quieres eliminar el pipeline «{pipelineToDelete.name}»?</p>
        </Modal>
      ) : null}

      {toast ? <Toast message={toast.message} onClose={() => setToast(null)} type={toast.type} /> : null}
    </>
  )
}

function PipelineRow({
  pipeline,
  isExpanded,
  onToggleStages,
  onEdit,
  onCopy,
  onDelete,
}: {
  pipeline: Pipeline
  isExpanded: boolean
  onToggleStages: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const stagesId = `pipeline-stages-${pipeline.id}`

  return (
    <>
      <tr>
        <td className="px-3 py-3 text-center">
          <button
            aria-controls={stagesId}
            aria-expanded={isExpanded}
            aria-label={`${pipeline.name} etapas`}
            className="rounded p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={onToggleStages}
            type="button"
          >
            <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
          </button>
        </td>
        <td className="px-4 py-3 text-sm font-medium text-slate-900">{pipeline.name}</td>
        <td className="px-4 py-3 text-sm">
          {pipeline.isDefault ? (
            <span
              aria-label="Estado: Default"
              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
            >
              <span aria-hidden="true">D</span><span aria-hidden="true">efault</span>
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Activo
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-sm">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              onClick={onCopy}
              type="button"
            >
              Copiar
            </button>
            {pipeline.isEditable ? (
              <>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onEdit}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-50"
                  onClick={onDelete}
                  type="button"
                >
                  Eliminar
                </button>
              </>
            ) : null}
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="bg-slate-50/70">
          <td className="px-4 py-4" colSpan={4} id={stagesId}>
            <ol aria-label={`Etapas de ${pipeline.name}`} className="flex flex-wrap items-center gap-2">
              {[...pipeline.stages]
                .sort((left, right) => left.position - right.position)
                .map((stage) => (
                  <li
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
                    key={stage.id}
                  >
                    <span className="font-medium text-slate-900">Etapa {stage.position}</span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-400">—</span>
                    <span>{stage.name}</span>
                  </li>
                ))}
            </ol>
          </td>
        </tr>
      ) : null}
    </>
  )
}
