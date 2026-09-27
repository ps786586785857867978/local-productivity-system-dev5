import type { GentledayApi } from '../../preload'

declare module '*.css'

declare global {
  interface Window {
    gentleday: GentledayApi
  }
}

export {}
