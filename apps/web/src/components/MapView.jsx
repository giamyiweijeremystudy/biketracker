import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { formatDistance, formatDuration } from '../lib/utils'
import Toast from './Toast'

const API = import.meta.env.VITE_API_URL

export default function MapView({ user, selectedRoute, setSelectedRoute }) {
  const mapRef = useRef(null)
  const map = useRef(null)
  const watchId = useRef(null)
  const points = useRef([])
  const markerRef = useRef(null)

  const [recording, setRecording] = useState(false) // 'idle' | 'recording' | 'paused'
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [showSave, setShowSave] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const timerRef = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  // Init map
  useEffect(() => {
    if (!mapRef.current || map.current) return
    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [103.8198, 1.3521],
      zoom: 14
    })
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }), 'top-right')
    return () => map.current?.remove()
  }, [])

  // Draw selected route on map
  useEffect(() => {
    if (!map.current || !selectedRoute) return
    const run = () => {
      if (map.current.getSource('selected-route')) {
        map.current.removeLayer('selected-route-line')
        map.current.removeSource('selected-route')
      }
      if (!selectedRoute.route_points?.length) return
      const coords = [...selectedRoute.route_points]
        .sort((a, b) => a.seq - b.seq)
        .map(p => [p.lng, p.lat])

      map.current.addSource('selected-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
      })
      map.current.addLayer({
        id: 'selected-route-line',
        type: 'line',
        source: 'selected-route',
        paint: { 'line-color': '#00e87a', 'line-width': 4, 'line-opacity': 0.9 }
      })

      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 16 })
    }

    if (map.current.loaded()) run()
    else map.current.on('load', run)

    return () => {
      if (map.current?.getSource('selected-route')) {
        map.current.removeLayer('selected-route-line')
        map.current.removeSource('selected-route')
      }
    }
  }, [selectedRoute])

  // Draw live track
  const updateLiveTrack = useCallback(() => {
    if (!map.current || points.current.length < 2) return
    const coords = points.current.map(p => [p.lng, p.lat])
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    if (map.current.getSource('live-track')) {
      map.current.getSource('live-track').setData(geojson)
    } else {
      map.current.addSource('live-track', { type: 'geojson', data: geojson })
      map.current.addLayer({
        id: 'live-track-line', type: 'line', source: 'live-track',
        paint: { 'line-color': '#ff5252', 'line-width': 4, 'line-dasharray': [2, 1] }
      })
    }
  }, [])

  // GPS distance calc
  const haversine = (a, b) => {
    const R = 6371000
    const dLat = (b.lat - a.lat) * Math.PI / 180
    const dLng = (b.lng - a.lng) * Math.PI / 180
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }

  const startRecording = () => {
    points.current = []
    setElapsed(0)
    setDistance(0)
    setRecording(true)

    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)

    watchId.current = navigator.geolocation.watchPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: new Date().toISOString() }
      if (points.current.length > 0) {
        const d = haversine(points.current[points.current.length - 1], p)
        setDistance(prev => prev + d)
      }
      points.current.push(p)
      updateLiveTrack()

      // Move map to current position
      map.current?.setCenter([p.lng, p.lat])
    }, err => console.error(err), { enableHighAccuracy: true, maximumAge: 0 })
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    navigator.geolocation.clearWatch(watchId.current)
    setRecording(false)
    if (points.current.length > 2) {
      setRouteName(`Route ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`)
      setShowSave(true)
    } else {
      showToast('Not enough GPS points recorded', 'error')
      clearLiveTrack()
    }
  }

  const clearLiveTrack = () => {
    if (map.current?.getSource('live-track')) {
      map.current.removeLayer('live-track-line')
      map.current.removeSource('live-track')
    }
    points.current = []
  }

  const saveRoute = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          name: routeName || 'Unnamed route',
          points: points.current,
          distance_m: Math.round(distance),
          duration_s: elapsed
        })
      })
      if (!res.ok) throw new Error('Save failed')
      showToast('Route saved!')
      setShowSave(false)
      clearLiveTrack()
      setElapsed(0)
      setDistance(0)
    } catch (e) {
      showToast('Failed to save route', 'error')
    } finally {
      setSaving(false)
    }
  }

  const discardRoute = () => {
    setShowSave(false)
    clearLiveTrack()
    setElapsed(0)
    setDistance(0)
  }

  return (
    <div className="map-view">
      <div ref={mapRef} className="map-container" />

      {recording && (
        <div className="recording-hud">
          <div className="hud-stats">
            <div className="hud-stat">
              <span className="hud-stat-val">{formatDistance(distance)}</span>
              <span className="hud-stat-label">Distance</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-val">{formatDuration(elapsed)}</span>
              <span className="hud-stat-label">Time</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-val">{elapsed > 0 ? formatDistance(distance / elapsed * 3600) : '0.0'}</span>
              <span className="hud-stat-label">km/h avg</span>
            </div>
          </div>
        </div>
      )}

      <div className="map-controls">
        {selectedRoute && !recording && (
          <div className="map-action-row">
            <button className="map-action-btn" onClick={() => setSelectedRoute(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Clear route
            </button>
          </div>
        )}
        <button
          className={`record-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          title={recording ? 'Stop recording' : 'Start recording'}
        >
          <div className="record-icon" />
        </button>
      </div>

      {showSave && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && discardRoute()}>
          <div className="modal">
            <div className="modal-title">Save Route</div>
            <div className="hud-stats" style={{ marginBottom: 14, pointerEvents: 'none' }}>
              <div className="hud-stat">
                <span className="hud-stat-val">{formatDistance(distance)}</span>
                <span className="hud-stat-label">Distance</span>
              </div>
              <div className="hud-stat">
                <span className="hud-stat-val">{formatDuration(elapsed)}</span>
                <span className="hud-stat-label">Time</span>
              </div>
            </div>
            <input
              className="modal-input"
              value={routeName}
              onChange={e => setRouteName(e.target.value)}
              placeholder="Route name"
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={discardRoute}>Discard</button>
              <button className="btn-primary" onClick={saveRoute} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
