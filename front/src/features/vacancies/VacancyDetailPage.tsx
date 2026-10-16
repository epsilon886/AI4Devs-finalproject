import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoadingState } from '../../components/LoadingState.tsx'
import { Modal } from '../../components/Modal.tsx'
import { NotFoundPage } from '../../components/NotFoundPage.tsx'
import { Toast, type ToastType } from '../../components/Toast.tsx'
import { ApiHttpError, apiRequest } from '../../lib/api.ts'
import { VacancyApplications } from './VacancyApplications.tsx'
import {
  VacancyFormModal,
  VacancyStatusBadge,
  type VacancyDetail,
  type VacancyStatus,
} from './VacanciesPage.tsx'

interface ToastState {
  type: ToastType
  message: string
}

interface VacancyPageCache {
  vacancies: Array<{
    id: string
    title: string
    companyName: string
    createdAt: string
    status: VacancyStatus
    pipelineName: string
  }>
}

type Transition = 'open' | 'close' | 'reopen'

export function VacancyDetailPage({ vacancyId }: { vacancyId: string }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [transition, setTransition] = useState<Transition | null>(null)
  const [closeStatus, setCloseStatus] = useState<VacancyStatus>('FILLED')
  const [toast, setToast] = useState<ToastState | null>(null)
  const statusSubmissionLock = useRef(false)
  const vacancyQuery = useQuery({
    queryKey: ['vacancy', vacancyId],
    queryFn: () => apiRequest<VacancyDetail>(`/vacancies/${vacancyId}`),
  })
  const statusMutation = useMutation({
    mutationFn: (status: VacancyStatus) =>
      apiRequest<VacancyDetail>(`/vacancies/${vacancyId}`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: (updatedVacancy) => {
      queryClient.setQueryData(['vacancy', vacancyId], updatedVacancy)
      queryClient.setQueriesData<VacancyPageCache>({ queryKey: ['vacancies'] }, (page) => {
        if (!page) {
          return page
        }

        return {
          ...page,
          vacancies: page.vacancies.map((vacancy) =>
            vacancy.id === updatedVacancy.id
              ? {
                  ...vacancy,
                  title: updatedVacancy.title,
                  companyName: updatedVacancy.companyName,
                  createdAt: updatedVacancy.createdAt,
                  status: updatedVacancy.status,
                  pipelineName: updatedVacancy.pipeline.name,
                }
              : vacancy,
          ),
        }
      })
      void queryClient.invalidateQueries({ queryKey: ['vacancies'] })
      setTransition(null)
      setToast({ type: 'success', message: 'El estado de la vacante se actualizó correctamente.' })
    },
    onError: (error) => {
      setTransition(null)
      setToast({ type: 'error', message: transitionErrorMessage(error) })
    },
    onSettled: () => {
      statusSubmissionLock.current = false
    },
  })

  if (vacancyQuery.isPending) {
    return <LoadingState label="Cargando vacante..." />
  }

  if (vacancyQuery.isError) {
    if (
      vacancyQuery.error instanceof ApiHttpError &&
      vacancyQuery.error.status === 404 &&
      vacancyQuery.error.code === 'VACANCY_NOT_FOUND'
    ) {
      return (
        <NotFoundPage
          action={
            <div className="space-y-3">
              <p className="text-slate-600">No pudimos encontrar esta vacante.</p>
              <Link className="text-sm font-medium text-blue-700 hover:underline" to="/vacancies">
                Volver a Vacantes
              </Link>
            </div>
          }
        />
      )
    }

    return (
      <div className="rounded-lg border border-red-200 bg-white px-6 py-8 text-center">
        <p className="text-slate-700">No pudimos cargar la vacante.</p>
        <button
          className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => void vacancyQuery.refetch()}
          type="button"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const vacancy = vacancyQuery.data

  return (
    <>
      <main className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{vacancy.title}</h1>
              <VacancyStatusBadge status={vacancy.status} />
            </div>
            <p className="mt-2 text-slate-700">{vacancy.companyName}</p>
            <p className="mt-1 text-sm text-slate-600">Creada el {formatDetailDate(vacancy.createdAt)}</p>
          </div>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setIsEditing(true)}
            type="button"
          >
            Editar
          </button>
        </div>

        <div className="mt-6">
          {vacancy.status === 'DRAFT' ? (
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => setTransition('open')}
              type="button"
            >
              Abrir vacante
            </button>
          ) : null}
          {vacancy.status === 'OPEN' ? (
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setTransition('close')}
              type="button"
            >
              Cerrar vacante
            </button>
          ) : null}
          {vacancy.status === 'FILLED' || vacancy.status === 'CANCELLED' ? (
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => setTransition('reopen')}
              type="button"
            >
              Reabrir vacante
            </button>
          ) : null}
        </div>

        <VacancyApplications vacancy={vacancy} />
      </main>

      {isEditing ? (
        <VacancyFormModal
          onClose={() => setIsEditing(false)}
          onSaved={async () => {
            setIsEditing(false)
            setToast({ type: 'success', message: 'La vacante se guardó correctamente.' })
          }}
          onToast={setToast}
          vacancy={vacancy}
        />
      ) : null}

      {transition ? (
        <TransitionModal
          closeStatus={closeStatus}
          onClose={() => {
            if (!statusMutation.isPending) {
              setTransition(null)
            }
          }}
          onCloseStatusChange={setCloseStatus}
          onConfirm={(status) => {
            if (statusSubmissionLock.current) {
              return
            }
            statusSubmissionLock.current = true
            statusMutation.mutate(status)
          }}
          pending={statusMutation.isPending}
          transition={transition}
        />
      ) : null}

      {toast ? <Toast message={toast.message} onClose={() => setToast(null)} type={toast.type} /> : null}
    </>
  )
}

