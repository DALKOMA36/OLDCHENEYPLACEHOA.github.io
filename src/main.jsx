import { createRoot } from 'react-dom/client'
import { Component } from 'react'
import App from './App'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#ff6b6b', background: '#0a0a1a', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#fff', marginBottom: 16 }}>Jarvis Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#888', marginTop: 8 }}>{this.state.error.stack}</pre>
          <button onClick={() => { localStorage.clear(); window.location.reload() }}
            style={{ marginTop: 20, padding: '10px 20px', background: '#6c5ce7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Clear Data & Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
