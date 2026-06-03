export default function Settings({ settings, updateSetting, onClose }) {
  const requestLocation = () => {
    if (!('geolocation' in navigator)) { alert('Geolocation not supported.'); return }
    navigator.geolocation.getCurrentPosition(
      () => alert('Location access granted!'),
      (err) => alert('Location denied: ' + err.message),
      { enableHighAccuracy: true }
    )
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="settings-close" onClick={onClose}>✕</button>
      </div>

      <div className="settings-section">
        <div className="settings-label">Map style</div>
        <div className="settings-toggle-row" style={{ flexDirection: 'column', gap: 6 }}>
          {[
            { id: 'dark',  label: '🌑 Dark' },
            { id: 'light', label: '☀️ Light' },
            { id: 'brown', label: '🗺️ Light Brown' },
          ].map(s => (
            <button
              key={s.id}
              className={`style-btn ${settings.mapStyle === s.id ? 'active' : ''}`}
              onClick={() => updateSetting('mapStyle', s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-label">Location</div>
        <button className="settings-action-btn" onClick={requestLocation}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
          Request location access
        </button>
      </div>
    </div>
  )
}
