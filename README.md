# BikeRoutes SG

A bike route tracking app for Singapore footpaths.

## Stack
- **Web**: React + Vite + MapLibre GL → Vercel
- **API**: Node.js + Express → Render
- **DB**: Supabase (Postgres + PostGIS)
- **Maps**: OpenStreetMap via OpenFreeMap

## Setup

### 1. Supabase
1. Create a project at supabase.com
2. Run `supabase/migrations/001_init.sql` in the SQL editor
3. Copy your project URL and keys

### 2. Vercel (web)
1. Import this repo, set root directory to `apps/web`
2. Add env vars from `apps/web/.env.example`

### 3. Render (API)
1. Create a Web Service, set root directory to `packages/api`
2. Set build command: `npm install`
3. Set start command: `node src/index.js`
4. Add env vars from `packages/api/.env.example`
