import { useEffect, useState } from 'react'
import { formatDistance, formatDuration, formatDate, toGPX } from '../lib/utils'
import Toast from './Toast'

const API = import.meta.env.VITE_API_URL

export default function RouteLibrary({ user, onSelectRoute }) {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('date')
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const fetchRoutes = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/routes?user_id=${user.id}`)
      const data = await res.json()
      setRoutes(Array.isArray(data) ? data : [])
    } catch {
      showToast('Failed to load routes', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRoutes() }, [])

  const deleteRoute = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this route?')) return
    try {
      await fetch(`${API}/routes/${id}`, { method: 'DELETE' })
      setRoutes(r => r.filter(x => x.id !== id))
      showToast('Route deleted')
    } catch {
      showToast('Failed to delete', 'error')
    }
  }

  const exportGPX = async (e, route) => {
    e.stopPropagation()
    try {
      const res = await fetch(`${API}/routes/${route.id}`)
      const full = await res.json()
      const gpx = toGPX(full)
      const blob = new Blob([gpx], { type: 'application/gpx+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${route.name.replace(/\s+/g, '_')}.gpx`
      a.click()
      URL.revokeObjectURL(url)
      showToast('GPX exported')
    } catch {
      showToast('Export failed', 'error')
    }
  }

  const viewOnMap = async (route) => {
    try {
      const res = await fetch(`${API}/routes/${route.id}`)
      const full = await res.json()
      onSelectRoute(full)
    } catch {
      showToast('Failed to load route', 'error')
    }
  }

  const filtered = routes
    .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'date') return new Date(b.recorded_at) - new Date(a.recorded_at)
      if (sort === 'distance') return (b.distance_m || 0) - (a.distance_m || 0)
      if (sort === 'duration') return (b.duration_s || 0) - (a.duration_s || 0)
      return 0
    })

  return (
    <div className="library">
      <div className="library-header">
        <div className="library-title">My Routes</div>
        <div className="library-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search routes…" />
        </div>
        <div className="library-sort">
          {['date', 'distance', 'duration'].map(s => (
            <button key={s} className={`sort-btn ${sort === s ? 'active' : ''}`} onClick={() => setSort(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="library-list">
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-text">Loading routes…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗺️</div>
            <div className="empty-state-text">
              {search ? 'No routes match your search' : 'No routes yet.\nHead to the map and start recording!'}
            </div>
          </div>
        ) : filtered.map(route => (
          <div key={route.id} className="route-card" onClick={() => viewOnMap(route)}>
            <div className="route-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div className="route-card-info">
              <div className="route-card-name">{route.name}</div>
              <div className="route-card-meta">
                {formatDistance(route.distance_m)} · {formatDuration(route.duration_s)}
              </div>
              <div className="route-card-date">{formatDate(route.recorded_at)}</div>
            </div>
            <div className="route-card-actions">
              <button className="icon-btn" onClick={e => exportGPX(e, route)} title="Export GPX">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button className="icon-btn" onClick={e => deleteRoute(e, route.id)} title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
