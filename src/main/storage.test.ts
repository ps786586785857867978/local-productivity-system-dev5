import { mkdir, mkdtemp, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendEventsToVault,
  approveVaultDirectory,
  createConfiguredVaultAccess,
  createSerializedVaultAppender,
  createStateStore,
  isAllowedRendererUrl,
  isLocalhostRendererUrl,
  isLogEvent,
  isProductState,
  isValidLocalDate,
  migrateLegacyStateFile,
  shouldMigrateLegacyState
} from './storage'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'gentleday-main-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function validState(vaultPath?: string): Record<string, unknown> {
  return {
    version: 1,
    tasks: [],
    sessions: [],
    outbox: [],
    deletedSeriesIds: [],
    settings: {
      lifeAreas: ['Health'],
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      streaksEnabled: true,
      reducedMotion: false,
      ...(vaultPath ? { vaultPath } : {})
    }
  }
}

function validEvent(id = 'event-1', localDate = '2026-09-27'): Record<string, unknown> {
  return {
    id,
    createdAt: '2026-09-27T10:00:00.000Z',
    localDate,
    timezone: 'Europe/Berlin',
    offset: '+02:00',
    eventType: 'task_created',
    status: 'active',
    entityId: 'task-1',
    details: { title: 'Test' }
  }
}

describe('runtime validation', () => {
  it('keeps explicit user-data profiles isolated from the global legacy profile', () => {
    expect(shouldMigrateLegacyState(false)).toBe(true)
    expect(shouldMigrateLegacyState(true)).toBe(false)
  })

  it('accepts a complete ProductState and rejects malformed nested values', () => {
    expect(isProductState(validState())).toBe(true)
    expect(isProductState({
      ...validState(),
      settings: { ...(validState().settings as Record<string, unknown>), theme: 'dark' }
    })).toBe(true)
    expect(isProductState({
      ...validState(),
      settings: { ...(validState().settings as Record<string, unknown>), theme: 'system' }
    })).toBe(false)
    expect(isProductState({ ...validState(), tasks: [{ id: 'incomplete' }] })).toBe(false)
    expect(isProductState({ ...validState(), settings: { lifeAreas: [] } })).toBe(false)
  })

  it('accepts a complete LogEvent and rejects unsupported types and unsafe dates', () => {
    expect(isLogEvent(validEvent())).toBe(true)
    expect(isLogEvent({ ...validEvent(), eventType: 'process_launched' })).toBe(false)
    expect(isLogEvent(validEvent('event-2', '../2026-09-27'))).toBe(false)
  })

  it('rejects multiline metadata, invalid timestamps, and non-JSON-safe or oversized details', () => {
    expect(isLogEvent({ ...validEvent(), id: 'event-1\n## forged' })).toBe(false)
    expect(isLogEvent({ ...validEvent(), timezone: 'Europe/Berlin\n- Status: forged' })).toBe(false)
    expect(isLogEvent({ ...validEvent(), status: 'active\r\n- Event ID: forged' })).toBe(false)
    expect(isLogEvent({ ...validEvent(), createdAt: '2026-02-29T10:00:00.000Z' })).toBe(false)
    expect(isLogEvent({ ...validEvent(), deliveredAt: 'not-a-timestamp' })).toBe(false)
    expect(isLogEvent({ ...validEvent(), details: { value: Number.NaN } })).toBe(false)
    expect(isLogEvent({ ...validEvent(), details: { value: new Map([['key', 'value']]) } })).toBe(false)
    expect(isLogEvent({ ...validEvent(), details: { value: 'x'.repeat(70_000) } })).toBe(false)
  })

  it('requires real task dates and consistent terminal sessions and active timers', () => {
    const task = {
      id: 'task-1',
      title: 'Test',
      recurrence: 'none',
      occurrenceDate: '2026-09-27',
      status: 'active',
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z'
    }
    const session = {
      id: 'timer-1',
      kind: 'focus',
      status: 'completed',
      plannedSeconds: 1500,
      activeSeconds: 1200,
      pausedSeconds: 30,
      startedAt: '2026-09-27T10:00:00.000Z',
      localDate: '2026-09-27',
      endedAt: '2026-09-27T10:20:30.000Z'
    }
    const activeTimer = {
      id: 'timer-2',
      kind: 'focus',
      status: 'running',
      plannedSeconds: 1500,
      startedAtMs: 1_000,
      runningSinceMs: 1_000,
      accumulatedActiveMs: 0,
      accumulatedPausedMs: 0
    }

    expect(isProductState({ ...validState(), tasks: [{ ...task, dueDate: '2026-02-29' }] })).toBe(false)
    expect(isProductState({ ...validState(), tasks: [{ ...task, createdAt: 'yesterday' }] })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...task, status: 'deleted', completedAt: '2026-09-27T10:05:00.000Z' }]
    })).toBe(true)
    expect(isProductState({ ...validState(), sessions: [{ ...session, endedAt: undefined }] })).toBe(false)
    expect(isProductState({ ...validState(), sessions: [{ ...session, status: 'running' }] })).toBe(false)
    expect(isProductState({ ...validState(), sessions: [{ ...session, endedAt: '2026-09-27T09:59:59.000Z' }] })).toBe(false)
    expect(isProductState({ ...validState(), activeTimer: { ...activeTimer, runningSinceMs: undefined } })).toBe(false)
    expect(isProductState({ ...validState(), activeTimer: { ...activeTimer, pausedSinceMs: 1_100 } })).toBe(false)
    expect(isProductState({ ...validState(), activeTimer: { ...activeTimer, runningSinceMs: 999 } })).toBe(false)
    expect(isProductState({ ...validState(), activeTimer: { ...activeTimer, status: 'completed', endedAtMs: 2_000 } })).toBe(false)
    expect(isProductState({ ...validState(), tasks: [task], sessions: [session], activeTimer })).toBe(true)
  })

  it('accepts weekly tasks with valid scheduling metadata and rejects malformed values', () => {
    const weeklyTask = {
      id: 'task-weekly',
      seriesId: 'series-weekly',
      title: 'Weekly planning',
      recurrence: 'weekly',
      scheduledTime: '09:30',
      focusMinutes: 30,
      occurrenceDate: '2026-09-27',
      status: 'active',
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z'
    }

    expect(isProductState({ ...validState(), tasks: [weeklyTask] })).toBe(true)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, scheduledTime: '9:30' }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, scheduledTime: '24:00' }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, focusMinutes: 0 }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, focusMinutes: 181 }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, seriesId: undefined }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, recurrence: 'none' }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, dueDate: '2026-09-28' }]
    })).toBe(false)
    expect(isProductState({
      ...validState(),
      tasks: [{ ...weeklyTask, recurrence: 'daily', dueDate: '2026-09-28' }]
    })).toBe(true)
  })

  it('requires a real zero-padded calendar date', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true)
    expect(isValidLocalDate('2026-02-29')).toBe(false)
    expect(isValidLocalDate('2026-9-7')).toBe(false)
    expect(isValidLocalDate('2026/09/27')).toBe(false)
  })
})

