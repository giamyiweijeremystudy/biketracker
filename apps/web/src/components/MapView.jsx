import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { formatDistance, formatDuration } from '../lib/utils'
import Toast from './Toast'

const API = import.meta.env.VITE_API_URL

const MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
}

export default function MapView({ user, selectedRoute, setSelectedRoute, mapStyle }) {
  const mapRef = useRef(null)
  const map = useRef(null)
  const watchId = useRef(null)
  const points = useRef([])
  const startMarker = useRef(null)
  const endMarker = useRef(null)

  const [mapMode, setMapMode] = useState('plan') // 'plan' | 'record'
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [showSave, setShowSave] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  // Plan route state
  const [planStart, setPlanStart] = useState(null)
  const [planEnd, setPlanEnd] = useState(null)
  const [planStep, setPlanStep] = useState('start') // 'start' | 'end' | 'done'
  const [planLoading, setPlanLoading] = useState(false)
  const [planDistance, setPlanDistance] = useState(null)
  const [planDuration, setPlanDuration] = useState(null)
  const [startName, setStartName] = useState('')
  const [endName, setEndName] = useState('')

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
      style: MAP_STYLES[mapStyle] || MAP_STYLES.dark,
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

  // Update map style when setting changes
  useEffect(() => {
    if (!map.current) return
    const style = MAP_STYLES[mapStyle] || MAP_STYLES.dark
    map.current.setStyle(style)
  }, [mapStyle])

  // Map click handler for route planning
  useEffect(() => {
    if (!map.current) return
    const handleClick = (e) => {
      if (mapMode !== 'plan') return
      const { lng, lat } = e.lngLat
      if (planStep === 'start') {
        setPlanStart({ lng, lat })
        setStartName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        setPlanStep('end')
        placeMarker('start', [lng, lat])
        showToast('Start set — now click your destination')
      } else if (planStep === 'end') {
        setPlanEnd({ lng, lat })
        setEndName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        setPlanStep('done')
        placeMarker('end', [lng, lat])
      }
    }
    map.current.on('click', handleClick)
    return () => map.current?.off('click', handleClick)
  }, [mapMode, planStep])

  // Auto-fetch route when both points set
  useEffect(() => {
    if (planStep === 'done' && planStart && planEnd) {
      fetchPlannedRoute(planStart, planEnd)
    }
  }, [planStep])

  const placeMarker = (type, coords) => {
    const el = document.createElement('div')
    el.className = `map-marker map-marker-${type}`
    el.innerHTML = type === 'start' ? 'A' : 'B'
    if (type === 'start') {
      startMarker.current?.remove()
      startMarker.current = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map.current)
    } else {
      endMarker.current?.remove()
      endMarker.current = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map.current)
    }
  }

  const fetchPlannedRoute = async (start, end) => {
    setPlanLoading(true)
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
      const res = await fetch(url)
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found')
      const route = data.routes[0]
      setPlanDistance(route.distance)
      setPlanDuration(route.duration)
      drawPlannedRoute(route.geometry)
    } catch (e) {
      showToast('Could not find a route', 'error')
      setPlanStep('end')
    } finally {
      setPlanLoading(false)
    }
  }

  const drawPlannedRoute = (geometry) => {
    if (!map.current) return
    const run = () => {
      if (map.current.getSource('planned-route')) {
        map.current.getSource('planned-route').setData({ type: 'Feature', geometry })
      } else {
        map.current.addSource('planned-route', { type: 'geojson', data: { type: 'Feature', geometry } })
        map.current.addLayer({ id: 'planned-route-line', type: 'line', source: 'planned-route', paint: { 'line-color': '#00e87a', 'line-width': 5, 'line-opacity': 0.9 } })
      }
      const coords = geometry.coordinates
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 16 })
    }
    if (map.current.loaded()) run()
    else map.current.on('load', run)
  }

  const clearPlan = () => {
    setPlanStart(null)
    setPlanEnd(null)
    setPlanStep('start')
    setPlanDistance(null)
    setPlanDuration(null)
    setStartName('')
    setEndName('')
    startMarker.current?.remove()
    endMarker.current?.remove()
    startMarker.current = null
    endMarker.current = null
    if (map.current?.getSource('planned-route')) {
      map.current.removeLayer('planned-route-line')
      map.current.removeSource('planned-route')
    }
  }

  // Draw selected (saved) route
  useEffect(() => {
    if (!map.current || !selectedRoute) return
    const run = () => {
      if (map.current.getSource('selected-route')) {
        map.current.removeLayer('selected-route-line')
        map.current.removeSource('selected-route')
      }
      if (!selectedRoute.route_points?.length) return
      const coords = [...selectedRoute.route_points].sort((a, b) => a.seq - b.seq).map(p => [p.lng, p.lat])
      map.current.addSource('selected-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } })
      map.current.addLayer({ id: 'selected-route-line', type: 'line', source: 'selected-route', paint: { 'line-color': '#ffb74d', 'line-width': 4, 'line-opacity': 0.9 } })
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 16 })
    }
    if (map.current.loaded()) run()
    else map.current.on('load', run)
    return () => {
      if (map.current?.getSource('selected-route')) {
        try { map.current.removeLayer('selected-route-line'); map.current.removeSource('selected-route') } catch {}
      }
    }
  }, [selectedRoute])

  // Live track update
  const updateLiveTrack = useCallback(() => {
    if (!map.current || points.current.length < 2) return
    const coords = points.current.map(p => [p.lng, p.lat])
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    if (map.current.getSource('live-track')) {
      map.current.getSource('live-track').setData(geojson)
    } else {
      map.current.addSource('live-track', { type: 'geojson', data: geojson })
      map.current.addLayer({ id: 'live-track-line', type: 'line', source: 'live-track', paint: { 'line-color': '#ff5252', 'line-width': 4 } })
    }
  }, [])

  const haversine = (a, b) => {
    const R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
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
      if (points.current.length > 0) setDistance(prev => prev + haversine(points.current[points.current.length - 1], p))
      points.current.push(p)
      updateLiveTrack()
      map.current?.setCenter([p.lng, p.lat])
    }, err => showToast('GPS error: ' + err.message, 'error'), { enableHighAccuracy: true, maximumAge: 0 })
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    navigator.geolocation.clearWatch(watchId.current)
    setRecording(false)
    if (points.current.length > 2) {
      setRouteName(`Route ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`)
      setShowSave(true)
    } else {
      showToast('Not enough GPS points', 'error')
      clearLiveTrack()
    }
  }

  const clearLiveTrack = () => {
    if (map.current?.getSource('live-track')) {
      try { map.current.removeLayer('live-track-line'); map.current.removeSource('live-track') } catch {}
    }
    points.current = []
  }

  const saveRoute = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, name: routeName || 'Unnamed route', points: points.current, distance_m: Math.round(distance), duration_s: elapsed })
      })
      if (!res.ok) throw new Error()
      showToast('Route saved!')
      setShowSave(false)
      clearLiveTrack()
      setElapsed(0)
      setDistance(0)
    } catch {
      showToast('Failed to save', 'error')
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

      {/* Side panel */}
      <div className="map-panel">
        {/* Panel tabs */}
        <div className="panel-tabs">
          <button className={`panel-tab ${mapMode === 'plan' ? 'active' : ''}`} onClick={() => setMapMode('plan')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Plan
          </button>
          <button className={`panel-tab ${mapMode === 'record' ? 'active' : ''}`} onClick={() => setMapMode('record')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
            Record
          </button>
        </div>

        {/* Plan panel */}
        {mapMode === 'plan' && (
          <div className="panel-body">
            <p className="panel-hint">
              {planStep === 'start' && 'Tap the map to set your start point'}
              {planStep === 'end' && 'Now tap your destination'}
              {planStep === 'done' && planLoading && 'Finding route…'}
              {planStep === 'done' && !planLoading && 'Route found!'}
            </p>

            {planStart && (
              <div className="plan-point">
                <div className="plan-point-dot plan-point-dot-a">A</div>
                <div className="plan-point-text">{startName}</div>
              </div>
            )}
            {planEnd && (
              <div className="plan-point">
                <div className="plan-point-dot plan-point-dot-b">B</div>
                <div className="plan-point-text">{endName}</div>
              </div>
            )}

            {planDistance !== null && !planLoading && (
              <div className="plan-stats">
                <div className="plan-stat">
                  <span className="plan-stat-val">{formatDistance(planDistance)}</span>
                  <span className="plan-stat-label">Distance</span>
                </div>
                <div className="plan-stat">
                  <span className="plan-stat-val">{formatDuration(Math.round(planDuration))}</span>
                  <span className="plan-stat-label">Est. time</span>
                </div>
              </div>
            )}

            {planStart && (
              <button className="panel-clear-btn" onClick={clearPlan}>Clear route</button>
            )}
          </div>
        )}

        {/* Record panel */}
        {mapMode === 'record' && (
          <div className="panel-body">
            {!recording ? (
              <>
                <p className="panel-hint">Track your ride in real time</p>
                <button className="record-start-btn" onClick={startRecording}>
                  <div className="record-dot" />
                  Start recording
                </button>
              </>
            ) : (
              <>
                <div className="live-stats">
                  <div className="live-stat">
                    <span className="live-stat-val">{formatDistance(distance)}</span>
                    <span className="live-stat-label">Distance</span>
                  </div>
                  <div className="live-stat">
                    <span className="live-stat-val">{formatDuration(elapsed)}</span>
                    <span className="live-stat-label">Time</span>
                  </div>
                  <div className="live-stat">
                    <span className="live-stat-val">{elapsed > 0 ? (distance / elapsed * 3.6).toFixed(1) : '0.0'}</span>
                    <span className="live-stat-label">km/h</span>
                  </div>
                </div>
                <button className="record-stop-btn" onClick={stopRecording}>
                  <div className="stop-icon" />
                  Stop & save
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Selected route banner */}
      {selectedRoute && (
        <div className="selected-route-banner">
          <span>{selectedRoute.name} · {formatDistance(selectedRoute.distance_m)}</span>
          <button onClick={() => setSelectedRoute(null)}>✕</button>
        </div>
      )}

      {/* Save modal */}
      {showSave && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && discardRoute()}>
          <div className="modal">
            <div className="modal-title">Save Route</div>
            <div className="modal-mini-stats">
              <span>{formatDistance(distance)}</span>
              <span>{formatDuration(elapsed)}</span>
            </div>
            <input className="modal-input" value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Route name" autoFocus />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={discardRoute}>Discard</button>
              <button className="btn-primary" onClick={saveRoute} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
