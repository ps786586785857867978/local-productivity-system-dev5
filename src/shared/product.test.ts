import { describe, expect, it } from 'vitest'
import { applyProductCommand, createInitialState, isTaskVisibleToday } from './product'

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
})

describe('Today visibility seam', () => {
  it('keeps unfinished one-off tasks visible after their creation day', () => {
    let state = createInitialState()
    state = applyProductCommand(state, {
      type: 'task.create', title: 'Finish report', lifeArea: 'Coursework', recurrence: 'none'
    }, context)

    expect(isTaskVisibleToday(state.tasks[0], '2026-09-28')).toBe(true)
  })
})

describe('product timer seam', () => {
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
  it('updates editable life areas and timer defaults', () => {
    const state = applyProductCommand(createInitialState(), {
      type: 'settings.update',
      changes: { lifeAreas: ['Health', 'Coursework', 'Home'], focusMinutes: 45 }
    }, context)

    expect(state.settings.lifeAreas).toEqual(['Health', 'Coursework', 'Home'])
    expect(state.settings.focusMinutes).toBe(45)
  })
})
