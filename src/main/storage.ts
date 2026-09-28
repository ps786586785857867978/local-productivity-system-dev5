import { constants } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LogEvent, ProductState } from '../shared/product'
import { formatMarkdownEvent, vaultRelativePath } from '../shared/vault'

const EVENT_TYPES = new Set<LogEvent['eventType']>([
  'task_created',
  'task_edited',
  'task_completed',
  'task_reopened',
  'task_deleted',
  'focus_started',
  'focus_completed',
  'focus_cancelled',
  'break_started',
  'break_completed',
  'break_cancelled'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const MAX_ID_LENGTH = 256
const MAX_METADATA_LENGTH = 128
const MAX_DETAILS_BYTES = 64 * 1024
const MAX_JSON_DEPTH = 12
const MAX_JSON_ENTRIES = 1_000
const MAX_JSON_STRING_LENGTH = 16 * 1024

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = true): value is string {
  return isString(value) && (allowEmpty || value.length > 0) && value.length <= maximum
}

function isSingleLine(value: unknown, maximum: number, allowEmpty = false): value is string {
  return isBoundedString(value, maximum, allowEmpty) && !/[\r\n\0]/.test(value)
}

function isOptionalSingleLine(value: unknown, maximum: number): value is string | undefined {
  return value === undefined || isSingleLine(value, maximum)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isTimestampMs(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

export function isValidLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value)
  return Boolean(match && isValidLocalDate(match[1]) && Number.isFinite(Date.parse(value)))
}

function isOptionalIsoTimestamp(value: unknown): value is string | undefined {
  return value === undefined || isIsoTimestamp(value)
}

function isOptionalLocalTime(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
}

function isJsonSafe(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value !== 'string' || value.length <= MAX_JSON_STRING_LENGTH
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (value === undefined) return true // JSON object properties with undefined values are safely omitted.
  if (typeof value !== 'object' || depth >= MAX_JSON_DEPTH || seen.has(value)) return false
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
  }
  seen.add(value)
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value)
  if (entries.length > MAX_JSON_ENTRIES) return false
  if (Array.isArray(value) && entries.some(([, item]) => item === undefined)) return false
  const valid = entries.every(([key, item]) => key.length <= MAX_METADATA_LENGTH && isJsonSafe(item, depth + 1, seen))
  seen.delete(value)
  return valid
}

function hasBoundedJsonEncoding(value: unknown): boolean {
  try {
    const encoded = JSON.stringify(value)
    return encoded !== undefined && Buffer.byteLength(encoded, 'utf8') <= MAX_DETAILS_BYTES
  } catch {
    return false
  }
}

export function isLogEvent(value: unknown): value is LogEvent {
  if (!isRecord(value)) return false
  return isSingleLine(value.id, MAX_ID_LENGTH) &&
    isIsoTimestamp(value.createdAt) &&
    isValidLocalDate(value.localDate) &&
    isSingleLine(value.timezone, MAX_METADATA_LENGTH) &&
    typeof value.offset === 'string' && /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(value.offset) &&
    typeof value.eventType === 'string' &&
    EVENT_TYPES.has(value.eventType as LogEvent['eventType']) &&
    isOneOf(value.status, ['active', 'completed', 'deleted', 'running', 'paused', 'cancelled'] as const) &&
    isSingleLine(value.entityId, MAX_ID_LENGTH) &&
    isRecord(value.details) && isJsonSafe(value.details) && hasBoundedJsonEncoding(value.details) &&
    isOptionalIsoTimestamp(value.deliveredAt)
}

