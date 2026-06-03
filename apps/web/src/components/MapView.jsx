import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { formatDistance, formatDuration } from '../lib/utils'
import Toast from './Toast'

const API = import.meta.env.VITE_API_URL
const OSRM = 'https://router.project-osrm.org/route/v1/foot'

const MAP_STYLES = {
  dark:   { type: 'style', url: 'https://tiles.openfreemap.org/styles/dark' },
  light:  { type: 'style', url: 'https://tiles.openfreemap.org/styles/liberty' },
  brown:  { type: 'raster', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', filter: 'brightness(0.62) saturate(0.5) hue-rotate(180deg) invert(1) sepia(0.3)' },
}

const PIN_COLORS = ['#00e87a','#ff5252','#ffb74d','#64b5f6','#ce93d8','#80cbc4','#ffcc02']

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MapView({ user, selectedRoute, setSelectedRoute, mapStyle }) {
  const mapRef = useRef(null)
  const map = useRef(null)
  const markersRef = useRef([])
  const routeLayersRef = useRef([])
  const watchId = useRef(null)
  const points = useRef([])
  const timerRef = useRef(null)
  const rasterLayerRef = useRef(null)

  const [mapMode, setMapMode] = useState('plan')
  const [pins, setPins] = useState([])
  const [planLoading, setPlanLoading] = useState(false)
  const [planResult, setPlanResult] = useState(null) // { distKm, durationS }

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [showSave, setShowSave] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  // ── Init map ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || map.current) return
    const style = MAP_STYLES[mapStyle] || MAP_STYLES.dark
    const initStyle = style.type === 'raster'
      ? { version: 8, sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png','https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] }
      : style.url

    map.current = new maplibregl.Map({
      container: mapRef.current,
      style: initStyle,
      center: [103.8198, 1.3521],
      zoom: 14
    })
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }), 'top-right')

    map.current.on('click', handleMapClick)
    return () => map.current?.remove()
  }, [])

  // ── Map style changes ─────────────────────────────
  useEffect(() => {
    if (!map.current) return
    const style = MAP_STYLES[mapStyle] || MAP_STYLES.dark

    // Apply CSS filter to canvas for raster style
    const canvas = mapRef.current?.querySelector('canvas')

    if (style.type === 'raster') {
      map.current.setStyle({
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png','https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      })
      if (canvas) canvas.style.filter = style.filter
    } else {
      map.current.setStyle(style.url)
      if (canvas) canvas.style.filter = 'none'
    }
  }, [mapStyle])

  // ── Map click → add pin (plan mode only) ─────────
  const handleMapClick = useCallback((e) => {
    if (mapMode !== 'plan') return
    const { lng, lat } = e.lngLat
    setPins(prev => {
      const next = [...prev, { lat, lng, id: Date.now() }]
      addMarkerToMap(next.length - 1, lat, lng, next.length)
      return next
    })
    clearRouteLines()
    setPlanResult(null)
  }, [mapMode])

  useEffect(() => {
    if (!map.current) return
    map.current.off('click', handleMapClick)
    map.current.on('click', handleMapClick)
  }, [handleMapClick])

  // ── Markers ───────────────────────────────────────
  const addMarkerToMap = (idx, lat, lng, total) => {
    const color = PIN_COLORS[idx % PIN_COLORS.length]
    const el = document.createElement('div')
    el.className = 'map-pin'
    el.style.cssText = `width:28px;height:36px;cursor:pointer;`
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path d="M14 0C6.27 0 0 6.27 0 14c0 9 14 22 14 22S28 23 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/><circle cx="14" cy="14" r="7" fill="rgba(0,0,0,0.3)"/><text x="14" y="19" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#fff">${total}</text></svg>`
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map.current)
    markersRef.current.push(marker)
  }

  const redrawMarkers = (pinsArr) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    pinsArr.forEach((p, i) => addMarkerToMap(i, p.lat, p.lng, i + 1))
  }

  // ── Routing ───────────────────────────────────────
  const findRoute = async (pinsArr) => {
    if (pinsArr.length < 2) return
    setPlanLoading(true)
    clearRouteLines()
    setPlanResult(null)
    try {
      const coords = pinsArr.map(p => `${p.lng},${p.lat}`).join(';')
      const url = `${OSRM}/${coords}?overview=full&geometries=geojson`
      const res = await fetch(url)
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route')
      const route = data.routes[0]
      drawRoute(route.geometry.coordinates)
      setPlanResult({ distKm: (route.distance / 1000).toFixed(2), durationS: Math.round(route.duration) })
    } catch (e) {
      showToast('Could not find a footpath route', 'error')
    } finally {
      setPlanLoading(false)
    }
  }

  const drawRoute = (coords) => {
    if (!map.current) return
    const run = () => {
      clearRouteLines()
      const id = 'planned-route'
      const idGlow = 'planned-route-glow'
      map.current.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } })
      map.current.addLayer({ id: idGlow, type: 'line', source: id, paint: { 'line-color': '#00e87a', 'line-width': 12, 'line-opacity': 0.18 } })
      map.current.addLayer({ id, type: 'line', source: id, paint: { 'line-color': '#00e87a', 'line-width': 4, 'line-opacity': 0.95 } })
      routeLayersRef.current = [id, idGlow]
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 17 })
    }
    if (map.current.loaded()) run()
    else map.current.on('load', run)
  }

  const clearRouteLines = () => {
    routeLayersRef.current.forEach(id => {
      try { map.current?.removeLayer(id); map.current?.removeSource(id.replace('-glow','').replace('-line','')) } catch {}
    })
    try { map.current?.removeSource('planned-route') } catch {}
    routeLayersRef.current = []
  }

  const clearPlan = () => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    clearRouteLines()
    setPins([])
    setPlanResult(null)
  }

  const removePin = (idx) => {
    const next = pins.filter((_, i) => i !== idx)
    setPins(next)
    redrawMarkers(next)
    clearRouteLines()
    setPlanResult(null)
  }

  // ── Selected (saved) route ─────────────────────────
  useEffect(() => {
    if (!map.current || !selectedRoute) return
    const run = () => {
      try { map.current.removeLayer('sel-route'); map.current.removeSource('sel-route') } catch {}
      if (!selectedRoute.route_points?.length) return
      const coords = [...selectedRoute.route_points].sort((a, b) => a.seq - b.seq).map(p => [p.lng, p.lat])
      map.current.addSource('sel-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } })
      map.current.addLayer({ id: 'sel-route', type: 'line', source: 'sel-route', paint: { 'line-color': '#ffb74d', 'line-width': 4, 'line-opacity': 0.9 } })
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 16 })
    }
    if (map.current.loaded()) run()
    else map.current.on('load', run)
    return () => { try { map.current?.removeLayer('sel-route'); map.current?.removeSource('sel-route') } catch {} }
  }, [selectedRoute])

  // ── GPS Recording ─────────────────────────────────
  const updateLiveTrack = useCallback(() => {
    if (!map.current || points.current.length < 2) return
    const coords = points.current.map(p => [p.lng, p.lat])
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    if (map.current.getSource('live-track')) map.current.getSource('live-track').setData(geojson)
    else {
      map.current.addSource('live-track', { type: 'geojson', data: geojson })
      map.current.addLayer({ id: 'live-track-line', type: 'line', source: 'live-track', paint: { 'line-color': '#ff5252', 'line-width': 4 } })
    }
  }, [])

  const startRecording = () => {
    points.current = []
    setElapsed(0); setDistance(0); setRecording(true)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    watchId.current = navigator.geolocation.watchPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: new Date().toISOString() }
      if (points.current.length > 0) setDistance(prev => prev + haversineM(points.current[points.current.length-1].lat, points.current[points.current.length-1].lng, p.lat, p.lng))
      points.current.push(p)
      updateLiveTrack()
      map.current?.setCenter([p.lng, p.lat])
    }, err => showToast('GPS: ' + err.message, 'error'), { enableHighAccuracy: true, maximumAge: 0 })
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
    try { map.current?.removeLayer('live-track-line'); map.current?.removeSource('live-track') } catch {}
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
      setShowSave(false); clearLiveTrack(); setElapsed(0); setDistance(0)
    } catch { showToast('Failed to save', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="map-view">
      <div ref={mapRef} className="map-container" />

      {/* Side panel */}
      <div className="map-panel">
        <div className="panel-tabs">
          <button className={`panel-tab ${mapMode === 'plan' ? 'active' : ''}`} onClick={() => setMapMode('plan')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s-8-6-8-13a8 8 0 0116 0c0 7-8 13-8 13z"/><circle cx="12" cy="9" r="3"/></svg>
            Plan
          </button>
          <button className={`panel-tab ${mapMode === 'record' ? 'active' : ''}`} onClick={() => setMapMode('record')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
            Record
          </button>
        </div>

        {/* ── Plan panel ── */}
        {mapMode === 'plan' && (
          <div className="panel-body">
            <p className="panel-hint">
              {pins.length === 0 && 'Tap the map to add waypoints'}
              {pins.length === 1 && 'Add another point to route'}
              {pins.length >= 2 && !planLoading && !planResult && 'Tap "Find route" or add more points'}
              {planLoading && 'Finding footpath route…'}
              {planResult && `${planResult.distKm} km · ${formatDuration(planResult.durationS)} on foot`}
            </p>

            {/* Waypoint list */}
            {pins.length > 0 && (
              <div className="pin-list-panel">
                {pins.map((p, i) => (
                  <div key={p.id} className="pin-list-item">
                    <div className="pin-list-dot" style={{ background: PIN_COLORS[i % PIN_COLORS.length] }}>{i + 1}</div>
                    <div className="pin-list-coords">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</div>
                    <button className="pin-remove-btn" onClick={() => removePin(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {pins.length >= 2 && (
              <button
                className="panel-action-btn"
                onClick={() => findRoute(pins)}
                disabled={planLoading}
              >
                {planLoading ? 'Routing…' : 'Find route'}
              </button>
            )}

            {pins.length > 0 && (
              <button className="panel-clear-btn" onClick={clearPlan}>Clear all</button>
            )}
          </div>
        )}

        {/* ── Record panel ── */}
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && (() => { setShowSave(false); clearLiveTrack(); setElapsed(0); setDistance(0) })()}>
          <div className="modal">
            <div className="modal-title">Save Route</div>
            <div className="modal-mini-stats">
              <span>{formatDistance(distance)}</span>
              <span>{formatDuration(elapsed)}</span>
            </div>
            <input className="modal-input" value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Route name" autoFocus />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => { setShowSave(false); clearLiveTrack(); setElapsed(0); setDistance(0) }}>Discard</button>
              <button className="btn-primary" onClick={saveRoute} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
