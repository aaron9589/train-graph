# LiveRun — Claude Code Guide

## What This App Is

A web app for planning and running model railway operating sessions. Features: visual stringline (time-distance) graph, timetable/station/train/crew management, CATS XML export, live REST API for guard panels/JMRI, and real-time MQTT fast-clock sync. No authentication — designed for trusted LAN environments.

## Tech Stack

- **Frontend:** React 18 + TypeScript 5 (strict), Vite 5, Tailwind CSS 3 (dark theme, custom `surface-` palette)
- **Backend:** Node.js 20, Express 4 (flat route handlers in `server/index.js`, no router framework)
- **Database:** Single JSON file (`server/data/train-graph.json`). Atomic writes via tmp→rename. All data loaded in memory per request.
- **Real-time:** MQTT (`mqtt` library) for fast-clock sync; WebSockets (`ws`) for live station feed

## Key Files

| File | Role |
|------|------|
| `server/index.js` | All Express routes, WebSocket handler, MQTT lifecycle, auto-assign algorithm, import/export (1318 lines) |
| `server/db.js` | DB layer: `readDB()`, `writeDB()`, `getTimetable(id)`, `mutateTimetable(id, fn)` |
| `server/openapi.js` | OpenAPI 3.0 spec (served at `/api/schema`, UI at `/api/docs`) |
| `client/src/App.tsx` | Root component — single source of truth for all UI state (1030 lines) |
| `client/src/types.ts` | All TypeScript domain types |
| `client/src/api.ts` | Typed fetch client (all API calls) |
| `client/src/utils.ts` | Time conversion, `exportCatsXml()`, `exportCrewsXml()`, `escapeXml()`, `useLocalStorage()` |
| `client/src/components/Sidebar.tsx` | Left panel: timetable list, station manager, train list/search, crew manager |
| `client/src/components/TrainEditor.tsx` | Train form modal — stops, path template, color picker |
| `client/src/components/TrainGraph.tsx` | SVG stringline — pan/zoom (8x max), hover tooltips, branch grouping |
| `client/src/components/StationReport.tsx` | A5 printable arrival/departure register |
| `client/src/hooks/useFastClock.ts` | Browser MQTT subscriber for live clock |

## Data Model (types.ts)

```
Timetable: id, name, description, start_time, end_time, active?, stations[], trains[], paths[], crews[], settings
Station:   id, timetable_id, name, short_code, distance (display label), graph_pos (Y-axis), sort_order, branch_name, alias_enabled?
Train:     id, timetable_id, name, color, notes, train_type?, train_id?, direction?, crew_id?, stops[]
TrainStop: id, train_id, station_id, arrival (HH:MM|null), departure (HH:MM|null), special_instructions?, location_alias?
Path:      id, timetable_id, name, stops[]  — reusable route template
PathStop:  station_id, sort_order, travel_time_from_prev (min), dwell_time (min)
Crew:      id, timetable_id, name, color
TimetableSettings: clock_enabled, clock_broker_url, clock_topic, auto_assign_min_break
```

## API Endpoints

Base: `/api` (dev: Vite proxies 5173 → 3001). Rate limit: 200 req/min.

```
GET/POST   /api/timetables
GET/PUT/DELETE /api/timetables/:id
POST       /api/timetables/:id/duplicate
POST       /api/timetables/:id/restore
PUT        /api/timetables/:id/settings
GET/PUT    /api/active-timetable

POST/PUT/DELETE  /api/timetables/:id/stations/:stationId?
POST/PUT/DELETE  /api/timetables/:id/trains/:trainId?
POST             /api/timetables/:id/trains/auto-assign
POST/PUT/DELETE  /api/timetables/:id/paths/:pathId?
POST/PUT/DELETE  /api/timetables/:id/crews/:crewId?
PUT              /api/timetables/:id/crews/reorder

GET  /api/timetables/:id/live/trains
GET  /api/timetables/:id/live/trains/:trainName
GET  /api/timetables/:id/live/stations/:stationName  [?direction=up|down&trainId=%pat%]
WS   /api/live/station-feed?id=&station=[&direction][&trainId][&futureCount]
```

All mutation endpoints return the full updated Timetable.

## Non-Obvious Architecture

- **No Redux/Zustand:** `App.tsx` is the single source of truth. Every mutation: component → `api.ts` → server → `App.tsx` setState.
- **Undo/redo:** Full-Timetable stacks (`historyPast[]`, `historyFuture[]`) in App.tsx — not delta-based.
- **camelCase/snake_case split:** Client sends camelCase request bodies; server stores + responds in snake_case; normalization in server route handlers.
- **Server returns full timetable:** Every mutation endpoint returns the complete updated Timetable, not just the delta.
- **MQTT per WebSocket:** Each live station-feed WS connection gets its own MQTT client; cleaned up on WS close.
- **Terminal stop enforcement:** First stop → no arrival; last stop → no departure. Enforced in UI and on save.
- **`graph_pos` vs `distance`:** `graph_pos` is the Y-axis layout unit (integer); `distance` is an optional display label. Independent fields.
- **`BASE_PATH` env var:** For reverse proxy sub-path deployments (e.g. `/liverun/`). Vite base is `./` (relative URLs).

## Dev Commands

```bash
npm install       # install all workspaces
npm run dev       # Vite (5173) + Express (3001) concurrently
npm run build     # tsc + vite build → client/dist/
npm run start     # Express serving client/dist/ (production)
docker compose up -d  # production; UI at localhost:3001
```

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `NODE_ENV` | — | `production` enables static file serving from Express |
| `PORT` | 3001 | Express listen port |
| `DB_PATH` | `server/data/train-graph.json` | JSON DB file path |
| `BASE_PATH` | — | Sub-path prefix for reverse proxy |
| `ALLOWED_ORIGIN` | `*` | CORS whitelist |