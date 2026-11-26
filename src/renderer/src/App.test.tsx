// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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
      loadState: vi.fn(async () => ({ state: loadedState, quarantinedPath: null })),
      saveState,
      chooseVault: vi.fn(async () => null),
      appendEvents: vi.fn(async () => []),
      notify: vi.fn(async () => undefined),
      windowReady: vi.fn(async () => undefined),
      scheduleTimerNotification: vi.fn(async () => undefined)
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

    await screen.findByText('Add a task or choose another view.')
    const emptyArtwork = document.querySelector('.empty-state-image')
    expect(emptyArtwork?.getAttribute('src')).toMatch(/gromit-empty\.png$/)
    expect(emptyArtwork?.getAttribute('alt')).toBe('')
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

  it('offers every active task for focus and adopts its duration or the default', async () => {
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
      'No task selected', 'Deep design work · 40 min', 'Loose note · 25 min'
    ])

    await user.selectOptions(selector, 'timed-task')
    expect(screen.getByText('40:00')).not.toBeNull()
  })

  it('keeps a linked focus task on the default length when editing removes its duration', async () => {
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

    await waitFor(() => expect(screen.getByText('25:00')).not.toBeNull())
    expect((selector as HTMLSelectElement).value).toBe('stale-link')
    await user.click(screen.getByRole('button', { name: /start focus/i }))

    expect(await screen.findByText('Stay with this moment')).not.toBeNull()
    await waitFor(() => {
      const savedState = saveState.mock.calls.at(-1)?.[0] as ProductState
      expect(savedState.activeTimer).toMatchObject({ taskId: 'stale-link', plannedSeconds: 1500 })
    })
  })

  it('explains that tasks without a duration use the default focus length', async () => {
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'untimed', title: 'Untimed task', recurrence: 'none', occurrenceDate: '2026-09-29',
      status: 'active', createdAt: '2026-09-29T08:00:00.000Z', updatedAt: '2026-09-29T08:00:00.000Z'
    }]
    render(<App />)

    expect(await screen.findByText(/use your default of 25 minutes/i)).not.toBeNull()
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

  it('lets a timer default be retyped and saves it when the field is left', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('combobox', { name: /show tasks for/i })
    await user.click(screen.getByRole('button', { name: /settings/i }))

    const focusMinutes = screen.getByRole('spinbutton', { name: /^focus minutes$/i }) as HTMLInputElement
    await user.clear(focusMinutes)
    expect(focusMinutes.value).toBe('')
    await user.type(focusMinutes, '30')
    expect(focusMinutes.value).toBe('30')
    await user.tab()

    await waitFor(() => expect(saveState).toHaveBeenLastCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ focusMinutes: 30 })
    })))
  })

  it('shows a refused save on every screen and keeps the vault dot independent of form messages', async () => {
    const user = userEvent.setup()
    loadedState.settings.vaultPath = '/vault'
    render(<App />)
    await screen.findByRole('combobox', { name: /show tasks for/i })

    await user.click(screen.getByRole('button', { name: /start focus/i }))
    expect(screen.getByText(/choose a task or add a short focus description/i)).not.toBeNull()
    expect(document.querySelector('.status-dot')?.classList.contains('connected')).toBe(true)

    saveState.mockRejectedValueOnce(new Error("Error invoking remote method 'state:save': Error: Refusing to save"))
    await user.click(screen.getByRole('button', { name: /settings/i }))
    await user.click(screen.getByRole('checkbox', { name: /reduce motion/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't save your latest change/i)
  })

  it('splits life areas typed on separate lines', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('combobox', { name: /show tasks for/i })
    await user.click(screen.getByRole('button', { name: /settings/i }))

    const areas = document.querySelector('.setting-card.wide textarea') as HTMLTextAreaElement
    await user.clear(areas)
    await user.type(areas, 'Health{Enter}Work')
    await user.tab()

    await waitFor(() => expect(saveState).toHaveBeenLastCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ lifeAreas: ['Health', 'Work'] })
    })))
    expect(areas.value).toBe('Health, Work')
  })

  it('moves the Today list to the new day when the app stays open past midnight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 26, 23, 59, 58))
    try {
      render(<App />)
      await screen.findByText(/Nov 26, 2026/)
      await act(async () => { vi.advanceTimersByTime(3_000) })
      expect(await screen.findByText(/Nov 27, 2026/)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('jumps back to the current period when the task view changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    const selector = await screen.findByRole('combobox', { name: /show tasks for/i })
    const period = () => document.querySelector('.task-period-controls span')?.textContent
    const todayLabel = period()

    for (let step = 0; step < 3; step += 1) await user.click(screen.getByRole('button', { name: /next day/i }))
    expect(period()).not.toBe(todayLabel)

    await user.selectOptions(selector, 'month')
    expect(period()).toBe(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date()))
    await user.click(screen.getByRole('button', { name: /next month/i }))
    await user.selectOptions(selector, 'today')
    expect(period()).toBe(todayLabel)
  })

  it('closes a dialog with Escape and returns focus to the button that opened it', async () => {
    const user = userEvent.setup()
    render(<App />)
    const addTask = await screen.findByRole('button', { name: /add task/i })
    await user.click(addTask)
    expect(screen.getByRole('dialog', { name: /what matters today/i })).not.toBeNull()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /what matters today/i })).toBeNull()
    expect(document.activeElement).toBe(addTask)
  })

  it('shows a retry screen instead of hanging when saved data cannot be opened', async () => {
    const user = userEvent.setup()
    vi.mocked(window.gentleday.loadState).mockRejectedValueOnce(new Error('EACCES: permission denied'))
    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn't open your saved data.*permission denied/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('combobox', { name: /show tasks for/i })).not.toBeNull()
  })

  it('tells the user when unreadable saved data was set aside', async () => {
    vi.mocked(window.gentleday.loadState).mockResolvedValueOnce({ state: null, quarantinedPath: '/data/state.json.corrupt-1' })
    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/started fresh.*state\.json\.corrupt-1/)
  })

  it('offers to undo a deleted task', async () => {
    const user = userEvent.setup()
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'undo-me', title: 'Keep me', recurrence: 'none', occurrenceDate: '2026-09-29',
      status: 'active', createdAt: '2026-09-29T08:00:00.000Z', updatedAt: '2026-09-29T08:00:00.000Z'
    }]
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /delete keep me/i }))
    await user.click(screen.getByRole('button', { name: /confirm delete task/i }))
    expect(screen.queryByRole('button', { name: /open keep me/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(await screen.findByRole('button', { name: /open keep me/i })).not.toBeNull()
    await waitFor(() => expect(saveState).toHaveBeenLastCalledWith(expect.objectContaining({
      tasks: [expect.objectContaining({ id: 'undo-me', status: 'active' })]
    })))
  })

  it('confirms clearing focus history in an app dialog rather than a browser prompt', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm')
    loadedState.sessions = [{
      id: 'session-1', kind: 'focus', status: 'completed', plannedSeconds: 1500, activeSeconds: 1500, pausedSeconds: 0,
      startedAt: '2026-09-29T08:00:00.000Z', endedAt: '2026-09-29T08:25:00.000Z', localDate: '2026-09-29'
    }]
    render(<App />)
    await screen.findByRole('combobox', { name: /show tasks for/i })
    await user.click(screen.getByRole('button', { name: /history/i }))
    await user.click(screen.getByRole('button', { name: /^clear$/i }))

    expect(screen.getByRole('alertdialog', { name: /clear focus history/i })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: /^clear history$/i }))
    await waitFor(() => expect(saveState).toHaveBeenLastCalledWith(expect.objectContaining({ sessions: [] })))
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('writes a diary page for today and lists finished work for the day', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    loadedState = createInitialState()
    loadedState.tasks = [{
      id: 'done-today', title: 'Water the tomatoes', recurrence: 'none', occurrenceDate: today, status: 'completed',
      completedForDate: today, completedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString()
    }]
    render(<App />)
    await screen.findByRole('combobox', { name: /show tasks for/i })
    await user.click(screen.getByRole('button', { name: /diary/i }))

    expect(screen.getByText('Water the tomatoes')).not.toBeNull()
    await user.type(screen.getByRole('textbox', { name: /write about the day/i }), 'Sunny, and the tomatoes are nearly ripe.')
    await user.tab()

    await waitFor(() => expect(saveState).toHaveBeenLastCalledWith(expect.objectContaining({
      diaryEntries: [expect.objectContaining({ localDate: today, text: 'Sunny, and the tomatoes are nearly ripe.' })]
    })))
    await user.click(screen.getByRole('tab', { name: /written pages/i }))
    expect(screen.getByRole('button', { name: /today.*written/i })).not.toBeNull()
  })
})

