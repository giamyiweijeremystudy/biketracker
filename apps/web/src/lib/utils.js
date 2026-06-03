export function formatDistance(meters) {
  if (!meters && meters !== 0) return '—'
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function toGPX(route) {
  const points = (route.route_points || [])
    .sort((a, b) => a.seq - b.seq)
    .map(p => `    <trkpt lat="${p.lat}" lon="${p.lng}">${p.elevation_m ? `<ele>${p.elevation_m}</ele>` : ''}${p.timestamp ? `<time>${p.timestamp}</time>` : ''}</trkpt>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BikeRoutes SG" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${route.name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`
}
