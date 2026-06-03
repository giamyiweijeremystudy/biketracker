import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDistance, formatDuration } from '../lib/utils'

const API = import.meta.env.VITE_API_URL

export default function Profile({ user }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch(`${API}/routes?user_id=${user.id}`)
      .then(r => r.json())
      .then(routes => {
        if (!Array.isArray(routes)) return
        const totalDist = routes.reduce((s, r) => s + (r.distance_m || 0), 0)
        const totalTime = routes.reduce((s, r) => s + (r.duration_s || 0), 0)
        const longest = routes.reduce((max, r) => (r.distance_m || 0) > (max.distance_m || 0) ? r : max, routes[0] || {})
        setStats({ count: routes.length, totalDist, totalTime, longest })
      })
  }, [])

  const signOut = () => supabase.auth.signOut()

  const avatarUrl = user.user_metadata?.avatar_url
  const name = user.user_metadata?.full_name || user.user_metadata?.user_name || 'Cyclist'

  return (
    <div className="profile">
      <div className="profile-header">
        {avatarUrl
          ? <img src={avatarUrl} alt="avatar" className="profile-avatar" />
          : <div className="profile-avatar-fallback">🚲</div>
        }
        <div>
          <div className="profile-name">{name}</div>
          <div className="profile-email">{user.email}</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-val">{stats ? stats.count : '—'}</div>
          <div className="stat-card-label">Total rides</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-val">{stats ? formatDistance(stats.totalDist) : '—'}</div>
          <div className="stat-card-label">Total distance</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-val">{stats ? formatDuration(stats.totalTime) : '—'}</div>
          <div className="stat-card-label">Total time</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-val">{stats?.longest ? formatDistance(stats.longest.distance_m) : '—'}</div>
          <div className="stat-card-label">Longest ride</div>
        </div>
      </div>

      {stats?.longest?.name && (
        <>
          <div className="section-title">Longest ride</div>
          <div style={{ padding: '0 16px' }}>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 14, color: 'var(--text2)' }}>
              {stats.longest.name}
            </div>
          </div>
        </>
      )}

      <button className="sign-out-btn" onClick={signOut}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign out
      </button>
    </div>
  )
}
