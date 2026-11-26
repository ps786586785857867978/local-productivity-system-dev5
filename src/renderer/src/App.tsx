import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  applyProductCommand,
  createInitialState,
  dailyAppStreak,
  isTaskCountedOnDate,
  isTaskVisibleInView,
  isUpcomingPreview,
  MAX_DIARY_TEXT_LENGTH,
  normalizeLifeAreas,
  recurringTaskStreak,
  type Priority,
  type ProductCommand,
  type ProductState,
  type Recurrence,
  type FocusSession,
  type Task,
  type TaskListView,
  upcomingOccurrences
} from '../../shared/product'
import { readTimer, type TimerKind } from '../../shared/timer'
import gromitEmpty from './assets/gromit-empty.png'
import gromitIcon from './assets/gromit-icon.png'
import gromitScene from './assets/gromit.jpg'
// Freely licensed photos of Aardman models from Wikimedia Commons; credits are listed in Settings.
import closeShaveModels from './assets/close-shave-models.jpg'
import wallaceGromitModels from './assets/wallace-gromit-models.jpg'
import shaunTheSheep from './assets/shaun-the-sheep.jpg'

const DIARY_PHOTOS = [gromitScene, closeShaveModels, wallaceGromitModels]

const PHOTO_CREDITS = [
  ['Wallace & Gromit models', 'Humbledaisy', 'CC BY-SA 4.0'],
  ['A Close Shave models', 'Chemical Engineer', 'CC BY-SA 4.0'],
  ['Shaun the Sheep at Skånes Djurpark', 'Kigsz', 'CC BY-SA 4.0']
] as const
import congratulationsImage from './assets/congratulations.jpeg'

type Screen = 'today' | 'diary' | 'history' | 'settings'
type TaskDraft = {
  title: string
  description: string
  lifeArea: string
  priority: '' | Priority
  dueDate: string
  scheduledTime: string
  focusMinutes: string
  recurrence: Recurrence
}

const emptyDraft = (area = ''): TaskDraft => ({
  title: '', description: '', lifeArea: area, priority: '', dueDate: '', scheduledTime: '', focusMinutes: '', recurrence: 'none'
})

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function offset(date = new Date()): string {
  const total = -date.getTimezoneOffset()
  const sign = total >= 0 ? '+' : '-'
  return `${sign}${pad(Math.floor(Math.abs(total) / 60))}:${pad(Math.abs(total) % 60)}`
}

function localIso(date = new Date()): string {
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}${offset(date)}`
}

function commandContext(date = new Date()) {
  return {
    now: localIso(date),
    nowMs: date.getTime(),
    localDate: localDate(date),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: offset(date),
    id: () => crypto.randomUUID()
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${pad(minutes)}:${pad(seconds % 60)}`
}

function friendlyDate(value?: string): string {
  if (!value) return 'No due date'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

function friendlyTime(value?: string): string | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2000, 0, 1, hours, minutes))
}

function recurrenceLabel(recurrence: Recurrence): string {
  if (recurrence === 'daily') return 'Daily'
  if (recurrence === 'weekly') return 'Weekly'
  if (recurrence === 'monthly') return 'Monthly'
  return 'Does not repeat'
}

function isOverdue(task: Task, today: string): boolean {
  const dueDate = task.recurrence === 'daily'
    ? task.occurrenceDate
    : task.dueDate ?? (task.recurrence === 'none' ? undefined : task.occurrenceDate)
  return task.status === 'active' && dueDate !== undefined && dueDate < today
}

function shiftMonth(month: string, amount: number): string {
  const date = new Date(`${month}-01T12:00:00`)
  date.setMonth(date.getMonth() + amount)
  return localDate(date).slice(0, 7)
}

function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return localDate(date)
}

