export type TimerKind = 'focus' | 'short_break' | 'long_break'
export type TimerStatus = 'running' | 'paused' | 'completed' | 'cancelled'

export interface TimerState {
  id: string
  kind: TimerKind
  status: TimerStatus
  plannedSeconds: number
  startedAtMs: number
  runningSinceMs?: number
  pausedSinceMs?: number
  accumulatedActiveMs: number
  accumulatedPausedMs: number
  endedAtMs?: number
  taskId?: string
  activity?: string
}

export interface TimerReading {
  status: TimerStatus
  activeSeconds: number
  pausedSeconds: number
  remainingSeconds: number
}

type StartTimerInput = Pick<TimerState, 'id' | 'kind' | 'plannedSeconds' | 'startedAtMs' | 'taskId' | 'activity'>

export function startTimer(input: StartTimerInput): TimerState {
  if (input.plannedSeconds <= 0) throw new Error('Timer duration must be positive')
  return {
    ...input,
    status: 'running',
    runningSinceMs: input.startedAtMs,
    accumulatedActiveMs: 0,
    accumulatedPausedMs: 0
  }
}

// The wall clock can jump backwards (NTP sync, manual change). Never record a
// transition earlier than the previous one, or the saved timer becomes invalid.
function latestTransitionMs(timer: TimerState): number {
  return Math.max(timer.startedAtMs, timer.runningSinceMs ?? 0, timer.pausedSinceMs ?? 0)
}

export function pauseTimer(timer: TimerState, nowMs: number): TimerState {
  if (timer.status !== 'running' || timer.runningSinceMs === undefined) return timer
  const atMs = Math.max(nowMs, latestTransitionMs(timer))
  return {
    ...timer,
    status: 'paused',
    accumulatedActiveMs: timer.accumulatedActiveMs + (atMs - timer.runningSinceMs),
    runningSinceMs: undefined,
    pausedSinceMs: atMs
  }
}

export function resumeTimer(timer: TimerState, nowMs: number): TimerState {
  if (timer.status !== 'paused' || timer.pausedSinceMs === undefined) return timer
  const atMs = Math.max(nowMs, latestTransitionMs(timer))
  return {
    ...timer,
    status: 'running',
    accumulatedPausedMs: timer.accumulatedPausedMs + (atMs - timer.pausedSinceMs),
    pausedSinceMs: undefined,
    runningSinceMs: atMs
  }
}

function endTimer(timer: TimerState, nowMs: number, status: 'completed' | 'cancelled'): TimerState {
  if (timer.status === 'completed' || timer.status === 'cancelled') return timer
  const atMs = Math.max(nowMs, latestTransitionMs(timer))
  const activeDelta = timer.status === 'running' && timer.runningSinceMs !== undefined
    ? atMs - timer.runningSinceMs
    : 0
  const pausedDelta = timer.status === 'paused' && timer.pausedSinceMs !== undefined
    ? atMs - timer.pausedSinceMs
    : 0
  const accumulatedActiveMs = timer.accumulatedActiveMs + activeDelta
  return {
    ...timer,
    status,
    accumulatedActiveMs: status === 'completed'
      ? Math.min(accumulatedActiveMs, timer.plannedSeconds * 1000)
      : accumulatedActiveMs,
    accumulatedPausedMs: timer.accumulatedPausedMs + pausedDelta,
    runningSinceMs: undefined,
    pausedSinceMs: undefined,
    endedAtMs: atMs
  }
}

export function completeTimer(timer: TimerState, nowMs: number): TimerState {
  return endTimer(timer, nowMs, 'completed')
}

export function cancelTimer(timer: TimerState, nowMs: number): TimerState {
  return endTimer(timer, nowMs, 'cancelled')
}

export function readTimer(timer: TimerState, nowMs: number): TimerReading {
  const liveActiveMs = timer.status === 'running' && timer.runningSinceMs !== undefined
    ? Math.max(0, nowMs - timer.runningSinceMs)
    : 0
  const livePausedMs = timer.status === 'paused' && timer.pausedSinceMs !== undefined
    ? Math.max(0, nowMs - timer.pausedSinceMs)
    : 0
  const plannedMs = timer.plannedSeconds * 1000
  const rawActiveMs = timer.accumulatedActiveMs + liveActiveMs
  const reachedZero = timer.status === 'running' && rawActiveMs >= plannedMs
  const activeMs = reachedZero ? plannedMs : rawActiveMs
  const status = reachedZero ? 'completed' : timer.status

  return {
    status,
    activeSeconds: Math.floor(activeMs / 1000),
    pausedSeconds: Math.floor((timer.accumulatedPausedMs + livePausedMs) / 1000),
    remainingSeconds: Math.max(0, timer.plannedSeconds - Math.floor(activeMs / 1000))
  }
}
