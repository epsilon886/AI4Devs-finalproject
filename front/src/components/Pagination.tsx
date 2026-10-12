export interface PaginationProps {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function Pagination({ page, totalPages, onPrevious, onNext }: PaginationProps) {
  const previousDisabled = page <= 1
  const nextDisabled = totalPages === 0 || page >= totalPages

  return (
    <nav aria-label="Paginación" className="flex flex-wrap justify-center gap-3">
      <button
        className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={previousDisabled}
        onClick={previousDisabled ? undefined : onPrevious}
        type="button"
      >
        Anterior
      </button>
      <button
        className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={nextDisabled}
        onClick={nextDisabled ? undefined : onNext}
        type="button"
      >
        Siguiente
      </button>
    </nav>
  )
}