function isTask(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSingleLine(value.id, MAX_ID_LENGTH) &&
    isOptionalSingleLine(value.seriesId, MAX_ID_LENGTH) &&
    isBoundedString(value.title, MAX_JSON_STRING_LENGTH) &&
    (value.lifeArea === undefined || isBoundedString(value.lifeArea, MAX_METADATA_LENGTH)) &&
    (value.priority === undefined || isOneOf(value.priority, ['low', 'medium', 'high'] as const)) &&
    (value.dueDate === undefined || isValidLocalDate(value.dueDate)) &&
    isOptionalLocalTime(value.scheduledTime) &&
    (value.focusMinutes === undefined || (isPositiveInteger(value.focusMinutes) && value.focusMinutes <= 180)) &&
    isOneOf(value.recurrence, ['none', 'daily', 'weekly'] as const) &&
    isValidLocalDate(value.occurrenceDate) &&
    isOneOf(value.status, ['active', 'completed', 'deleted'] as const) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    isOptionalIsoTimestamp(value.completedAt) &&
    (value.status === 'completed'
      ? isIsoTimestamp(value.completedAt)
      : value.status === 'active' ? value.completedAt === undefined : true) &&
    (value.recurrence === 'none'
      ? value.seriesId === undefined
      : isSingleLine(value.seriesId, MAX_ID_LENGTH)) &&
    (value.recurrence !== 'weekly' || value.dueDate === undefined || value.dueDate === value.occurrenceDate)
}

function isFocusSession(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isSingleLine(value.id, MAX_ID_LENGTH) &&
    isOneOf(value.kind, ['focus', 'short_break', 'long_break'] as const) &&
    isOneOf(value.status, ['completed', 'cancelled'] as const) &&
    isOptionalSingleLine(value.taskId, MAX_ID_LENGTH) &&
    (value.activity === undefined || isBoundedString(value.activity, MAX_JSON_STRING_LENGTH)) &&
    isPositiveInteger(value.plannedSeconds) &&
    isNonNegativeInteger(value.activeSeconds) &&
    isNonNegativeInteger(value.pausedSeconds) &&
    isIsoTimestamp(value.startedAt) &&
    (value.localDate === undefined || isValidLocalDate(value.localDate)) &&
    isIsoTimestamp(value.endedAt) &&
    Date.parse(value.endedAt) >= Date.parse(value.startedAt)
}

function isTimerState(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!isSingleLine(value.id, MAX_ID_LENGTH) ||
    !isOneOf(value.kind, ['focus', 'short_break', 'long_break'] as const) ||
    !isOneOf(value.status, ['running', 'paused'] as const) ||
    !isPositiveInteger(value.plannedSeconds) ||
    !isTimestampMs(value.startedAtMs) ||
    !(value.runningSinceMs === undefined || isTimestampMs(value.runningSinceMs)) ||
    !(value.pausedSinceMs === undefined || isTimestampMs(value.pausedSinceMs)) ||
    !isNonNegativeInteger(value.accumulatedActiveMs) ||
    !isNonNegativeInteger(value.accumulatedPausedMs) ||
    value.endedAtMs !== undefined ||
    !isOptionalSingleLine(value.taskId, MAX_ID_LENGTH) ||
    (value.activity !== undefined && !isBoundedString(value.activity, MAX_JSON_STRING_LENGTH))) return false
  return value.status === 'running'
    ? value.runningSinceMs !== undefined && value.runningSinceMs >= value.startedAtMs && value.pausedSinceMs === undefined
    : value.runningSinceMs === undefined && value.pausedSinceMs !== undefined && value.pausedSinceMs >= value.startedAtMs
}

function isSettings(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Array.isArray(value.lifeAreas) &&
    value.lifeAreas.length > 0 && value.lifeAreas.length <= MAX_JSON_ENTRIES &&
    value.lifeAreas.every(area => isSingleLine(area, MAX_METADATA_LENGTH)) &&
    isPositiveInteger(value.focusMinutes) &&
    isPositiveInteger(value.shortBreakMinutes) &&
    isPositiveInteger(value.longBreakMinutes) &&
    typeof value.streaksEnabled === 'boolean' &&
    typeof value.reducedMotion === 'boolean' &&
    (value.theme === undefined || isOneOf(value.theme, ['light', 'dark'] as const)) &&
    (value.vaultPath === undefined || isSingleLine(value.vaultPath, 4096))
}

export function isProductState(value: unknown): value is ProductState {
  if (!isRecord(value)) return false
  return value.version === 1 &&
    Array.isArray(value.tasks) && value.tasks.every(isTask) &&
    Array.isArray(value.sessions) && value.sessions.every(isFocusSession) &&
    (value.activeTimer === undefined || isTimerState(value.activeTimer)) &&
    Array.isArray(value.outbox) && value.outbox.every(isLogEvent) &&
    Array.isArray(value.deletedSeriesIds) && value.deletedSeriesIds.every(id => isSingleLine(id, MAX_ID_LENGTH)) &&
    isSettings(value.settings)
}

