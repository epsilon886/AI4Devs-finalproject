interface LoadingStateProps {
  label?: string
}

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-slate-600" role="status">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
      />
      <span>{label}</span>
    </div>
  )
}
