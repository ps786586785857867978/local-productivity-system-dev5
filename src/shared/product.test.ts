import { describe, expect, it } from 'vitest'
import { applyProductCommand, createInitialState, dailyAppStreak, isTaskVisibleInView, isTaskVisibleToday, recurringTaskStreak, type Task } from './product'

const context = {
  now: '2026-09-27T08:00:00.000+02:00',
  localDate: '2026-09-27',
  timezone: 'Europe/Brussels',
  offset: '+02:00',
  id: (() => {
    let value = 0
    return () => `id-${++value}`
  })()
}

describe('product task seam', () => {
  it('creates, edits, completes, and reopens a task while queuing append-only events', () => {
    let state = createInitialState()

    state = applyProductCommand(state, {
      type: 'task.create',
      title: 'Review interaction design notes',
      lifeArea: 'Coursework',
      priority: 'high',
      dueDate: '2026-09-27',
      recurrence: 'none'
    }, context)

    const taskId = state.tasks[0].id
    expect(state.tasks[0]).toMatchObject({ title: 'Review interaction design notes', status: 'active' })
    expect(state.outbox.at(-1)).toMatchObject({ eventType: 'task_created', entityId: taskId })

    state = applyProductCommand(state, {
      type: 'task.edit', taskId, changes: { title: 'Review interaction design research' }
    }, { ...context, now: '2026-09-27T08:05:00.000+02:00' })
    expect(state.tasks[0].title).toBe('Review interaction design research')
    expect(state.outbox.at(-1)).toMatchObject({ eventType: 'task_edited', details: { changedFields: ['title'] } })

    state = applyProductCommand(state, { type: 'task.complete', taskId }, { ...context, now: '2026-09-27T08:30:00.000+02:00' })
    expect(state.tasks[0].status).toBe('completed')
    expect(state.outbox.at(-1)?.eventType).toBe('task_completed')

    state = applyProductCommand(state, { type: 'task.reopen', taskId }, { ...context, now: '2026-09-27T09:00:00.000+02:00' })
    expect(state.tasks[0].status).toBe('active')
    expect(state.outbox.at(-1)?.eventType).toBe('task_reopened')
  })

  it('creates and edits an optional task description', () => {
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Plan portfolio review',
      description: 'Collect the strongest interaction design examples.',
      recurrence: 'none'
    }, context)

    const taskId = state.tasks[0].id
    expect(state.tasks[0].description).toBe('Collect the strongest interaction design examples.')
    expect(state.outbox.at(-1)?.details).toMatchObject({
      task: { description: 'Collect the strongest interaction design examples.' }
    })

    state = applyProductCommand(state, {
      type: 'task.edit',
      taskId,
      changes: { description: 'Include the final moonim case study.' }
    }, { ...context, now: '2026-09-27T08:10:00.000+02:00' })

    expect(state.tasks[0].description).toBe('Include the final moonim case study.')
    expect(state.outbox.at(-1)).toMatchObject({
      eventType: 'task_edited',
      details: { changedFields: ['description'] }
    })
  })

  it('creates one new daily occurrence after midnight without deleting yesterday', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'task.create', title: 'Mandarin lesson', lifeArea: 'Learning', recurrence: 'daily'
    }, context)
    const original = state.tasks[0]
    state = applyProductCommand(state, { type: 'task.complete', taskId: original.id }, context)

    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-28' }, {
      ...context,
      now: '2026-09-28T00:01:00.000+02:00',
      localDate: '2026-09-28'
    })
    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-28' }, {
      ...context,
      now: '2026-09-28T00:02:00.000+02:00',
      localDate: '2026-09-28'
    })

    expect(state.tasks).toHaveLength(2)
    expect(state.tasks[0]).toMatchObject({ occurrenceDate: '2026-09-27', status: 'completed' })
    expect(state.tasks[1]).toMatchObject({ occurrenceDate: '2026-09-28', status: 'active', seriesId: original.seriesId })
  })

  it('deletes only an occurrence or prevents the entire series from returning', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'task.create', title: 'Read for 30 minutes', lifeArea: 'Learning', recurrence: 'daily'
    }, context)
    const first = state.tasks[0]

    state = applyProductCommand(state, { type: 'task.delete', taskId: first.id, scope: 'occurrence' }, context)
    expect(state.tasks[0].status).toBe('deleted')

    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-28' }, {
      ...context, localDate: '2026-09-28', now: '2026-09-28T00:01:00.000+02:00'
    })
    const second = state.tasks.find(task => task.occurrenceDate === '2026-09-28')!
    expect(second.status).toBe('active')

    state = applyProductCommand(state, { type: 'task.delete', taskId: second.id, scope: 'series' }, context)
    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-29' }, {
      ...context, localDate: '2026-09-29', now: '2026-09-29T00:01:00.000+02:00'
    })
    expect(state.tasks.some(task => task.occurrenceDate === '2026-09-29')).toBe(false)
  })

  it('uses the latest edited occurrence as the next daily template', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'task.create', title: 'Drawing practice', lifeArea: 'Creative', recurrence: 'daily'
    }, context)
    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-28' }, {
      ...context, localDate: '2026-09-28', now: '2026-09-28T00:01:00.000+02:00'
    })
    const second = state.tasks.find(task => task.occurrenceDate === '2026-09-28')!
    state = applyProductCommand(state, {
      type: 'task.edit', taskId: second.id, changes: { title: 'Sketchbook practice' }
    }, { ...context, localDate: '2026-09-28', now: '2026-09-28T08:00:00.000+02:00' })
    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-29' }, {
      ...context, localDate: '2026-09-29', now: '2026-09-29T00:01:00.000+02:00'
    })

    expect(state.tasks.find(task => task.occurrenceDate === '2026-09-29')?.title).toBe('Sketchbook practice')
  })

  it('creates weekly occurrences on the same weekday and preserves the scheduled time', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'task.create',
      title: 'Weekly planning',
      lifeArea: 'Coursework',
      recurrence: 'weekly',
      scheduledTime: '09:30'
    }, context)
    const original = state.tasks[0]

    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-09-28' }, {
      ...context,
      now: '2026-09-28T00:01:00.000+02:00',
      localDate: '2026-09-28'
    })
    expect(state.tasks).toHaveLength(1)

    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-10-04' }, {
      ...context,
      now: '2026-10-04T00:01:00.000+02:00',
      localDate: '2026-10-04'
    })

    expect(state.tasks).toHaveLength(2)
    expect(state.tasks[1]).toMatchObject({
      occurrenceDate: '2026-10-04',
      recurrence: 'weekly',
      scheduledTime: '09:30',
      seriesId: original.seriesId,
      status: 'active'
    })
  })

  it('creates monthly occurrences from a stable anchor without end-of-month drift', () => {
    const januaryContext = {
      ...context,
      now: '2027-01-31T08:00:00.000+01:00',
      localDate: '2027-01-31'
    }
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Month-end review',
      dueDate: '2027-01-31',
      scheduledTime: '16:00',
      focusMinutes: 45,
      recurrence: 'monthly'
    }, januaryContext)
    const seriesId = state.tasks[0].seriesId

    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2027-02-28' }, {
      ...januaryContext, now: '2027-02-28T00:01:00.000+01:00', localDate: '2027-02-28'
    })
    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2027-03-28' }, {
      ...januaryContext, now: '2027-03-28T00:01:00.000+02:00', localDate: '2027-03-28'
    })
    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2027-03-31' }, {
      ...januaryContext, now: '2027-03-31T00:01:00.000+02:00', localDate: '2027-03-31'
    })

    expect(state.tasks.filter(task => task.seriesId === seriesId).map(task => ({
      date: task.occurrenceDate,
      dueDate: task.dueDate,
      anchor: task.recurrenceAnchorDate,
      duration: task.focusMinutes
    }))).toEqual([
      { date: '2027-01-31', dueDate: '2027-01-31', anchor: '2027-01-31', duration: 45 },
      { date: '2027-02-28', dueDate: '2027-02-28', anchor: '2027-01-31', duration: 45 },
      { date: '2027-03-31', dueDate: '2027-03-31', anchor: '2027-01-31', duration: 45 }
    ])
  })

  it('uses the selected due date as the start date for a recurring task', () => {
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Monday review',
      dueDate: '2026-09-28',
      scheduledTime: '15:00',
      recurrence: 'weekly'
    }, context)

    expect(state.tasks[0].occurrenceDate).toBe('2026-09-28')
    expect(isTaskVisibleToday(state.tasks[0], '2026-09-27')).toBe(false)

    state = applyProductCommand(state, { type: 'day.ensure', localDate: '2026-10-05' }, {
      ...context,
      now: '2026-10-05T00:01:00.000+02:00',
      localDate: '2026-10-05'
    })

    expect(state.tasks.at(-1)).toMatchObject({
      occurrenceDate: '2026-10-05',
      dueDate: '2026-10-05',
      scheduledTime: '15:00',
      recurrence: 'weekly'
    })
  })

  it('keeps a recurring occurrence valid when its due date is edited', () => {
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Weekly review',
      dueDate: '2026-09-28',
      recurrence: 'weekly'
    }, context)

    state = applyProductCommand(state, {
      type: 'task.edit',
      taskId: state.tasks[0].id,
      changes: { dueDate: '2026-09-29' }
    }, { ...context, now: '2026-09-27T09:00:00.000+02:00' })

    expect(state.tasks[0]).toMatchObject({
      dueDate: '2026-09-29',
      occurrenceDate: '2026-09-29',
      recurrence: 'weekly'
    })
  })
})

