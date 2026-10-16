import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { EmptyState } from '../../components/EmptyState.tsx'
import { LoadingState } from '../../components/LoadingState.tsx'
import { Modal } from '../../components/Modal.tsx'
import { Pagination } from '../../components/Pagination.tsx'
import { Toast, type ToastType } from '../../components/Toast.tsx'
import { ApiHttpError, ApiNetworkError, apiRequest } from '../../lib/api.ts'

const pageSize = 10
const vacancyPageSize = 100
const emailPattern = /^[^\s@]+@[^\s@]+$/
const phonePattern = /^(?:[0-9]{6,30}|\+[0-9]{6,29})$/
const candidateQueryKey = ['candidates'] as const
const openVacanciesQueryKey = ['vacancies', { status: 'OPEN', pageSize: vacancyPageSize }] as const

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

interface CandidatePageResponse {
  candidates: Candidate[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface Vacancy {
  id: string
  title: string
  companyName: string
  createdAt: string
  status: 'OPEN'
  pipelineName: string
}

interface VacancyPageResponse {
  vacancies: Vacancy[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface CandidateFormValues {
  firstName: string
  lastName: string
  email: string
  phone: string
}

interface ToastState {
  type: ToastType
  message: string
}

export function CandidatesPage() {
  const [page, setPage] = useState(1)
  const [candidateToEdit, setCandidateToEdit] = useState<Candidate | null>(null)
  const [candidateToAddToVacancy, setCandidateToAddToVacancy] = useState<Candidate | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const queryClient = useQueryClient()
  const candidatesQuery = useQuery({
    queryKey: [...candidateQueryKey, { page, pageSize }],
    queryFn: () =>
      apiRequest<CandidatePageResponse>(`/candidates?page=${page}&pageSize=${pageSize}`),
  })

  function openCreateModal() {
    setCandidateToEdit(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setCandidateToEdit(null)
  }

  const data = candidatesQuery.data

  return (
    <>
      <main className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Candidatos</h1>
          {candidatesQuery.isError || (data !== undefined && data.candidates.length > 0) ? (
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={openCreateModal}
              type="button"
            >
              Crear candidato
            </button>
          ) : null}
        </div>

        <section className="mt-6" aria-label="Listado de candidatos">
          {candidatesQuery.isPending ? <LoadingState label="Cargando candidatos..." /> : null}

          {candidatesQuery.isError ? (
            <div className="rounded-lg border border-red-200 bg-white px-6 py-8 text-center">
              <p className="text-slate-700">No pudimos cargar los candidatos.</p>
              <button
                className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void candidatesQuery.refetch()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {data ? (
            <>
              {data.candidates.length === 0 ? (
                <EmptyState
                  action={
                    <button
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      onClick={openCreateModal}
                      type="button"
                    >
                      Crear candidato
                    </button>
                  }
                  description="Crea un candidato para comenzar a organizar tu proceso de selección."
                  title="No hay candidatos"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.candidates.map((candidate) => (
                    <CandidateCard
                      candidate={candidate}
                      key={candidate.id}
                      onAddToVacancy={() => setCandidateToAddToVacancy(candidate)}
                      onEdit={() => {
                        setCandidateToEdit(candidate)
                        setIsModalOpen(true)
                      }}
                    />
                  ))}
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

      {isModalOpen ? (
        <CandidateFormModal
          candidate={candidateToEdit}
          onClose={closeModal}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: candidateQueryKey })
            closeModal()
            setToast({ type: 'success', message: 'El candidato se guardó correctamente.' })
          }}
          onToast={setToast}
        />
      ) : null}

      {candidateToAddToVacancy ? (
        <AddCandidateToVacancyModal
          candidate={candidateToAddToVacancy}
          onClose={() => setCandidateToAddToVacancy(null)}
          onToast={setToast}
          queryClient={queryClient}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} onClose={() => setToast(null)} type={toast.type} />
      ) : null}
    </>
  )
}

function CandidateCard({
  candidate,
  onAddToVacancy,
  onEdit,
}: {
  candidate: Candidate
  onAddToVacancy: () => void
  onEdit: () => void
}) {
  return (
    <article className="flex min-h-48 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        {candidate.firstName} {candidate.lastName}
      </h2>
      <p className="mt-3 flex min-w-0 items-start gap-2 text-sm text-slate-700">
        <svg
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="m4 6 8 5 8-5" strokeLinecap="round" strokeLinejoin="round" />
          <rect height="14" rx="2" width="18" x="3" y="5" />
        </svg>
        <span className="min-w-0 break-words">{candidate.email}</span>
      </p>
      {candidate.phone ? (
        <p className="mt-2 flex min-w-0 items-start gap-2 text-sm text-slate-700">
          <svg
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 4h3l2 5-2 1.5a14 14 0 0 0 5.5 5.5L15 14l5 2v3a2 2 0 0 1-2 2C10.3 21 3 13.7 3 6a2 2 0 0 1 2-2Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="min-w-0 break-words">{candidate.phone}</span>
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
        <button
          className="rounded-md border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          onClick={onAddToVacancy}
          type="button"
        >
          Agregar a vacante
        </button>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={onEdit}
          type="button"
        >
          Editar
        </button>
      </div>
    </article>
  )
}

function AddCandidateToVacancyModal({
  candidate,
  onClose,
  onToast,
  queryClient,
}: {
  candidate: Candidate
  onClose: () => void
  onToast: (toast: ToastState | null) => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [search, setSearch] = useState('')
  const [selectedVacancyId, setSelectedVacancyId] = useState('')
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [isVacancyListOpen, setIsVacancyListOpen] = useState(false)
  const [activeVacancyIndex, setActiveVacancyIndex] = useState(-1)
  const submissionLock = useRef(false)
  const vacanciesQuery = useQuery({
    queryKey: openVacanciesQueryKey,
    queryFn: getAllOpenVacancies,
  })
  const applicationMutation = useMutation({
    mutationFn: (vacancyId: string) =>
      apiRequest('/applications', {
        method: 'POST',
        body: { candidateId: candidate.id, vacancyId },
      }),
    onMutate: () => {
      setSelectionError(null)
      onToast(null)
    },
    onSuccess: async (_application, vacancyId) => {
      await queryClient.invalidateQueries({ queryKey: ['vacancy-applications', vacancyId] })
      onClose()
      onToast({ type: 'success', message: 'El candidato se agregó a la vacante.' })
    },
    onError: (error) => {
      onToast({ type: 'error', message: applicationErrorMessage(error) })
    },
    onSettled: () => {
      submissionLock.current = false
    },
  })

  const matchingVacancies = (vacanciesQuery.data ?? []).filter((vacancy) => {
    const searchTerm = search.toLocaleLowerCase()
    return (
      vacancy.title.toLocaleLowerCase().includes(searchTerm) ||
      vacancy.companyName.toLocaleLowerCase().includes(searchTerm)
    )
  })

  function selectVacancy(vacancy: Vacancy) {
    setSelectedVacancyId(vacancy.id)
    setSearch(`${vacancy.title} — ${vacancy.companyName}`)
    setSelectionError(null)
    setIsVacancyListOpen(false)
    setActiveVacancyIndex(-1)
  }

  function handleComboboxKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsVacancyListOpen(true)
      setActiveVacancyIndex((currentIndex) =>
        Math.min(currentIndex + 1, matchingVacancies.length - 1),
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIsVacancyListOpen(true)
      setActiveVacancyIndex((currentIndex) => Math.max(currentIndex - 1, 0))
      return
    }

    if (event.key === 'Enter' && isVacancyListOpen && activeVacancyIndex >= 0) {
      const activeVacancy = matchingVacancies[activeVacancyIndex]
      if (activeVacancy) {
        event.preventDefault()
        selectVacancy(activeVacancy)
      }
      return
    }

    if (event.key === 'Escape') {
      setIsVacancyListOpen(false)
      setActiveVacancyIndex(-1)
    }
  }

  function submitApplication() {
    if (!selectedVacancyId) {
      setSelectionError('Selecciona una vacante.')
      return
    }

    if (submissionLock.current) {
      return
    }

    submissionLock.current = true
    applicationMutation.mutate(selectedVacancyId)
  }

  function handleApplicationFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitApplication()
  }

  return (
    <Modal
      open
      title="Agregar a vacante"
      onClose={applicationMutation.isPending ? () => {} : onClose}
      primaryAction={{
        disabled: applicationMutation.isPending,
        label: 'Agregar a vacante',
        onClick: submitApplication,
        pending: applicationMutation.isPending,
        pendingLabel: 'Agregando...',
      }}
    >
      <form
        aria-label="Agregar a vacante"
        className="space-y-4"
        noValidate
        onSubmit={handleApplicationFormSubmit}
      >
        {vacanciesQuery.isPending ? <LoadingState label="Cargando vacantes..." /> : null}

        {vacanciesQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert">
            <p>No pudimos cargar las vacantes.</p>
            <button
              className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              onClick={() => void vacanciesQuery.refetch()}
              type="button"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {vacanciesQuery.data && vacanciesQuery.data.length === 0 ? (
          <p>No hay vacantes abiertas disponibles.</p>
        ) : null}

        {vacanciesQuery.data && vacanciesQuery.data.length > 0 ? (
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="vacancy-combobox">
              Vacante <span aria-hidden="true">*</span>
            </label>
            <div
              className="relative mt-1"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsVacancyListOpen(false)
                  setActiveVacancyIndex(-1)
                }
              }}
            >
              <input
                aria-activedescendant={
                  activeVacancyIndex >= 0
                    ? `candidate-vacancy-option-${matchingVacancies[activeVacancyIndex]?.id}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="candidate-vacancy-options"
                aria-describedby={selectionError ? 'vacancy-id-error' : undefined}
                aria-expanded={isVacancyListOpen}
                aria-haspopup="listbox"
                aria-invalid={selectionError ? true : undefined}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-600"
                id="vacancy-combobox"
                onChange={(event) => {
                  setSearch(event.target.value)
                  setIsVacancyListOpen(true)
                  setActiveVacancyIndex(0)
                }}
                onClick={() => {
                  setIsVacancyListOpen(true)
                  setActiveVacancyIndex(0)
                }}
                onFocus={() => {
                  setIsVacancyListOpen(true)
                  setActiveVacancyIndex(0)
                }}
                onKeyDown={handleComboboxKeyDown}
                placeholder="Busca por título o empresa"
                role="combobox"
                type="text"
                value={search}
              />
              {isVacancyListOpen ? (
                <ul
                  className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg"
                  id="candidate-vacancy-options"
                  role="listbox"
                >
                  {matchingVacancies.map((vacancy, index) => (
                    <li
                      aria-selected={selectedVacancyId === vacancy.id}
                      className={[
                        'cursor-pointer px-3 py-2 text-sm text-slate-800',
                        index === activeVacancyIndex ? 'bg-blue-50' : 'hover:bg-slate-50',
                      ].join(' ')}
                      id={`candidate-vacancy-option-${vacancy.id}`}
                      key={vacancy.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectVacancy(vacancy)}
                      role="option"
                    >
                      <span className="block font-medium">{vacancy.title}</span>
                      <span className="block text-slate-600">{vacancy.companyName}</span>
                    </li>
                  ))}
                  {matchingVacancies.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-600">No hay vacantes que coincidan con la búsqueda.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
            {selectionError ? (
              <p className="mt-1 text-sm text-red-700" id="vacancy-id-error" role="alert">
                {selectionError}
              </p>
            ) : null}
          </div>
        ) : null}

        {applicationMutation.isPending ? (
          <p className="text-sm text-slate-600" role="status">
            Agregando candidato a la vacante...
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

async function getAllOpenVacancies(): Promise<Vacancy[]> {
  const firstPage = await apiRequest<VacancyPageResponse>(
    `/vacancies?page=1&pageSize=${vacancyPageSize}&status=OPEN`,
  )
  const vacancies = [...firstPage.vacancies]

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await apiRequest<VacancyPageResponse>(
      `/vacancies?page=${page}&pageSize=${vacancyPageSize}&status=OPEN`,
    )
    vacancies.push(...nextPage.vacancies)
  }

  return vacancies
}

function applicationErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'APPLICATION_ALREADY_EXISTS') {
      return 'El candidato ya está asociado a esta vacante.'
    }

    if (error.code === 'VACANCY_NOT_OPEN') {
      return 'La vacante ya no está abierta.'
    }

    if (error.code === 'VACANCY_NOT_FOUND') {
      return 'La vacante ya no está disponible.'
    }

    if (error.code === 'CANDIDATE_NOT_FOUND') {
      return 'El candidato ya no está disponible.'
    }

    if (error.code === 'VALIDATION_ERROR') {
      return 'Revisa los datos ingresados.'
    }
  }

  return 'No pudimos agregar el candidato a la vacante. Inténtalo de nuevo.'
}

function CandidateFormModal({
  candidate,
  onClose,
  onSaved,
  onToast,
}: {
  candidate: Candidate | null
  onClose: () => void
  onSaved: () => Promise<void>
  onToast: (toast: ToastState | null) => void
}) {
  const isEditing = candidate !== null
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<CandidateFormValues>({
    defaultValues: {
      firstName: candidate?.firstName ?? '',
      lastName: candidate?.lastName ?? '',
      email: candidate?.email ?? '',
      phone: candidate?.phone ?? '',
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const submissionLock = useRef(false)
  const mutation = useMutation({
    mutationFn: (values: CandidateFormValues) => {
      const body = candidateRequestBody(values)

      return isEditing
        ? apiRequest<Candidate>(`/candidates/${candidate.id}`, { method: 'PATCH', body })
        : apiRequest<Candidate>('/candidates', { method: 'POST', body })
    },
    onMutate: () => {
      clearErrors()
      onToast(null)
    },
    onSuccess: () => onSaved(),
    onError: (error) => {
      if (error instanceof ApiHttpError) {
        if (error.status === 409 && error.code === 'CANDIDATE_EMAIL_CONFLICT') {
          onToast({
            type: 'error',
            message: 'Ya existe un candidato con este correo electrónico.',
          })
          return
        }

        if (error.status === 400 && error.code === 'VALIDATION_ERROR') {
          let hasUnknownFieldError = false

          for (const fieldError of error.errors ?? []) {
            if (
              fieldError.field === 'firstName' ||
              fieldError.field === 'lastName' ||
              fieldError.field === 'email' ||
              fieldError.field === 'phone'
            ) {
              setError(fieldError.field, {
                type: 'server',
                message: serverFieldMessage(fieldError.field),
              })
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

      if (error instanceof ApiNetworkError) {
        onToast({ type: 'error', message: 'No pudimos guardar el candidato. Inténtalo de nuevo.' })
        return
      }

      onToast({ type: 'error', message: 'No pudimos guardar el candidato. Inténtalo de nuevo.' })
    },
    onSettled: () => {
      submissionLock.current = false
    },
  })

  const title = isEditing ? 'Editar candidato' : 'Crear candidato'

  const handleCandidateSubmit = useCallback(
    (values: CandidateFormValues) => {
      if (submissionLock.current) {
        return
      }

      submissionLock.current = true
      mutation.mutate(values)
    },
    [mutation],
  )

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit(handleCandidateSubmit)(event)
  }

  function submitCandidate() {
    void handleSubmit(handleCandidateSubmit)()
  }

  return (
    <Modal
      open
      title={title}
      onClose={mutation.isPending ? () => {} : onClose}
      primaryAction={{
        disabled: mutation.isPending,
        label: 'Guardar candidato',
        onClick: submitCandidate,
        pending: mutation.isPending,
        pendingLabel: 'Guardando...',
      }}
    >
      <form
        aria-label={title}
        className="space-y-4"
        noValidate
        onSubmit={handleFormSubmit}
      >
        <CandidateTextField
          error={errors.firstName?.message}
          id="candidate-first-name"
          label="Nombre"
          maxLength={100}
          registration={register('firstName', {
            required: 'El nombre es obligatorio.',
            validate: {
              notEmpty: (value) => value.trim().length > 0 || 'El nombre no puede estar vacío.',
              maximumLength: (value) =>
                value.trim().length <= 100 || 'El nombre debe tener como máximo 100 caracteres.',
            },
          })}
        />

        <CandidateTextField
          error={errors.lastName?.message}
          id="candidate-last-name"
          label="Apellido"
          maxLength={100}
          registration={register('lastName', {
            required: 'El apellido es obligatorio.',
            validate: {
              notEmpty: (value) => value.trim().length > 0 || 'El apellido no puede estar vacío.',
              maximumLength: (value) =>
                value.trim().length <= 100 || 'El apellido debe tener como máximo 100 caracteres.',
            },
          })}
        />

        <CandidateTextField
          error={errors.email?.message}
          id="candidate-email"
          label="Correo electrónico"
          maxLength={200}
          registration={register('email', {
            required: 'El correo electrónico es obligatorio.',
            validate: {
              format: (value) =>
                emailPattern.test(value.trim()) || 'Ingresa un correo electrónico válido.',
              maximumLength: (value) =>
                value.trim().length <= 200 ||
                'El correo electrónico debe tener como máximo 200 caracteres.',
            },
          })}
          type="email"
        />

        <CandidateTextField
          error={errors.phone?.message}
          id="candidate-phone"
          label="Teléfono"
          maxLength={30}
          registration={register('phone', {
            validate: {
              format: (value) => {
                const phone = value.trim()
                return phone.length === 0 || phonePattern.test(phone) || 'Ingresa un teléfono válido.'
              },
              maximumLength: (value) =>
                value.trim().length <= 30 || 'El teléfono debe tener como máximo 30 caracteres.',
            },
          })}
          required={false}
          type="tel"
        />

        {mutation.isPending ? (
          <p className="text-sm text-slate-600" role="status">
            Guardando candidato...
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

function CandidateTextField({
  error,
  id,
  label,
  maxLength,
  registration,
  required = true,
  type = 'text',
}: {
  error?: string
  id: string
  label: string
  maxLength: number
  registration: UseFormRegisterReturn
  required?: boolean
  type?: 'email' | 'tel' | 'text'
}) {
  const errorId = `${id}-error`

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={[
          'mt-1 w-full rounded-md border px-3 py-2 text-slate-900 outline-none transition',
          error ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-600',
        ].join(' ')}
        id={id}
        maxLength={maxLength}
        type={type}
        {...registration}
      />
      {error ? (
        <p className="mt-1 text-sm text-red-700" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function candidateRequestBody(values: CandidateFormValues) {
  const phone = values.phone.trim()

  return {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: phone === '' ? null : phone,
  }
}

function serverFieldMessage(field: 'firstName' | 'lastName' | 'email' | 'phone'): string {
  return {
    firstName: 'Revisa el nombre.',
    lastName: 'Revisa el apellido.',
    email: 'Revisa el correo electrónico.',
    phone: 'Revisa el teléfono.',
  }[field]
}
