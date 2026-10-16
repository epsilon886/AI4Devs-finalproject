import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { Modal } from '../../components/Modal.tsx'
import { ApiHttpError, apiRequest } from '../../lib/api.ts'
import type { VacancyDetail } from './VacanciesPage.tsx'

const APPLICATIONS_PAGE_SIZE = 100
const CANDIDATES_PAGE_SIZE = 100
const applicationDateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' })

interface Application {
  id: string
  createdAt: string
  candidate: { id: string; firstName: string; lastName: string }
  currentStage: { id: string; name: string; position: number }
}

interface ApplicationDetail extends Application {
  candidate: Application['candidate'] & { email: string; phone: string | null }
}

interface ApplicationPage {
  applications: Application[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface CandidatePage {
  candidates: Candidate[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

function formatApplicationCount(count: number) {
  return `${count} ${count === 1 ? 'postulación' : 'postulaciones'}`
}

function formatCreatedAt(createdAt: string) {
  return applicationDateFormatter.format(new Date(createdAt))
}

function applicationSummary(application: ApplicationDetail): Application {
  return {
    id: application.id,
    createdAt: application.createdAt,
    candidate: {
      id: application.candidate.id,
      firstName: application.candidate.firstName,
      lastName: application.candidate.lastName,
    },
    currentStage: application.currentStage,
  }
}

function updatedPageMetadata(
  page: ApplicationPage,
  totalItems: number,
  totalPages: number,
): ApplicationPage {
  return {
    ...page,
    totalItems,
    totalPages,
  }
}

function uniqueApplications(pages: ApplicationPage[]) {
  const applicationsById = new Map<string, Application>()
  for (const page of pages) {
    for (const application of page.applications) {
      if (!applicationsById.has(application.id)) {
        applicationsById.set(application.id, application)
      }
    }
  }

  return [...applicationsById.values()]
}

function totalPagesFor(totalItems: number, pageSize: number) {
  return totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
}

function updateMetadata(pages: ApplicationPage[], totalItems: number, pageSize: number) {
  const totalPages = totalPagesFor(totalItems, pageSize)
  return pages.map((page) => updatedPageMetadata(page, totalItems, totalPages))
}

function repaginateLoadedApplications(
  data: InfiniteData<ApplicationPage>,
  applications: Application[],
  totalItems: number,
) {
  const pageSize = data.pages[0]?.pageSize ?? APPLICATIONS_PAGE_SIZE
  const totalPages = totalPagesFor(totalItems, pageSize)
  const pageCount = Math.max(1, Math.ceil(applications.length / pageSize))
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    ...(data.pages[index] ?? data.pages.at(-1)),
    applications: applications.slice(index * pageSize, (index + 1) * pageSize),
    page: index + 1,
    pageSize,
    totalItems,
    totalPages,
  }))

  return {
    ...data,
    pages,
    pageParams: pages.map((page) => page.page),
  }
}

function applyConfirmedApplicationChanges(
  data: InfiniteData<ApplicationPage>,
  changes: ReadonlyMap<string, Application | null>,
) {
  let pages = data.pages
  let totalItems = data.pages.at(-1)?.totalItems ?? 0
  let changed = false

  for (const [applicationId, confirmedApplication] of changes) {
    const hasApplication = pages.some((page) =>
      page.applications.some(({ id }) => id === applicationId),
    )

    if (confirmedApplication === null) {
      if (!hasApplication) continue

      pages = pages.map((page) => ({
        ...page,
        applications: page.applications.filter(({ id }) => id !== applicationId),
      }))
      totalItems = Math.max(0, totalItems - 1)
      changed = true
      continue
    }

    if (hasApplication) {
      const needsReplacement = pages.some((page) =>
        page.applications.some(
          (application) => application.id === applicationId && application !== confirmedApplication,
        ),
      )
      if (!needsReplacement) continue

      pages = pages.map((page) => ({
        ...page,
        applications: page.applications.map((application) =>
          application.id === applicationId ? confirmedApplication : application,
        ),
      }))
      changed = true
      continue
    }

    pages = pages.map((page, index) =>
      index === 0
        ? { ...page, applications: [confirmedApplication, ...page.applications] }
        : page,
    )
    totalItems += 1
    changed = true
  }

  if (!changed) return data

  if (uniqueApplications(pages).length >= totalItems) {
    return repaginateLoadedApplications(data, uniqueApplications(pages), totalItems)
  }

  const pageSize = data.pages[0]?.pageSize ?? APPLICATIONS_PAGE_SIZE
  return {
    ...data,
    pages: updateMetadata(pages, totalItems, pageSize),
  }
}

async function getAllCandidates(): Promise<Candidate[]> {
  const firstPage = await apiRequest<CandidatePage>(
    `/candidates?page=1&pageSize=${CANDIDATES_PAGE_SIZE}`,
  )
  const candidates = [...firstPage.candidates]

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await apiRequest<CandidatePage>(
      `/candidates?page=${page}&pageSize=${CANDIDATES_PAGE_SIZE}`,
    )
    candidates.push(...nextPage.candidates)
  }

