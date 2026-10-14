import { useEffect, useState } from 'react'
import './App.css'

type Health = { status: string; timestamp: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="app">
      <div className="card">
        <h1 className="card-title">Helpdesk</h1>
        <p className="status">
          API status:{' '}
          {error ? (
            <span className="status-error">unreachable ({error})</span>
          ) : health ? (
            <span className="status-ok">{health.status}</span>
          ) : (
            <span className="status-pending">checking…</span>
          )}
        </p>
      </div>
    </main>
  )
}

export default App
