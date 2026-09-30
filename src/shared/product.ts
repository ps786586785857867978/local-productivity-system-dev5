import {
  cancelTimer,
  completeTimer,
  pauseTimer,
  readTimer,
  resumeTimer,
  startTimer,
  type TimerKind,
  type TimerState
} from './timer'

export type Priority = 'low' | 'medium' | 'high'
export type TaskStatus = 'active' | 'completed' | 'deleted'
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export type TaskListView = 'today' | 'week' | 'month' | 'calendar'

export interface Task {
  id: string
  seriesId?: string
  title: string
  description?: string
  lifeArea?: string
  priority?: Priority
  dueDate?: string
  scheduledTime?: string
  focusMinutes?: number
  recurrence: Recurrence
  recurrenceAnchorDate?: string
  occurrenceDate: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface FocusSession {
  id: string
  kind: 'focus' | 'short_break' | 'long_break'
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  taskId?: string
  activity?: string
  plannedSeconds: number
  activeSeconds: number
  pausedSeconds: number
  startedAt: string
  localDate?: string
  endedAt?: string
}

export interface LogEvent {
  id: string
  createdAt: string
  localDate: string
  timezone: string
  offset: string
  eventType:
    | 'task_created'
    | 'task_edited'
    | 'task_completed'
    | 'task_reopened'
    | 'task_deleted'
    | 'focus_started'
    | 'focus_completed'
    | 'focus_cancelled'
    | 'break_started'
    | 'break_completed'
    | 'break_cancelled'
  status: string
  entityId: string
  details: Record<string, unknown>
  deliveredAt?: string
}

export interface AppSettings {
  lifeAreas: string[]
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  streaksEnabled: boolean
  reducedMotion: boolean
  theme?: 'light' | 'dark'
  vaultPath?: string
}

export interface ProductState {
  version: 1
  tasks: Task[]
  sessions: FocusSession[]
  activeTimer?: TimerState
  outbox: LogEvent[]
  deletedSeriesIds: string[]
  dailyCompletionDates?: string[]
  settings: AppSettings
}

export function isTaskVisibleToday(task: Task, today: string): boolean {
  if (task.status === 'deleted') return false
  if (task.status === 'active') {
    return (task.dueDate ?? task.occurrenceDate) <= today
  }
  const completedDate = task.completedAt?.slice(0, 10) ?? task.occurrenceDate
  return completedDate === today
}

export function isTaskVisibleInView(
  task: Task,
  view: TaskListView,
  today: string,
  calendarMonth = today.slice(0, 7)
): boolean {
  if (task.status === 'deleted') return false
  if (view === 'today') return isTaskVisibleToday(task, today)

  const isUnscheduledActiveTask = task.status === 'active' && task.recurrence === 'none' && task.dueDate === undefined
  if (isUnscheduledActiveTask) return true

  const scheduledDate = task.dueDate ?? task.occurrenceDate
  if (view === 'calendar') return scheduledDate.slice(0, 7) === calendarMonth

  const taskDate = task.status === 'completed'
    ? task.completedAt?.slice(0, 10) ?? task.dueDate ?? task.occurrenceDate
    : scheduledDate

  if (view === 'month') return taskDate.slice(0, 7) === today.slice(0, 7)

  const todayDate = new Date(`${today}T12:00:00Z`)
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7
  const weekStart = new Date(todayDate)
  weekStart.setUTCDate(todayDate.getUTCDate() - mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
  const formatDate = (date: Date) => date.toISOString().slice(0, 10)
  return taskDate >= formatDate(weekStart) && taskDate <= formatDate(weekEnd)
}

export function isDailyTaskCompletion(tasks: readonly Task[], localDate: string): boolean {
  const visibleTasks = tasks.filter(task => isTaskVisibleToday(task, localDate))
  return visibleTasks.length > 0 && visibleTasks.every(task => task.status === 'completed')
}

function shiftLocalDate(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function updateDailyCompletionDates(
  dates: readonly string[] | undefined,
  tasks: readonly Task[],
  localDate: string
): string[] {
  const values = new Set(dates ?? [])
  if (isDailyTaskCompletion(tasks, localDate)) values.add(localDate)
  else values.delete(localDate)
  return [...values].sort()
}

export function dailyAppStreak(
  completionDates: readonly string[],
  today: string
): { current: number; best: number } {
  const dates = [...new Set(completionDates)].sort()
  const values = new Set(dates)
  let best = 0
  let run = 0
  let previous: string | undefined
  for (const date of dates) {
    run = previous && shiftLocalDate(previous, 1) === date ? run + 1 : 1
    best = Math.max(best, run)
    previous = date
  }

  let cursor = values.has(today) ? today : shiftLocalDate(today, -1)
  let current = 0
  while (values.has(cursor)) {
    current += 1
    cursor = shiftLocalDate(cursor, -1)
  }
  return { current, best }
}

export function recurringTaskStreak(
  tasks: readonly Task[],
  seriesId: string,
  asOfDate: string
): { current: number; best: number } {
  const seriesTasks = tasks
    .filter(task => task.seriesId === seriesId && task.occurrenceDate <= asOfDate)
    .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate))
  if (seriesTasks.length === 0) return { current: 0, best: 0 }

  const statusesByDate = new Map<string, TaskStatus[]>()
  for (const task of seriesTasks) {
    const statuses = statusesByDate.get(task.occurrenceDate) ?? []
    statuses.push(task.status)
    statusesByDate.set(task.occurrenceDate, statuses)
  }

  const recurrence = seriesTasks[0].recurrence
  const anchorDate = seriesTasks.find(task => task.recurrenceAnchorDate)?.recurrenceAnchorDate ?? seriesTasks[0].occurrenceDate
  let current = 0
  let best = 0
  let expectedDate = seriesTasks[0].occurrenceDate
  for (const date of [...statusesByDate.keys()].sort()) {
    if (date !== expectedDate) current = 0
    const statuses = statusesByDate.get(date)!
    if (statuses.includes('completed')) {
      current += 1
      best = Math.max(best, current)
    } else if (statuses.includes('active')) {
      current = 0
    }
    expectedDate = nextRecurrenceDate(recurrence, date, anchorDate)
  }

  if (expectedDate <= asOfDate) current = 0

  return { current, best }
}

function nextRecurrenceDate(recurrence: Recurrence, date: string, anchorDate: string): string {
  if (recurrence === 'daily') return shiftLocalDate(date, 1)
  if (recurrence === 'weekly') return shiftLocalDate(date, 7)
  if (recurrence === 'monthly') {
    const [year, month] = date.split('-').map(Number)
    const anchorDay = Number(anchorDate.slice(8, 10))
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(anchorDay, lastDay)).padStart(2, '0')}`
  }
  return date
}

export interface CommandContext {
  now: string
  localDate: string
  timezone: string
  offset: string
  id: () => string
  nowMs?: number
}

type TaskCreateCommand = {
  type: 'task.create'
  title: string
  description?: string
  lifeArea?: string
  priority?: Priority
  dueDate?: string
  scheduledTime?: string
  focusMinutes?: number
  recurrence: Recurrence
}

type TaskEditCommand = {
  type: 'task.edit'
  taskId: string
  changes: Partial<Pick<Task, 'title' | 'description' | 'lifeArea' | 'priority' | 'dueDate' | 'scheduledTime' | 'focusMinutes'>>
}

export type ProductCommand =
  | TaskCreateCommand
  | TaskEditCommand
  | { type: 'task.complete'; taskId: string }
  | { type: 'task.reopen'; taskId: string }
  | { type: 'task.delete'; taskId: string; scope: 'occurrence' | 'series' }
  | { type: 'day.ensure'; localDate: string }
  | {
      type: 'timer.start'
      kind: TimerKind
      plannedSeconds: number
      taskId?: string
      activity?: string
    }
  | { type: 'timer.pause' }
  | { type: 'timer.resume' }
  | { type: 'timer.complete' }
  | { type: 'timer.cancel' }
  | { type: 'history.clear'; kind: 'focus' | 'rest' }
  | { type: 'settings.update'; changes: Partial<AppSettings> }

export function createInitialState(): ProductState {
  return {
    version: 1,
    tasks: [],
    sessions: [],
    outbox: [],
    deletedSeriesIds: [],
    dailyCompletionDates: [],
    settings: {
      lifeAreas: ['Health', 'Learning', 'Creative', 'Movement', 'Coursework'],
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      streaksEnabled: true,
      reducedMotion: false,
      theme: 'light'
    }
  }
}

function event(
  context: CommandContext,
  eventType: LogEvent['eventType'],
  entityId: string,
  status: string,
  details: Record<string, unknown>
): LogEvent {
  return {
    id: context.id(),
    createdAt: context.now,
    localDate: context.localDate,
    timezone: context.timezone,
    offset: context.offset,
    eventType,
    entityId,
    status,
    details
  }
}

function clone(state: ProductState): ProductState {
  return {
    ...state,
    tasks: state.tasks.map(task => ({ ...task })),
    sessions: state.sessions.map(session => ({ ...session })),
    activeTimer: state.activeTimer ? { ...state.activeTimer } : undefined,
    outbox: state.outbox.map(item => ({ ...item, details: { ...item.details } })),
    deletedSeriesIds: [...state.deletedSeriesIds],
    dailyCompletionDates: [...(state.dailyCompletionDates ?? [])],
    settings: { ...state.settings, lifeAreas: [...state.settings.lifeAreas] }
  }
}

function requireTask(state: ProductState, taskId: string): Task {
  const task = state.tasks.find(item => item.id === taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  return task
}

function completeActiveTask(state: ProductState, task: Task, context: CommandContext): boolean {
  if (task.status !== 'active') return false
  task.status = 'completed'
  task.completedAt = context.now
  task.updatedAt = context.now
  state.outbox.push(event(context, 'task_completed', task.id, task.status, { task: { ...task } }))
  return true
}

export function applyProductCommand(
  current: ProductState,
  command: ProductCommand,
  context: CommandContext
): ProductState {
  const state = clone(current)
  const nowMs = context.nowMs ?? Date.parse(context.now)

  if (command.type === 'task.create') {
    const seriesId = command.recurrence === 'none' ? undefined : context.id()
    const task: Task = {
      id: context.id(),
      seriesId,
      title: command.title.trim(),
      description: command.description?.trim() || undefined,
      lifeArea: command.lifeArea,
      priority: command.priority,
      dueDate: command.dueDate,
      scheduledTime: command.scheduledTime,
      focusMinutes: validateTaskFocusMinutes(command.focusMinutes),
      recurrence: command.recurrence,
      recurrenceAnchorDate: command.recurrence === 'monthly' ? command.dueDate ?? context.localDate : undefined,
      occurrenceDate: command.recurrence === 'none' ? context.localDate : command.dueDate ?? context.localDate,
      status: 'active',
      createdAt: context.now,
      updatedAt: context.now
    }
    if (!task.title) throw new Error('Task title is required')
    state.tasks.push(task)
    state.outbox.push(event(context, 'task_created', task.id, task.status, { task: { ...task } }))
    state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
    return state
  }

  if (command.type === 'task.edit') {
    const task = requireTask(state, command.taskId)
    const changes = { ...command.changes }
    if ('description' in changes) {
      changes.description = changes.description?.trim() || undefined
    }
    if ('focusMinutes' in changes) {
      changes.focusMinutes = validateTaskFocusMinutes(changes.focusMinutes)
    }
    const changedFields = Object.keys(changes).filter(key => {
      const field = key as keyof typeof changes
      return changes[field] !== task[field]
    })
    if (changedFields.length === 0) return state
    Object.assign(task, changes, { updatedAt: context.now })
    if (task.recurrence !== 'none' && changedFields.includes('dueDate') && task.dueDate) {
      task.occurrenceDate = task.dueDate
      if (task.recurrence === 'monthly') task.recurrenceAnchorDate = task.dueDate
    }
    if (!task.title.trim()) throw new Error('Task title is required')
    state.outbox.push(event(context, 'task_edited', task.id, task.status, {
      changedFields,
      task: { ...task }
    }))
    state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
    return state
  }

  if (command.type === 'task.complete') {
    const task = requireTask(state, command.taskId)
    completeActiveTask(state, task, context)
    state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
    return state
  }

  if (command.type === 'task.reopen') {
    const task = requireTask(state, command.taskId)
    if (task.status !== 'completed') return state
    task.status = 'active'
    delete task.completedAt
    task.updatedAt = context.now
    state.outbox.push(event(context, 'task_reopened', task.id, task.status, { task: { ...task } }))
    state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
    return state
  }

  if (command.type === 'task.delete') {
    const task = requireTask(state, command.taskId)
    task.status = 'deleted'
    task.updatedAt = context.now
    if (command.scope === 'series' && task.seriesId) {
      if (!state.deletedSeriesIds.includes(task.seriesId)) state.deletedSeriesIds.push(task.seriesId)
      for (const related of state.tasks) {
        if (related.seriesId === task.seriesId && related.status === 'active') {
          related.status = 'deleted'
          related.updatedAt = context.now
        }
      }
    }
    state.outbox.push(event(context, 'task_deleted', task.id, task.status, {
      scope: command.scope,
      task: { ...task }
    }))
    state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
    return state
  }

  if (command.type === 'timer.start') {
    if (state.activeTimer) throw new Error('A timer is already active')
    const linkedTask = command.kind === 'focus' && command.taskId
      ? requireTask(state, command.taskId)
      : undefined
    if (linkedTask && (linkedTask.status !== 'active' || linkedTask.focusMinutes === undefined)) {
      throw new Error('Linked tasks require a focus duration')
    }
    const timer = startTimer({
      id: context.id(),
      kind: command.kind,
      plannedSeconds: linkedTask ? linkedTask.focusMinutes! * 60 : command.plannedSeconds,
      startedAtMs: nowMs,
      taskId: command.taskId,
      activity: command.activity?.trim() || undefined
    })
    state.activeTimer = timer
    const eventType = timer.kind === 'focus' ? 'focus_started' : 'break_started'
    state.outbox.push(event(context, eventType, timer.id, timer.status, {
      kind: timer.kind,
      taskId: timer.taskId,
      activity: timer.activity,
      plannedSeconds: timer.plannedSeconds
    }))
    return state
  }

  if (command.type === 'timer.pause') {
    if (state.activeTimer) state.activeTimer = pauseTimer(state.activeTimer, nowMs)
    return state
  }

  if (command.type === 'timer.resume') {
    if (state.activeTimer) state.activeTimer = resumeTimer(state.activeTimer, nowMs)
    return state
  }

  if (command.type === 'timer.complete' || command.type === 'timer.cancel') {
    if (!state.activeTimer) return state
    const original = state.activeTimer
    const ended = command.type === 'timer.complete'
      ? completeTimer(original, nowMs)
      : cancelTimer(original, nowMs)
    const reading = readTimer(ended, nowMs)
    const session: FocusSession = {
      id: ended.id,
      kind: ended.kind,
      status: ended.status,
      taskId: ended.taskId,
      activity: ended.activity,
      plannedSeconds: ended.plannedSeconds,
      activeSeconds: reading.activeSeconds,
      pausedSeconds: reading.pausedSeconds,
      startedAt: new Date(ended.startedAtMs).toISOString(),
      localDate: context.localDate,
      endedAt: new Date(nowMs).toISOString()
    }
    state.sessions.push(session)
    state.activeTimer = undefined
    const eventType = ended.kind === 'focus'
      ? ended.status === 'completed' ? 'focus_completed' : 'focus_cancelled'
      : ended.status === 'completed' ? 'break_completed' : 'break_cancelled'
    state.outbox.push(event(context, eventType, ended.id, ended.status, {
      kind: ended.kind,
      taskId: ended.taskId,
      activity: ended.activity,
      plannedSeconds: ended.plannedSeconds,
      activeSeconds: reading.activeSeconds,
      pausedSeconds: reading.pausedSeconds
    }))
    if (ended.kind === 'focus' && ended.status === 'completed' && ended.taskId) {
      const linkedTask = state.tasks.find(task => task.id === ended.taskId)
      if (linkedTask && completeActiveTask(state, linkedTask, context)) {
        state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
      }
    }
    return state
  }

  if (command.type === 'settings.update') {
    const lifeAreas = command.changes.lifeAreas
      ?.map(area => area.trim())
      .filter((area, index, values) => area.length > 0 && values.indexOf(area) === index)
    state.settings = {
      ...state.settings,
      ...command.changes,
      lifeAreas: lifeAreas?.length ? lifeAreas : state.settings.lifeAreas,
      focusMinutes: clampMinutes(command.changes.focusMinutes ?? state.settings.focusMinutes),
      shortBreakMinutes: clampMinutes(command.changes.shortBreakMinutes ?? state.settings.shortBreakMinutes),
      longBreakMinutes: clampMinutes(command.changes.longBreakMinutes ?? state.settings.longBreakMinutes)
    }
    return state
  }

  if (command.type === 'history.clear') {
    state.sessions = state.sessions.filter(session => command.kind === 'focus'
      ? session.kind !== 'focus'
      : session.kind === 'focus')
    return state
  }

  const recurringSeries = new Map<string, Task>()
  for (const task of state.tasks) {
    if (task.recurrence !== 'none' && task.seriesId) {
      const current = recurringSeries.get(task.seriesId)
      if (!current || task.occurrenceDate > current.occurrenceDate ||
        (task.occurrenceDate === current.occurrenceDate && task.updatedAt > current.updatedAt)) {
        recurringSeries.set(task.seriesId, task)
      }
    }
  }

  for (const [seriesId, template] of recurringSeries) {
    if (state.deletedSeriesIds.includes(seriesId)) continue
    const exists = state.tasks.some(task => task.seriesId === seriesId && task.occurrenceDate === command.localDate)
    if (exists) continue
    if (!shouldCreateOccurrence(
      template.recurrence,
      template.recurrenceAnchorDate ?? template.occurrenceDate,
      command.localDate
    )) continue
    const occurrence: Task = {
      ...template,
      id: context.id(),
      occurrenceDate: command.localDate,
      dueDate: template.dueDate ? command.localDate : undefined,
      status: 'active',
      createdAt: context.now,
      updatedAt: context.now,
      completedAt: undefined
    }
    state.tasks.push(occurrence)
  }
  state.dailyCompletionDates = updateDailyCompletionDates(state.dailyCompletionDates, state.tasks, context.localDate)
  return state
}

function shouldCreateOccurrence(recurrence: Recurrence, previousDate: string, targetDate: string): boolean {
  if (recurrence === 'monthly') {
    const [anchorYear, anchorMonth, anchorDay] = previousDate.split('-').map(Number)
    const [targetYear, targetMonth, targetDay] = targetDate.split('-').map(Number)
    const elapsedMonths = (targetYear - anchorYear) * 12 + targetMonth - anchorMonth
    if (elapsedMonths <= 0) return false
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
    return targetDay === Math.min(anchorDay, lastDay)
  }
  const dayMs = 24 * 60 * 60 * 1000
  const previous = Date.parse(`${previousDate}T00:00:00Z`)
  const target = Date.parse(`${targetDate}T00:00:00Z`)
  const elapsedDays = Math.round((target - previous) / dayMs)
  return recurrence !== 'none' && elapsedDays > 0 && (recurrence === 'daily' || elapsedDays % 7 === 0)
}

function validateTaskFocusMinutes(value?: number): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || value < 1 || value > 180) {
    throw new Error('Task focus duration must be between 1 and 180 minutes')
  }
  return value
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(180, Math.max(1, Math.round(value)))
}
