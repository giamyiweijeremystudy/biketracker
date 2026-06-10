import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { formatDistance, formatDuration } from '../lib/utils'
import Toast from './Toast'

const API = import.meta.env.VITE_API_URL
const GH_KEY = import.meta.env.VITE_GH_KEY

const MAP_STYLES = {
  dark:   { type: 'style', url: 'https://tiles.openfreemap.org/styles/dark' },
  light:  { type: 'style', url: 'https://tiles.openfreemap.org/styles/liberty' },
  brown:  { type: 'raster', filter: 'brightness(0.62) saturate(0.5) hue-rotate(180deg) invert(1) sepia(0.3)' },
}

const PIN_COLORS = ['#00e87a','#ff5252','#ffb74d','#64b5f6','#ce93d8','#80cbc4','#ffcc02']

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}

const RASTER_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png','https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
}

export default function MapView({ user, selectedRoute, setSelectedRoute, mapStyle, preferParks }) {
  const mapRef = useRef(null)
  const map = useRef(null)
  const markersRef = useRef([])
  const routeSourcesRef = useRef([])
  const watchId = useRef(null)
  const points = useRef([])
  const timerRef = useRef(null)

  const [mapMode, setMapMode] = useState('plan')
  const [pins, setPins] = useState([])
  const [planLoading, setPlanLoading] = useState(false)
  const [planResult, setPlanResult] = useState(null)

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [showSave, setShowSave] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Init map ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || map.current) return
    const initStyle = mapStyle === 'brown' ? RASTER_STYLE : (MAP_STYLES[mapStyle]?.url || MAP_STYLES.dark.url)
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
    return () => map.current?.remove()
  }, [])

  // ── Map style changes ─────────────────────────────
  useEffect(() => {
    if (!map.current) return
    const canvas = mapRef.current?.querySelector('canvas')
    if (mapStyle === 'brown') {
      map.current.setStyle(RASTER_STYLE)
      if (canvas) canvas.style.filter = MAP_STYLES.brown.filter
    } else {
      map.current.setStyle(MAP_STYLES[mapStyle]?.url || MAP_STYLES.dark.url)
      if (canvas) canvas.style.filter = 'none'
    }
  }, [mapStyle])

  // ── Map click handler ─────────────────────────────
  const mapModeRef = useRef(mapMode)
  useEffect(() => { mapModeRef.current = mapMode }, [mapMode])

  useEffect(() => {
    if (!map.current) return
    const handleClick = (e) => {
      if (mapModeRef.current !== 'plan') return
      const { lng, lat } = e.lngLat
      const newPin = { lat, lng, id: Date.now() }
      const next = [...pinsRef.current, newPin]
      pinsRef.current = next
      setPins(next)
      addMarkerToMap(next.length - 1, lat, lng, next.length)
      clearRouteLines()
      setPlanResult(null)
    }
    map.current.on('click', handleClick)
    return () => map.current?.off('click', handleClick)
  }, [])

  // ── Markers ───────────────────────────────────────
  const addMarkerToMap = (idx, lat, lng, num) => {
    const color = PIN_COLORS[idx % PIN_COLORS.length]
    const el = document.createElement('div')
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" style="cursor:pointer"><path d="M14 0C6.27 0 0 6.27 0 14c0 9 14 22 14 22S28 23 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/><circle cx="14" cy="14" r="7" fill="rgba(0,0,0,0.3)"/><text x="14" y="19" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#fff">${num}</text></svg>`
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

  const pinsRef = useRef(pins)
  useEffect(() => { pinsRef.current = pins }, [pins])

  const preferParksRef = useRef(preferParks)
  useEffect(() => { preferParksRef.current = preferParks }, [preferParks])

  // ── Routing ───────────────────────────────────────
  // Standard foot: Graphhopper free tier
  // Prefer parks: Valhalla public instance with use_trails=1, use_roads=0.1
  const findRoute = async (pinsArr) => {
    if (pinsArr.length < 2) return
    setPlanLoading(true)
    clearRouteLines()
    setPlanResult(null)

    try {
      let coords, distM, durationS

      if (preferParksRef.current) {
        // Valhalla pedestrian with trail preference
        const locations = pinsArr.map(p => ({ lon: p.lng, lat: p.lat }))
        const res = await fetch('https://valhalla1.openstreetmap.de/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations,
            costing: 'pedestrian',
            costing_options: {
              pedestrian: {
                use_roads: 0.1,    // strongly avoid roads
                use_trails: 1.0,   // strongly prefer trails/paths
                use_living_streets: 0.5,
              }
            },
            shape_match: 'walk_or_snap',
            units: 'kilometers'
          })
        })
        if (!res.ok) throw new Error(`Valhalla error ${res.status}`)
        const data = await res.json()
        if (!data.trip) throw new Error(data.error || 'No route')
        // Valhalla returns encoded polyline — decode it
        coords = decodePolyline(data.trip.legs.flatMap(l => l.shape))
        distM = data.trip.summary.length * 1000
        durationS = Math.round(data.trip.summary.time)
      } else {
        // Graphhopper foot
        const pointParams = pinsArr.map(p => `point=${p.lat},${p.lng}`).join('&')
        const res = await fetch(`https://graphhopper.com/api/1/route?${pointParams}&profile=foot&points_encoded=false&key=${GH_KEY}`)
        if (!res.ok) throw new Error(`Error ${res.status}`)
        const data = await res.json()
        const path = data.paths?.[0]
        if (!path) throw new Error('No route returned')
        coords = path.points.coordinates
        distM = path.distance
        durationS = Math.round(path.time / 1000)
      }

      drawRouteSegments(coords)
      setPlanResult({
        distKm: (distM / 1000).toFixed(2),
        durationS
      })
    } catch (e) {
      console.error(e)
      showToast('Routing failed: ' + e.message, 'error')
    } finally {
      setPlanLoading(false)
    }
  }

  // Decode Valhalla's encoded polyline6 format
  const decodePolyline = (encoded) => {
    const coords = []
    let index = 0, lat = 0, lng = 0
    while (index < encoded.length) {
      let b, shift = 0, result = 0
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
      lat += (result & 1) ? ~(result >> 1) : (result >> 1)
      shift = 0; result = 0
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
      lng += (result & 1) ? ~(result >> 1) : (result >> 1)
      coords.push([lng / 1e6, lat / 1e6])
    }
    return coords
  }

  // Draw route colored by first pin color
  const drawRouteSegments = (coords) => {
    if (!map.current) return
    // Color the whole route based on the first pin's color
    const color = PIN_COLORS[0]

    const run = () => {
      clearRouteLines()
      const srcId = 'planned-route'
      const glowId = 'planned-route-glow'
      const lineId = 'planned-route-line'

      map.current.addSource(srcId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
      })
      map.current.addLayer({
        id: glowId, type: 'line', source: srcId,
        paint: { 'line-color': color, 'line-width': 14, 'line-opacity': 0.18 }
      })
      map.current.addLayer({
        id: lineId, type: 'line', source: srcId,
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.95 }
      })
      routeSourcesRef.current = [{ srcId, layers: [glowId, lineId] }]

      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 17 })
    }

    if (map.current.loaded()) run()
    else map.current.on('load', run)
  }

  const clearRouteLines = () => {
    routeSourcesRef.current.forEach(({ srcId, layers }) => {
      layers.forEach(id => { try { map.current?.removeLayer(id) } catch {} })
      try { map.current?.removeSource(srcId) } catch {}
    })
    routeSourcesRef.current = []
  }

  const clearPlan = () => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    clearRouteLines()
    pinsRef.current = []
    setPins([])
    setPlanResult(null)
  }

  const removePin = (idx) => {
    const next = pinsRef.current.filter((_, i) => i !== idx)
    pinsRef.current = next
    setPins(next)
    redrawMarkers(next)
    clearRouteLines()
    setPlanResult(null)
  }

  // ── Selected saved route ──────────────────────────
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
    points.current = []; setElapsed(0); setDistance(0); setRecording(true)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    watchId.current = navigator.geolocation.watchPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: new Date().toISOString() }
      if (points.current.length > 0) setDistance(prev => prev + haversineM(points.current[points.current.length-1].lat, points.current[points.current.length-1].lng, p.lat, p.lng))
      points.current.push(p); updateLiveTrack()
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
    } else { showToast('Not enough GPS points', 'error'); clearLiveTrack() }
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

        {mapMode === 'plan' && (
          <div className="panel-body">
            <p className="panel-hint">
              {pins.length === 0 && 'Tap the map to add waypoints'}
              {pins.length === 1 && 'Add another point to route'}
              {pins.length >= 2 && !planLoading && !planResult && 'Ready — tap "Find route"'}
              {planLoading && 'Finding footpath route…'}
              {planResult && `🚶 ${planResult.distKm} km · ${formatDuration(planResult.durationS)}`}
            </p>

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
              <button className="panel-action-btn" onClick={() => findRoute(pins)} disabled={planLoading}>
                {planLoading ? 'Routing…' : 'Find route'}
              </button>
            )}

            {pins.length > 0 && (
              <button className="panel-clear-btn" onClick={clearPlan}>Clear all</button>
            )}
          </div>
        )}

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
                    <span className="live-stat-val">{elapsed > 0 ? (distance/elapsed*3.6).toFixed(1) : '0.0'}</span>
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

      {selectedRoute && (
        <div className="selected-route-banner">
          <span>{selectedRoute.name} · {formatDistance(selectedRoute.distance_m)}</span>
          <button onClick={() => setSelectedRoute(null)}>✕</button>
        </div>
      )}

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