describe('serialized state storage', () => {
  it('copies a legacy state file into the moonim profile without removing the original', async () => {
    const directory = await temporaryDirectory()
    const legacy = join(directory, 'Gentleday', 'gentleday-state.json')
    const current = join(directory, 'moonim', 'gentleday-state.json')
    const state = validState('/vault')
    await mkdir(join(directory, 'Gentleday'), { recursive: true })
    await writeFile(legacy, JSON.stringify(state), 'utf8')

    await migrateLegacyStateFile(legacy, current)

    expect(JSON.parse(await readFile(current, 'utf8'))).toEqual(state)
    expect(JSON.parse(await readFile(legacy, 'utf8'))).toEqual(state)
  })

  it('does not overwrite an existing moonim state during legacy migration', async () => {
    const directory = await temporaryDirectory()
    const legacy = join(directory, 'Gentleday', 'gentleday-state.json')
    const current = join(directory, 'moonim', 'gentleday-state.json')
    await mkdir(join(directory, 'Gentleday'), { recursive: true })
    await mkdir(join(directory, 'moonim'), { recursive: true })
    await writeFile(legacy, JSON.stringify(validState('/legacy')), 'utf8')
    await writeFile(current, JSON.stringify(validState('/current')), 'utf8')

    await migrateLegacyStateFile(legacy, current)

    expect(JSON.parse(await readFile(current, 'utf8'))).toEqual(validState('/current'))
  })

  it('serializes concurrent saves and leaves the last state in place without shared temp files', async () => {
    const directory = await temporaryDirectory()
    const target = join(directory, 'state.json')
    const store = createStateStore(target)
    const first = validState('/first')
    const second = validState('/second')

    await Promise.all([store.save(first), store.save(second)])
    await store.flush()

    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(second)
    expect((await readdir(directory)).filter(name => name.includes('.tmp-'))).toEqual([])
  })

  it('rejects invalid saved input and quarantines invalid loaded input', async () => {
    const directory = await temporaryDirectory()
    const target = join(directory, 'state.json')
    const store = createStateStore(target)

    await expect(store.save({ version: 1 })).rejects.toThrow('invalid Gentleday state')
    await writeFile(target, JSON.stringify({ ...validState(), outbox: [{}] }), 'utf8')
    await expect(store.load()).resolves.toBeNull()
    expect((await readdir(directory)).some(name => name.startsWith('state.json.corrupt-'))).toBe(true)
  })

  it('reloads a paused active timer for process-restart recovery', async () => {
    const directory = await temporaryDirectory()
    const store = createStateStore(join(directory, 'state.json'))
    const state = {
      ...validState(),
      activeTimer: {
        id: 'focus-paused',
        kind: 'focus',
        status: 'paused',
        plannedSeconds: 1500,
        startedAtMs: 1_000,
        pausedSinceMs: 301_000,
        accumulatedActiveMs: 300_000,
        accumulatedPausedMs: 0
      }
    }

    await store.save(state)
    await store.flush()

    await expect(store.load()).resolves.toEqual(state)
  })

  it('reloads all edited focus and break duration settings', async () => {
    const directory = await temporaryDirectory()
    const store = createStateStore(join(directory, 'state.json'))
    const state = validState() as ReturnType<typeof validState> & {
      settings: Record<string, unknown>
    }
    state.settings = {
      ...state.settings,
      focusMinutes: 45,
      shortBreakMinutes: 10,
      longBreakMinutes: 25
    }

    await store.save(state)
    await store.flush()

    await expect(store.load()).resolves.toMatchObject({
      settings: { focusMinutes: 45, shortBreakMinutes: 10, longBreakMinutes: 25 }
    })
  })
})