function taskPeriodLabel(date: string, view: TaskListView): string {
  if (view === 'today') {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      .format(new Date(`${date}T12:00:00`))
  }
  if (view === 'month' || view === 'calendar') {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
      .format(new Date(`${date.slice(0, 7)}-01T12:00:00`))
  }
  const selected = new Date(`${date}T12:00:00`)
  const start = new Date(selected)
  start.setDate(selected.getDate() - ((selected.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const format = (value: Date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value)
  return `${format(start)} – ${format(end)}`
}

function calendarDates(month: string): Array<{ date: string; inMonth: boolean }> {
  const first = new Date(`${month}-01T12:00:00`)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const value = localDate(date)
    return { date: value, inMonth: value.slice(0, 7) === month }
  })
}

function actualDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`
}

// Electron wraps IPC failures as "Error invoking remote method '<channel>': Error: <message>".
function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '').trim()
}

const MAX_TITLE_LENGTH = 300
const MAX_DESCRIPTION_LENGTH = 10_000

function MinutesInput({ label, value, onCommit }: { label: string; value: number; onCommit: (minutes: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const parsed = Number(text)
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setText(String(value))
      return
    }
    const minutes = Math.min(180, Math.max(1, Math.round(parsed)))
    setText(String(minutes))
    if (minutes !== value) onCommit(minutes)
  }
  return <input
    type="number"
    min="1"
    max="180"
    aria-label={`${label} minutes`}
    value={text}
    onChange={event => setText(event.target.value)}
    onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
  />
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Backdrop + dialog behaviour: Escape closes, Tab stays inside, focus returns to where it was. */
function Modal({ onClose, className = 'modal-backdrop', closeOnAnyClick = false, children }: {
  onClose: () => void
  className?: string
  closeOnAnyClick?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // Captured during the first render, before an autoFocus field inside takes focus.
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    const previous = opener.current
    const root = ref.current
    if (root && !root.contains(document.activeElement)) {
      const field = root.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled])')
      ;(field ?? root.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !root) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!root.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return <div
    ref={ref}
    className={className}
    onMouseDown={event => { if (!closeOnAnyClick && event.target === event.currentTarget) onClose() }}
    onClick={() => { if (closeOnAnyClick) onClose() }}
  >{children}</div>
}

type ConfirmRequest = { title: string; body: string; confirmLabel: string; onConfirm: () => void }
type UndoOffer = { message: string; previous: ProductState }

/** The date a task belongs to in lists and the calendar: when it was done, or when it is due. */
function taskDate(task: Task): string {
  return task.status === 'completed'
    ? task.completedForDate ?? task.completedAt?.slice(0, 10) ?? task.dueDate ?? task.occurrenceDate
    : task.dueDate ?? task.occurrenceDate
}

function periodStart(date: string, view: TaskListView): string {
  if (view === 'today') return date
  if (view === 'week') {
    const day = new Date(`${date}T12:00:00`).getDay()
    return shiftDate(date, -((day + 6) % 7))
  }
  return `${date.slice(0, 7)}-01`
}


const DIARY_DAYS_PER_PAGE = 8

function longDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`))
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`))
}

/** A memory book: every day with something done or written, and a page to write about it. */
function DiaryBook({ state, today, onSave }: {
  state: ProductState
  today: string
  onSave: (localDate: string, text: string) => void
}) {
  const [tab, setTab] = useState<'days' | 'written'>('days')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(today)
  const entries = state.diaryEntries ?? []
  const entryFor = (date: string) => entries.find(entry => entry.localDate === date)

  const days = useMemo(() => {
    const done = new Map<string, Task[]>()
    for (const task of state.tasks) {
      if (task.status !== 'completed') continue
      const date = taskDate(task)
      done.set(date, [...(done.get(date) ?? []), task])
    }
    const focus = new Map<string, FocusSession[]>()
    for (const session of state.sessions) {
      if (session.kind !== 'focus' || session.status !== 'completed') continue
      const date = session.localDate ?? session.startedAt.slice(0, 10)
      focus.set(date, [...(focus.get(date) ?? []), session])
    }
    const dates = new Set<string>([today, ...done.keys(), ...focus.keys(), ...entries.map(entry => entry.localDate)])
    return [...dates].sort().reverse().map(date => ({ date, done: done.get(date) ?? [], focus: focus.get(date) ?? [] }))
  }, [state.tasks, state.sessions, entries, today])

  const listed = tab === 'written' ? days.filter(day => entryFor(day.date)) : days
  const pageCount = Math.max(1, Math.ceil(listed.length / DIARY_DAYS_PER_PAGE))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleDays = listed.slice(currentPage * DIARY_DAYS_PER_PAGE, (currentPage + 1) * DIARY_DAYS_PER_PAGE)
  const day = days.find(item => item.date === selected) ?? days[0]
  const focusMinutes = Math.round(day.focus.reduce((total, session) => total + session.activeSeconds, 0) / 60)

  const [draft, setDraft] = useState(entryFor(day.date)?.text ?? '')
  useEffect(() => setDraft(entryFor(day.date)?.text ?? ''), [day.date, entryFor(day.date)?.text])
  const save = () => { if (draft.trim() !== (entryFor(day.date)?.text ?? '')) onSave(day.date, draft) }

  const summary = (item: typeof days[number]) => {
    const parts = [
      item.done.length ? `${item.done.length} done` : '',
      item.focus.length ? `${Math.round(item.focus.reduce((total, session) => total + session.activeSeconds, 0) / 60)} min focus` : '',
      entryFor(item.date) ? 'written' : ''
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : 'A blank page'
  }

  return <section className="diary" aria-label="Diary">
    <div className="diary-tabs" role="tablist" aria-label="Which days to show">
      <button role="tab" aria-selected={tab === 'days'} className={tab === 'days' ? 'active' : ''} onClick={() => { setTab('days'); setPage(0) }}>Every day</button>
      <button role="tab" aria-selected={tab === 'written'} className={tab === 'written' ? 'active' : ''} onClick={() => { setTab('written'); setPage(0) }}>Written pages</button>
    </div>
    <div className="diary-book">
      <div className="diary-page diary-index">
        <h2>Days</h2>
        {visibleDays.length === 0
          ? <div className="diary-empty-state"><img src={shaunTheSheep} alt="" /><p className="diary-empty">Nothing written yet. Pick a day under Every day and write a few lines about it.</p></div>
          : <ol className="diary-days">{visibleDays.map(item => <li key={item.date}>
            <button className={item.date === day.date ? 'active' : ''} aria-current={item.date === day.date ? 'date' : undefined} onClick={() => { save(); setSelected(item.date) }}>
              <strong>{item.date === today ? 'Today' : shortDate(item.date)}</strong>
              <span>{summary(item)}</span>
            </button>
          </li>)}</ol>}
        <div className="diary-pager">
          <button aria-label="Previous page of days" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹</button>
          <span>Page {currentPage + 1} of {pageCount}</span>
          <button aria-label="Next page of days" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>›</button>
        </div>
      </div>
      <div className="diary-page diary-entry">
        <figure className="diary-photo"><img src={DIARY_PHOTOS[Number(day.date.slice(8, 10)) % DIARY_PHOTOS.length]} alt="" /></figure>
        <p className="diary-date">{day.date === today ? 'Today' : shortDate(day.date)}</p>
        <h2>{longDate(day.date)}</h2>
        <div className="diary-memories">
          <h3>What happened</h3>
          {day.done.length === 0 && day.focus.length === 0
            ? <p className="diary-empty">No finished tasks or focus sessions on this day.</p>
            : <ul>
              {day.done.map(task => <li key={task.id}><span aria-hidden="true">✓</span>{task.title}</li>)}
              {day.focus.length > 0 && <li><span aria-hidden="true">◷</span>{focusMinutes} minutes of focus over {day.focus.length} {day.focus.length === 1 ? 'session' : 'sessions'}</li>}
            </ul>}
        </div>
        <label className="diary-writing">Write about the day
          <textarea maxLength={MAX_DIARY_TEXT_LENGTH} value={draft} onChange={event => setDraft(event.target.value)} onBlur={save} placeholder="What made today good? What do you want to remember?" />
        </label>
        <p className="diary-hint">Saved when you click away.</p>
      </div>
    </div>
  </section>
}

export function App() {
  const [state, setState] = useState<ProductState | null>(null)
  const [screen, setScreen] = useState<Screen>('today')
  const [taskView, setTaskView] = useState<TaskListView>('today')
  const [taskPeriodDate, setTaskPeriodDate] = useState(localDate())
  const [calendarMonth, setCalendarMonth] = useState(localDate().slice(0, 7))
  const [nowMs, setNowMs] = useState(Date.now())
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [viewingTask, setViewingTask] = useState<Task | null>(null)
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [draft, setDraft] = useState<TaskDraft>(emptyDraft())
  const [timerKind, setTimerKind] = useState<TimerKind>('focus')
  const [linkedTaskId, setLinkedTaskId] = useState('')
  const [activity, setActivity] = useState('')
  const [distractionFree, setDistractionFree] = useState(false)
  const [vaultError, setVaultError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [formError, setFormError] = useState('')
  const [taskFormError, setTaskFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null)
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false)
  const [lifeAreaText, setLifeAreaText] = useState('')
  const [syncPulse, setSyncPulse] = useState(0)
  const syncing = useRef(false)
  const autoCompleted = useRef(new Set<string>())
  const previousCompletionDates = useRef<string[] | null>(null)

  useEffect(() => {
    let active = true
    setLoadError('')
    window.gentleday.loadState().then(({ state: saved, quarantinedPath }) => {
      if (!active) return
      const initial = applyProductCommand(saved ?? createInitialState(), {
        type: 'day.ensure', localDate: localDate()
      }, commandContext())
      setState(initial)
      setLifeAreaText(initial.settings.lifeAreas.join(', '))
      if (quarantinedPath) {
        setRecoveryNotice(`Your saved data couldn't be read, so moonim started fresh. The old file was kept at ${quarantinedPath}.`)
      }
    }).catch(error => {
      if (!active) return
      setLoadError(readableError(error) || 'The saved data file could not be opened.')
      void window.gentleday.windowReady('light')
    })
    return () => { active = false }
  }, [loadAttempt])

  useEffect(() => {
    if (state) void window.gentleday.windowReady(state.settings.theme ?? 'light')
  }, [state === null, state?.settings.theme])

  useEffect(() => {
    if (!undoOffer) return
    const timeout = window.setTimeout(() => setUndoOffer(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [undoOffer])

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setSyncPulse(value => value + 1), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!state) return
    void window.gentleday.saveState(state).then(async () => {
      setSaveError('')
      const pending = state.outbox.filter(item => !item.deliveredAt)
      if (!state.settings.vaultPath || pending.length === 0 || syncing.current) return
      syncing.current = true
      try {
        const deliveredIds = await window.gentleday.appendEvents(state.settings.vaultPath, pending)
        if (deliveredIds.length) {
          // Delivered events live in the vault now; drop them so the state file doesn't grow forever.
          setState(current => current ? {
            ...current,
            outbox: current.outbox.filter(item => !item.deliveredAt && !deliveredIds.includes(item.id))
          } : current)
        }
        setVaultError('')
      } catch (error) {
        const detail = readableError(error)
        setVaultError(`Couldn't write to your Obsidian vault${detail ? ` (${detail})` : ''}. Events stay queued and will retry.`)
      } finally {
        syncing.current = false
      }
    }).catch(() => setSaveError("moonim couldn't save your latest change, so it may be lost when you quit. Try undoing what you just changed."))
  }, [state, syncPulse])

  const run = (command: ProductCommand) => {
    setUndoOffer(null)
    setState(current => {
      if (!current) return current
      try {
        return applyProductCommand(current, command, commandContext())
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Something went wrong.'
        queueMicrotask(() => setActionError(`That didn't work: ${message}`))
        return current
      }
    })
  }

  const runWithUndo = (command: ProductCommand, message: string) => {
    const previous = state
    run(command)
    if (previous) setUndoOffer({ message, previous })
  }

  const undo = () => {
    if (!undoOffer) return
    const previousEventIds = new Set(undoOffer.previous.outbox.map(item => item.id))
    // Restore everything except events already written to the vault, which must not be sent twice.
    setState(current => current && {
      ...undoOffer.previous,
      outbox: current.outbox.filter(item => previousEventIds.has(item.id))
    })
    setUndoOffer(null)
  }

  const today = localDate(new Date(nowMs))
  const lastEnsuredDate = useRef(today)

  useEffect(() => {
    if (!state || lastEnsuredDate.current === today) return
    const previousDay = lastEnsuredDate.current
    lastEnsuredDate.current = today
    setTaskPeriodDate(current => current === previousDay ? today : current)
    setCalendarMonth(current => current === previousDay.slice(0, 7) ? today.slice(0, 7) : current)
    run({ type: 'day.ensure', localDate: today })
  }, [today, state])

  const moveTaskPeriod = (direction: -1 | 1) => {
    if (taskView === 'today') {
      setTaskPeriodDate(current => shiftDate(current, direction))
    } else if (taskView === 'week') {
      setTaskPeriodDate(current => shiftDate(current, direction * 7))
    } else {
      const nextMonth = shiftMonth(taskPeriodDate.slice(0, 7), direction)
      setTaskPeriodDate(`${nextMonth}-01`)
      setCalendarMonth(nextMonth)
    }
  }
  const taskPeriod = taskView === 'calendar' ? `${calendarMonth}-01` : taskPeriodDate
  const taskPeriodTitle = taskPeriodLabel(taskPeriod, taskView)

  const visibleTasks = useMemo(() => {
    if (!state) return []
    // 40 days past the period start covers any displayed day, week or month.
    const upcoming = upcomingOccurrences(state, today, shiftDate(taskPeriod, 40))
      .filter(task => taskView !== 'today' || task.occurrenceDate === taskPeriodDate)
    return [...state.tasks, ...upcoming].filter(task =>
      isTaskVisibleInView(task, taskView, taskPeriodDate, calendarMonth))
  }, [state?.tasks, state?.deletedSeriesIds, today, taskView, taskPeriod, taskPeriodDate, calendarMonth])
  const allActiveTasks = state?.tasks.filter(task => task.status === 'active') ?? []
  const focusEligibleTasks = allActiveTasks
  useEffect(() => {
    if (linkedTaskId && !focusEligibleTasks.some(task => task.id === linkedTaskId)) {
      setLinkedTaskId('')
    }
  }, [linkedTaskId, state?.tasks])
  const activeTasks = visibleTasks.filter(task => task.status === 'active').sort((left, right) => {
    const leftOverdue = isOverdue(left, today)
    const rightOverdue = isOverdue(right, today)
    return Number(rightOverdue) - Number(leftOverdue) || (left.dueDate ?? left.occurrenceDate).localeCompare(right.dueDate ?? right.occurrenceDate)
  })
  const openTaskCount = activeTasks.filter(task => !isUpcomingPreview(task)).length
  const isFuturePeriod = periodStart(taskPeriodDate, taskView) > today
  const completedTasks = visibleTasks.filter(task => task.status === 'completed')
  const unscheduledCalendarTasks = taskView === 'calendar'
    ? activeTasks.filter(task => task.recurrence === 'none' && !task.dueDate)
    : []
  const completedTodayTasks = state?.tasks.filter(task => task.status === 'completed' && isTaskCountedOnDate(task, today)) ?? []
  const todayTasks = state?.tasks.filter(task => isTaskCountedOnDate(task, today)) ?? []
  const todayListComplete = todayTasks.length > 0 && todayTasks.every(task => task.status === 'completed')
  const realVisibleTaskCount = visibleTasks.filter(task => !isUpcomingPreview(task)).length
  const completionPercent = realVisibleTaskCount ? Math.round((completedTasks.length / realVisibleTaskCount) * 100) : 0
  const timerReading = state?.activeTimer ? readTimer(state.activeTimer, nowMs) : null

  useEffect(() => {
    if (!state) return
    const dates = state.dailyCompletionDates ?? []
    const previouslyRecordedDates = previousCompletionDates.current
    previousCompletionDates.current = [...dates]
    if (previouslyRecordedDates && dates.some(date => !previouslyRecordedDates.includes(date))) {
      setShowCompletionCelebration(true)
    }
  }, [state])

  useEffect(() => {
    if (!showCompletionCelebration) return
    const timeout = window.setTimeout(() => setShowCompletionCelebration(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [showCompletionCelebration])

  useEffect(() => {
    const timer = state?.activeTimer
    if (!timer || timerReading?.status !== 'completed' || autoCompleted.current.has(timer.id)) return
    autoCompleted.current.add(timer.id)
    run({ type: 'timer.complete' })
  }, [state?.activeTimer?.id, timerReading?.status])

  // The main process shows the "time's up" alert, so it fires even with the window closed.
  useEffect(() => {
    if (!state) return
    const timer = state.activeTimer
    const endsAtMs = timer?.status === 'running' && timer.runningSinceMs !== undefined
      ? timer.runningSinceMs + timer.plannedSeconds * 1000 - timer.accumulatedActiveMs
      : null
    void window.gentleday.scheduleTimerNotification(endsAtMs, timer?.kind === 'focus' ? 'Focus session complete' : 'Break complete')
  }, [state === null, state?.activeTimer?.id, state?.activeTimer?.status, state?.activeTimer?.runningSinceMs])

  if (!state) {
    if (loadError) {
      return <div className="loading-shell" role="alert"><img className="loading-gromit" src={gromitIcon} alt="" /><p>moonim couldn't open your saved data ({loadError}). Nothing was changed or overwritten.</p><button className="primary" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button></div>
    }
    return <div className="loading-shell"><img className="loading-gromit" src={gromitIcon} alt="" /><p>Opening moonim…</p></div>
  }

  const pendingEvents = state.outbox.filter(item => !item.deliveredAt).length
  const focusSessions = state.sessions.filter(session => session.kind === 'focus')
  const currentTasks = state.tasks
    .filter(task => task.status !== 'deleted')
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'active' ? -1 : 1
      return right.updatedAt.localeCompare(left.updatedAt)
    })
  const dailyStreak = dailyAppStreak(state.dailyCompletionDates ?? [], today)
  const recurringSeries = [...state.tasks.reduce((series, task) => {
    if (!task.seriesId || task.recurrence === 'none' || task.status === 'deleted' || state.deletedSeriesIds.includes(task.seriesId)) return series
    const current = series.get(task.seriesId)
    if (!current || task.occurrenceDate > current.occurrenceDate ||
      (task.occurrenceDate === current.occurrenceDate && task.updatedAt > current.updatedAt)) {
      series.set(task.seriesId, task)
    }
    return series
  }, new Map<string, Task>()).values()].map(task => ({
    task,
    streak: recurringTaskStreak(state.tasks, task.seriesId!, today),
    unit: task.recurrence === 'daily' ? 'day' : task.recurrence === 'weekly' ? 'week' : 'month'
  }))
  const calendarCells = calendarDates(calendarMonth)
  const calendarTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(new Date(`${calendarMonth}-01T12:00:00`))

  const openCreateTask = () => {
    setEditingTask(null)
    setTaskFormError('')
    setDraft(emptyDraft(state.settings.lifeAreas[0]))
    setTaskDialogOpen(true)
  }

  const openEditTask = (task: Task) => {
    setViewingTask(null)
    setEditingTask(task)
    setTaskFormError('')
    setDraft({
      title: task.title,
      description: task.description ?? '',
      lifeArea: task.lifeArea ?? state.settings.lifeAreas[0] ?? '',
      priority: task.priority ?? '',
      dueDate: task.dueDate ?? '',
      scheduledTime: task.scheduledTime ?? '',
      focusMinutes: task.focusMinutes ? String(task.focusMinutes) : '',
      recurrence: task.recurrence
    })
    setTaskDialogOpen(true)
  }

  const saveTask = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim()) {
      setTaskFormError('Give the task a title.')
      return
    }
    const focusMinutes = draft.focusMinutes === '' ? undefined : Number(draft.focusMinutes)
    if (focusMinutes !== undefined && (!Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 180)) {
      setTaskFormError('Task focus duration must be between 1 and 180 minutes.')
      return
    }
    setTaskFormError('')
    if (editingTask) {
      run({
        type: 'task.edit',
        taskId: editingTask.id,
        changes: {
          title: draft.title,
          description: draft.description,
          lifeArea: draft.lifeArea || undefined,
          priority: draft.priority || undefined,
          dueDate: draft.dueDate || undefined,
          scheduledTime: draft.scheduledTime || undefined,
          focusMinutes,
          recurrence: draft.recurrence
        }
      })
    } else {
      run({
        type: 'task.create',
        title: draft.title,
        description: draft.description,
        lifeArea: draft.lifeArea || undefined,
        priority: draft.priority || undefined,
        dueDate: draft.dueDate || undefined,
        scheduledTime: draft.scheduledTime || undefined,
        focusMinutes,
        recurrence: draft.recurrence
      })
    }
    setTaskDialogOpen(false)
  }

  const requestDeleteTask = (task: Task) => {
    setViewingTask(null)
    setDeletingTask(task)
  }

  const confirmDeleteTask = (scope: 'occurrence' | 'series') => {
    if (!deletingTask) return
    runWithUndo({ type: 'task.delete', taskId: deletingTask.id, scope }, scope === 'series' ? `Deleted the ${deletingTask.recurrence} routine.` : `Deleted “${deletingTask.title}”.`)
    setDeletingTask(null)
  }

  const linkedTask = focusEligibleTasks.find(task => task.id === linkedTaskId)
  const plannedMinutes = timerKind === 'focus'
    ? linkedTask?.focusMinutes ?? state.settings.focusMinutes
    : timerKind === 'short_break'
      ? state.settings.shortBreakMinutes
      : state.settings.longBreakMinutes

  const startTimer = () => {
    const validLinkedTaskId = timerKind === 'focus' && linkedTask ? linkedTask.id : undefined
    if (timerKind === 'focus' && !validLinkedTaskId && !activity.trim()) {
      setFormError('Choose a task or add a short focus description first.')
      return
    }
    setFormError('')
    run({
      type: 'timer.start',
      kind: timerKind,
      plannedSeconds: plannedMinutes * 60,
      taskId: validLinkedTaskId,
      activity: timerKind === 'focus' && !validLinkedTaskId ? activity.trim() || undefined : undefined
    })
  }

  const finishTimer = () => {
    run({ type: 'timer.complete' })
    void window.gentleday.notify('Session recorded', 'Your actual active time was saved. Start the next phase when ready.')
  }

  const chooseVault = async () => {
    const path = await window.gentleday.chooseVault()
    if (path) run({ type: 'settings.update', changes: { vaultPath: path } })
  }

  return (
    <div className={`app-shell theme-${state.settings.theme ?? 'light'} ${distractionFree ? 'distraction-free' : ''} ${state.settings.reducedMotion ? 'reduced-motion' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><img className="brand-mark" src={gromitIcon} alt="" /><strong>moonim</strong></div>
        <nav aria-label="Main navigation">
          <button className={screen === 'today' ? 'active' : ''} aria-current={screen === 'today' ? 'page' : undefined} onClick={() => setScreen('today')}><span aria-hidden="true">◌</span>Today</button>
          <button className={screen === 'diary' ? 'active' : ''} aria-current={screen === 'diary' ? 'page' : undefined} onClick={() => setScreen('diary')}><span aria-hidden="true">❦</span>Diary</button>
          <button className={screen === 'history' ? 'active' : ''} aria-current={screen === 'history' ? 'page' : undefined} onClick={() => setScreen('history')}><span aria-hidden="true">↗</span>History</button>
          <button className={screen === 'settings' ? 'active' : ''} aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => setScreen('settings')}><span aria-hidden="true">⚙</span>Settings</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="vault-status">
          <span className={`status-dot ${state.settings.vaultPath && !vaultError ? 'connected' : ''}`} />
          <div><strong>{state.settings.vaultPath ? 'Obsidian linked' : 'Vault not linked'}</strong><small>{pendingEvents} event{pendingEvents === 1 ? '' : 's'} queued</small></div>
        </div>
      </aside>

      <main>
        {saveError && <div className="notice" role="alert">{saveError}</div>}
        {recoveryNotice && <div className="notice" role="alert">{recoveryNotice} <button className="notice-dismiss" onClick={() => setRecoveryNotice('')}>Dismiss</button></div>}
        {actionError && <div className="notice" role="alert">{actionError} <button className="notice-dismiss" onClick={() => setActionError('')}>Dismiss</button></div>}
        {screen === 'today' && (
          <>
            <header className="page-header today-header">
              <div><p className="eyebrow">TODAY</p><h1>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${today}T12:00:00`))}</h1></div>
              <button className="primary" onClick={openCreateTask}>＋ Add task</button>
            </header>

            {formError && <div className="notice" role="status">{formError}</div>}
            {vaultError && <div className="notice" role="status">{vaultError}</div>}

            <section className="dashboard-grid">
              <div className="task-panel card">
                <div className="section-heading task-heading"><label className="task-view-select"><span>Show tasks for</span><select value={taskView} onChange={event => { setTaskView(event.target.value as TaskListView); setTaskPeriodDate(today); setCalendarMonth(today.slice(0, 7)) }}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="calendar">Calendar</option></select></label><div className="task-period-controls" aria-label="Change task date range"><button type="button" aria-label={`Previous ${taskView === 'today' ? 'day' : taskView === 'week' ? 'week' : 'month'}`} onClick={() => moveTaskPeriod(-1)}>‹</button><span aria-live="polite">{taskPeriodTitle}</span><button type="button" aria-label={`Next ${taskView === 'today' ? 'day' : taskView === 'week' ? 'week' : 'month'}`} onClick={() => moveTaskPeriod(1)}>›</button></div><span className="count-badge">{openTaskCount} open</span></div>
                {state.settings.streaksEnabled && taskView !== 'calendar' && !isFuturePeriod && <>
                  <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
                  <p className="progress-copy">{completionPercent}% complete · one small step at a time</p>
                </>}

                {taskView === 'calendar' ? (
                  <div className="calendar-view">
                    {unscheduledCalendarTasks.length > 0 && <section className="unscheduled-tasks"><div><strong>Unscheduled</strong><span>Tasks without a date stay visible here.</span></div><div>{unscheduledCalendarTasks.map(task => <button key={task.id} onClick={() => setViewingTask(task)}>{task.title}</button>)}</div></section>}
                    
                    <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
                    <div className="calendar-grid">{calendarCells.map(cell => {
                      const dayTasks = visibleTasks.filter(task => !(task.status === 'active' && task.recurrence === 'none' && !task.dueDate) && taskDate(task) === cell.date)
                      return <div className={`calendar-day ${cell.inMonth ? '' : 'outside'} ${cell.date === today ? 'today' : ''}`} key={cell.date}><span>{Number(cell.date.slice(-2))}</span><div>{dayTasks.map(task => <button className={isUpcomingPreview(task) ? 'upcoming' : task.status} title={isUpcomingPreview(task) ? `${task.title} (upcoming)` : task.title} key={task.id} disabled={isUpcomingPreview(task)} onClick={() => setViewingTask(task)}>{friendlyTime(task.scheduledTime) ? `${friendlyTime(task.scheduledTime)} ` : ''}{task.title}</button>)}</div></div>
                    })}</div>
                  </div>
                ) : <>
                  <div className="task-list">
                    {activeTasks.length === 0 && <div className="empty-state"><img className="empty-state-image" src={gromitEmpty} alt="" /><p>Add a task or choose another view.</p></div>}
                    {activeTasks.map(task => isUpcomingPreview(task) ? (
                      <article className="task-row upcoming" key={task.id}>
                        <span className="check" aria-hidden="true" />
                        <div className="task-copy"><strong>{task.title}</strong>{task.description && <span className="task-description-preview">{task.description}</span>}<span className="task-meta"><span className="area-tag">{task.lifeArea || 'General'}</span><span>{friendlyDate(task.occurrenceDate)}</span>{friendlyTime(task.scheduledTime) && <span>{friendlyTime(task.scheduledTime)}</span>}<span>{recurrenceLabel(task.recurrence)} · upcoming</span></span></div>
                      </article>
                    ) : (
                      <article className={`task-row ${isOverdue(task, today) ? 'overdue' : ''}`} key={task.id}>
                        <button className="check" aria-label={`Complete ${task.title}`} onClick={() => run({ type: 'task.complete', taskId: task.id })} />
                        <button className="task-copy task-open" aria-label={`Open ${task.title}`} onClick={() => setViewingTask(task)}><strong>{task.title}{isOverdue(task, today) && <span className="overdue-label"> · OVERDUE</span>}</strong>{task.description && <span className="task-description-preview">{task.description}</span>}<span className="task-meta"><span className="area-tag">{task.lifeArea || 'General'}</span><span>{friendlyDate(task.dueDate)}</span>{friendlyTime(task.scheduledTime) && <span>{friendlyTime(task.scheduledTime)}</span>}{task.focusMinutes && <span>{task.focusMinutes} min focus</span>}{task.recurrence !== 'none' && <span>{recurrenceLabel(task.recurrence)}</span>}{task.priority && <span className={`priority ${task.priority}`}>{task.priority}</span>}</span></button>
                        <div className="row-actions">{task.focusMinutes && <button onClick={() => { setTimerKind('focus'); setLinkedTaskId(task.id); setActivity(task.title) }} aria-label={`Focus on ${task.title}`}>Focus</button>}<button onClick={() => openEditTask(task)} aria-label={`Edit ${task.title}`}>Edit</button><button onClick={() => requestDeleteTask(task)} aria-label={`Delete ${task.title}`}>×</button></div>
                      </article>
                    ))}
                  </div>
                  {completedTasks.length > 0 && <details className="completed-group" open><summary>{completedTasks.length} completed</summary>{completedTasks.map(task => <article className="task-row completed" key={task.id}><button className="check checked" aria-label={`Reopen ${task.title}`} onClick={() => run({ type: 'task.reopen', taskId: task.id })}>✓</button><button className="task-copy task-open" aria-label={`Open ${task.title}`} onClick={() => setViewingTask(task)}><strong>{task.title}</strong>{task.description && <span className="task-description-preview">{task.description}</span>}<span className="task-meta"><span>{task.lifeArea || 'General'}</span></span></button></article>)}</details>}
                </>}
              </div>

              <aside className="focus-panel card">
                <div className="section-heading"><div><span className="kicker">FOCUS</span><h2>{state.activeTimer ? 'Stay with this moment' : 'Choose what to focus on'}</h2></div><button className={`quiet-toggle ${distractionFree ? 'on' : ''}`} onClick={() => setDistractionFree(value => !value)} aria-label="Toggle distraction-free focus mode" aria-pressed={distractionFree} title="In-app distraction-free mode">◐</button></div>

                {!state.activeTimer ? (
                  <>
                    <div className="phase-tabs" role="tablist" aria-label="Session type">
                      <button role="tab" aria-selected={timerKind === 'focus'} className={timerKind === 'focus' ? 'active' : ''} onClick={() => setTimerKind('focus')}>Focus</button>
                      <button role="tab" aria-selected={timerKind === 'short_break'} className={timerKind === 'short_break' ? 'active' : ''} onClick={() => setTimerKind('short_break')}>Short break</button>
                      <button role="tab" aria-selected={timerKind === 'long_break'} className={timerKind === 'long_break' ? 'active' : ''} onClick={() => setTimerKind('long_break')}>Long break</button>
                    </div>
                    <div className="timer-orbit"><div className="timer-display">{formatDuration(plannedMinutes * 60)}</div><small>ready when you are</small></div>
                    <div className="focus-start-zone">
                      {timerKind === 'focus' && <div className="timer-fields"><label>Link a task<select value={linkedTaskId} onChange={event => { setLinkedTaskId(event.target.value); const task = focusEligibleTasks.find(item => item.id === event.target.value); if (task) setActivity(task.title) }}><option value="">No task selected</option>{focusEligibleTasks.map(task => <option value={task.id} key={task.id}>{task.title} · {task.focusMinutes ?? state.settings.focusMinutes} min</option>)}</select></label><p className="focus-link-help">Tasks without their own focus duration use your default of {state.settings.focusMinutes} minutes.</p><label>Or describe your focus<input maxLength={MAX_TITLE_LENGTH} value={activity} onChange={event => setActivity(event.target.value)} placeholder="e.g. Mandarin lesson" /></label></div>}
                      <button className="start-button" onClick={startTimer}>Start {timerKind === 'focus' ? 'focus' : 'break'}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`timer-orbit running ${state.activeTimer.status === 'paused' ? 'paused' : ''}`}><div className="timer-display">{formatDuration(timerReading?.remainingSeconds ?? 0)}</div><small className="timer-status">{state.activeTimer.status === 'paused' ? 'paused · active time is not counting' : 'active time counting'}</small></div>
                    <div className="current-activity">{state.activeTimer.taskId ? state.tasks.find(task => task.id === state.activeTimer?.taskId)?.title : state.activeTimer.activity || (state.activeTimer.kind === 'focus' ? 'Focused work' : 'Rest and reset')}</div>
                    <div className="timer-actions">
                      {state.activeTimer.status === 'running' ? <button className="secondary" onClick={() => run({ type: 'timer.pause' })}>Pause</button> : <button className="secondary" onClick={() => run({ type: 'timer.resume' })}>Resume</button>}
                      <button className="primary" onClick={finishTimer}>Complete</button>
                      <button className="danger-text" onClick={() => setConfirmRequest({ title: 'Stop this session?', body: 'It will be recorded as cancelled, with the active time so far.', confirmLabel: 'Stop session', onConfirm: () => run({ type: 'timer.cancel' }) })}>Stop</button>
                    </div>
                    <div className="session-stats"><span><strong>{Math.floor((timerReading?.activeSeconds ?? 0) / 60)}</strong> active min</span><span><strong>{Math.floor((timerReading?.pausedSeconds ?? 0) / 60)}</strong> paused min</span></div>
                  </>
                )}
              </aside>
            </section>

            {state.settings.streaksEnabled && <section className="day-summary card"><img className="growth-gromit" src={gromitScene} alt="Gromit knitting" /><div><span className="kicker">TODAY'S GROWTH</span><h3>{todayListComplete ? "Today's list is complete." : completedTodayTasks.length === 0 ? 'The day is still opening.' : completedTodayTasks.length === 1 ? 'One meaningful step is complete.' : `${completedTodayTasks.length} meaningful steps are complete.`}</h3><p>{todayListComplete ? `You extended your streak to ${dailyStreak.current} ${dailyStreak.current === 1 ? 'day' : 'days'}.` : 'Complete the whole Today list to extend your streak.'}</p></div><div className="summary-stat"><strong>{dailyStreak.current}</strong><span>day streak</span></div></section>}
          </>
        )}

        {screen === 'diary' && (
          <section className="page-stack">
            <header className="page-header"><div><p className="eyebrow">DIARY</p><h1>Your memory book.</h1></div></header>
            <DiaryBook state={state} today={today} onSave={(localDate, text) => run({ type: 'diary.save', localDate, text })} />
          </section>
        )}

        {screen === 'history' && (
          <section className="page-stack">
            <header className="page-header"><div><p className="eyebrow">LOCAL HISTORY</p><h1>A record of your progress.</h1></div></header>
            <section className="card recurrence-history"><div className="section-heading"><div><span className="kicker">CONSISTENCY</span><h2>Recurring task streaks</h2></div></div>{recurringSeries.length === 0 ? <p className="muted">Daily, weekly, and monthly task streaks will appear here.</p> : <div className="streak-list">{recurringSeries.map(({ task, streak, unit }) => <button type="button" className="streak-task-button" aria-label={`Open ${task.title} streak details`} key={task.seriesId} onClick={() => setViewingTask(task)}><div><strong>{task.title}</strong><p>{task.recurrence} · best {streak.best} {streak.best === 1 ? unit : `${unit}s`}</p></div><span><strong>{streak.current}</strong> {unit} streak</span></button>)}</div>}</section>
            <section className="card task-history"><div className="section-heading"><div><span className="kicker">TASKS</span><h2>All tasks</h2></div>{currentTasks.length > 0 && <button className="clear-history" onClick={() => setConfirmRequest({ title: 'Clear all tasks?', body: 'Every task is removed from this device and recurring routines stop. Your Obsidian records remain.', confirmLabel: 'Clear all tasks', onConfirm: () => runWithUndo({ type: 'task.history.clear' }, 'Cleared all tasks.') })}>Clear all</button>}</div>{currentTasks.length === 0 ? <p className="muted">You do not have any tasks yet.</p> : <div className="task-history-list">{currentTasks.map(task => <div className="task-history-row" key={task.id}><button type="button" aria-label={`Open ${task.title} task`} onClick={() => setViewingTask(task)}><span><strong>{task.title}</strong><small>{task.status === 'active' ? 'Active' : 'Completed'}{task.description ? ` · ${task.description}` : task.lifeArea ? ` · ${task.lifeArea}` : ''}</small></span><time>{task.status === 'completed' ? friendlyDate(task.completedForDate ?? task.completedAt?.slice(0, 10) ?? task.updatedAt.slice(0, 10)) : friendlyDate(task.dueDate ?? task.occurrenceDate)}</time></button><button type="button" className="task-history-delete" aria-label={`Remove ${task.title} from task history`} title="Remove this task occurrence" onClick={() => requestDeleteTask(task)}>×</button></div>)}</div>}</section>
            <div className="card history-list"><div className="section-heading"><div><span className="kicker">FOCUS</span><h2>Sessions</h2></div>{focusSessions.length > 0 && <button className="clear-history" onClick={() => setConfirmRequest({ title: 'Clear focus history?', body: 'Focus sessions are removed from this device. Your Obsidian records remain.', confirmLabel: 'Clear history', onConfirm: () => runWithUndo({ type: 'history.clear', kind: 'focus' }, 'Cleared focus history.') })}>Clear</button>}</div><div className="history-scroll">{focusSessions.length === 0 ? <p className="muted">Completed and cancelled focus sessions will appear here.</p> : [...focusSessions].reverse().map(session => <article key={session.id}><span className={`history-icon ${session.status}`}>{session.status === 'completed' ? '✓' : '×'}</span><div><strong>{session.activity || state.tasks.find(task => task.id === session.taskId)?.title || 'Focused work'}</strong><p>{actualDuration(session.activeSeconds)} active · {session.status}</p></div><time>{new Date(session.startedAt).toLocaleDateString()}</time></article>)}</div></div>
          </section>
        )}

        {screen === 'settings' && (
          <section className="page-stack settings-page">
            <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>Shape moonim around you.</h1></div></header>
            <div className="settings-grid">
              <section className="card setting-card"><span className="kicker">OBSIDIAN</span><h2>Append-only activity vault</h2><p>Task, focus, and break events are stored in predictable Markdown folders. If your vault is unavailable, events stay queued locally and retry every 30 seconds.</p><div className="path-box">{state.settings.vaultPath || 'No vault selected'}</div><div className="button-row"><button className="primary" onClick={chooseVault}>{state.settings.vaultPath ? 'Change vault' : 'Choose vault'}</button>{pendingEvents > 0 && state.settings.vaultPath && <button className="secondary" onClick={() => setSyncPulse(value => value + 1)}>Retry now</button>}</div></section>
              <section className="card setting-card"><span className="kicker">TIMER DEFAULTS</span><h2>Session lengths</h2><div className="duration-grid">{([['focusMinutes', 'Focus'], ['shortBreakMinutes', 'Short break'], ['longBreakMinutes', 'Long break']] as const).map(([key, label]) => <label key={key}>{label}<span><MinutesInput label={label} value={state.settings[key]} onCommit={minutes => run({ type: 'settings.update', changes: { [key]: minutes } })} /> minutes</span></label>)}</div></section>
              <section className="card setting-card wide"><span className="kicker">LIFE AREAS</span><h2>Your editable categories</h2><p>Separate areas with commas or new lines. Existing tasks keep their current labels.</p><textarea value={lifeAreaText} onChange={event => setLifeAreaText(event.target.value)} onBlur={() => { const areas = normalizeLifeAreas([lifeAreaText]); if (areas.length) run({ type: 'settings.update', changes: { lifeAreas: areas } }); setLifeAreaText((areas.length ? areas : state.settings.lifeAreas).join(', ')) }} /><div className="tag-preview">{state.settings.lifeAreas.map(area => <span key={area}>{area}</span>)}</div></section>
              <section className="card setting-card"><span className="kicker">APPEARANCE</span><h2>Light by default</h2><label className="switch-row"><span>Use dark theme<small>Off keeps moonim's light, warm atmosphere.</small></span><input type="checkbox" checked={(state.settings.theme ?? 'light') === 'dark'} onChange={event => run({ type: 'settings.update', changes: { theme: event.target.checked ? 'dark' : 'light' } })} /></label><label className="switch-row"><span>Show completion progress<small>No penalties after missed days.</small></span><input type="checkbox" checked={state.settings.streaksEnabled} onChange={event => run({ type: 'settings.update', changes: { streaksEnabled: event.target.checked } })} /></label><label className="switch-row"><span>Reduce motion<small>Calmer transitions throughout the app.</small></span><input type="checkbox" checked={state.settings.reducedMotion} onChange={event => run({ type: 'settings.update', changes: { reducedMotion: event.target.checked } })} /></label></section>
              <section className="card setting-card"><span className="kicker">FOCUS MODE</span><h2>Distraction-free fallback</h2><p>moonim uses an in-app quiet mode without requiring privileged macOS access.</p><button className="secondary" onClick={() => setDistractionFree(value => !value)}>{distractionFree ? 'Exit quiet mode' : 'Enter quiet mode'}</button></section>
              <section className="card setting-card wide"><span className="kicker">PHOTO CREDITS</span><h2>Aardman models, photographed by visitors</h2><p>The Diary photos come from Wikimedia Commons. Wallace, Gromit and Shaun the Sheep belong to Aardman Animations.</p><ul className="credit-list">{PHOTO_CREDITS.map(([subject, author, licence]) => <li key={subject}><strong>{subject}</strong><span>{author}, {licence}</span></li>)}</ul></section>
            </div>
          </section>
        )}
      </main>

      {viewingTask && <Modal onClose={() => setViewingTask(null)}><section className="task-detail card" role="dialog" aria-modal="true" aria-labelledby="task-detail-title"><div className="dialog-heading"><div><span className="kicker">TASK DETAILS</span><h2 id="task-detail-title">{viewingTask.title}</h2></div><button type="button" aria-label="Close task details" onClick={() => setViewingTask(null)}>×</button></div><p className="task-detail-description">{viewingTask.description || 'No description yet.'}</p><dl className="task-detail-grid"><div><dt>Life area</dt><dd>{viewingTask.lifeArea || 'General'}</dd></div><div><dt>Due</dt><dd>{friendlyDate(viewingTask.dueDate)}{friendlyTime(viewingTask.scheduledTime) ? ` · ${friendlyTime(viewingTask.scheduledTime)}` : ''}</dd></div><div><dt>Focus duration</dt><dd>{viewingTask.focusMinutes ? `${viewingTask.focusMinutes} minutes` : 'Not set'}</dd></div><div><dt>Repeat</dt><dd>{viewingTask.recurrence}</dd></div></dl><div className="dialog-actions task-detail-actions"><button type="button" className="danger-button" onClick={() => requestDeleteTask(viewingTask)}>Delete task</button><button type="button" className="primary" onClick={() => openEditTask(viewingTask)}>Edit task</button></div></section></Modal>}

      {deletingTask && <Modal onClose={() => setDeletingTask(null)}><section className="delete-dialog card" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><span className="kicker">CONFIRM DELETE</span><h2 id="delete-dialog-title">Delete {deletingTask.title}?</h2><p>{deletingTask.recurrence === 'none' ? 'This removes the task from moonim. Its append-only activity record is preserved.' : 'Choose whether to remove only this occurrence or the entire recurring routine.'}</p><div className="dialog-actions delete-actions"><button type="button" className="secondary" onClick={() => setDeletingTask(null)}>Cancel</button>{deletingTask.recurrence === 'none' ? <button type="button" className="danger-button" aria-label="Confirm delete task" onClick={() => confirmDeleteTask('occurrence')}>Delete task</button> : <><button type="button" className="secondary" onClick={() => confirmDeleteTask('occurrence')}>Delete this occurrence</button><button type="button" className="danger-button" onClick={() => confirmDeleteTask('series')}>Delete whole {deletingTask.recurrence} routine</button></>}</div></section></Modal>}

      {taskDialogOpen && <Modal onClose={() => setTaskDialogOpen(false)}><form className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onSubmit={saveTask}><div className="dialog-heading"><div><span className="kicker">{editingTask ? 'EDIT TASK' : 'NEW TASK'}</span><h2 id="task-dialog-title">{editingTask ? 'Refine this step' : 'What matters today?'}</h2></div><button type="button" aria-label="Close" onClick={() => setTaskDialogOpen(false)}>×</button></div>{taskFormError && <div className="notice" role="alert">{taskFormError}</div>}<label>Task title<input autoFocus required maxLength={MAX_TITLE_LENGTH} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="e.g. Take morning medication" /></label><label>Description<textarea maxLength={MAX_DESCRIPTION_LENGTH} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Add notes, context, or a definition of done." /></label><div className="form-grid"><label>Life area<select value={draft.lifeArea} onChange={event => setDraft(current => ({ ...current, lifeArea: event.target.value }))}>{(draft.lifeArea && !state.settings.lifeAreas.includes(draft.lifeArea) ? [draft.lifeArea, ...state.settings.lifeAreas] : state.settings.lifeAreas).map(area => <option key={area}>{area}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as TaskDraft['priority'] }))}><option value="">No priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Due date<input type="date" value={draft.dueDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))} /></label><label>Time<input type="time" value={draft.scheduledTime} onChange={event => setDraft(current => ({ ...current, scheduledTime: event.target.value }))} /></label><label>Focus duration (minutes)<input type="number" min="1" max="180" step="1" value={draft.focusMinutes} onChange={event => setDraft(current => ({ ...current, focusMinutes: event.target.value }))} placeholder="Optional, e.g. 30" /></label><label>Repeat<select value={draft.recurrence} onChange={event => setDraft(current => ({ ...current, recurrence: event.target.value as Recurrence }))}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setTaskDialogOpen(false)}>Cancel</button><button className="primary" type="submit">{editingTask ? 'Save changes' : 'Create task'}</button></div></form></Modal>}

      {showCompletionCelebration && <Modal className="celebration-backdrop" closeOnAnyClick onClose={() => setShowCompletionCelebration(false)}><section className="celebration-card" role="dialog" aria-modal="true" aria-label="Congratulations"><img src={congratulationsImage} alt="Well done lad! Wallace and Gromit celebrate" /><h2>Well done!</h2><p>You completed everything for today.</p></section></Modal>}

      {confirmRequest && <Modal onClose={() => setConfirmRequest(null)}><section className="delete-dialog card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-body"><span className="kicker">PLEASE CONFIRM</span><h2 id="confirm-dialog-title">{confirmRequest.title}</h2><p id="confirm-dialog-body">{confirmRequest.body}</p><div className="dialog-actions delete-actions"><button type="button" className="secondary" onClick={() => setConfirmRequest(null)}>Cancel</button><button type="button" className="danger-button" onClick={() => { confirmRequest.onConfirm(); setConfirmRequest(null) }}>{confirmRequest.confirmLabel}</button></div></section></Modal>}

      {undoOffer && <div className="undo-toast" role="status"><span>{undoOffer.message}</span><button type="button" onClick={undo}>Undo</button></div>}
    </div>
  )
}
