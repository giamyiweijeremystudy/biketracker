import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import MapView from './components/MapView'
import RouteLibrary from './components/RouteLibrary'
import Profile from './components/Profile'
import Auth from './components/Auth'
import Settings from './components/Settings'
import './index.css'

const DEFAULT_SETTINGS = {
  mapStyle: 'dark',
  preferParks: false,
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('map')
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [locationAsked, setLocationAsked] = useState(false)

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

  // Ask for location on mobile when app loads
  useEffect(() => {
    if (!user || locationAsked) return
    setLocationAsked(true)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {})
    }
  }, [user])

  const updateSetting = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">🚲</div>
      <div className="splash-text">BikeRoutes SG</div>
    </div>
  )

  if (!user) return <Auth />

  return (
    <div className="app">
      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">🚲</div>
          <nav className="sidebar-nav">
            <button className={`sidebar-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')} title="Map">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
              <span>Map</span>
            </button>
            <button className={`sidebar-btn ${tab === 'routes' ? 'active' : ''}`} onClick={() => setTab('routes')} title="Routes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
              <span>Routes</span>
            </button>
            <button className={`sidebar-btn ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')} title="Profile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              <span>Profile</span>
            </button>
          </nav>
          <div className="sidebar-bottom">
            <button className={`sidebar-btn ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(s => !s)} title="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              <span>Settings</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="main-content">
          {tab === 'map' && (
            <MapView
              user={user}
              selectedRoute={selectedRoute}
              setSelectedRoute={setSelectedRoute}
              mapStyle={settings.mapStyle}
              preferParks={settings.preferParks}
            />
          )}
          {tab === 'routes' && (
            <RouteLibrary
              user={user}
              onSelectRoute={r => { setSelectedRoute(r); setTab('map') }}
            />
          )}
          {tab === 'profile' && <Profile user={user} />}
        </main>

        {/* Settings panel */}
        {showSettings && (
          <Settings
            settings={settings}
            updateSetting={updateSetting}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {/* Mobile bottom nav */}
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
        <button className={`nav-btn ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(s => !s)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}
