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
  const saveState = vi.fn(async (_state: ProductState) => undefined)
  let loadedState: ProductState

  beforeEach(() => {
    saveState.mockClear()
    loadedState = legacyStateWithoutTheme()
    window.gentleday = {
      loadState: vi.fn(async () => loadedState),
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

  it('uses the moonim artwork and helper copy for an empty task list without an empty-state heading', async () => {
    render(<App />)

    const emptyArtwork = await screen.findByRole('img', { name: /moonim empty task list/i })
    expect(emptyArtwork.getAttribute('src')).toMatch(/gromit-empty\.png$/)
    expect(screen.getByText('Add a task or choose another view.')).not.toBeNull()
    expect(screen.queryByText('Nothing here yet')).toBeNull()
  })

  it('marks the paused timer message for constrained wrapping inside the timer orbit', async () => {
    const now = Date.now()
    loadedState.activeTimer = {
      id: 'paused-focus',
      kind: 'focus',
      status: 'paused',
      plannedSeconds: 1500,
      startedAtMs: now - 10_000,
      pausedSinceMs: now - 5_000,
      accumulatedActiveMs: 5_000,
      accumulatedPausedMs: 0
    }

    render(<App />)

    const pausedMessage = await screen.findByText('paused · active time is not counting')
    expect(pausedMessage.className).toContain('timer-status')
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

  it('opens a task detail popup with its description and edit/delete actions', async () => {
    const user = userEvent.setup()
    loadedState = createInitialState()
    loadedState.tasks.push({
      id: 'task-details',
      title: 'Plan portfolio review',
      description: 'Collect the strongest interaction design examples.',
      lifeArea: 'Coursework',
      focusMinutes: 30,
      recurrence: 'none',
      occurrenceDate: '2026-09-27',
      status: 'active',
      createdAt: '2026-09-27T08:00:00.000+02:00',
      updatedAt: '2026-09-27T08:00:00.000+02:00'
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /open plan portfolio review/i }))

    const dialog = screen.getByRole('dialog', { name: /plan portfolio review/i })
    expect(dialog.textContent).toContain('Collect the strongest interaction design examples.')
    expect(screen.getByRole('button', { name: /edit task/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /delete task/i })).not.toBeNull()
  })

  it('keeps completed tasks clickable so their details and delete action remain available', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'done-task', title: 'Finished portfolio', description: 'Archived context remains readable.',
      recurrence: 'none', occurrenceDate: today, status: 'completed',
      createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T09:00:00.000Z`, completedAt: `${today}T09:00:00.000Z`
    }]
    render(<App />)

    await user.click(await screen.findByText('1 completed'))
    await user.click(screen.getByRole('button', { name: /^open finished portfolio$/i }))

    expect(screen.getByRole('dialog', { name: /finished portfolio/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /delete task/i })).not.toBeNull()
  })

  it('offers monthly recurrence when creating or editing a task', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /add task/i }))

    expect(screen.getByRole('option', { name: 'Monthly' })).not.toBeNull()
  })

  it('offers explicit occurrence and routine deletion for recurring tasks', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'monthly-task', seriesId: 'monthly-series', title: 'Monthly review',
      recurrence: 'monthly', recurrenceAnchorDate: today, occurrenceDate: today,
      dueDate: today, status: 'active', createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T08:00:00.000Z`
    }]
    render(<App />)

    expect(await screen.findByText('Monthly')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /delete monthly review/i }))

    expect(screen.getByRole('dialog', { name: /delete monthly review/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /delete this occurrence/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /delete whole monthly routine/i })).not.toBeNull()
  })

  it('deletes a one-off task after an explicit in-app confirmation', async () => {
    const user = userEvent.setup()
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'delete-me', title: 'Temporary task', recurrence: 'none', occurrenceDate: '2026-09-29',
      status: 'active', createdAt: '2026-09-29T08:00:00.000Z', updatedAt: '2026-09-29T08:00:00.000Z'
    }]
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /open temporary task/i }))
    await user.click(screen.getByRole('button', { name: /^delete task$/i }))
    await user.click(screen.getByRole('button', { name: /confirm delete task/i }))

    await waitFor(() => expect(saveState).toHaveBeenCalledWith(expect.objectContaining({
      tasks: [expect.objectContaining({ id: 'delete-me', status: 'deleted' })]
    })))
    expect(screen.queryByRole('dialog', { name: /temporary task/i })).toBeNull()
  })

  it('offers only active tasks with durations for focus and adopts the selected duration', async () => {
    const user = userEvent.setup()
    loadedState = createInitialState()
    loadedState.tasks.push(
      {
        id: 'timed-task', title: 'Deep design work', focusMinutes: 40, recurrence: 'none',
        occurrenceDate: '2026-09-29', status: 'active',
        createdAt: '2026-09-29T08:00:00.000+02:00', updatedAt: '2026-09-29T08:00:00.000+02:00'
      },
      {
        id: 'untimed-task', title: 'Loose note', recurrence: 'none',
        occurrenceDate: '2026-09-29', status: 'active',
        createdAt: '2026-09-29T08:00:00.000+02:00', updatedAt: '2026-09-29T08:00:00.000+02:00'
      },
      {
        id: 'finished-task', title: 'Finished timed task', focusMinutes: 20, recurrence: 'none',
        occurrenceDate: '2026-09-29', status: 'completed',
        completedAt: '2026-09-29T08:30:00.000+02:00',
        createdAt: '2026-09-29T08:00:00.000+02:00', updatedAt: '2026-09-29T08:30:00.000+02:00'
      }
    )

    render(<App />)
    const selector = await screen.findByRole('combobox', { name: /link a task/i })
    expect([...selector.querySelectorAll('option')].map(option => option.textContent)).toEqual([
      'No task selected', 'Deep design work · 40 min'
    ])

    await user.selectOptions(selector, 'timed-task')
    expect(screen.getByText('40:00')).not.toBeNull()
  })

  it('clears a linked focus task when editing removes its duration', async () => {
    const user = userEvent.setup()
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'stale-link', title: 'Timed task', focusMinutes: 40, recurrence: 'none',
      occurrenceDate: '2026-09-29', status: 'active',
      createdAt: '2026-09-29T08:00:00.000+02:00', updatedAt: '2026-09-29T08:00:00.000+02:00'
    }]
    render(<App />)

    const selector = await screen.findByRole('combobox', { name: /link a task/i })
    await user.selectOptions(selector, 'stale-link')
    await user.click(screen.getByRole('button', { name: /open timed task/i }))
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.clear(screen.getByRole('spinbutton', { name: /focus duration/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect((selector as HTMLSelectElement).value).toBe(''))
    expect(screen.getByText('25:00')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /start focus/i }))

    expect(await screen.findByText('Stay with this moment')).not.toBeNull()
    await waitFor(() => {
      const savedState = saveState.mock.calls.at(-1)?.[0] as ProductState
      expect(savedState.activeTimer?.taskId).toBeUndefined()
    })
  })

  it('explains how to make tasks linkable when no active task has a duration', async () => {
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'untimed', title: 'Untimed task', recurrence: 'none', occurrenceDate: '2026-09-29',
      status: 'active', createdAt: '2026-09-29T08:00:00.000Z', updatedAt: '2026-09-29T08:00:00.000Z'
    }]
    render(<App />)

    expect(await screen.findByText(/no tasks have a focus duration yet/i)).not.toBeNull()
    expect(screen.getByText(/open a task and choose edit task/i)).not.toBeNull()
  })

  it('celebrates a completed Today list with the daily streak instead of focused minutes', async () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.dailyCompletionDates = [today]
    loadedState.tasks.push(
      {
        id: 'done-one', title: 'First completed step', recurrence: 'none', occurrenceDate: today,
        status: 'completed', completedAt: `${today}T09:00:00.000+02:00`,
        createdAt: `${today}T08:00:00.000+02:00`, updatedAt: `${today}T09:00:00.000+02:00`
      },
      {
        id: 'done-two', title: 'Second completed step', recurrence: 'none', occurrenceDate: today,
        status: 'completed', completedAt: `${today}T10:00:00.000+02:00`,
        createdAt: `${today}T08:00:00.000+02:00`, updatedAt: `${today}T10:00:00.000+02:00`
      }
    )

    render(<App />)
    expect(await screen.findByText("Today's list is complete.")).not.toBeNull()
    expect(screen.getByText('day streak')).not.toBeNull()
    expect(screen.queryByText(/focused minutes/i)).toBeNull()
  })

  it('shows per-task recurrence streaks in History and omits break analytics', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [
      { id: 'journal-1', seriesId: 'journal-series', title: 'Daily journal', recurrence: 'daily', occurrenceDate: yesterday, status: 'completed', createdAt: `${yesterday}T08:00:00.000Z`, updatedAt: `${yesterday}T08:30:00.000Z`, completedAt: `${yesterday}T08:30:00.000Z` },
      { id: 'journal-2', seriesId: 'journal-series', title: 'Daily journal', recurrence: 'daily', occurrenceDate: today, status: 'completed', createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T08:30:00.000Z`, completedAt: `${today}T08:30:00.000Z` }
    ]
    loadedState.sessions = [{
      id: 'break-1', kind: 'short_break', status: 'completed', plannedSeconds: 300,
      activeSeconds: 300, pausedSeconds: 0, startedAt: `${today}T09:00:00.000Z`,
      endedAt: `${today}T09:05:00.000Z`, localDate: today
    }]
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /history/i }))

    expect(screen.getByRole('button', { name: /open daily journal streak details/i })).not.toBeNull()
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && /2\s+day\s+streak/.test(element.textContent ?? ''))).not.toBeNull()
    expect(screen.queryByText(/focused minutes/i)).toBeNull()
    expect(screen.queryByText(/^completed tasks$/i)).toBeNull()
    expect(screen.queryByText(/^rest$/i)).toBeNull()
    expect(screen.queryByText(/^breaks$/i)).toBeNull()
  })

  it('opens recurring task details from its History streak card', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'daily-task', seriesId: 'daily-series', title: 'Daily journal', description: 'Reflect on the day.',
      recurrence: 'daily', occurrenceDate: today, dueDate: today, status: 'completed',
      createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T08:30:00.000Z`, completedAt: `${today}T08:30:00.000Z`
    }]
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /history/i }))
    await user.click(screen.getByRole('button', { name: /open daily journal streak details/i }))

    const dialog = screen.getByRole('dialog', { name: /daily journal/i })
    expect(dialog.textContent).toContain('Reflect on the day.')
  })

  it('removes a recurring streak card after deleting the whole routine', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'routine-task', seriesId: 'routine-series', title: 'Daily journal', recurrence: 'daily',
      occurrenceDate: today, dueDate: today, status: 'completed',
      createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T08:30:00.000Z`, completedAt: `${today}T08:30:00.000Z`
    }]
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /history/i }))
    await user.click(screen.getByRole('button', { name: /open daily journal streak details/i }))
    await user.click(screen.getByRole('button', { name: /^delete task$/i }))
    await user.click(screen.getByRole('button', { name: /delete whole daily routine/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /open daily journal streak details/i })).toBeNull())
    await waitFor(() => expect(saveState).toHaveBeenCalledWith(expect.objectContaining({
      deletedSeriesIds: ['routine-series']
    })))
  })

  it('shows every current task in a clickable All tasks list and excludes deleted tasks', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [
      {
        id: 'active-task', title: 'Plan next prototype', recurrence: 'none', occurrenceDate: today,
        status: 'active', createdAt: `${today}T07:00:00.000Z`, updatedAt: `${today}T07:00:00.000Z`
      },
      {
        id: 'focused-task', title: 'Finish prototype', description: 'Completed through a linked focus session.',
        focusMinutes: 30, recurrence: 'none', occurrenceDate: today, status: 'completed',
        createdAt: `${today}T08:00:00.000Z`, updatedAt: `${today}T08:30:00.000Z`, completedAt: `${today}T08:30:00.000Z`
      },
      {
        id: 'deleted-task', title: 'Removed prototype', recurrence: 'none', occurrenceDate: today,
        status: 'deleted', createdAt: `${today}T06:00:00.000Z`, updatedAt: `${today}T06:30:00.000Z`
      }
    ]
    loadedState.sessions = [{
      id: 'focus-session', kind: 'focus', status: 'completed', taskId: 'focused-task',
      plannedSeconds: 1800, activeSeconds: 1800, pausedSeconds: 0,
      startedAt: `${today}T08:00:00.000Z`, endedAt: `${today}T08:30:00.000Z`, localDate: today
    }]
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /history/i }))
    expect(screen.getByRole('heading', { name: /all tasks/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /open plan next prototype task/i })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /open removed prototype task/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /open finish prototype task/i }))

    expect(screen.getByRole('dialog', { name: /finish prototype/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /edit task/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /delete task/i })).not.toBeNull()
  })

  it('exposes distraction-free mode as a pressed toggle', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = await screen.findByRole('button', { name: /toggle distraction-free focus mode/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    await user.click(toggle)

    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.app-shell')?.classList.contains('distraction-free')).toBe(true)
  })
})
