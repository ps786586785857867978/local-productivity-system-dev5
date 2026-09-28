import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  applyProductCommand,
  createInitialState,
  isTaskVisibleInView,
  isTaskVisibleToday,
  type Priority,
  type ProductCommand,
  type ProductState,
  type Recurrence,
  type Task,
  type TaskListView
} from '../../shared/product'
import { readTimer, type TimerKind } from '../../shared/timer'
import gromitIcon from './assets/gromit-icon.png'
import gromitScene from './assets/gromit.jpg'

type Screen = 'today' | 'history' | 'settings'
type TaskDraft = {
  title: string
  lifeArea: string
  priority: '' | Priority
  dueDate: string
  scheduledTime: string
  focusMinutes: string
  recurrence: Recurrence
}

const emptyDraft = (area = ''): TaskDraft => ({
  title: '', lifeArea: area, priority: '', dueDate: '', scheduledTime: '', focusMinutes: '', recurrence: 'none'
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
  const activeTasks = visibleTasks.filter(task => task.status === 'active')
  const completedTasks = visibleTasks.filter(task => task.status === 'completed')
  const unscheduledCalendarTasks = taskView === 'calendar'
    ? activeTasks.filter(task => task.recurrence === 'none' && !task.dueDate)
    : []
  const completedTodayTasks = state?.tasks.filter(task => task.status === 'completed' && isTaskVisibleToday(task, today)) ?? []
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
  const breakSessions = state.sessions.filter(session => session.kind !== 'focus')
  const focusedToday = focusSessions
    .filter(session => (session.localDate ?? session.startedAt.slice(0, 10)) === today && session.status === 'completed')
    .reduce((total, session) => total + session.activeSeconds, 0)
  const calendarCells = calendarDates(calendarMonth)
  const taskViewTitle = taskView === 'today'
    ? 'Take matters into your own hands'
    : taskView === 'week'
      ? 'This week at a glance'
      : taskView === 'month'
        ? 'Plan the month ahead'
        : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
          .format(new Date(`${calendarMonth}-01T12:00:00`))

  const openCreateTask = () => {
    setEditingTask(null)
    setDraft(emptyDraft(state.settings.lifeAreas[0]))
    setTaskDialogOpen(true)
  }

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setDraft({
      title: task.title,
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

  const deleteTask = (task: Task) => {
    let scope: 'occurrence' | 'series' = 'occurrence'
    if (task.recurrence !== 'none') {
      const cadence = task.recurrence === 'daily' ? 'daily' : 'weekly'
      scope = window.confirm(`Delete the whole ${cadence} routine? Choose Cancel to delete only this occurrence.`)
        ? 'series'
        : 'occurrence'
    }
    const message = scope === 'series'
      ? 'Delete this routine and prevent future occurrences?'
      : 'Delete this task occurrence?'
    if (window.confirm(message)) run({ type: 'task.delete', taskId: task.id, scope })
  }

  const linkedTask = allActiveTasks.find(task => task.id === linkedTaskId)
  const plannedMinutes = timerKind === 'focus'
    ? linkedTask?.focusMinutes ?? state.settings.focusMinutes
    : timerKind === 'short_break'
      ? state.settings.shortBreakMinutes
      : state.settings.longBreakMinutes

  const startTimer = () => {
    if (timerKind === 'focus' && !linkedTaskId && !activity.trim()) {
      setSyncError('Choose a task or add a short focus description first.')
      return
    }
    setSyncError('')
    run({
      type: 'timer.start',
      kind: timerKind,
      plannedSeconds: plannedMinutes * 60,
      taskId: timerKind === 'focus' ? linkedTaskId || undefined : undefined,
      activity: timerKind === 'focus' && !linkedTaskId ? activity.trim() || undefined : undefined
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
    <div className={`app-shell ${distractionFree ? 'distraction-free' : ''} ${state.settings.reducedMotion ? 'reduced-motion' : ''}`}>
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
                <div className="section-heading"><div><span className="kicker">{taskView.toUpperCase()}</span><h2>{taskViewTitle}</h2></div><span className="count-badge">{activeTasks.length} open</span></div>
                <label className="task-view-select"><span>Show tasks for</span><select value={taskView} onChange={event => setTaskView(event.target.value as TaskListView)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="calendar">Calendar</option></select></label>
                {state.settings.streaksEnabled && taskView !== 'calendar' && <>
                  <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
                  <p className="progress-copy">{completionPercent}% complete · one small step at a time</p>
                </>}

                {taskView === 'calendar' ? (
                  <div className="calendar-view">
                    {unscheduledCalendarTasks.length > 0 && <section className="unscheduled-tasks"><div><strong>Unscheduled</strong><span>Tasks without a date stay visible here.</span></div><div>{unscheduledCalendarTasks.map(task => <button key={task.id} onClick={() => openEditTask(task)}>{task.title}</button>)}</div></section>}
                    <div className="calendar-toolbar"><button aria-label="Previous month" onClick={() => setCalendarMonth(current => shiftMonth(current, -1))}>←</button><strong>{taskViewTitle}</strong><button aria-label="Next month" onClick={() => setCalendarMonth(current => shiftMonth(current, 1))}>→</button></div>
                    <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
                    <div className="calendar-grid">{calendarCells.map(cell => {
                      const dayTasks = visibleTasks.filter(task => !(task.status === 'active' && task.recurrence === 'none' && !task.dueDate) && (task.dueDate ?? task.occurrenceDate) === cell.date)
                      return <div className={`calendar-day ${cell.inMonth ? '' : 'outside'} ${cell.date === today ? 'today' : ''}`} key={cell.date}><span>{Number(cell.date.slice(-2))}</span><div>{dayTasks.map(task => <button className={task.status} title={task.title} key={task.id} onClick={() => openEditTask(task)}>{task.scheduledTime ? `${task.scheduledTime} ` : ''}{task.title}</button>)}</div></div>
                    })}</div>
                  </div>
                ) : <>
                  <div className="task-list">
                    {activeTasks.length === 0 && <div className="empty-state"><span>✓</span><h3>Nothing here yet</h3><p>Add a task or choose another view.</p></div>}
                    {activeTasks.map(task => (
                      <article className="task-row" key={task.id}>
                        <button className="check" aria-label={`Complete ${task.title}`} onClick={() => run({ type: 'task.complete', taskId: task.id })} />
                        <div className="task-copy"><strong>{task.title}</strong><div className="task-meta"><span className="area-tag">{task.lifeArea || 'General'}</span><span>{friendlyDate(task.dueDate)}</span>{friendlyTime(task.scheduledTime) && <span>{friendlyTime(task.scheduledTime)}</span>}{task.focusMinutes && <span>{task.focusMinutes} min focus</span>}{task.recurrence !== 'none' && <span>{task.recurrence === 'daily' ? 'Daily' : 'Weekly'}</span>}{task.priority && <span className={`priority ${task.priority}`}>{task.priority}</span>}</div></div>
                        <div className="row-actions"><button onClick={() => { setLinkedTaskId(task.id); setActivity(task.title) }} aria-label={`Focus on ${task.title}`}>Focus</button><button onClick={() => openEditTask(task)} aria-label={`Edit ${task.title}`}>Edit</button><button onClick={() => deleteTask(task)} aria-label={`Delete ${task.title}`}>×</button></div>
                      </article>
                    ))}
                  </div>
                  {completedTasks.length > 0 && <details className="completed-group"><summary>{completedTasks.length} completed</summary>{completedTasks.map(task => <article className="task-row completed" key={task.id}><button className="check checked" aria-label={`Reopen ${task.title}`} onClick={() => run({ type: 'task.reopen', taskId: task.id })}>✓</button><div className="task-copy"><strong>{task.title}</strong><div className="task-meta"><span>{task.lifeArea || 'General'}</span></div></div></article>)}</details>}
                </>}
              </div>

              <aside className="focus-panel card">
                <div className="section-heading"><div><span className="kicker">FOCUS</span><h2>{state.activeTimer ? 'Stay with this moment' : 'Choose what to focus on'}</h2></div><button className={`quiet-toggle ${distractionFree ? 'on' : ''}`} onClick={() => setDistractionFree(value => !value)} title="In-app distraction-free mode">◐</button></div>

                {!state.activeTimer ? (
                  <>
                    <div className="phase-tabs" role="tablist">
                      <button className={timerKind === 'focus' ? 'active' : ''} onClick={() => setTimerKind('focus')}>Focus</button>
                      <button className={timerKind === 'short_break' ? 'active' : ''} onClick={() => setTimerKind('short_break')}>Short break</button>
                      <button className={timerKind === 'long_break' ? 'active' : ''} onClick={() => setTimerKind('long_break')}>Long break</button>
                    </div>
                    <div className="timer-orbit"><div className="timer-display">{formatDuration(plannedMinutes * 60)}</div><small>ready when you are</small></div>
                    <div className="focus-start-zone">
                      {timerKind === 'focus' && <div className="timer-fields"><label>Link a task<select value={linkedTaskId} onChange={event => { setLinkedTaskId(event.target.value); const task = allActiveTasks.find(item => item.id === event.target.value); if (task) setActivity(task.title) }}><option value="">No task selected</option>{allActiveTasks.map(task => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><label>Or describe your focus<input value={activity} onChange={event => setActivity(event.target.value)} placeholder="e.g. Mandarin lesson" /></label></div>}
                      <button className="start-button" onClick={startTimer}>Start {timerKind === 'focus' ? 'focus' : 'break'}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`timer-orbit running ${state.activeTimer.status === 'paused' ? 'paused' : ''}`}><div className="timer-display">{formatDuration(timerReading?.remainingSeconds ?? 0)}</div><small>{state.activeTimer.status === 'paused' ? 'paused · active time is not counting' : 'active time counting'}</small></div>
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

            {state.settings.streaksEnabled && <section className="day-summary card"><img className="growth-gromit" src={gromitScene} alt="Gromit knitting" /><div><span className="kicker">TODAY'S GROWTH</span><h3>{completedTodayTasks.length === 0 ? 'The day is still opening.' : completedTodayTasks.length === 1 ? 'One meaningful step is complete.' : `${completedTodayTasks.length} meaningful steps are complete.`}</h3><p>Progress grows from consistency, not pressure.</p></div><div className="summary-stat"><strong>{Math.round(focusedToday / 60)}</strong><span>focused minutes</span></div></section>}
          </>
        )}

        {screen === 'history' && (
          <section className="page-stack">
            <header className="page-header"><div><p className="eyebrow">LOCAL HISTORY</p><h1>A record of your progress.</h1></div></header>
            <div className="metrics-grid"><div className="metric card"><span>Completed focus</span><strong>{focusSessions.filter(item => item.status === 'completed').length}</strong></div><div className="metric card"><span>Focused minutes</span><strong>{Math.round(focusSessions.filter(item => item.status === 'completed').reduce((sum, item) => sum + item.activeSeconds, 0) / 60)}</strong></div><div className="metric card"><span>Completed tasks</span><strong>{state.tasks.filter(item => item.status === 'completed').length}</strong></div></div>
            <div className="history-grid"><div className="card history-list"><div className="section-heading"><div><span className="kicker">FOCUS</span><h2>Sessions</h2></div>{focusSessions.length > 0 && <button className="clear-history" onClick={() => window.confirm('Clear focus history from this device? Your append-only Obsidian records will remain.') && run({ type: 'history.clear', kind: 'focus' })}>Clear</button>}</div><div className="history-scroll">{focusSessions.length === 0 ? <p className="muted">Completed and cancelled focus sessions will appear here.</p> : [...focusSessions].reverse().map(session => <article key={session.id}><span className={`history-icon ${session.status}`}>{session.status === 'completed' ? '✓' : '×'}</span><div><strong>{session.activity || state.tasks.find(task => task.id === session.taskId)?.title || 'Focused work'}</strong><p>{actualDuration(session.activeSeconds)} active · {session.status}</p></div><time>{new Date(session.startedAt).toLocaleDateString()}</time></article>)}</div></div><div className="card history-list"><div className="section-heading"><div><span className="kicker">REST</span><h2>Breaks</h2></div>{breakSessions.length > 0 && <button className="clear-history" onClick={() => window.confirm('Clear rest history from this device? Your append-only Obsidian records will remain.') && run({ type: 'history.clear', kind: 'rest' })}>Clear</button>}</div><div className="history-scroll">{breakSessions.length === 0 ? <p className="muted">Break history stays separate from focus analytics.</p> : [...breakSessions].reverse().map(session => <article key={session.id}><span className="history-icon break">☾</span><div><strong>{session.kind === 'short_break' ? 'Short break' : 'Long break'}</strong><p>{actualDuration(session.activeSeconds)} · {session.status}</p></div><time>{new Date(session.startedAt).toLocaleDateString()}</time></article>)}</div></div></div>
          </section>
        )}

        {screen === 'settings' && (
          <section className="page-stack settings-page">
            <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>Shape moonim around you.</h1></div></header>
            <div className="settings-grid">
              <section className="card setting-card"><span className="kicker">OBSIDIAN</span><h2>Append-only activity vault</h2><p>Task, focus, and break events are stored in predictable Markdown folders. If your vault is unavailable, events stay queued locally and retry every 30 seconds.</p><div className="path-box">{state.settings.vaultPath || 'No vault selected'}</div><div className="button-row"><button className="primary" onClick={chooseVault}>{state.settings.vaultPath ? 'Change vault' : 'Choose vault'}</button>{pendingEvents > 0 && state.settings.vaultPath && <button className="secondary" onClick={() => setSyncPulse(value => value + 1)}>Retry now</button>}</div></section>
              <section className="card setting-card"><span className="kicker">TIMER DEFAULTS</span><h2>Session lengths</h2><div className="duration-grid">{([['focusMinutes', 'Focus'], ['shortBreakMinutes', 'Short break'], ['longBreakMinutes', 'Long break']] as const).map(([key, label]) => <label key={key}>{label}<span><input type="number" min="1" max="180" value={state.settings[key]} onChange={event => run({ type: 'settings.update', changes: { [key]: Number(event.target.value) } })} /> minutes</span></label>)}</div></section>
              <section className="card setting-card wide"><span className="kicker">LIFE AREAS</span><h2>Your editable categories</h2><p>Separate areas with commas. Existing tasks keep their current labels.</p><textarea value={lifeAreaText} onChange={event => setLifeAreaText(event.target.value)} onBlur={() => run({ type: 'settings.update', changes: { lifeAreas: lifeAreaText.split(',') } })} /><div className="tag-preview">{state.settings.lifeAreas.map(area => <span key={area}>{area}</span>)}</div></section>
              <section className="card setting-card"><span className="kicker">MOTIVATION</span><h2>Gentle progress</h2><label className="switch-row"><span>Show completion progress<small>No penalties after missed days.</small></span><input type="checkbox" checked={state.settings.streaksEnabled} onChange={event => run({ type: 'settings.update', changes: { streaksEnabled: event.target.checked } })} /></label><label className="switch-row"><span>Reduce motion<small>Calmer transitions throughout the app.</small></span><input type="checkbox" checked={state.settings.reducedMotion} onChange={event => run({ type: 'settings.update', changes: { reducedMotion: event.target.checked } })} /></label></section>
              <section className="card setting-card"><span className="kicker">FOCUS MODE</span><h2>Distraction-free fallback</h2><p>moonim uses an in-app quiet mode without requiring privileged macOS access.</p><button className="secondary" onClick={() => setDistractionFree(value => !value)}>{distractionFree ? 'Exit quiet mode' : 'Enter quiet mode'}</button></section>
            </div>
          </section>
        )}
      </main>

      {taskDialogOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setTaskDialogOpen(false)}><form className="task-dialog" onSubmit={saveTask}><div className="dialog-heading"><div><span className="kicker">{editingTask ? 'EDIT TASK' : 'NEW TASK'}</span><h2>{editingTask ? 'Refine this step' : 'What matters today?'}</h2></div><button type="button" onClick={() => setTaskDialogOpen(false)}>×</button></div><label>Task title<input autoFocus value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="e.g. Take morning medication" /></label><div className="form-grid"><label>Life area<select value={draft.lifeArea} onChange={event => setDraft(current => ({ ...current, lifeArea: event.target.value }))}>{state.settings.lifeAreas.map(area => <option key={area}>{area}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as TaskDraft['priority'] }))}><option value="">No priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Due date<input type="date" value={draft.dueDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))} /></label><label>Time<input type="time" value={draft.scheduledTime} onChange={event => setDraft(current => ({ ...current, scheduledTime: event.target.value }))} /></label><label>Focus duration (minutes)<input type="number" min="1" max="180" step="1" value={draft.focusMinutes} onChange={event => setDraft(current => ({ ...current, focusMinutes: event.target.value }))} placeholder="Optional, e.g. 30" /></label>{!editingTask && <label>Repeat<select value={draft.recurrence} onChange={event => setDraft(current => ({ ...current, recurrence: event.target.value as Recurrence }))}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></label>}</div><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setTaskDialogOpen(false)}>Cancel</button><button className="primary" type="submit">{editingTask ? 'Save changes' : 'Add task'}</button></div></form></div>}
    </div>
  )
}
