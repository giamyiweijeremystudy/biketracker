import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { supabase } from './supabase'
import './index.css'

export default function App() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [user, setUser] = useState(null)
  const [routes, setRoutes] = useState([])

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [103.8198, 1.3521], // Singapore
      zoom: 12
    })
    return () => mapInstance.current?.remove()
  }, [])

  // Load routes when user is set
  useEffect(() => {
    if (!user) return
    fetch(`${import.meta.env.VITE_API_URL}/routes?user_id=${user.id}`)
      .then(r => r.json())
      .then(setRoutes)
  }, [user])

  const signIn = () => supabase.auth.signInWithOAuth({ provider: 'github' })
  const signOut = () => supabase.auth.signOut()

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 16px', background: '#1a1a2e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>🚲 BikeRoutes SG</strong>
        {user
          ? <button onClick={signOut} style={btnStyle}>Sign out</button>
          : <button onClick={signIn} style={btnStyle}>Sign in with GitHub</button>
        }
      </header>
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {user && routes.length > 0 && (
          <div style={{ position: 'absolute', top: 12, left: 12, background: '#fff', borderRadius: 8, padding: 12, maxWidth: 220, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <strong style={{ fontSize: 13 }}>Your routes</strong>
            {routes.map(r => (
              <div key={r.id} style={{ fontSize: 12, marginTop: 6, color: '#444' }}>
                {r.name} · {(r.distance_m / 1000).toFixed(1)} km
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const btnStyle = {
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: 13
}
