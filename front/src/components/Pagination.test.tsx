import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Pagination } from './Pagination.tsx'

it('disables Anterior when there is no previous page', () => {
  render(
    <Pagination page={1} totalPages={3} onPrevious={vi.fn()} onNext={vi.fn()} />,
  )

  expect(screen.getByRole('button', { name: 'Anterior' })).toMatchObject({ disabled: true })
})

it('disables Siguiente when there is no next page', () => {
  render(
    <Pagination page={3} totalPages={3} onPrevious={vi.fn()} onNext={vi.fn()} />,
  )

  expect(screen.getByRole('button', { name: 'Siguiente' })).toMatchObject({ disabled: true })
})

it('calls the matching callback when an enabled pagination control is pressed', () => {
  const onPrevious = vi.fn()
  const onNext = vi.fn()
  render(
    <Pagination page={2} totalPages={3} onPrevious={onPrevious} onNext={onNext} />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

  expect(onPrevious).toHaveBeenCalledTimes(1)
  expect(onNext).toHaveBeenCalledTimes(1)
})

it('does not call callbacks for disabled pagination controls', () => {
  const onPrevious = vi.fn()
  const onNext = vi.fn()
  render(
    <Pagination page={1} totalPages={1} onPrevious={onPrevious} onNext={onNext} />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

  expect(onPrevious).not.toHaveBeenCalled()
  expect(onNext).not.toHaveBeenCalled()
})

it('disables navigation for an empty collection with no pages', () => {
  render(
    <Pagination page={1} totalPages={0} onPrevious={vi.fn()} onNext={vi.fn()} />,
  )

  expect(screen.getByRole('button', { name: 'Anterior' })).toMatchObject({ disabled: true })
  expect(screen.getByRole('button', { name: 'Siguiente' })).toMatchObject({ disabled: true })
})
