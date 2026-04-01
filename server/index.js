const express = require('express');
const cors = require('cors');
const path = require('path');
const { readDB, writeDB, getTimetable, mutateTimetable, uuidv4 } = require('./db');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

const DEFAULT_SETTINGS = {
  clock_enabled: false,
  clock_broker_url: '',
  clock_topic: 'jmri/memory/currentTime',
};

app.get('/api/timetables', (_req, res) => {
  const { timetables } = readDB();
  const summaries = [...timetables]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(({ id, name, description, start_time, end_time, created_at, updated_at }) => ({
      id, name, description, start_time, end_time, created_at, updated_at,
    }));
  res.json(summaries);
});

app.post('/api/timetables', (req, res) => {
  const { name, description, startTime, endTime } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = readDB();
  const now = new Date().toISOString();
  const timetable = {
    id: uuidv4(), name: name.trim(), description: description || '',
    start_time: startTime || '06:00', end_time: endTime || '22:00',
    created_at: now, updated_at: now, stations: [], trains: [], paths: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  db.timetables.push(timetable);
  writeDB(db);
  res.status(201).json(timetable);
});

app.get('/api/timetables/:id', (req, res) => {
  const tt = getTimetable(req.params.id);
  if (!tt) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(tt));
});

app.put('/api/timetables/:id', (req, res) => {
  const { name, description, startTime, endTime } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    tt.name = name.trim(); tt.description = description || '';
    tt.start_time = startTime; tt.end_time = endTime;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.delete('/api/timetables/:id', (req, res) => {
  const db = readDB();
  db.timetables = db.timetables.filter((t) => t.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/timetables/:id/duplicate', (req, res) => {
  const db = readDB();
  const original = db.timetables.find((t) => t.id === req.params.id);
  if (!original) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString();
  const newId = uuidv4();
  const stationIdMap = {};
  (original.stations || []).forEach((s) => { stationIdMap[s.id] = uuidv4(); });
  const pathIdMap = {};
  (original.paths || []).forEach((p) => { pathIdMap[p.id] = uuidv4(); });
  const duplicate = {
    ...original,
    id: newId,
    name: original.name + ' (copy)',
    created_at: now,
    updated_at: now,
    stations: (original.stations || []).map((s) => ({ ...s, id: stationIdMap[s.id], timetable_id: newId })),
    trains: (original.trains || []).map((tr) => {
      const trainId = uuidv4();
      return {
        ...tr, id: trainId, timetable_id: newId,
        stops: (tr.stops || []).map((stop) => ({
          ...stop, id: uuidv4(), train_id: trainId,
          station_id: stationIdMap[stop.station_id] || stop.station_id,
        })),
      };
    }),
    paths: (original.paths || []).map((p) => {
      const pathId = pathIdMap[p.id];
      return {
        ...p, id: pathId, timetable_id: newId,
        stops: (p.stops || []).map((ps) => ({
          ...ps, id: uuidv4(), path_id: pathId,
          station_id: stationIdMap[ps.station_id] || ps.station_id,
        })),
      };
    }),
  };
  db.timetables.push(duplicate);
  writeDB(db);
  res.status(201).json(normalise(duplicate));
});

app.post('/api/timetables/:id/restore', (req, res) => {
  const { stations, trains, paths } = req.body;
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (Array.isArray(stations)) tt.stations = stations;
    if (Array.isArray(trains)) tt.trains = trains;
    if (Array.isArray(paths)) tt.paths = paths;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.put('/api/timetables/:id/settings', (req, res) => {
  const { clock_enabled, clock_broker_url, clock_topic } = req.body;
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.settings) tt.settings = { ...DEFAULT_SETTINGS };
    if (clock_enabled !== undefined) tt.settings.clock_enabled = Boolean(clock_enabled);
    if (clock_broker_url !== undefined) tt.settings.clock_broker_url = String(clock_broker_url);
    if (clock_topic !== undefined) tt.settings.clock_topic = String(clock_topic);
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.post('/api/timetables/:id/stations', (req, res) => {
  const { name, shortCode, distance, graphPos } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (graphPos == null || graphPos === '') return res.status(400).json({ error: 'graphPos is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    const maxOrder = tt.stations.reduce((m, s) => Math.max(m, s.sort_order || 0), -1);
    tt.stations.push({
      id: uuidv4(), timetable_id: req.params.id, name: name.trim(),
      short_code: shortCode || '',
      distance: (distance !== '' && distance != null) ? Number(distance) : null,
      graph_pos: Number(graphPos),
      sort_order: maxOrder + 1,
    });
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.status(201).json(normalise(updated));
});

app.put('/api/timetables/:id/stations/:stationId', (req, res) => {
  const { name, shortCode, distance, graphPos, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    const st = tt.stations.find((s) => s.id === req.params.stationId);
    if (st) {
      st.name = name.trim(); st.short_code = shortCode || '';
      st.distance = (distance !== '' && distance != null) ? Number(distance) : null;
      if (graphPos != null && graphPos !== '') st.graph_pos = Number(graphPos);
      st.sort_order = sortOrder != null ? sortOrder : st.sort_order;
    }
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.delete('/api/timetables/:id/stations/:stationId', (req, res) => {
  const updated = mutateTimetable(req.params.id, (tt) => {
    tt.stations = tt.stations.filter((s) => s.id !== req.params.stationId);
    tt.trains.forEach((tr) => {
      tr.stops = tr.stops.filter((s) => s.station_id !== req.params.stationId);
    });
    (tt.paths || []).forEach((p) => {
      p.stops = p.stops.filter((s) => s.station_id !== req.params.stationId);
    });
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

// ── Paths ─────────────────────────────────────────────────────

app.post('/api/timetables/:id/paths', (req, res) => {
  const { name, stops } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const pathId = uuidv4();
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.paths) tt.paths = [];
    tt.paths.push({
      id: pathId, timetable_id: req.params.id, name: name.trim(),
      stops: buildPathStops(pathId, stops || []),
    });
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.status(201).json(normalise(updated));
});

app.put('/api/timetables/:id/paths/:pathId', (req, res) => {
  const { name, stops } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.paths) tt.paths = [];
    const p = tt.paths.find((x) => x.id === req.params.pathId);
    if (p) {
      p.name = name.trim();
      p.stops = buildPathStops(req.params.pathId, stops || []);
    }
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.delete('/api/timetables/:id/paths/:pathId', (req, res) => {
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.paths) tt.paths = [];
    tt.paths = tt.paths.filter((p) => p.id !== req.params.pathId);
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.post('/api/timetables/:id/trains', (req, res) => {
  const { name, color, notes, stops } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const trainId = uuidv4();
  const updated = mutateTimetable(req.params.id, (tt) => {
    tt.trains.push({
      id: trainId, timetable_id: req.params.id, name: name.trim(),
      color: color || '#3b82f6', notes: notes || '', stops: buildStops(trainId, stops || []),
    });
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.status(201).json(normalise(updated));
});

app.put('/api/timetables/:id/trains/:trainId', (req, res) => {
  const { name, color, notes, stops } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    const tr = tt.trains.find((t) => t.id === req.params.trainId);
    if (tr) {
      tr.name = name.trim(); tr.color = color || '#3b82f6'; tr.notes = notes || '';
      tr.stops = buildStops(req.params.trainId, stops || []);
    }
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.delete('/api/timetables/:id/trains/:trainId', (req, res) => {
  const updated = mutateTimetable(req.params.id, (tt) => {
    tt.trains = tt.trains.filter((t) => t.id !== req.params.trainId);
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

function buildPathStops(pathId, stops) {
  return stops.map((s, i) => ({
    id: uuidv4(), path_id: pathId, station_id: s.stationId,
    sort_order: i,
    travel_time_from_prev: Number(s.travelTimeFromPrev) || 0,
    dwell_time: Number(s.dwellTime) || 0,
  }));
}

function buildStops(trainId, stops) {
  return stops
    .filter((s) => s.arrival || s.departure)
    .map((s) => ({
      id: uuidv4(), train_id: trainId, station_id: s.stationId,
      arrival: s.arrival || null, departure: s.departure || null,
    }));
}

function normalise(tt) {
  return {
    ...tt,
    paths: tt.paths ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(tt.settings ?? {}) },
    stations: [...tt.stations].sort(
      (a, b) =>
        (a.graph_pos ?? a.distance ?? 0) - (b.graph_pos ?? b.distance ?? 0) ||
        a.sort_order - b.sort_order
    ),
  };
}

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log('Train Graph server listening on http://localhost:' + PORT);
});