describe('Today visibility seam', () => {
  it('keeps unfinished one-off tasks visible after their creation day', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'task.create', title: 'Finish report', lifeArea: 'Coursework', recurrence: 'none'
    }, context)

    expect(isTaskVisibleToday(state.tasks[0], '2026-09-28')).toBe(true)
  })

  it('filters dated tasks across today, week, month, and calendar views', () => {
    const task = (date: string): Task => ({
      id: date,
      title: date,
      dueDate: date,
      recurrence: 'none',
      occurrenceDate: '2026-09-01',
      status: 'active',
      createdAt: '2026-09-01T08:00:00.000+02:00',
      updatedAt: '2026-09-01T08:00:00.000+02:00'
    })

    expect(isTaskVisibleInView(task('2026-09-28'), 'today', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(task('2026-10-02'), 'week', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(task('2026-10-05'), 'week', '2026-09-28')).toBe(false)
    expect(isTaskVisibleInView(task('2026-09-30'), 'month', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(task('2026-10-01'), 'month', '2026-09-28')).toBe(false)
    expect(isTaskVisibleInView(task('2026-10-12'), 'calendar', '2026-09-28', '2026-10')).toBe(true)
    expect(isTaskVisibleInView(task('2026-09-30'), 'calendar', '2026-09-28', '2026-10')).toBe(false)
  })

  it('shows current and overdue recurring work in Today but excludes future occurrences', () => {
    const recurringTask = (date: string): Task => ({
      id: date,
      title: 'Weekly review',
      dueDate: date,
      recurrence: 'weekly',
      occurrenceDate: date,
      status: 'active',
      createdAt: '2026-09-01T08:00:00.000+02:00',
      updatedAt: '2026-09-01T08:00:00.000+02:00'
    })

    expect(isTaskVisibleInView(recurringTask('2026-09-27'), 'today', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(recurringTask('2026-09-28'), 'today', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(recurringTask('2026-10-05'), 'today', '2026-09-28')).toBe(false)
  })

  it('keeps active unscheduled tasks available in every broader task view', () => {
    const unscheduledTask: Task = {
      id: 'unscheduled-task',
      title: 'Organize references',
      recurrence: 'none',
      occurrenceDate: '2026-08-15',
      status: 'active',
      createdAt: '2026-08-15T08:00:00.000+02:00',
      updatedAt: '2026-08-15T08:00:00.000+02:00'
    }

    expect(isTaskVisibleInView(unscheduledTask, 'week', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(unscheduledTask, 'month', '2026-09-28')).toBe(true)
    expect(isTaskVisibleInView(unscheduledTask, 'calendar', '2026-09-28', '2026-10')).toBe(true)
  })

  it('places completed calendar tasks by their scheduled date rather than completion date', () => {
    const completedTask: Task = {
      id: 'completed-task',
      title: 'Submit report',
      dueDate: '2026-09-30',
      recurrence: 'none',
      occurrenceDate: '2026-09-30',
      status: 'completed',
      completedAt: '2026-10-01T08:00:00.000+02:00',
      createdAt: '2026-09-01T08:00:00.000+02:00',
      updatedAt: '2026-10-01T08:00:00.000+02:00'
    }

    expect(isTaskVisibleInView(completedTask, 'calendar', '2026-10-01', '2026-09')).toBe(true)
    expect(isTaskVisibleInView(completedTask, 'calendar', '2026-10-01', '2026-10')).toBe(false)
  })
})

describe('product timer seam', () => {
  it('rejects linking a task that does not define a focus duration', () => {
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Review notes',
      recurrence: 'none'
    }, context)

    expect(() => applyProductCommand(state, {
        type: 'timer.start',
        kind: 'focus',
        plannedSeconds: 1500,
        taskId: state.tasks[0].id
      }, { ...context, nowMs: 0 }))
      .toThrow('Linked tasks require a focus duration')
  })

  it('uses an optional task focus duration instead of the global default', () => {
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Drawing practice',
      focusMinutes: 30,
      recurrence: 'none'
    }, context)
    const taskId = state.tasks[0].id

    state = applyProductCommand(state, {
      type: 'timer.start',
      kind: 'focus',
      plannedSeconds: 1500,
      taskId
    }, { ...context, nowMs: 0 })

    expect(state.tasks[0].focusMinutes).toBe(30)
    expect(state.activeTimer?.plannedSeconds).toBe(1800)
  })

  it('completes an active linked task when its focus session completes', () => {
    let state = applyProductCommand(createInitialState(), {
      type: 'task.create',
      title: 'Finish the interaction prototype',
      focusMinutes: 30,
      recurrence: 'none'
    }, context)
    const taskId = state.tasks[0].id

    state = applyProductCommand(state, {
      type: 'timer.start', kind: 'focus', plannedSeconds: 1500, taskId
    }, { ...context, nowMs: 0 })
    state = applyProductCommand(state, { type: 'timer.complete' }, {
      ...context, now: '2026-09-27T08:30:00.000+02:00', nowMs: 1_800_000
    })

    expect(state.tasks[0]).toMatchObject({
      id: taskId,
      status: 'completed',
      completedAt: '2026-09-27T08:30:00.000+02:00'
    })
    expect(state.outbox.slice(-2).map(item => item.eventType)).toEqual([
      'focus_completed', 'task_completed'
    ])
  })

  it('persists timer transitions and logs actual active focus time', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'timer.start', kind: 'focus', plannedSeconds: 1500, activity: 'Assignment build'
    }, { ...context, nowMs: 0 })

    expect(state.activeTimer).toMatchObject({ kind: 'focus', status: 'running' })
    expect(state.outbox.at(-1)?.eventType).toBe('focus_started')

    state = applyProductCommand(state, { type: 'timer.pause' }, { ...context, nowMs: 300_000 })
    state = applyProductCommand(state, { type: 'timer.resume' }, { ...context, nowMs: 420_000 })
    state = applyProductCommand(state, { type: 'timer.complete' }, { ...context, nowMs: 600_000 })

    expect(state.activeTimer).toBeUndefined()
    expect(state.sessions.at(-1)).toMatchObject({
      status: 'completed', activeSeconds: 480, pausedSeconds: 120, localDate: '2026-09-27'
    })
    expect(state.outbox.at(-1)).toMatchObject({
      eventType: 'focus_completed',
      details: { activeSeconds: 480, pausedSeconds: 120, activity: 'Assignment build' }
    })
  })

  it('keeps break records separate and logs cancelled focus sessions', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'timer.start', kind: 'focus', plannedSeconds: 1500, activity: 'Drawing practice'
    }, { ...context, nowMs: 0 })
    state = applyProductCommand(state, { type: 'timer.cancel' }, { ...context, nowMs: 90_000 })
    expect(state.sessions.at(-1)).toMatchObject({ kind: 'focus', status: 'cancelled', activeSeconds: 90 })
    expect(state.outbox.at(-1)?.eventType).toBe('focus_cancelled')

    state = applyProductCommand(state, {
      type: 'timer.start', kind: 'short_break', plannedSeconds: 300
    }, { ...context, nowMs: 100_000 })
    state = applyProductCommand(state, { type: 'timer.complete' }, { ...context, nowMs: 400_000 })
    expect(state.sessions.at(-1)?.kind).toBe('short_break')
    expect(state.outbox.at(-1)?.eventType).toBe('break_completed')
  })

  it('clears focus and rest history independently without deleting logged events', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'timer.start', kind: 'focus', plannedSeconds: 1500, activity: 'Design review'
    }, { ...context, nowMs: 0 })
    state = applyProductCommand(state, { type: 'timer.complete' }, { ...context, nowMs: 60_000 })
    state = applyProductCommand(state, {
      type: 'timer.start', kind: 'short_break', plannedSeconds: 300
    }, { ...context, nowMs: 60_000 })
    state = applyProductCommand(state, { type: 'timer.complete' }, { ...context, nowMs: 120_000 })

    const loggedEventCount = state.outbox.length
    state = applyProductCommand(state, { type: 'history.clear', kind: 'focus' }, context)

    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].kind).toBe('short_break')
    expect(state.outbox).toHaveLength(loggedEventCount)

    state = applyProductCommand(state, { type: 'history.clear', kind: 'rest' }, context)
    expect(state.sessions).toHaveLength(0)
    expect(state.outbox).toHaveLength(loggedEventCount)
  })
})

