import { useEffect } from 'react'

export type ToastType = 'success' | 'warning' | 'error'

export interface ToastProps {
  type: ToastType
  message: string
  onClose: () => void
}

const stylesByType: Record<ToastType, string> = {
  success: 'border-green-200 text-green-800',
  warning: 'border-amber-200 text-amber-900',
  error: 'border-red-200 text-red-800',
}

export function Toast({ type, message, onClose }: ToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onClose, 3_000)

    return () => window.clearTimeout(timeoutId)
  }, [type, message, onClose])

  return (
    <div
      className={`fixed top-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg ${stylesByType[type]}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      {message}
    </div>
  )
}