  return candidates
}

function addErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'APPLICATION_ALREADY_EXISTS') {
      return 'El candidato ya está asociado a esta vacante.'
    }
    if (error.code === 'CANDIDATE_NOT_FOUND') {
      return 'El candidato seleccionado ya no está disponible.'
    }
    if (error.code === 'VACANCY_NOT_OPEN') return 'La vacante ya no está abierta.'
    if (error.code === 'VACANCY_NOT_FOUND') return 'La vacante ya no está disponible.'
  }

  return 'No pudimos agregar la postulación. Inténtalo de nuevo.'
}

function moveErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'VACANCY_NOT_OPEN') return 'La vacante ya no está abierta.'
    if (error.code === 'APPLICATION_NOT_FOUND') return 'Esta postulación ya no está disponible.'
    if (error.code === 'VALIDATION_ERROR') {
      return 'No pudimos mover la postulación. Revisa los datos.'
    }
  }

  return 'No pudimos mover la postulación. Inténtalo de nuevo.'
}

function removeErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'VACANCY_NOT_OPEN') return 'La vacante ya no está abierta.'
    if (error.code === 'APPLICATION_NOT_FOUND') return 'Esta postulación ya no está disponible.'
  }

  return 'No pudimos eliminar la postulación. Inténtalo de nuevo.'
}

