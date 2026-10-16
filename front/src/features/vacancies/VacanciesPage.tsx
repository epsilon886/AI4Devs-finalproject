import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { EmptyState } from '../../components/EmptyState.tsx'
import { LoadingState } from '../../components/LoadingState.tsx'
import { Modal } from '../../components/Modal.tsx'
import { Pagination } from '../../components/Pagination.tsx'
import { Toast, type ToastType } from '../../components/Toast.tsx'
import { ApiHttpError, apiRequest } from '../../lib/api.ts'

const pageSize = 10
const pipelinePageSize = 100
const vacancyQueryKey = ['vacancies'] as const
const statuses = ['DRAFT', 'OPEN', 'FILLED', 'CANCELLED'] as const

export type VacancyStatus = (typeof statuses)[number]

interface VacancySummary {
  id: string
  title: string
  companyName: string
  createdAt: string
  status: VacancyStatus
  pipelineName: string
}

export interface VacancyDetail {
  id: string
  title: string
  companyName: string
  description: string
  createdAt: string
  status: VacancyStatus
  pipeline: VacancyPipeline
}

interface VacancyPipeline {
  name: string
  stages: PipelineStage[]
}

interface VacancyPageResponse {
  vacancies: VacancySummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface PipelineStage {
  id: string
  name: string
  position: number
}

interface Pipeline {
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

interface VacancyFormValues {
  title: string
  companyName: string
  description: string
}

interface ToastState {
  type: ToastType
  message: string
}

export function VacanciesPage({ onView }: { onView?: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const [selectedStatuses, setSelectedStatuses] = useState<VacancyStatus[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [vacancyToEditId, setVacancyToEditId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const queryClient = useQueryClient()
  const statusSearch = selectedStatuses.map((status) => `status=${status}`).join('&')
  const vacancyQuery = useQuery({
    queryKey: [...vacancyQueryKey, { page, pageSize, selectedStatuses }],
    queryFn: () =>
      apiRequest<VacancyPageResponse>(
        `/vacancies?page=${page}&pageSize=${pageSize}${statusSearch ? `&${statusSearch}` : ''}`,
      ),
  })
  const detailQuery = useQuery({
    queryKey: ['vacancy', vacancyToEditId],
    queryFn: () => apiRequest<VacancyDetail>(`/vacancies/${vacancyToEditId}`),
    enabled: vacancyToEditId !== null,
  })

  function changeStatusFilter(status: VacancyStatus) {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((value) => value !== status) : [...current, status],
    )
    setPage(1)
  }

  function closeCreateModal() {
    setIsCreateOpen(false)
  }

  function closeEditModal() {
    setVacancyToEditId(null)
    void queryClient.cancelQueries({ queryKey: ['vacancy'] })
  }

  const data = vacancyQuery.data

  return (
    <>
      <main className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Vacantes</h1>
          {vacancyQuery.isError || (data !== undefined && data.vacancies.length > 0) ? (
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => setIsCreateOpen(true)}
              type="button"
            >
              Crear vacante
            </button>
          ) : null}
        </div>

        <section aria-label="Listado de vacantes" className="mt-6">
          <div aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button
                aria-pressed={selectedStatuses.includes(status)}
                className={[
                  'rounded-full border px-3 py-1.5 text-sm font-medium',
                  selectedStatuses.includes(status)
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                ].join(' ')}
                key={status}
                onClick={() => changeStatusFilter(status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>

          {vacancyQuery.isPending ? <LoadingState label="Cargando vacantes..." /> : null}

          {vacancyQuery.isError ? (
            <div className="rounded-lg border border-red-200 bg-white px-6 py-8 text-center">
              <p className="text-slate-700">No pudimos cargar las vacantes.</p>
              <button
                className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void vacancyQuery.refetch()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {data ? (
            <>
              {data.vacancies.length === 0 ? (
                <EmptyState
                  action={
                    <button
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      onClick={() => setIsCreateOpen(true)}
                      type="button"
                    >
                      Crear vacante
                    </button>
                  }
                  description="Crea una vacante para comenzar a organizar tu proceso de selección."
                  title="No hay vacantes"
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table aria-label="Listado de vacantes" className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-left text-sm text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium" scope="col">Título</th>
                        <th className="px-4 py-3 font-medium" scope="col">Empresa</th>
                        <th className="px-4 py-3 font-medium" scope="col">Fecha de creación</th>
                        <th className="px-4 py-3 font-medium" scope="col">Estado</th>
                        <th className="px-4 py-3 text-right font-medium" scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.vacancies.map((vacancy) => (
                        <tr key={vacancy.id}>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{vacancy.title}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{vacancy.companyName}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{formatDate(vacancy.createdAt)}</td>
                          <td className="px-4 py-3 text-sm"><VacancyStatusBadge status={vacancy.status} /></td>
                          <td className="px-4 py-3 text-right text-sm">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                aria-label={vacancy === data.vacancies[0] ? 'Editar' : `Editar ${vacancy.title}`}
                                className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => setVacancyToEditId(vacancy.id)}
                                type="button"
                              >
                                Editar
                              </button>
                              <button
                                aria-label={vacancy === data.vacancies[0] ? 'Ver' : `Ver ${vacancy.title}`}
                                className="rounded-md border border-blue-600 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-50"
                                onClick={() => onView?.(vacancy.id)}
                                type="button"
                              >
                                Ver
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.totalPages > 0 || data.page > 1 ? (
                <div className="mt-6">
                  <Pagination
                    onNext={() => setPage((current) => current + 1)}
                    onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                    page={data.page}
                    totalPages={data.totalPages}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </main>

      {isCreateOpen ? (
        <VacancyFormModal
          onClose={closeCreateModal}
          onSaved={async (refreshList) => {
            if (refreshList) {
              await queryClient.invalidateQueries({ queryKey: vacancyQueryKey })
            }
            closeCreateModal()
            setToast({ type: 'success', message: 'La vacante se guardó correctamente.' })
          }}
          onToast={setToast}
        />
      ) : null}

      {vacancyToEditId && detailQuery.isPending ? <LoadingState label="Cargando vacante..." /> : null}
      {vacancyToEditId && detailQuery.isError ? (
        <Toast
          message="No pudimos cargar la vacante. Inténtalo de nuevo."
          onClose={closeEditModal}
          type="error"
        />
      ) : null}
      {vacancyToEditId && detailQuery.data ? (
        <VacancyFormModal
          vacancy={detailQuery.data}
          onClose={closeEditModal}
          onSaved={async (refreshList) => {
            if (refreshList) {
              await queryClient.invalidateQueries({ queryKey: vacancyQueryKey })
            }
            closeEditModal()
            setToast({ type: 'success', message: 'La vacante se guardó correctamente.' })
          }}
          onToast={setToast}
        />
      ) : null}

      {toast ? <Toast message={toast.message} onClose={() => setToast(null)} type={toast.type} /> : null}
    </>
  )
}

export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  const styles: Record<VacancyStatus, string> = {
    DRAFT: 'bg-slate-100 text-slate-800',
    OPEN: 'bg-emerald-100 text-emerald-800',
    FILLED: 'bg-amber-100 text-amber-900',
    CANCELLED: 'bg-red-100 text-red-800',
  }

  return (
    <span aria-label={`Estado: ${status}`} className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export function VacancyFormModal({
  vacancy,
  onClose,
  onSaved,
  onToast,
}: {
  vacancy?: VacancyDetail
  onClose: () => void
  onSaved: (refreshList: boolean) => Promise<void>
  onToast: (toast: ToastState | null) => void
}) {
  const isEditing = vacancy !== undefined
  const queryClient = useQueryClient()
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null)
  const [isPipelineListOpen, setIsPipelineListOpen] = useState(false)
  const submissionLock = useRef(false)
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<VacancyFormValues>({
    defaultValues: {
      title: vacancy?.title ?? '',
      companyName: vacancy?.companyName ?? '',
      description: vacancy?.description ?? '',
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const pipelinesQuery = useQuery({
    queryKey: ['vacancy-pipelines'],
    queryFn: getAllPipelines,
    enabled: !isEditing,
  })
  const mutation = useMutation({
    mutationFn: (values: VacancyFormValues) => {
      const descriptiveValues = vacancyRequestBody(values)

      if (isEditing) {
        return apiRequest<VacancyDetail>(`/vacancies/${vacancy.id}`, {
          method: 'PATCH',
          body: descriptiveValues,
        })
      }

      return apiRequest<VacancyDetail>('/vacancies', {
        method: 'POST',
        body: { ...descriptiveValues, pipelineId: selectedPipeline?.id },
      })
    },
    onMutate: () => {
      clearErrors()
      onToast(null)
    },
    onSuccess: async (savedVacancy) => {
      queryClient.setQueryData(['vacancy', savedVacancy.id], savedVacancy)
      queryClient.setQueriesData<VacancyPageResponse>({ queryKey: vacancyQueryKey }, (page) => {
        if (!page) {
          return page
        }

        const summary = vacancySummary(savedVacancy)
        const existingIndex = page.vacancies.findIndex((item) => item.id === summary.id)
        if (existingIndex === -1) {
          return page
        }

        return {
          ...page,
          vacancies: page.vacancies.map((item) => item.id === summary.id ? summary : item),
        }
      })
      await onSaved(!isEditing)
    },
    onError: (error) => {
      if (error instanceof ApiHttpError) {
        if (error.status === 404 && error.code === 'PIPELINE_NOT_FOUND') {
          onToast({ type: 'error', message: 'El pipeline seleccionado ya no está disponible.' })
          return
        }

        if (error.status === 400 && error.code === 'VALIDATION_ERROR') {
          let hasUnknownFieldError = false
          for (const fieldError of error.errors ?? []) {
            if (fieldError.field === 'title' || fieldError.field === 'companyName' || fieldError.field === 'description') {
              setError(fieldError.field, { type: 'server', message: serverFieldMessage(fieldError.field) })
            } else {
              hasUnknownFieldError = true
            }
          }
          if (hasUnknownFieldError || !error.errors?.length) {
            onToast({ type: 'error', message: 'Revisa los datos ingresados.' })
          }
          return
        }
      }

      onToast({ type: 'error', message: 'No pudimos guardar la vacante. Inténtalo de nuevo.' })
    },
    onSettled: () => {
      submissionLock.current = false
    },
  })

  const matchingPipelines = (pipelinesQuery.data ?? []).filter((pipeline) =>
    pipeline.name.toLocaleLowerCase().includes(pipelineSearch.toLocaleLowerCase()),
  )
  const previewStages = (isEditing ? vacancy.pipeline.stages : selectedPipeline?.stages) ?? []
  const title = isEditing ? 'Editar vacante' : 'Crear vacante'

  const submitVacancy = useCallback(
    (values: VacancyFormValues) => {
      if (!isEditing && !selectedPipeline) {
        setError('title', { type: 'manual', message: 'Selecciona un pipeline.' })
        return
      }
      if (submissionLock.current) {
        return
      }
      submissionLock.current = true
      mutation.mutate(values)
    },
    [isEditing, mutation, selectedPipeline, setError],
  )

  function saveVacancy() {
    void handleSubmit(submitVacancy)()
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(submitVacancy)(event)
  }

  function choosePipeline(pipeline: Pipeline) {
    setSelectedPipeline(pipeline)
    setPipelineSearch(pipeline.name)
    setIsPipelineListOpen(false)
  }

  return (
    <Modal
      onClose={mutation.isPending ? () => {} : onClose}
      open
      primaryAction={{
        disabled: mutation.isPending,
        label: 'Guardar vacante',
        onClick: saveVacancy,
        pending: mutation.isPending,
      }}
      title={title}
    >
      <form aria-label={title} className="space-y-4" noValidate onSubmit={handleFormSubmit}>
        <VacancyTextField
          error={errors.title?.message}
          id="vacancy-title"
          label="Título"
          maxLength={200}
          registration={register('title', fieldValidation('El título', 'El título es obligatorio.', 200))}
        />
        <VacancyTextField
          error={errors.companyName?.message}
          id="vacancy-company-name"
          label="Empresa"
          maxLength={200}
          registration={register('companyName', fieldValidation('La empresa', 'La empresa es obligatoria.', 200))}
        />
        <VacancyTextField
          error={errors.description?.message}
          id="vacancy-description"
          label="Descripción"
          maxLength={1500}
          multiline
          registration={register('description', fieldValidation('La descripción', 'La descripción es obligatoria.', 1500))}
        />

        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="vacancy-pipeline-combobox">
            Pipeline
          </label>
          <div className="relative mt-1">
            <input
              aria-autocomplete="list"
              aria-controls="vacancy-pipeline-options"
              aria-expanded={isPipelineListOpen}
              aria-haspopup="listbox"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-600 disabled:bg-slate-100"
              disabled={isEditing}
              id="vacancy-pipeline-combobox"
              onChange={(event) => {
                setPipelineSearch(event.target.value)
                setIsPipelineListOpen(true)
              }}
              onClick={() => setIsPipelineListOpen(true)}
              onFocus={() => setIsPipelineListOpen(true)}
              placeholder="Busca un pipeline"
              role="combobox"
              type="text"
              value={isEditing ? vacancy.pipeline.name : pipelineSearch}
            />
            {!isEditing && isPipelineListOpen ? (
              <ul
                className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg"
                id="vacancy-pipeline-options"
                role="listbox"
              >
                {matchingPipelines.map((pipeline) => (
                  <li
                    aria-selected={selectedPipeline?.id === pipeline.id}
                    className="cursor-pointer px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                    key={pipeline.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choosePipeline(pipeline)}
                    role="option"
                  >
                    {pipeline.name}
                  </li>
                ))}
                {pipelinesQuery.isPending ? <li className="px-3 py-2 text-sm text-slate-600">Cargando pipelines...</li> : null}
                {pipelinesQuery.data && matchingPipelines.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-600">No hay pipelines que coincidan con la búsqueda.</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>

        {previewStages.length > 0 ? (
          <ol aria-label="Etapas del pipeline" className="flex flex-wrap gap-2">
            {[...previewStages]
              .sort((left, right) => left.position - right.position)
              .map((stage) => <li className="rounded border border-slate-200 px-2 py-1 text-sm" key={stage.id}>{stage.name}</li>)}
          </ol>
        ) : null}

        {mutation.isPending ? <p className="text-sm text-slate-600" role="status">Guardando vacante...</p> : null}
      </form>
    </Modal>
  )
}

function VacancyTextField({
  error,
  id,
  label,
  maxLength,
  multiline = false,
  registration,
}: {
  error?: string
  id: string
  label: string
  maxLength: number
  multiline?: boolean
  registration: UseFormRegisterReturn
}) {
  const className = `mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none focus:border-blue-600 ${error ? 'border-red-500' : 'border-slate-300'}`
  const describedBy = error ? `${id}-error` : undefined

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={className} id={id} maxLength={maxLength} rows={4} {...registration} />
      ) : (
        <input aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={className} id={id} maxLength={maxLength} type="text" {...registration} />
      )}
      {error ? <p className="mt-1 text-sm text-red-700" id={`${id}-error`} role="alert">{error}</p> : null}
    </div>
  )
}

function fieldValidation(label: string, requiredMessage: string, maximumLength: number) {
  return {
    required: requiredMessage,
    validate: {
      notEmpty: (value: string) => value.trim().length > 0 || requiredMessage,
      maximumLength: (value: string) =>
        value.trim().length <= maximumLength || `${label} debe tener como máximo ${maximumLength} caracteres.`,
    },
  }
}

function vacancyRequestBody(values: VacancyFormValues) {
  return {
    title: values.title.trim(),
    companyName: values.companyName.trim(),
    description: values.description.trim(),
  }
}

function vacancySummary(vacancy: VacancyDetail): VacancySummary {
  return {
    id: vacancy.id,
    title: vacancy.title,
    companyName: vacancy.companyName,
    createdAt: vacancy.createdAt,
    status: vacancy.status,
    pipelineName: vacancy.pipeline.name,
  }
}

function serverFieldMessage(field: keyof VacancyFormValues): string {
  const fieldMessages: Record<keyof VacancyFormValues, string> = {
    title: 'Revisa el título.',
    companyName: 'Revisa la empresa.',
    description: 'Revisa la descripción.',
  }

  return fieldMessages[field]
}

async function getAllPipelines(): Promise<Pipeline[]> {
  const firstPage = await apiRequest<PipelinePageResponse>(`/pipelines?page=1&pageSize=${pipelinePageSize}`)
  const pipelines = [...firstPage.pipelines]

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await apiRequest<PipelinePageResponse>(`/pipelines?page=${page}&pageSize=${pipelinePageSize}`)
    pipelines.push(...nextPage.pipelines)
  }

  return pipelines
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}
