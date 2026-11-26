import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

/** Shows a recoverable message instead of a blank window if rendering throws. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="loading-shell" role="alert">
      <p>Something went wrong while showing moonim ({this.state.error.message}). Your saved data is unchanged.</p>
      <button className="primary" onClick={() => window.location.reload()}>Reload moonim</button>
    </div>
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
