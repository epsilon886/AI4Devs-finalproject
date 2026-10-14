import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export interface ModalProps {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  primaryAction?: {
    label: string
    pendingLabel?: string
    variant?: 'default' | 'destructive'
    onClick: () => void
    disabled?: boolean
    pending?: boolean
  }
}

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, title, children, onClose, primaryAction }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const activeElement = document.activeElement
    previouslyFocusedRef.current =
      activeElement instanceof HTMLElement ? activeElement : null
    closeButtonRef.current?.focus()

    return () => {
      previouslyFocusedRef.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') {
      return
    }

    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    )

    if (focusableElements.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    if (
      event.shiftKey &&
      (activeElement === firstElement || !dialog.contains(activeElement))
    ) {
      event.preventDefault()
      lastElement.focus()
    }

    if (
      !event.shiftKey &&
      (activeElement === lastElement || !dialog.contains(activeElement))
    ) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl sm:p-6"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="Cerrar"
            className="rounded p-1 text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-4 text-slate-700">{children}</div>

        <div className={`mt-6 flex flex-wrap gap-3 ${primaryAction ? 'justify-start' : 'justify-end'}`}>
          {primaryAction ? (
            <button
              className={[
                'rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed',
                primaryAction.variant === 'destructive'
                  ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400',
              ].join(' ')}
              disabled={primaryAction.disabled || primaryAction.pending}
              onClick={primaryAction.onClick}
              type="button"
            >
              {primaryAction.pending && primaryAction.pendingLabel
                ? primaryAction.pendingLabel
                : primaryAction.label}
            </button>
          ) : null}
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
