import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ProductState } from '../shared/product'
import {
  createConfiguredVaultAccess,
  createSerializedVaultAppender,
  createStateStore,
  isAllowedRendererUrl,
  isLocalhostRendererUrl,
  isProductState,
  migrateLegacyStateFile,
  shouldMigrateLegacyState
} from './storage'

const currentDir = dirname(fileURLToPath(import.meta.url))
const packagedRendererPath = join(currentDir, '../renderer/index.html')
const packagedRendererUrl = pathToFileURL(packagedRendererPath).href
const requestedDevelopmentUrl = process.env.ELECTRON_RENDERER_URL
const developmentRendererUrl = !app.isPackaged && requestedDevelopmentUrl && isLocalhostRendererUrl(requestedDevelopmentUrl)
  ? requestedDevelopmentUrl
  : null
const rendererUrl = developmentRendererUrl ?? packagedRendererUrl
const stateFilename = 'gentleday-state.json'
const currentStatePath = join(app.getPath('userData'), stateFilename)
const legacyStatePath = join(app.getPath('appData'), 'Gentleday', stateFilename)
const migrateLegacyProfile = shouldMigrateLegacyState(app.commandLine.hasSwitch('user-data-dir'))
const stateStore = createStateStore(currentStatePath)
let legacyMigration: Promise<void> | null = null

let mainWindow: BrowserWindow | null = null
let quitAfterFlush = false
const vaultAccess = createConfiguredVaultAccess()
const appendEvents = createSerializedVaultAppender(() => vaultAccess.resolve())

function ensureLegacyMigration(): Promise<void> {
  legacyMigration ??= migrateLegacyProfile
    ? migrateLegacyStateFile(legacyStatePath, currentStatePath)
    : Promise.resolve()
  return legacyMigration
}

// Never expose a debugging port in the packaged app.
if (process.env.GENTLEDAY_DEBUG_PORT && !app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.GENTLEDAY_DEBUG_PORT)
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL()
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    !isAllowedRendererUrl(senderUrl, rendererUrl, developmentRendererUrl !== null)
  ) {
    throw new Error('Rejected IPC from an untrusted renderer')
  }
}

async function loadState(): Promise<{ state: ProductState | null; quarantinedPath: string | null }> {
  const state = await loadStoredState()
  return { state, quarantinedPath: stateStore.quarantinedPath() }
}

async function loadStoredState(): Promise<ProductState | null> {
  await ensureLegacyMigration()
  const state = await stateStore.load()
  if (!state) {
    vaultAccess.configure(null)
    return null
  }

  const storedVaultPath = state.settings.vaultPath
  if (!storedVaultPath) {
    vaultAccess.configure(null)
    return state
  }

  vaultAccess.configure(storedVaultPath)
  try {
    await vaultAccess.resolve()
  } catch {
    // Preserve the configured path so queued retries can reconnect automatically.
  }
  return state
}

async function saveState(input: unknown): Promise<void> {
  if (!isProductState(input)) {
    return Promise.reject(new Error('Refusing to save an invalid moonim state'))
  }
  const settings = { ...input.settings }
  const configuredVaultPath = vaultAccess.configuredPath()
  if (configuredVaultPath) settings.vaultPath = configuredVaultPath
  else delete settings.vaultPath
  await ensureLegacyMigration()
  return stateStore.save({ ...input, settings })
}

function installNavigationGuards(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url, rendererUrl, developmentRendererUrl !== null)) {
      event.preventDefault()
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: 'moonim',
    backgroundColor: LIGHT_BACKGROUND,
    // Shown once the renderer has applied the saved theme, so dark mode doesn't flash light.
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(currentDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  installNavigationGuards(mainWindow)
  if (developmentRendererUrl) void mainWindow.loadURL(developmentRendererUrl)
  else void mainWindow.loadFile(packagedRendererPath)

  const window = mainWindow
  const fallback = setTimeout(() => { if (!window.isDestroyed()) window.show() }, 3000)
  mainWindow.on('closed', () => {
    clearTimeout(fallback)
    mainWindow = null
  })
}

const LIGHT_BACKGROUND = '#ded6c8'
const DARK_BACKGROUND = '#20241d'
let timerNotification: ReturnType<typeof setTimeout> | undefined

// Runs in the main process so the alert still fires while the window is closed.
function scheduleTimerNotification(endsAtMs: unknown, title: unknown): void {
  clearTimeout(timerNotification)
  timerNotification = undefined
  if (endsAtMs === null) return
  if (typeof endsAtMs !== 'number' || !Number.isFinite(endsAtMs) || typeof title !== 'string' || title.length > 200) {
    throw new Error('Invalid timer notification')
  }
  const delay = Math.min(Math.max(0, endsAtMs - Date.now()), 24 * 60 * 60 * 1000)
  timerNotification = setTimeout(() => {
    timerNotification = undefined
    if (Notification.isSupported()) {
      new Notification({ title, body: 'Your time is complete. Start the next phase when you are ready.' }).show()
    }
  }, delay)
}

function registerIpcHandlers(): void {
  ipcMain.handle('state:load', event => {
    assertTrustedSender(event)
    return loadState()
  })
  ipcMain.handle('state:save', (event, state: unknown) => {
    assertTrustedSender(event)
    return saveState(state)
  })
  ipcMain.handle('vault:choose', async event => {
    assertTrustedSender(event)
    const options: OpenDialogOptions = {
      title: 'Choose your Obsidian vault',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return vaultAccess.choose(result.filePaths[0])
  })
  ipcMain.handle('vault:append', (event, _rendererSuppliedPath: unknown, events: unknown) => {
    assertTrustedSender(event)
    return appendEvents(events)
  })
  ipcMain.handle('window:ready', (event, theme: unknown) => {
    assertTrustedSender(event)
    mainWindow?.setBackgroundColor(theme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND)
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  })
  ipcMain.handle('timer:schedule', (event, endsAtMs: unknown, title: unknown) => {
    assertTrustedSender(event)
    scheduleTimerNotification(endsAtMs, title)
  })
  ipcMain.handle('app:notify', (event, title: unknown, body: unknown) => {
    assertTrustedSender(event)
    if (typeof title !== 'string' || typeof body !== 'string') {
      throw new Error('Invalid notification')
    }
    if (Notification.isSupported()) new Notification({ title, body }).show()
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', event => {
    if (quitAfterFlush) return
    event.preventDefault()
    quitAfterFlush = true
    void Promise.all([stateStore.flush(), appendEvents.flush()]).finally(() => app.quit())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
