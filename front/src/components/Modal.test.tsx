import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { Modal } from './Modal.tsx'

it('exposes an accessible dialog identified by its title', () => {
  render(
    <Modal open title="Delete candidate" onClose={vi.fn()}>
      <p>This action cannot be undone.</p>
    </Modal>,
  )

  const dialog = screen.getByRole('dialog', { name: 'Delete candidate' })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
})

it('requests close through the explicit close and Cancel controls', () => {
  const onClose = vi.fn()
  render(
    <Modal open title="Delete candidate" onClose={onClose}>
      <p>This action cannot be undone.</p>
    </Modal>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onClose).toHaveBeenCalledTimes(2)
})

it('does not request close for Escape or a backdrop interaction', () => {
  const onClose = vi.fn()
  render(
    <Modal open title="Delete candidate" onClose={onClose}>
      <p>This action cannot be undone.</p>
    </Modal>,
  )

  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.mouseDown(document.body)

  expect(onClose).not.toHaveBeenCalled()
})

it('moves focus into the dialog, keeps it there and restores it after closing', () => {
  render(<ModalHarness />)

  const opener = screen.getByRole('button', { name: 'Open modal' })
  opener.focus()
  fireEvent.click(opener)

  const closeButton = screen.getByRole('button', { name: 'Close' })
  const cancelButton = screen.getByRole('button', { name: 'Cancel' })
  expect(document.activeElement).toBe(closeButton)

  cancelButton.focus()
  fireEvent.keyDown(cancelButton, { key: 'Tab' })
  expect(document.activeElement).toBe(closeButton)

  fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(cancelButton)

  fireEvent.click(cancelButton)
  expect(document.activeElement).toBe(opener)
})

function ModalHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open modal
      </button>
      <Modal open={open} title="Delete candidate" onClose={() => setOpen(false)}>
        <button type="button">Confirm</button>
      </Modal>
    </>
  )
}
