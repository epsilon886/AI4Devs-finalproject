import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from './App.tsx'

it('renders the frontend bootstrap', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: 'RecruitLane' })).toBeTruthy()
})