describe('product settings seam', () => {
  it('defaults to the light theme and can persist an explicit dark theme', () => {
    expect(createInitialState().settings.theme).toBe('light')

    const state = applyProductCommand(createInitialState(), {
      type: 'settings.update',
      changes: { theme: 'dark' }
    }, context)

    expect(state.settings.theme).toBe('dark')
  })

  it('updates editable life areas and timer defaults', () => {
    const state = applyProductCommand(createInitialState(), {
      type: 'settings.update',
      changes: { lifeAreas: ['Health', 'Coursework', 'Home'], focusMinutes: 45 }
    }, context)

    expect(state.settings.lifeAreas).toEqual(['Health', 'Coursework', 'Home'])
    expect(state.settings.focusMinutes).toBe(45)
  })
})

describe('daily completion streak seam', () => {
  it('records a day only when every Today task is complete and revokes it when new work appears', () => {
    let state = createInitialState()
    state = applyProductCommand(state, { type: 'task.create', title: 'First step', recurrence: 'none' }, context)
    state = applyProductCommand(state, { type: 'task.create', title: 'Second step', recurrence: 'none' }, context)

    state = applyProductCommand(state, { type: 'task.complete', taskId: state.tasks[0].id }, context)
    expect(state.dailyCompletionDates).toEqual([])

    state = applyProductCommand(state, { type: 'task.complete', taskId: state.tasks[1].id }, context)
    expect(state.dailyCompletionDates).toEqual(['2026-09-27'])

    state = applyProductCommand(state, { type: 'task.create', title: 'Late addition', recurrence: 'none' }, context)
    expect(state.dailyCompletionDates).toEqual([])

    state = applyProductCommand(state, { type: 'task.complete', taskId: state.tasks[2].id }, context)
    expect(state.dailyCompletionDates).toEqual(['2026-09-27'])
  })

  it('calculates consecutive current and best daily streaks', () => {
    expect(dailyAppStreak(['2026-09-25', '2026-09-26', '2026-09-27'], '2026-09-27')).toEqual({
      current: 3,
      best: 3
    })
    expect(dailyAppStreak(['2026-09-24', '2026-09-26', '2026-09-27'], '2026-09-28')).toEqual({
      current: 2,
      best: 2
    })
  })
})

