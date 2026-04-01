# Train Graph

A web application for building and managing train stringline (time-distance) diagrams. Replace your Excel workflow with an interactive, real-time graph editor.

## Features

- **Multiple timetables** — manage independent scenarios side-by-side
- **Distance-scaled Y axis** — stations are positioned to true distance scale
- **Real-time graph preview** — the graph updates live as you type stop times
- **Configurable time axis** — set start and end time per timetable
- **Colour-coded trains** — 12 preset colours + custom colour picker
- **Tooltips** — hover any train line to see its name, origin, destination, and times
- **Persistent storage** — data saved as JSON; survives server restarts
- **Dark UI** — easy on the eyes for long planning sessions

## Quick Start (development)

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Docker (production)

```bash
# Build and run
docker compose up -d

# Access at http://localhost:3001
```

Data is persisted in a Docker volume (`train-graph-data`).

## Usage

1. **Create a timetable** — click *+ New* in the sidebar, set a name and the time window (e.g. 06:00 – 22:00)
2. **Add stations** — click *+ Add* under Stations; enter the station name, optional short code, and distance in km from the origin (distance 0)
3. **Add trains** — click *+ Add* under Trains; pick a colour and enter stop times for each station. Leave a station blank to skip it. The graph updates in real time as you type
4. **Edit** — click any station or train to open its editor
5. **Hover the graph** — mouse over any train line to see its details in a tooltip

## JMRI Integration

The app is a standalone HTTP server. To expose it from JMRI:

- Set the `PORT` environment variable to the port JMRI routes traffic to, or
- Use JMRI's built-in web server proxy to forward `/train-graph/` to this server

## Project Structure

```
train-graph/
├── server/          Express API server + JSON persistence
├── client/          React + TypeScript frontend (Vite)
├── Dockerfile       Multi-stage Docker build
└── docker-compose.yml
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timetables` | List all timetables |
| POST | `/api/timetables` | Create timetable |
| GET | `/api/timetables/:id` | Get timetable with stations & trains |
| PUT | `/api/timetables/:id` | Update timetable settings |
| DELETE | `/api/timetables/:id` | Delete timetable |
| POST | `/api/timetables/:id/stations` | Add station |
| PUT | `/api/timetables/:id/stations/:sid` | Update station |
| DELETE | `/api/timetables/:id/stations/:sid` | Delete station |
| POST | `/api/timetables/:id/trains` | Add train |
| PUT | `/api/timetables/:id/trains/:tid` | Update train |
| DELETE | `/api/timetables/:id/trains/:tid` | Delete train |
