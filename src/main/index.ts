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
  isProductState
} from './storage'

const currentDir = dirname(fileURLToPath(import.meta.url))
const packagedRendererPath = join(currentDir, '../renderer/index.html')
const packagedRendererUrl = pathToFileURL(packagedRendererPath).href
const requestedDevelopmentUrl = process.env.ELECTRON_RENDERER_URL
const developmentRendererUrl = !app.isPackaged && requestedDevelopmentUrl && isLocalhostRendererUrl(requestedDevelopmentUrl)
  ? requestedDevelopmentUrl
  : null
const rendererUrl = developmentRendererUrl ?? packagedRendererUrl
const stateStore = createStateStore(join(app.getPath('userData'), 'gentleday-state.json'))

let mainWindow: BrowserWindow | null = null
let quitAfterFlush = false
const vaultAccess = createConfiguredVaultAccess()
const appendEvents = createSerializedVaultAppender(() => vaultAccess.resolve())

if (process.env.GENTLEDAY_DEBUG_PORT) {
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

async function loadState(): Promise<ProductState | null> {
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

function saveState(input: unknown): Promise<void> {
  if (!isProductState(input)) {
    return Promise.reject(new Error('Refusing to save an invalid Gentleday state'))
  }
  const settings = { ...input.settings }
  const configuredVaultPath = vaultAccess.configuredPath()
  if (configuredVaultPath) settings.vaultPath = configuredVaultPath
  else delete settings.vaultPath
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
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Gentleday',
    backgroundColor: '#f3f0e7',
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
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