function TransitionModal({
  closeStatus,
  onClose,
  onCloseStatusChange,
  onConfirm,
  pending,
  transition,
}: {
  closeStatus: VacancyStatus
  onClose: () => void
  onCloseStatusChange: (status: VacancyStatus) => void
  onConfirm: (status: VacancyStatus) => void
  pending: boolean
  transition: Transition
}) {
  const details = transitionDetails(transition)
  const nextStatus = transition === 'open' || transition === 'reopen' ? 'OPEN' : closeStatus

  return (
    <Modal
      onClose={onClose}
      open
      primaryAction={{
        disabled: pending,
        label: details.confirmLabel,
        onClick: () => onConfirm(nextStatus),
        pending,
        pendingLabel: 'Actualizando...',
      }}
      title={details.title}
    >
      <p>{details.description}</p>
      {transition === 'close' ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium text-slate-800">Estado final</legend>
          <label className="flex items-center gap-2">
            <input
              checked={closeStatus === 'FILLED'}
              name="close-vacancy-status"
              onChange={() => onCloseStatusChange('FILLED')}
              type="radio"
              value="FILLED"
            />
            Cubierta
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={closeStatus === 'CANCELLED'}
              name="close-vacancy-status"
              onChange={() => onCloseStatusChange('CANCELLED')}
              type="radio"
              value="CANCELLED"
            />
            Cancelada
          </label>
        </fieldset>
      ) : null}
      {pending ? <p className="mt-4 text-sm text-slate-600" role="status">Actualizando vacante...</p> : null}
    </Modal>
  )
}

function transitionDetails(transition: Transition) {
  const details: Record<Transition, { title: string; description: string; confirmLabel: string }> = {
    open: {
      title: 'Abrir vacante',
      description: '¿Quieres abrir esta vacante?',
      confirmLabel: 'Confirmar apertura',
    },
    close: {
      title: 'Cerrar vacante',
      description: 'Selecciona el estado final de esta vacante.',
      confirmLabel: 'Confirmar cierre',
    },
    reopen: {
      title: 'Reabrir vacante',
      description: '¿Quieres reabrir esta vacante?',
      confirmLabel: 'Confirmar reapertura',
    },
  }

  return details[transition]
}

function transitionErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.status === 404 && error.code === 'VACANCY_NOT_FOUND') {
      return 'Esta vacante ya no está disponible.'
    }

    if (error.status === 409 && error.code === 'VACANCY_NOT_OPEN') {
      return 'La vacante no permite esta transición.'
    }

    if (error.status === 400 && error.code === 'VALIDATION_ERROR') {
      return 'No pudimos actualizar el estado de la vacante.'
    }
  }

  return 'No pudimos actualizar el estado de la vacante. Inténtalo de nuevo.'
}

function formatDetailDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
}
