import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'

const app = express()
app.use(cors())
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'bikeroutes-api' })
})

// Get all routes for a user
app.get('/routes', async (req, res) => {
  const userId = req.query.user_id
  if (!userId) return res.status(400).json({ error: 'user_id required' })

  const { data, error } = await supabase
    .from('routes')
    .select('id, name, distance_m, duration_s, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Get a single route with points
app.get('/routes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('routes')
    .select('*, route_points(*)')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Save a new route
app.post('/routes', async (req, res) => {
  const { user_id, name, points, distance_m, duration_s } = req.body

  const { data: route, error: routeErr } = await supabase
    .from('routes')
    .insert({ user_id, name, distance_m, duration_s })
    .select()
    .single()

  if (routeErr) return res.status(500).json({ error: routeErr.message })

  const routePoints = points.map((p, i) => ({
    route_id: route.id,
    lat: p.lat,
    lng: p.lng,
    elevation_m: p.elevation_m ?? null,
    timestamp: p.timestamp ?? null,
    seq: i
  }))

  const { error: pointsErr } = await supabase
    .from('route_points')
    .insert(routePoints)

  if (pointsErr) return res.status(500).json({ error: pointsErr.message })
  res.status(201).json(route)
})

// Delete a route
app.delete('/routes/:id', async (req, res) => {
  const { error } = await supabase
    .from('routes')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API running on port ${PORT}`))
