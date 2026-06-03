import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import MapView from './components/MapView'
import RouteLibrary from './components/RouteLibrary'
import Profile from './components/Profile'
import Auth from './components/Auth'
import './index.css'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('map')
  const [selectedRoute, setSelectedRoute] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">🚲</div>
      <div className="splash-text">BikeRoutes SG</div>
    </div>
  )

  if (!user) return <Auth />

  return (
    <div className="app">
      <div className="app-content">
        {tab === 'map' && <MapView user={user} selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} />}
        {tab === 'routes' && <RouteLibrary user={user} onSelectRoute={(r) => { setSelectedRoute(r); setTab('map') }} />}
        {tab === 'profile' && <Profile user={user} />}
      </div>
      <nav className="bottom-nav">
        <button className={`nav-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          <span>Map</span>
        </button>
        <button className={`nav-btn ${tab === 'routes' ? 'active' : ''}`} onClick={() => setTab('routes')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
          <span>Routes</span>
        </button>
        <button className={`nav-btn ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  )
}