describe('recurring task streak seam', () => {
  it('counts completed occurrences, waives deleted dates, and breaks on an incomplete due occurrence', () => {
    const recurringTasks: Task[] = [
      { id: '1', seriesId: 'series-1', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-25', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now },
      { id: '2', seriesId: 'series-1', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-26', status: 'deleted', createdAt: context.now, updatedAt: context.now },
      { id: '3', seriesId: 'series-1', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-27', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now },
      { id: '4', seriesId: 'series-1', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-28', status: 'active', createdAt: context.now, updatedAt: context.now },
      { id: '5', seriesId: 'series-1', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-30', status: 'active', createdAt: context.now, updatedAt: context.now }
    ]

    expect(recurringTaskStreak(recurringTasks, 'series-1', '2026-09-29')).toEqual({ current: 0, best: 2 })
    expect(recurringTaskStreak(recurringTasks, 'series-1', '2026-09-27')).toEqual({ current: 2, best: 2 })
  })

  it('breaks a streak when an expected recurrence period is missing', () => {
    const dailyTasks: Task[] = [
      { id: 'daily-1', seriesId: 'daily-series', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-25', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now },
      { id: 'daily-3', seriesId: 'daily-series', title: 'Journal', recurrence: 'daily', occurrenceDate: '2026-09-27', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now }
    ]

    expect(recurringTaskStreak(dailyTasks, 'daily-series', '2026-09-27')).toEqual({ current: 1, best: 1 })
    expect(recurringTaskStreak(dailyTasks, 'daily-series', '2026-09-29')).toEqual({ current: 0, best: 1 })
  })

  it('uses the stable month-end anchor when checking monthly streak continuity', () => {
    const monthlyTasks: Task[] = [
      { id: 'month-1', seriesId: 'monthly-series', title: 'Review', recurrence: 'monthly', recurrenceAnchorDate: '2027-01-31', occurrenceDate: '2027-01-31', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now },
      { id: 'month-2', seriesId: 'monthly-series', title: 'Review', recurrence: 'monthly', recurrenceAnchorDate: '2027-01-31', occurrenceDate: '2027-02-28', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now },
      { id: 'month-4', seriesId: 'monthly-series', title: 'Review', recurrence: 'monthly', recurrenceAnchorDate: '2027-01-31', occurrenceDate: '2027-04-30', status: 'completed', createdAt: context.now, updatedAt: context.now, completedAt: context.now }
    ]

    expect(recurringTaskStreak(monthlyTasks, 'monthly-series', '2027-04-30')).toEqual({ current: 1, best: 2 })
  })
})