export function VacancyApplications({ vacancy }: { vacancy: VacancyDetail }) {
  const queryClient = useQueryClient()
  const applicationsQueryKey = useMemo(
    () => ['vacancy-applications', vacancy.id] as const,
    [vacancy.id],
  )
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [applicationToMove, setApplicationToMove] = useState<Application | null>(null)
  const [applicationToRemove, setApplicationToRemove] = useState<Application | null>(null)
  const confirmedApplicationChanges = useRef(new Map<string, Application | null>())
  const applicationsQuery = useInfiniteQuery({
    queryKey: applicationsQueryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiRequest<ApplicationPage>(
        `/applications?vacancyId=${vacancy.id}&page=${pageParam}&pageSize=${APPLICATIONS_PAGE_SIZE}`,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    select: (data) =>
      applyConfirmedApplicationChanges(data, confirmedApplicationChanges.current),
  })

  useEffect(() => {
    if (!applicationsQuery.data || confirmedApplicationChanges.current.size === 0) return

    const cachedData = queryClient.getQueryData<InfiniteData<ApplicationPage>>(
      applicationsQueryKey,
    )

    if (!cachedData) return

    const reconciledData = applyConfirmedApplicationChanges(
      cachedData,
      confirmedApplicationChanges.current,
    )

    if (reconciledData !== cachedData) {
      queryClient.setQueryData(applicationsQueryKey, reconciledData)
    }
  }, [applicationsQuery.data, applicationsQueryKey, queryClient, vacancy.id])

  function applyConfirmedApplicationChangesToCache() {
    queryClient.setQueryData<InfiniteData<ApplicationPage>>(applicationsQueryKey, (data) =>
      data
        ? applyConfirmedApplicationChanges(data, confirmedApplicationChanges.current)
        : data,
    )
  }

  function addApplicationToCache(application: ApplicationDetail) {
    const summary = applicationSummary(application)
    confirmedApplicationChanges.current.set(summary.id, summary)
    applyConfirmedApplicationChangesToCache()
  }

  function moveApplicationInCache(application: ApplicationDetail) {
    const summary = applicationSummary(application)
    confirmedApplicationChanges.current.set(summary.id, summary)
    applyConfirmedApplicationChangesToCache()
  }

  function removeApplicationFromCache(applicationId: string) {
    confirmedApplicationChanges.current.set(applicationId, null)
    applyConfirmedApplicationChangesToCache()
  }

  const applications = useMemo(() => {
    const applicationsById = new Map<string, Application>()
    for (const page of applicationsQuery.data?.pages ?? []) {
      for (const application of page.applications) {
        if (!applicationsById.has(application.id)) applicationsById.set(application.id, application)
      }
    }

    return [...applicationsById.values()]
  }, [applicationsQuery.data])
  const stages = useMemo(
    () =>
      [...vacancy.pipeline.stages].sort(
        (firstStage, secondStage) => firstStage.position - secondStage.position,
      ),
    [vacancy.pipeline.stages],
  )
  const isOpen = vacancy.status === 'OPEN'
  const kanbanColumns = useMemo(
    () =>
      stages.map((stage) => {
        const stageApplications = applications.filter(
          (application) => application.currentStage.id === stage.id,
        )

        return (
          <section
            key={stage.id}
            aria-label={`Etapa ${stage.name}`}
            className="w-72 rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <header className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-900">{stage.name}</h2>
              <span className="text-sm text-slate-600">
                {formatApplicationCount(stageApplications.length)}
              </span>
            </header>
            <div className="mt-4 space-y-3">
              {stageApplications.length === 0 ? (
                <p className="text-sm text-slate-500">No hay postulaciones</p>
              ) : (
                stageApplications.map((application) => (
                  <article
                    key={application.id}
                    className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <p className="font-medium text-slate-900">
                      {application.candidate.firstName} {application.candidate.lastName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatCreatedAt(application.createdAt)}
                    </p>
                    {isOpen ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className="text-sm font-medium text-blue-700 hover:text-blue-900"
                          onClick={() => setApplicationToMove(application)}
                        >
                          Mover
                        </button>
                        <button
                          type="button"
                          className="text-sm font-medium text-red-700 hover:text-red-900"
                          onClick={() => setApplicationToRemove(application)}
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        )
      }),
    [applications, isOpen, stages],
  )

  const addApplicationModal = isAddModalOpen ? (
    <AddApplicationModal
      onAdded={(application) => {
        addApplicationToCache(application)
        setIsAddModalOpen(false)
      }}
      onClose={() => setIsAddModalOpen(false)}
      vacancyId={vacancy.id}
    />
  ) : null

  if (applicationsQuery.isPending) {
    return (
      <div
        aria-label="Cargando postulaciones..."
        className="flex items-center justify-center gap-3 py-8 text-slate-600"
        role="status"
      >
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
        />
        <span>Cargando postulaciones...</span>
      </div>
    )
  }

  if (applicationsQuery.isError) {
    return (
      <section aria-label="Postulaciones por etapa" className="mt-8">
        <p>No pudimos cargar las postulaciones.</p>
        <button
          type="button"
          className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => void applicationsQuery.refetch()}
        >
          Reintentar
        </button>
      </section>
    )
  }

  const totalItems = applicationsQuery.data.pages.at(-1)?.totalItems ?? 0

  return (
    <section aria-label="Postulaciones por etapa" className="mt-8">
      {isOpen ? (
        <button
          type="button"
          className="mb-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => setIsAddModalOpen(true)}
        >
          Agregar postulación
        </button>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {kanbanColumns}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-600">
          Mostrando {applications.length} de {totalItems}
        </p>
        {applicationsQuery.hasNextPage ? (
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={applicationsQuery.isFetchingNextPage}
            onClick={() => void applicationsQuery.fetchNextPage()}
          >
            {applicationsQuery.isFetchingNextPage
              ? 'Cargando postulaciones...'
              : 'Cargar más postulaciones'}
          </button>
        ) : null}
      </div>

      {addApplicationModal}
      {applicationToMove ? (
        <MoveApplicationModal
          application={applicationToMove}
          onClose={() => setApplicationToMove(null)}
          onMoved={(application) => {
            moveApplicationInCache(application)
            setApplicationToMove(null)
          }}
          stages={stages}
        />
      ) : null}
      {applicationToRemove ? (
        <RemoveApplicationModal
          application={applicationToRemove}
          onClose={() => setApplicationToRemove(null)}
          onRemoved={() => {
            removeApplicationFromCache(applicationToRemove.id)
            setApplicationToRemove(null)
          }}
        />
      ) : null}
    </section>
  )
}

function AddApplicationModal({
  vacancyId,
  onAdded,
  onClose,
}: {
  vacancyId: string
  onAdded: (application: ApplicationDetail) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submissionLock = useRef(false)
  const candidatesQuery = useQuery({
    queryKey: ['vacancy-application-candidates'],
    queryFn: getAllCandidates,
  })
  const createMutation = useMutation({
    mutationFn: (candidateId: string) =>
      apiRequest<ApplicationDetail>('/applications', {
        method: 'POST',
        body: { candidateId, vacancyId },
      }),
    onMutate: () => setErrorMessage(null),
    onSuccess: onAdded,
    onError: (error) => setErrorMessage(addErrorMessage(error)),
    onSettled: () => {
      submissionLock.current = false
    },
  })
  const matchingCandidates = (candidatesQuery.data ?? []).filter((candidate) => {
    const normalizedSearch = search.toLocaleLowerCase()
    return (
      `${candidate.firstName} ${candidate.lastName}`.toLocaleLowerCase().includes(normalizedSearch) ||
      candidate.email.toLocaleLowerCase().includes(normalizedSearch)
    )
  })

  function submit() {
    if (!selectedCandidateId) {
      setErrorMessage('Selecciona un candidato.')
      return
    }
    if (submissionLock.current) return
    submissionLock.current = true
    createMutation.mutate(selectedCandidateId)
  }

  return (
    <Modal
      open
      title="Agregar postulación"
      onClose={createMutation.isPending ? () => {} : onClose}
      primaryAction={{
        disabled: createMutation.isPending,
        label: 'Agregar postulación',
        onClick: submit,
        pending: createMutation.isPending,
        pendingLabel: 'Agregando...',
      }}
    >
      <div className="space-y-4">
        {candidatesQuery.isPending ? <p>Cargando candidatos...</p> : null}
        {candidatesQuery.isError ? (
          <div role="alert">
            <p>No pudimos cargar los candidatos.</p>
            <button type="button" onClick={() => void candidatesQuery.refetch()}>
              Reintentar
            </button>
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="application-candidate-combobox">
            Candidato <span aria-hidden="true">*</span>
          </label>
          <input
            aria-autocomplete="list"
            aria-controls="application-candidate-options"
            aria-expanded="true"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
            id="application-candidate-combobox"
            onChange={(event) => {
              setSearch(event.target.value)
              setSelectedCandidateId('')
            }}
            role="combobox"
            value={search}
          />
          <ul className="mt-2 max-h-48 overflow-y-auto" id="application-candidate-options" role="listbox">
            {matchingCandidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  aria-selected={selectedCandidateId === candidate.id}
                  className="w-full rounded px-3 py-2 text-left hover:bg-slate-100"
                  onClick={() => {
                    setSelectedCandidateId(candidate.id)
                    setSearch(`${candidate.firstName} ${candidate.lastName} — ${candidate.email}`)
                    setErrorMessage(null)
                  }}
                  role="option"
                  type="button"
                >
                  {candidate.firstName} {candidate.lastName} — {candidate.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {createMutation.isPending ? (
          <p aria-label="Agregando postulación..." role="status">
            Agregando postulación...
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

function MoveApplicationModal({
  application,
  stages,
  onMoved,
  onClose,
}: {
  application: Application
  stages: Application['currentStage'][]
  onMoved: (application: ApplicationDetail) => void
  onClose: () => void
}) {
  const [selectedStageId, setSelectedStageId] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submissionLock = useRef(false)
  const moveMutation = useMutation({
    mutationFn: (currentStageId: string) =>
      apiRequest<ApplicationDetail>(`/applications/${application.id}`, {
        method: 'PATCH',
        body: { currentStageId },
      }),
    onMutate: () => setErrorMessage(null),
    onSuccess: onMoved,
    onError: (error) => setErrorMessage(moveErrorMessage(error)),
    onSettled: () => {
      submissionLock.current = false
    },
  })
  const targetStages = stages.filter((stage) => stage.id !== application.currentStage.id)

  function submit() {
    if (!selectedStageId) {
      setErrorMessage('Selecciona una etapa.')
      return
    }
    if (submissionLock.current) return
    submissionLock.current = true
    moveMutation.mutate(selectedStageId)
  }

  return (
    <Modal
      open
      title="Mover postulación"
      onClose={moveMutation.isPending ? () => {} : onClose}
      primaryAction={{
        disabled: moveMutation.isPending,
        label: 'Mover postulación',
        onClick: submit,
        pending: moveMutation.isPending,
        pendingLabel: 'Moviendo...',
      }}
    >
      <div className="space-y-3">
        <p>Selecciona la nueva etapa para esta postulación.</p>
        {targetStages.map((stage) => (
          <label className="flex items-center gap-2" key={stage.id}>
            <input
              checked={selectedStageId === stage.id}
              name="target-stage"
              onChange={() => setSelectedStageId(stage.id)}
              type="radio"
              value={stage.id}
            />
            {stage.name}
          </label>
        ))}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {moveMutation.isPending ? (
          <p aria-label="Moviendo postulación..." role="status">
            Moviendo postulación...
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

function RemoveApplicationModal({
  application,
  onRemoved,
  onClose,
}: {
  application: Application
  onRemoved: () => void
  onClose: () => void
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submissionLock = useRef(false)
  const removeMutation = useMutation({
    mutationFn: () => apiRequest(`/applications/${application.id}`, { method: 'DELETE' }),
    onMutate: () => setErrorMessage(null),
    onSuccess: onRemoved,
    onError: (error) => setErrorMessage(removeErrorMessage(error)),
    onSettled: () => {
      submissionLock.current = false
    },
  })

  function submit() {
    if (submissionLock.current) return
    submissionLock.current = true
    removeMutation.mutate()
  }

  return (
    <Modal
      open
      title="Eliminar postulación"
      onClose={removeMutation.isPending ? () => {} : onClose}
      primaryAction={{
        disabled: removeMutation.isPending,
        label: 'Eliminar',
        onClick: submit,
        pending: removeMutation.isPending,
        pendingLabel: 'Eliminando...',
        variant: 'destructive',
      }}
    >
      <div className="space-y-3">
        <p>¿Quieres eliminar esta postulación?</p>
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {removeMutation.isPending ? (
          <p aria-label="Eliminando postulación..." role="status">
            Eliminando postulación...
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
