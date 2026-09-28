// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, type ProductState } from '../../shared/product'
import { App } from './App'

function legacyStateWithoutTheme(): ProductState {
  const state = createInitialState()
  delete state.settings.theme
  return state
}

describe('moonim renderer layout and theme', () => {
  const saveState = vi.fn(async () => undefined)

  beforeEach(() => {
    saveState.mockClear()
    window.gentleday = {
      loadState: vi.fn(async () => legacyStateWithoutTheme()),
      saveState,
      chooseVault: vi.fn(async () => null),
      appendEvents: vi.fn(async () => []),
      notify: vi.fn(async () => undefined)
    }
  })

  afterEach(() => cleanup())

  it('places the task-range selector in the task-card heading and omits the old heading', async () => {
    render(<App />)

    const selector = await screen.findByRole('combobox', { name: /show tasks for/i })
    expect(selector.closest('.task-panel')?.querySelector('.section-heading .task-view-select')).not.toBeNull()
    expect(screen.queryByText('Take matters into your own hands')).toBeNull()
    expect([...selector.querySelectorAll('option')].map(option => option.textContent)).toEqual([
      'Today', 'This week', 'This month', 'Calendar'
    ])
  })

  it('renders a legacy theme-less state in light mode and persists explicit dark mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('combobox', { name: /show tasks for/i })
    expect(document.querySelector('.app-shell')?.classList.contains('theme-light')).toBe(true)

    await user.click(screen.getByRole('button', { name: /settings/i }))
    const darkTheme = screen.getByRole('checkbox', { name: /use dark theme/i })
    expect((darkTheme as HTMLInputElement).checked).toBe(false)

    await user.click(darkTheme)
    expect(document.querySelector('.app-shell')?.classList.contains('theme-dark')).toBe(true)
    await waitFor(() => expect(saveState).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ theme: 'dark' })
    })))
  })
})
