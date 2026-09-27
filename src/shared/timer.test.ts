import { describe, expect, it } from 'vitest'
import { cancelTimer, completeTimer, pauseTimer, readTimer, resumeTimer, startTimer } from './timer'

const minute = 60_000

describe('timer seam', () => {
  it('excludes paused time from actual active duration', () => {
    let timer = startTimer({
      id: 'focus-1', kind: 'focus', plannedSeconds: 25 * 60, startedAtMs: 0,
      taskId: 'task-1'
    })

    timer = pauseTimer(timer, 5 * minute)
    expect(readTimer(timer, 7 * minute)).toMatchObject({ activeSeconds: 300, pausedSeconds: 120, status: 'paused' })

    timer = resumeTimer(timer, 7 * minute)
    timer = completeTimer(timer, 10 * minute)

    expect(readTimer(timer, 10 * minute)).toMatchObject({
      status: 'completed', activeSeconds: 480, pausedSeconds: 120, remainingSeconds: 1020
    })
  })

  it('cancels with the active time already completed', () => {
    let timer = startTimer({ id: 'focus-2', kind: 'focus', plannedSeconds: 1500, startedAtMs: 1_000 })
    timer = cancelTimer(timer, 91_000)
    expect(readTimer(timer, 91_000)).toMatchObject({ status: 'cancelled', activeSeconds: 90 })
  })

  it('reconstructs a running timer from persisted timestamps and completes at zero', () => {
    const timer = startTimer({ id: 'focus-3', kind: 'focus', plannedSeconds: 60, startedAtMs: 10_000 })
    expect(readTimer(timer, 40_000)).toMatchObject({ status: 'running', activeSeconds: 30, remainingSeconds: 30 })
    expect(readTimer(timer, 75_000)).toMatchObject({ status: 'completed', activeSeconds: 60, remainingSeconds: 0 })
  })

  it('reconstructs a paused timer from persisted timestamps without adding active time', () => {
    const timer = pauseTimer(
      startTimer({ id: 'focus-4', kind: 'focus', plannedSeconds: 60, startedAtMs: 10_000 }),
      40_000
    )

    expect(readTimer(timer, 100_000)).toMatchObject({
      status: 'paused', activeSeconds: 30, pausedSeconds: 60, remainingSeconds: 30
    })
  })
})
