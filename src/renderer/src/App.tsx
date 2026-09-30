import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  applyProductCommand,
  createInitialState,
  dailyAppStreak,
  isTaskVisibleInView,
  isTaskVisibleToday,
  recurringTaskStreak,
  type Priority,
  type ProductCommand,
  type ProductState,
  type Recurrence,
  type Task,
  type TaskListView
} from '../../shared/product'
import { readTimer, type TimerKind } from '../../shared/timer'
import gromitEmpty from './assets/gromit-empty.png'
import gromitIcon from './assets/gromit-icon.png'
import gromitScene from './assets/gromit.jpg'

type Screen = 'today' | 'history' | 'settings'
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

function shiftMonth(month: string, amount: number): string {
  const date = new Date(`${month}-01T12:00:00`)
  date.setMonth(date.getMonth() + amount)
  return localDate(date).slice(0, 7)
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

export function App() {
  const [state, setState] = useState<ProductState | null>(null)
  const [screen, setScreen] = useState<Screen>('today')
  const [taskView, setTaskView] = useState<TaskListView>('today')
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
  const [syncError, setSyncError] = useState('')
  const [lifeAreaText, setLifeAreaText] = useState('')
  const [syncPulse, setSyncPulse] = useState(0)
  const syncing = useRef(false)
  const autoCompleted = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    void window.gentleday.loadState().then(saved => {
      if (!active) return
      const initial = applyProductCommand(saved ?? createInitialState(), {
        type: 'day.ensure', localDate: localDate()
      }, commandContext())
      setState(initial)
      setLifeAreaText(initial.settings.lifeAreas.join(', '))
    })
    return () => { active = false }
  }, [])

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
      const pending = state.outbox.filter(item => !item.deliveredAt)
      if (!state.settings.vaultPath || pending.length === 0 || syncing.current) return
      syncing.current = true
      try {
        const deliveredIds = await window.gentleday.appendEvents(state.settings.vaultPath, pending)
        if (deliveredIds.length) {
          const deliveredAt = localIso()
          setState(current => current ? {
            ...current,
            outbox: current.outbox.map(item => deliveredIds.includes(item.id)
              ? { ...item, deliveredAt }
              : item)
          } : current)
        }
        setSyncError('')
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Vault unavailable; events remain queued.')
      } finally {
        syncing.current = false
      }
    }).catch(error => setSyncError(error instanceof Error ? error.message : 'Local save failed.'))
  }, [state, syncPulse])

  const run = (command: ProductCommand) => {
    setState(current => current ? applyProductCommand(current, command, commandContext()) : current)
  }

  const today = localDate(new Date(nowMs))
  const lastEnsuredDate = useRef(today)

  useEffect(() => {
    if (!state || lastEnsuredDate.current === today) return
    lastEnsuredDate.current = today
    run({ type: 'day.ensure', localDate: today })
  }, [today, state])

  const visibleTasks = useMemo(() => state?.tasks.filter(task =>
    isTaskVisibleInView(task, taskView, today, calendarMonth)
  ) ?? [], [state?.tasks, taskView, today, calendarMonth])
  const allActiveTasks = state?.tasks.filter(task => task.status === 'active') ?? []
  const focusEligibleTasks = allActiveTasks.filter(task => task.focusMinutes !== undefined)
  useEffect(() => {
    if (linkedTaskId && !focusEligibleTasks.some(task => task.id === linkedTaskId)) {
      setLinkedTaskId('')
    }
  }, [linkedTaskId, state?.tasks])
  const activeTasks = visibleTasks.filter(task => task.status === 'active')
  const completedTasks = visibleTasks.filter(task => task.status === 'completed')
  const unscheduledCalendarTasks = taskView === 'calendar'
    ? activeTasks.filter(task => task.recurrence === 'none' && !task.dueDate)
    : []
  const completedTodayTasks = state?.tasks.filter(task => task.status === 'completed' && isTaskVisibleToday(task, today)) ?? []
  const todayTasks = state?.tasks.filter(task => isTaskVisibleToday(task, today)) ?? []
  const todayListComplete = todayTasks.length > 0 && todayTasks.every(task => task.status === 'completed')
  const completionPercent = visibleTasks.length ? Math.round((completedTasks.length / visibleTasks.length) * 100) : 0
  const timerReading = state?.activeTimer ? readTimer(state.activeTimer, nowMs) : null

  useEffect(() => {
    const timer = state?.activeTimer
    if (!timer || timerReading?.status !== 'completed' || autoCompleted.current.has(timer.id)) return
    autoCompleted.current.add(timer.id)
    run({ type: 'timer.complete' })
    void window.gentleday.notify(
      timer.kind === 'focus' ? 'Focus session complete' : 'Break complete',
      'Your time is complete. Start the next phase when you are ready.'
    )
  }, [state?.activeTimer?.id, timerReading?.status])

  if (!state) {
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
    setDraft(emptyDraft(state.settings.lifeAreas[0]))
    setTaskDialogOpen(true)
  }

  const openEditTask = (task: Task) => {
    setViewingTask(null)
    setEditingTask(task)
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
    if (!draft.title.trim()) return
    const focusMinutes = draft.focusMinutes === '' ? undefined : Number(draft.focusMinutes)
    if (focusMinutes !== undefined && (!Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 180)) {
      setSyncError('Task focus duration must be between 1 and 180 minutes.')
      return
    }
    setSyncError('')
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
          focusMinutes
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
    run({ type: 'task.delete', taskId: deletingTask.id, scope })
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
      setSyncError('Choose a task or add a short focus description first.')
      return
    }
    setSyncError('')
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
          <button className={screen === 'today' ? 'active' : ''} onClick={() => setScreen('today')}><span>◌</span>Today</button>
          <button className={screen === 'history' ? 'active' : ''} onClick={() => setScreen('history')}><span>↗</span>History</button>
          <button className={screen === 'settings' ? 'active' : ''} onClick={() => setScreen('settings')}><span>⚙</span>Settings</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="vault-status">
          <span className={`status-dot ${state.settings.vaultPath && !syncError ? 'connected' : ''}`} />
          <div><strong>{state.settings.vaultPath ? 'Obsidian linked' : 'Vault not linked'}</strong><small>{pendingEvents} event{pendingEvents === 1 ? '' : 's'} queued</small></div>
        </div>
      </aside>

      <main>
        {screen === 'today' && (
          <>
            <header className="page-header today-header">
              <button className="primary" onClick={openCreateTask}>＋ Add task</button>
            </header>

            {syncError && <div className="notice" role="status">{syncError}</div>}

            <section className="dashboard-grid">
              <div className="task-panel card">
                <div className="section-heading task-heading"><label className="task-view-select"><span>Show tasks for</span><select value={taskView} onChange={event => setTaskView(event.target.value as TaskListView)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="calendar">Calendar</option></select></label><span className="count-badge">{activeTasks.length} open</span></div>
                {state.settings.streaksEnabled && taskView !== 'calendar' && <>
                  <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
                  <p className="progress-copy">{completionPercent}% complete · one small step at a time</p>
                </>}

                {taskView === 'calendar' ? (
                  <div className="calendar-view">
                    {unscheduledCalendarTasks.length > 0 && <section className="unscheduled-tasks"><div><strong>Unscheduled</strong><span>Tasks without a date stay visible here.</span></div><div>{unscheduledCalendarTasks.map(task => <button key={task.id} onClick={() => setViewingTask(task)}>{task.title}</button>)}</div></section>}
                    <div className="calendar-toolbar"><button aria-label="Previous month" onClick={() => setCalendarMonth(current => shiftMonth(current, -1))}>←</button><strong>{calendarTitle}</strong><button aria-label="Next month" onClick={() => setCalendarMonth(current => shiftMonth(current, 1))}>→</button></div>
                    <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
                    <div className="calendar-grid">{calendarCells.map(cell => {
                      const dayTasks = visibleTasks.filter(task => !(task.status === 'active' && task.recurrence === 'none' && !task.dueDate) && (task.dueDate ?? task.occurrenceDate) === cell.date)
                      return <div className={`calendar-day ${cell.inMonth ? '' : 'outside'} ${cell.date === today ? 'today' : ''}`} key={cell.date}><span>{Number(cell.date.slice(-2))}</span><div>{dayTasks.map(task => <button className={task.status} title={task.title} key={task.id} onClick={() => setViewingTask(task)}>{task.scheduledTime ? `${task.scheduledTime} ` : ''}{task.title}</button>)}</div></div>
                    })}</div>
                  </div>
                ) : <>
                  <div className="task-list">
                    {activeTasks.length === 0 && <div className="empty-state"><img className="empty-state-image" src={gromitEmpty} alt="moonim empty task list" /><p>Add a task or choose another view.</p></div>}
                    {activeTasks.map(task => (
                      <article className="task-row" key={task.id}>
                        <button className="check" aria-label={`Complete ${task.title}`} onClick={() => run({ type: 'task.complete', taskId: task.id })} />
                        <button className="task-copy task-open" aria-label={`Open ${task.title}`} onClick={() => setViewingTask(task)}><strong>{task.title}</strong>{task.description && <span className="task-description-preview">{task.description}</span>}<span className="task-meta"><span className="area-tag">{task.lifeArea || 'General'}</span><span>{friendlyDate(task.dueDate)}</span>{friendlyTime(task.scheduledTime) && <span>{friendlyTime(task.scheduledTime)}</span>}{task.focusMinutes && <span>{task.focusMinutes} min focus</span>}{task.recurrence !== 'none' && <span>{recurrenceLabel(task.recurrence)}</span>}{task.priority && <span className={`priority ${task.priority}`}>{task.priority}</span>}</span></button>
                        <div className="row-actions">{task.focusMinutes && <button onClick={() => { setLinkedTaskId(task.id); setActivity(task.title) }} aria-label={`Focus on ${task.title}`}>Focus</button>}<button onClick={() => openEditTask(task)} aria-label={`Edit ${task.title}`}>Edit</button><button onClick={() => requestDeleteTask(task)} aria-label={`Delete ${task.title}`}>×</button></div>
                      </article>
                    ))}
                  </div>
                  {completedTasks.length > 0 && <details className="completed-group"><summary>{completedTasks.length} completed</summary>{completedTasks.map(task => <article className="task-row completed" key={task.id}><button className="check checked" aria-label={`Reopen ${task.title}`} onClick={() => run({ type: 'task.reopen', taskId: task.id })}>✓</button><button className="task-copy task-open" aria-label={`Open ${task.title}`} onClick={() => setViewingTask(task)}><strong>{task.title}</strong>{task.description && <span className="task-description-preview">{task.description}</span>}<span className="task-meta"><span>{task.lifeArea || 'General'}</span></span></button></article>)}</details>}
                </>}
              </div>

              <aside className="focus-panel card">
                <div className="section-heading"><div><span className="kicker">FOCUS</span><h2>{state.activeTimer ? 'Stay with this moment' : 'Choose what to focus on'}</h2></div><button className={`quiet-toggle ${distractionFree ? 'on' : ''}`} onClick={() => setDistractionFree(value => !value)} aria-label="Toggle distraction-free focus mode" aria-pressed={distractionFree} title="In-app distraction-free mode">◐</button></div>

                {!state.activeTimer ? (
                  <>
                    <div className="phase-tabs" role="tablist">
                      <button className={timerKind === 'focus' ? 'active' : ''} onClick={() => setTimerKind('focus')}>Focus</button>
                      <button className={timerKind === 'short_break' ? 'active' : ''} onClick={() => setTimerKind('short_break')}>Short break</button>
                      <button className={timerKind === 'long_break' ? 'active' : ''} onClick={() => setTimerKind('long_break')}>Long break</button>
                    </div>
                    <div className="timer-orbit"><div className="timer-display">{formatDuration(plannedMinutes * 60)}</div><small>ready when you are</small></div>
                    <div className="focus-start-zone">
                      {timerKind === 'focus' && <div className="timer-fields"><label>Link a task<select value={linkedTaskId} onChange={event => { setLinkedTaskId(event.target.value); const task = focusEligibleTasks.find(item => item.id === event.target.value); if (task) setActivity(task.title) }}><option value="">No task selected</option>{focusEligibleTasks.map(task => <option value={task.id} key={task.id}>{task.title} · {task.focusMinutes} min</option>)}</select></label>{focusEligibleTasks.length === 0 ? <p className="focus-link-help"><strong>No tasks have a focus duration yet.</strong> Open a task and choose Edit task to set one.</p> : <p className="focus-link-help">Only active tasks with a focus duration appear here.</p>}<label>Or describe your focus<input value={activity} onChange={event => setActivity(event.target.value)} placeholder="e.g. Mandarin lesson" /></label></div>}
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
                      <button className="danger-text" onClick={() => window.confirm('Stop and record this session as cancelled?') && run({ type: 'timer.cancel' })}>Stop</button>
                    </div>
                    <div className="session-stats"><span><strong>{Math.floor((timerReading?.activeSeconds ?? 0) / 60)}</strong> active min</span><span><strong>{Math.floor((timerReading?.pausedSeconds ?? 0) / 60)}</strong> paused min</span></div>
                  </>
                )}
              </aside>
            </section>

            {state.settings.streaksEnabled && <section className="day-summary card"><img className="growth-gromit" src={gromitScene} alt="Gromit knitting" /><div><span className="kicker">TODAY'S GROWTH</span><h3>{todayListComplete ? "Today's list is complete." : completedTodayTasks.length === 0 ? 'The day is still opening.' : completedTodayTasks.length === 1 ? 'One meaningful step is complete.' : `${completedTodayTasks.length} meaningful steps are complete.`}</h3><p>{todayListComplete ? `You extended your streak to ${dailyStreak.current} ${dailyStreak.current === 1 ? 'day' : 'days'}.` : 'Complete the whole Today list to extend your streak.'}</p></div><div className="summary-stat"><strong>{dailyStreak.current}</strong><span>day streak</span></div></section>}
          </>
        )}

        {screen === 'history' && (
          <section className="page-stack">
            <header className="page-header"><div><p className="eyebrow">LOCAL HISTORY</p><h1>A record of your progress.</h1></div></header>
            <section className="card recurrence-history"><div className="section-heading"><div><span className="kicker">CONSISTENCY</span><h2>Recurring task streaks</h2></div></div>{recurringSeries.length === 0 ? <p className="muted">Daily, weekly, and monthly task streaks will appear here.</p> : <div className="streak-list">{recurringSeries.map(({ task, streak, unit }) => <button type="button" className="streak-task-button" aria-label={`Open ${task.title} streak details`} key={task.seriesId} onClick={() => setViewingTask(task)}><div><strong>{task.title}</strong><p>{task.recurrence} · best {streak.best} {streak.best === 1 ? unit : `${unit}s`}</p></div><span><strong>{streak.current}</strong> {unit} streak</span></button>)}</div>}</section>
            <section className="card task-history"><div className="section-heading"><div><span className="kicker">TASKS</span><h2>All tasks</h2></div></div>{currentTasks.length === 0 ? <p className="muted">You do not have any tasks yet.</p> : <div className="task-history-list">{currentTasks.map(task => <button type="button" aria-label={`Open ${task.title} task`} key={task.id} onClick={() => setViewingTask(task)}><span><strong>{task.title}</strong><small>{task.status === 'active' ? 'Active' : 'Completed'}{task.description ? ` · ${task.description}` : task.lifeArea ? ` · ${task.lifeArea}` : ''}</small></span><time>{task.status === 'completed' ? new Date(task.completedAt ?? task.updatedAt).toLocaleDateString() : friendlyDate(task.dueDate)}</time></button>)}</div>}</section>
            <div className="card history-list"><div className="section-heading"><div><span className="kicker">FOCUS</span><h2>Sessions</h2></div>{focusSessions.length > 0 && <button className="clear-history" onClick={() => window.confirm('Clear focus history from this device? Your append-only Obsidian records will remain.') && run({ type: 'history.clear', kind: 'focus' })}>Clear</button>}</div><div className="history-scroll">{focusSessions.length === 0 ? <p className="muted">Completed and cancelled focus sessions will appear here.</p> : [...focusSessions].reverse().map(session => <article key={session.id}><span className={`history-icon ${session.status}`}>{session.status === 'completed' ? '✓' : '×'}</span><div><strong>{session.activity || state.tasks.find(task => task.id === session.taskId)?.title || 'Focused work'}</strong><p>{actualDuration(session.activeSeconds)} active · {session.status}</p></div><time>{new Date(session.startedAt).toLocaleDateString()}</time></article>)}</div></div>
          </section>
        )}

        {screen === 'settings' && (
          <section className="page-stack settings-page">
            <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>Shape moonim around you.</h1></div></header>
            <div className="settings-grid">
              <section className="card setting-card"><span className="kicker">OBSIDIAN</span><h2>Append-only activity vault</h2><p>Task, focus, and break events are stored in predictable Markdown folders. If your vault is unavailable, events stay queued locally and retry every 30 seconds.</p><div className="path-box">{state.settings.vaultPath || 'No vault selected'}</div><div className="button-row"><button className="primary" onClick={chooseVault}>{state.settings.vaultPath ? 'Change vault' : 'Choose vault'}</button>{pendingEvents > 0 && state.settings.vaultPath && <button className="secondary" onClick={() => setSyncPulse(value => value + 1)}>Retry now</button>}</div></section>
              <section className="card setting-card"><span className="kicker">TIMER DEFAULTS</span><h2>Session lengths</h2><div className="duration-grid">{([['focusMinutes', 'Focus'], ['shortBreakMinutes', 'Short break'], ['longBreakMinutes', 'Long break']] as const).map(([key, label]) => <label key={key}>{label}<span><input type="number" min="1" max="180" value={state.settings[key]} onChange={event => run({ type: 'settings.update', changes: { [key]: Number(event.target.value) } })} /> minutes</span></label>)}</div></section>
              <section className="card setting-card wide"><span className="kicker">LIFE AREAS</span><h2>Your editable categories</h2><p>Separate areas with commas. Existing tasks keep their current labels.</p><textarea value={lifeAreaText} onChange={event => setLifeAreaText(event.target.value)} onBlur={() => run({ type: 'settings.update', changes: { lifeAreas: lifeAreaText.split(',') } })} /><div className="tag-preview">{state.settings.lifeAreas.map(area => <span key={area}>{area}</span>)}</div></section>
              <section className="card setting-card"><span className="kicker">APPEARANCE</span><h2>Light by default</h2><label className="switch-row"><span>Use dark theme<small>Off keeps moonim's light, warm atmosphere.</small></span><input type="checkbox" checked={(state.settings.theme ?? 'light') === 'dark'} onChange={event => run({ type: 'settings.update', changes: { theme: event.target.checked ? 'dark' : 'light' } })} /></label><label className="switch-row"><span>Show completion progress<small>No penalties after missed days.</small></span><input type="checkbox" checked={state.settings.streaksEnabled} onChange={event => run({ type: 'settings.update', changes: { streaksEnabled: event.target.checked } })} /></label><label className="switch-row"><span>Reduce motion<small>Calmer transitions throughout the app.</small></span><input type="checkbox" checked={state.settings.reducedMotion} onChange={event => run({ type: 'settings.update', changes: { reducedMotion: event.target.checked } })} /></label></section>
              <section className="card setting-card"><span className="kicker">FOCUS MODE</span><h2>Distraction-free fallback</h2><p>moonim uses an in-app quiet mode without requiring privileged macOS access.</p><button className="secondary" onClick={() => setDistractionFree(value => !value)}>{distractionFree ? 'Exit quiet mode' : 'Enter quiet mode'}</button></section>
            </div>
          </section>
        )}
      </main>

      {viewingTask && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setViewingTask(null)}><section className="task-detail card" role="dialog" aria-modal="true" aria-labelledby="task-detail-title"><div className="dialog-heading"><div><span className="kicker">TASK DETAILS</span><h2 id="task-detail-title">{viewingTask.title}</h2></div><button type="button" aria-label="Close task details" onClick={() => setViewingTask(null)}>×</button></div><p className="task-detail-description">{viewingTask.description || 'No description yet.'}</p><dl className="task-detail-grid"><div><dt>Life area</dt><dd>{viewingTask.lifeArea || 'General'}</dd></div><div><dt>Due</dt><dd>{friendlyDate(viewingTask.dueDate)}{friendlyTime(viewingTask.scheduledTime) ? ` · ${friendlyTime(viewingTask.scheduledTime)}` : ''}</dd></div><div><dt>Focus duration</dt><dd>{viewingTask.focusMinutes ? `${viewingTask.focusMinutes} minutes` : 'Not set'}</dd></div><div><dt>Repeat</dt><dd>{viewingTask.recurrence}</dd></div></dl><div className="dialog-actions task-detail-actions"><button type="button" className="danger-button" onClick={() => requestDeleteTask(viewingTask)}>Delete task</button><button type="button" className="primary" onClick={() => openEditTask(viewingTask)}>Edit task</button></div></section></div>}

      {deletingTask && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setDeletingTask(null)}><section className="delete-dialog card" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><span className="kicker">CONFIRM DELETE</span><h2 id="delete-dialog-title">Delete {deletingTask.title}?</h2><p>{deletingTask.recurrence === 'none' ? 'This removes the task from moonim. Its append-only activity record is preserved.' : 'Choose whether to remove only this occurrence or the entire recurring routine.'}</p><div className="dialog-actions delete-actions"><button type="button" className="secondary" onClick={() => setDeletingTask(null)}>Cancel</button>{deletingTask.recurrence === 'none' ? <button type="button" className="danger-button" aria-label="Confirm delete task" onClick={() => confirmDeleteTask('occurrence')}>Delete task</button> : <><button type="button" className="secondary" onClick={() => confirmDeleteTask('occurrence')}>Delete this occurrence</button><button type="button" className="danger-button" onClick={() => confirmDeleteTask('series')}>Delete whole {deletingTask.recurrence} routine</button></>}</div></section></div>}

      {taskDialogOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setTaskDialogOpen(false)}><form className="task-dialog" onSubmit={saveTask}><div className="dialog-heading"><div><span className="kicker">{editingTask ? 'EDIT TASK' : 'NEW TASK'}</span><h2>{editingTask ? 'Refine this step' : 'What matters today?'}</h2></div><button type="button" onClick={() => setTaskDialogOpen(false)}>×</button></div><label>Task title<input autoFocus value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="e.g. Take morning medication" /></label><label>Description<textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Add notes, context, or a definition of done." /></label><div className="form-grid"><label>Life area<select value={draft.lifeArea} onChange={event => setDraft(current => ({ ...current, lifeArea: event.target.value }))}>{state.settings.lifeAreas.map(area => <option key={area}>{area}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as TaskDraft['priority'] }))}><option value="">No priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Due date<input type="date" value={draft.dueDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))} /></label><label>Time<input type="time" value={draft.scheduledTime} onChange={event => setDraft(current => ({ ...current, scheduledTime: event.target.value }))} /></label><label>Focus duration (minutes)<input type="number" min="1" max="180" step="1" value={draft.focusMinutes} onChange={event => setDraft(current => ({ ...current, focusMinutes: event.target.value }))} placeholder="Optional, e.g. 30" /></label>{!editingTask && <label>Repeat<select value={draft.recurrence} onChange={event => setDraft(current => ({ ...current, recurrence: event.target.value as Recurrence }))}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>}</div><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setTaskDialogOpen(false)}>Cancel</button><button className="primary" type="submit">{editingTask ? 'Save changes' : 'Create task'}</button></div></form></div>}
    </div>
  )
}
