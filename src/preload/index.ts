import { contextBridge, ipcRenderer } from 'electron'
import type { LogEvent, ProductState } from '../shared/product'

const api = {
  loadState: (): Promise<ProductState | null> => ipcRenderer.invoke('state:load'),
  saveState: (state: ProductState): Promise<void> => ipcRenderer.invoke('state:save', state),
  chooseVault: (): Promise<string | null> => ipcRenderer.invoke('vault:choose'),
  appendEvents: (vaultPath: string, events: LogEvent[]): Promise<string[]> =>
    ipcRenderer.invoke('vault:append', vaultPath, events),
  notify: (title: string, body: string): Promise<void> => ipcRenderer.invoke('app:notify', title, body)
}

contextBridge.exposeInMainWorld('gentleday', api)

export type GentledayApi = typeof api
