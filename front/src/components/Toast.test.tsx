import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Toast, type ToastType } from './Toast.tsx'

afterEach(() => {
  vi.useRealTimers()
})

it.each([
  ['success', 'status'],
  ['warning', 'status'],
  ['error', 'alert'],
] as const)('announces %s messages with the %s role', (type: ToastType, role) => {
  render(<Toast type={type} message="Saved" onClose={vi.fn()} />)

  expect(screen.getByRole(role).textContent).toContain('Saved')
})

it('calls onClose after approximately three seconds', () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  render(<Toast type="success" message="Saved" onClose={onClose} />)

  expect(screen.getByRole('status')).toBeTruthy()
  vi.advanceTimersByTime(2_999)
  expect(onClose).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('cleans up its timer when it disappears', () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  const { unmount } = render(<Toast type="error" message="Failed" onClose={onClose} />)

  expect(screen.getByRole('alert')).toBeTruthy()
  unmount()
  vi.advanceTimersByTime(3_000)

  expect(onClose).not.toHaveBeenCalled()
})