describe('vault append safety', () => {
  it('serializes appends so duplicate concurrent deliveries are written once', async () => {
    const vault = await temporaryDirectory()
    const access = createConfiguredVaultAccess()
    await access.choose(vault)
    const append = createSerializedVaultAppender(() => access.resolve())
    const event = validEvent()

    const results = await Promise.all([append([event]), append([event])])
    const file = await readFile(join(vault, 'Gentleday/Tasks/2026/09/2026-09-27.md'), 'utf8')

    expect(results).toEqual([['event-1'], ['event-1']])
    expect(file.match(/- Event ID: event-1/g)).toHaveLength(1)
  })

  it('rejects a symlinked directory that escapes the approved vault', async () => {
    const vault = await temporaryDirectory()
    const outside = await temporaryDirectory()
    await symlink(outside, join(vault, 'Gentleday'))
    const approval = await approveVaultDirectory(vault)

    await expect(appendEventsToVault(approval, [validEvent()])).rejects.toThrow('escapes the approved vault')
    await expect(readdir(outside)).resolves.toEqual([])
  })

  it('preserves an unavailable configured vault and reconnects on a later queued retry', async () => {
    const parent = await temporaryDirectory()
    const vault = join(parent, 'offline-vault')
    const access = createConfiguredVaultAccess()
    access.configure(vault)
    const append = createSerializedVaultAppender(() => access.resolve())

    await expect(append([validEvent()])).rejects.toThrow()
    expect(access.configuredPath()).toBe(vault)

    await mkdir(vault)
    await expect(append([validEvent()])).resolves.toEqual(['event-1'])
    await expect(readFile(join(vault, 'Gentleday/Tasks/2026/09/2026-09-27.md'), 'utf8'))
      .resolves.toContain('- Event ID: event-1')
  })

  it('rejects replacement of an approved vault root even at the same configured path', async () => {
    const parent = await temporaryDirectory()
    const vault = join(parent, 'vault')
    const displaced = join(parent, 'displaced-vault')
    await mkdir(vault)
    const approval = await approveVaultDirectory(vault)

    await rename(vault, displaced)
    await mkdir(vault)

    await expect(appendEventsToVault(approval, [validEvent()])).rejects.toThrow('approved vault root has changed')
    await expect(readdir(vault)).resolves.toEqual([])
  })
})

describe('renderer origin policy', () => {
  it('accepts only the packaged renderer file or loopback HTTP development origins', () => {
    const packaged = 'file:///Applications/Gentleday.app/Contents/Resources/app.asar/out/renderer/index.html'
    expect(isAllowedRendererUrl(packaged, packaged, false)).toBe(true)
    expect(isAllowedRendererUrl('file:///tmp/attacker.html', packaged, false)).toBe(false)
    expect(isAllowedRendererUrl('http://localhost:5173/settings', 'http://localhost:5173', true)).toBe(true)
    expect(isAllowedRendererUrl('http://127.0.0.1:5173/', 'http://localhost:5173', true)).toBe(false)
    expect(isAllowedRendererUrl('http://evil.example/', 'http://localhost:5173', true)).toBe(false)
  })

  it('only recognizes http loopback URLs for the development renderer override', () => {
    expect(isLocalhostRendererUrl('http://localhost:5173')).toBe(true)
    expect(isLocalhostRendererUrl('http://[::1]:5173')).toBe(true)
    expect(isLocalhostRendererUrl('https://localhost:5173')).toBe(false)
    expect(isLocalhostRendererUrl('file:///tmp/index.html')).toBe(false)
  })
})