export function shouldMigrateLegacyState(hasUserDataOverride: boolean): boolean {
  return !hasUserDataOverride
}

export async function migrateLegacyStateFile(legacy: string, target: string): Promise<void> {
  if (legacy === target) return
  await mkdir(dirname(target), { recursive: true })
  try {
    await copyFile(legacy, target, constants.COPYFILE_EXCL)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'EEXIST') return
    throw error
  }
}

function createQueue(): {
  enqueue<T>(operation: () => Promise<T>): Promise<T>
  flush(): Promise<void>
} {
  let tail = Promise.resolve()
  return {
    enqueue<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation)
      tail = result.then(() => undefined, () => undefined)
      return result
    },
    flush(): Promise<void> {
      return tail
    }
  }
}

export function createStateStore(target: string): {
  load(): Promise<ProductState | null>
  save(state: unknown): Promise<void>
  flush(): Promise<void>
} {
  const queue = createQueue()

  return {
    async load(): Promise<ProductState | null> {
      try {
        const parsed: unknown = JSON.parse(await readFile(target, 'utf8'))
        if (!isProductState(parsed)) throw new Error('Invalid Gentleday state on disk')
        return parsed
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        try {
          await rename(target, `${target}.corrupt-${Date.now()}-${randomUUID()}`)
        } catch {
          // Loading safely falls back to a clean state if quarantine is unavailable.
        }
        return null
      }
    },

    save(state: unknown): Promise<void> {
      if (!isProductState(state)) {
        return Promise.reject(new Error('Refusing to save an invalid Gentleday state'))
      }
      return queue.enqueue(async () => {
        const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`
        await mkdir(dirname(target), { recursive: true })
        try {
          await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
          await rename(temporary, target)
        } catch (error) {
          const { rm } = await import('node:fs/promises')
          await rm(temporary, { force: true }).catch(() => undefined)
          throw error
        }
      })
    },

    flush(): Promise<void> {
      return queue.flush()
    }
  }
}

export interface VaultApproval {
  canonicalPath: string
  device: number
  inode: number
}

function sameVaultApproval(left: VaultApproval, right: VaultApproval): boolean {
  return left.canonicalPath === right.canonicalPath && left.device === right.device && left.inode === right.inode
}

export async function approveVaultDirectory(path: string): Promise<VaultApproval> {
  const canonicalPath = await realpath(path)
  const linkInfo = await lstat(canonicalPath)
  const info = await stat(canonicalPath)
  if (linkInfo.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('The selected Obsidian vault is not a directory')
  }
  return { canonicalPath, device: info.dev, inode: info.ino }
}

async function verifyVaultApproval(approval: VaultApproval): Promise<void> {
  let current: VaultApproval
  try {
    current = await approveVaultDirectory(approval.canonicalPath)
  } catch {
    throw new Error('The approved vault root is unavailable or has changed')
  }
  if (!sameVaultApproval(approval, current)) throw new Error('The approved vault root has changed')
}

export interface ConfiguredVaultAccess {
  configure(path: string | null | undefined): void
  configuredPath(): string | null
  choose(path: string): Promise<string>
  resolve(): Promise<VaultApproval>
}

export function createConfiguredVaultAccess(): ConfiguredVaultAccess {
  let configured: string | null = null
  let approval: VaultApproval | null = null
  return {
    configure(path): void {
      const next = path ?? null
      if (next !== configured) approval = null
      configured = next
    },
    configuredPath(): string | null {
      return configured
    },
    async choose(path): Promise<string> {
      const next = await approveVaultDirectory(path)
      configured = next.canonicalPath
      approval = next
      return next.canonicalPath
    },
    async resolve(): Promise<VaultApproval> {
      if (!configured) throw new Error('Choose an Obsidian vault before appending events')
      const next = await approveVaultDirectory(configured)
      if (approval && !sameVaultApproval(approval, next)) {
        throw new Error('The approved vault root has changed')
      }
      approval = next
      return next
    }
  }
}

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
}

async function secureDirectory(approval: VaultApproval, components: string[]): Promise<string> {
  const root = approval.canonicalPath
  await verifyVaultApproval(approval)
  let current = root
  for (const component of components) {
    if (!component || component === '.' || component === '..' || component.includes('/') || component.includes('\\')) {
      throw new Error('Invalid vault path component')
    }
    current = join(current, component)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error('Vault event path escapes the approved vault through a symlink')
      if (!info.isDirectory()) throw new Error('Vault event path contains a non-directory component')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(current).catch(async mkdirError => {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError
      })
      const info = await lstat(current)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('Vault event path escapes the approved vault through a symlink')
      }
    }
    const actual = await realpath(current)
    if (!isInside(root, actual)) throw new Error('Vault event path escapes the approved vault')
  }
  return current
}

async function recheckParentBeforeOpen(approval: VaultApproval, parent: string): Promise<string> {
  await verifyVaultApproval(approval)
  const parentInfo = await lstat(parent)
  if (parentInfo.isSymbolicLink() || !parentInfo.isDirectory()) {
    throw new Error('Vault event path escapes the approved vault through a changed parent')
  }
  const actualParent = await realpath(parent)
  if (actualParent !== parent || !isInside(approval.canonicalPath, actualParent)) {
    throw new Error('Vault event path escapes the approved vault through a changed parent')
  }
  return actualParent
}

export async function appendEventsToVault(approval: VaultApproval, events: unknown): Promise<string[]> {
  if (!Array.isArray(events) || !events.every(isLogEvent)) {
    throw new Error('Refusing to append invalid Gentleday events')
  }
  await verifyVaultApproval(approval)
  const root = approval.canonicalPath

  const delivered: string[] = []
  for (const event of events) {
    const relativePath = vaultRelativePath(event)
    const components = relativePath.split('/')
    const fileName = components.pop()
    if (!fileName || fileName !== `${event.localDate}.md`) throw new Error('Invalid vault event path')
    const parent = await secureDirectory(approval, components)
    let target = join(parent, fileName)
    if (!isInside(root, target)) throw new Error('Vault event path escapes the approved vault')

    let existing = ''
    try {
      const info = await lstat(target)
      if (info.isSymbolicLink()) throw new Error('Vault event path escapes the approved vault through a symlink')
      if (!info.isFile()) throw new Error('Vault event target is not a file')
      existing = await readFile(target, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    if (!existing.includes(`- Event ID: ${event.id}`)) {
      const checkedParent = await recheckParentBeforeOpen(approval, parent)
      target = join(checkedParent, fileName)
      const handle = await open(
        target,
        constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600
      )
      try {
        const info = await handle.stat()
        if (!info.isFile()) throw new Error('Vault event target is not a file')
        await handle.writeFile(formatMarkdownEvent(event), 'utf8')
      } finally {
        await handle.close()
      }
    }
    delivered.push(event.id)
  }
  return delivered
}

export interface SerializedVaultAppender {
  (events: unknown): Promise<string[]>
  flush(): Promise<void>
}

export function createSerializedVaultAppender(
  approvedVault: () => Promise<VaultApproval>
): SerializedVaultAppender {
  const queue = createQueue()
  const append = (events: unknown): Promise<string[]> => queue.enqueue(async () => {
    const approval = await approvedVault()
    return appendEventsToVault(approval, events)
  })
  append.flush = () => queue.flush()
  return append
}

export function isLocalhostRendererUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export function isAllowedRendererUrl(senderUrl: string, expectedRendererUrl: string, development: boolean): boolean {
  try {
    const sender = new URL(senderUrl)
    const expected = new URL(expectedRendererUrl)
    if (development) {
      return isLocalhostRendererUrl(expected.href) && isLocalhostRendererUrl(sender.href) && sender.origin === expected.origin
    }
    sender.hash = ''
    sender.search = ''
    expected.hash = ''
    expected.search = ''
    return sender.protocol === 'file:' && sender.href === expected.href
  } catch {
    return false
  }
}
