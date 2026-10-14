import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { LoadingState } from '../../components/LoadingState.tsx'
import { Toast, type ToastType } from '../../components/Toast.tsx'
import { ApiHttpError, ApiNetworkError, apiRequest } from '../../lib/api.ts'
import {
  getPipelineCopy,
  pipelineQueryKey,
  setPendingPipelineToast,
  type Pipeline,
} from './PipelinesPage.tsx'

const minimumStages = 3
const maximumStages = 10

interface StageFormValue {
  id?: string
  name: string
}

interface PipelineFormValues {
  name: string
  stages: StageFormValue[]
}

interface ToastState {
  type: ToastType
  message: string
}

interface ClientErrors {
  name?: string
  stages: string[]
}

export function PipelineFormPage({ id, onBack }: { id?: string; onBack: () => void }) {
  const copy = useState(() => getPipelineCopy())[0]
  const isEditing = id !== undefined
  const [activeStages, setActiveStages] = useState(
    Math.max(minimumStages, copy?.stages.length ?? minimumStages),
  )
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientErrors, setClientErrors] = useState<ClientErrors>({ stages: [] })
  const queryClient = useQueryClient()
  const pipelineQuery = useQuery({
    enabled: isEditing,
    queryKey: ['pipelines', id],
    queryFn: () => apiRequest<Pipeline>(`/pipelines/${id}`),
  })
  const {
    clearErrors,
    formState: { errors },
    getValues,
    register,
    reset,
    setError,
    setValue,
  } = useForm<PipelineFormValues>({
    defaultValues: formValuesFromCopy(copy),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const submissionLock = useRef(false)
  const hydratedPipelineId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!isEditing) {
      hydratedPipelineId.current = undefined
      return
    }

    if (!pipelineQuery.data || hydratedPipelineId.current === pipelineQuery.data.id) {
      return
    }

    hydratedPipelineId.current = pipelineQuery.data.id
    reset(formValuesFromPipeline(pipelineQuery.data))
    setActiveStages(Math.max(minimumStages, pipelineQuery.data.stages.length))
  }, [isEditing, pipelineQuery.data, reset])

  const saveMutation = useMutation({
    mutationFn: ({ request }: { request: Promise<Pipeline> }) => request,
    onMutate: () => {
      clearErrors()
      setClientErrors({ stages: [] })
      setToast(null)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pipelineQueryKey })
      setPendingPipelineToast({
        type: 'success',
        message: isEditing ? 'Pipeline actualizado correctamente.' : 'Pipeline creado correctamente.',
      })
      onBack()
    },
    onError: (error) => {
      handleSaveError(error, activeStages, setError, setToast)
    },
    onSettled: () => {
      submissionLock.current = false
      setIsSubmitting(false)
    },
  })

  if (isEditing && pipelineQuery.isPending) {
    return <LoadingState label="Cargando pipeline..." />
  }

  if (isEditing && pipelineQuery.isError) {
    return <PipelineUnavailable onBack={onBack} />
  }

  const pipeline = pipelineQuery.data
  if (isEditing && pipeline && !pipeline.isEditable) {
    return (
      <main className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-900">Editar pipeline</h1>
        <p className="mt-4 text-slate-700">Este pipeline ya no se puede modificar.</p>
        <button
          className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={onBack}
          type="button"
        >
          Volver al listado
        </button>
      </main>
    )
  }

  function submit(values: PipelineFormValues) {
    clearErrors()
    const validationErrors = validateForm(values, activeStages)
    setClientErrors(validationErrors)
    if (validationErrors.name || validationErrors.stages.length > 0) {
      return
    }

    if (submissionLock.current) {
      return
    }

    submissionLock.current = true
    setIsSubmitting(true)
    const body = pipelineRequestBody(values, activeStages, isEditing)
    const request = isEditing
      ? apiRequest<Pipeline>(`/pipelines/${id}`, { method: 'PATCH', body })
      : apiRequest<Pipeline>('/pipelines', { method: 'POST', body })
    saveMutation.mutate({ request })
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit(getValues())
  }

  function toggleStage(position: number) {
    if (position <= minimumStages || position > activeStages + 1) {
      return
    }

    if (position <= activeStages) {
      for (let index = position - 1; index < maximumStages; index += 1) {
        setValue(`stages.${index}.name`, '')
      }
      setActiveStages(position - 1)
      return
    }

    setActiveStages(position)
  }

  return (
    <>
      <main className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isEditing ? 'Editar pipeline' : 'Crear pipeline'}
        </h1>
        <form className="mt-6 space-y-6" noValidate onSubmit={handleFormSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="pipeline-name">
              Nombre del pipeline <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={clientErrors.name || errors.name ? 'pipeline-name-error' : undefined}
              aria-invalid={clientErrors.name || errors.name ? true : undefined}
              className={inputClass(Boolean(clientErrors.name || errors.name))}
              id="pipeline-name"
              maxLength={100}
              {...register('name')}
            />
            {clientErrors.name || errors.name ? (
              <p className="mt-1 text-sm text-red-700" id="pipeline-name-error" role="alert">
                {clientErrors.name ?? errors.name?.message}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-slate-800">Etapas</legend>
            {Array.from({ length: maximumStages }, (_, index) => {
              const position = index + 1
              const isRequired = position <= minimumStages
              const isActive = position <= activeStages
              const canToggle = position > minimumStages && position <= activeStages + 1
              const stageError = clientErrors.stages[index] ?? errors.stages?.[index]?.name?.message
              return (
                <div className="rounded-md border border-slate-200 p-3" key={position}>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-slate-800" htmlFor={`pipeline-stage-${position}`}>
                      Etapa {position} {isRequired ? <span aria-hidden="true">*</span> : null}
                    </label>
                    {!isRequired ? (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          checked={isActive}
                          disabled={!canToggle && !isActive}
                          name={`activate-stage-${position}`}
                          onChange={() => toggleStage(position)}
                          type="checkbox"
                        />
                        Activar etapa {position}
                      </label>
                    ) : null}
                  </div>
                  <input
                    aria-describedby={stageError ? `pipeline-stage-${position}-error` : undefined}
                    aria-invalid={stageError ? true : undefined}
                    className={inputClass(Boolean(stageError))}
                    disabled={!isActive}
                    id={`pipeline-stage-${position}`}
                    maxLength={100}
                    {...register(`stages.${index}.name`)}
                  />
                  {stageError ? (
                    <p
                      className="mt-1 text-sm text-red-700"
                      id={`pipeline-stage-${position}-error`}
                      role="alert"
                    >
                    {stageError}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || saveMutation.isPending}
              onClick={onBack}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              disabled={isSubmitting || saveMutation.isPending}
              type="submit"
            >
              Guardar
            </button>
          </div>
          {isSubmitting || saveMutation.isPending ? (
            <p className="text-sm text-slate-600" role="status">
              Guardando pipeline...
            </p>
          ) : null}
        </form>
      </main>

      {toast ? <Toast message={toast.message} onClose={() => setToast(null)} type={toast.type} /> : null}
    </>
  )
}

function PipelineUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <main className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Editar pipeline</h1>
      <p className="mt-4 text-slate-700">El pipeline no existe o ya no está disponible.</p>
      <button
        className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onClick={onBack}
        type="button"
      >
        Volver al listado
      </button>
    </main>
  )
}

function formValuesFromCopy(copy: ReturnType<typeof getPipelineCopy>): PipelineFormValues {
  const stages = Array.from({ length: maximumStages }, () => ({ name: '' }))
  for (const stage of copy?.stages ?? []) {
    if (stage.position >= 1 && stage.position <= maximumStages) {
      stages[stage.position - 1] = { name: stage.name }
    }
  }

  return { name: copy?.name ?? '', stages }
}

function formValuesFromPipeline(pipeline: Pipeline): PipelineFormValues {
  const stages: StageFormValue[] = Array.from({ length: maximumStages }, () => ({ name: '' }))
  for (const stage of pipeline.stages) {
    if (stage.position >= 1 && stage.position <= maximumStages) {
      stages[stage.position - 1] = { id: stage.id, name: stage.name }
    }
  }

  return { name: pipeline.name, stages }
}

function validateForm(
  values: PipelineFormValues,
  activeStages: number,
): ClientErrors {
  const errors: ClientErrors = { stages: [] }
  const name = values.name.trim()
  if (!name) {
    errors.name = 'El nombre del pipeline es obligatorio.'
  } else if (name.length > 100) {
    errors.name = 'El nombre del pipeline no puede superar 100 caracteres.'
  }

  const normalizedNames = new Set<string>()
  for (let index = 0; index < activeStages; index += 1) {
    const stage = values.stages[index]
    const stageName = stage?.name.trim() ?? ''
    if (!stageName) {
      errors.stages[index] = `La etapa ${index + 1} es obligatoria.`
      continue
    }

    if (stageName.length > 100) {
      errors.stages[index] = `La etapa ${index + 1} no puede superar 100 caracteres.`
    }

    const normalized = stageName.toLocaleLowerCase()
    if (normalizedNames.has(normalized)) {
      errors.stages[index] = 'Las etapas deben tener nombres únicos.'
      continue
    }
    normalizedNames.add(normalized)
  }

  return errors
}

function pipelineRequestBody(
  values: PipelineFormValues,
  activeStages: number,
  isEditing: boolean,
): {
  name: string
  stages: Array<{ id?: string; name: string; position: number }>
} {
  return {
    name: values.name.trim(),
    stages: values.stages.slice(0, activeStages).map((stage, index) => ({
      ...(isEditing && stage.id ? { id: stage.id } : {}),
      name: stage.name.trim(),
      position: index + 1,
    })),
  }
}

function handleSaveError(
  error: unknown,
  activeStages: number,
  setError: ReturnType<typeof useForm<PipelineFormValues>>['setError'],
  setToast: (toast: ToastState) => void,
) {
  if (error instanceof ApiHttpError) {
    if (error.code === 'PIPELINE_NAME_CONFLICT') {
      setError('name', { type: 'server', message: 'Corrige este campo.' })
      for (let index = 0; index < activeStages; index += 1) {
        setError(`stages.${index}.name`, {
          type: 'server',
          message: 'Corrige este campo.',
        })
      }
      setToast({ type: 'error', message: 'Ya existe un pipeline con ese nombre.' })
      return
    }

    if (error.code === 'PIPELINE_NOT_EDITABLE') {
      setToast({ type: 'error', message: 'Este pipeline ya no se puede modificar.' })
      return
    }

    if (error.code === 'PIPELINE_NOT_FOUND') {
      setToast({ type: 'error', message: 'El pipeline no existe o ya no está disponible.' })
      return
    }

    if (error.code === 'PIPELINE_STAGE_NOT_FOUND') {
      setToast({ type: 'error', message: 'Una etapa del pipeline ya no existe o no está disponible.' })
      return
    }

    if (error.code === 'VALIDATION_ERROR') {
      let hasFieldError = false
      for (const fieldError of error.errors ?? []) {
        const stageMatch = /^stages\.(\d+)\.name$/.exec(fieldError.field)
        if (fieldError.field === 'name') {
          setError('name', { type: 'server', message: 'El nombre del pipeline no es válido.' })
          hasFieldError = true
        } else if (stageMatch) {
          const index = Number(stageMatch[1])
          setError(`stages.${index}.name`, {
            type: 'server',
            message: `El nombre de la etapa ${index + 1} es obligatorio.`,
          })
          hasFieldError = true
        }
      }

      if (!hasFieldError) {
        setToast({ type: 'error', message: 'Corrige los campos marcados e inténtalo nuevamente.' })
      } else {
        setToast({ type: 'error', message: 'Corrige los campos marcados e inténtalo nuevamente.' })
      }
      return
    }
  }

  const message = error instanceof ApiNetworkError
    ? 'No pudimos guardar el pipeline. Inténtalo de nuevo.'
    : 'No pudimos guardar el pipeline. Inténtalo de nuevo.'
  setToast({ type: 'error', message })
}

function inputClass(hasError: boolean): string {
  return [
    'mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none focus:border-blue-600',
    hasError ? 'border-red-400' : 'border-slate-300',
  ].join(' ')
}
