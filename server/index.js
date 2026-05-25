const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readDB, writeDB, getTimetable, mutateTimetable, uuidv4 } = require('./db');
const openApiSpec = require('./openapi');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
// Optional sub-path prefix, e.g. BASE_PATH=/traingraph
// Strips the prefix from incoming URLs before any routing so the same
// image works whether the reverse proxy rewrites the path or not.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

// ── API key ──────────────────────────────────────────────────
// Set API_KEY in the environment to use a fixed key.
// If unset, a random key is generated each startup and printed to the log.
const API_KEY = process.env.API_KEY || (() => {
  const generated = crypto.randomUUID();
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│  No API_KEY set — using auto-generated key:         │');
  console.log(`│  ${generated}  │`);
  console.log('│  Set API_KEY env var to make this persistent.        │');
  console.log('└─────────────────────────────────────────────────────┘\n');
  return generated;
})();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;
app.use(cors(ALLOWED_ORIGIN ? { origin: ALLOWED_ORIGIN } : {}));
app.use(express.json({ limit: '1mb' }));

// 200 requests per minute across all API routes
app.use('/api', rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));

// Require X-API-Key on all mutating API calls (POST/PUT/DELETE).
// GET/HEAD/OPTIONS remain open so read-only clients and live endpoints work unauthenticated.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const provided = req.headers['x-api-key'];
  if (!provided || provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: valid X-API-Key header required' });
  }
  next();
});

if (BASE_PATH) {
  app.use((req, _res, next) => {
    if (req.url.startsWith(BASE_PATH + '/') || req.url === BASE_PATH) {
      req.url = req.url.slice(BASE_PATH.length) || '/';
    }
    next();
  });
}

if (process.env.NODE_ENV === 'production') {
  // Serve static assets but skip index.html — the catch-all below injects the API key into it.
  app.use(express.static(path.join(__dirname, '../client/dist'), { index: false }));
}

const DEFAULT_SETTINGS = {
  clock_enabled: false,
  clock_broker_url: '',
  clock_topic: 'trains/jmri/memory/currentTime',
};

app.get('/api/timetables', (_req, res) => {
  const db = readDB();
  const summaries = [...db.timetables]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(({ id, name, description, start_time, end_time, created_at, updated_at }) => ({
      id, name, description, start_time, end_time, created_at, updated_at,
      active: id === (db.active_timetable_id || null),
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

// ── Active timetable (guard panel flag) ───────────────────────

app.get('/api/active-timetable', (_req, res) => {
  const db = readDB();
  const id = db.active_timetable_id || null;
  res.json({ id });
});

app.put('/api/active-timetable', (req, res) => {
  const { id } = req.body;
  const db = readDB();
  if (id && !db.timetables.find((t) => t.id === id)) {
    return res.status(404).json({ error: 'Timetable not found' });
  }
  db.active_timetable_id = id || null;
  writeDB(db);
  res.json({ id: db.active_timetable_id });
});

// Must be defined before /:id routes to avoid 'import' being matched as an id
app.post('/api/timetables/import', (req, res) => {
  const data = req.body;
  if (!data || !data.name) return res.status(400).json({ error: 'Invalid timetable data: name is required' });
  const db = readDB();
  const now = new Date().toISOString();
  const newId = uuidv4();
  const stationIdMap = {};
  (data.stations || []).forEach((s) => { stationIdMap[s.id] = uuidv4(); });
  const pathIdMap = {};
  (data.paths || []).forEach((p) => { pathIdMap[p.id] = uuidv4(); });
  const crewIdMap = {};
  (data.crews || []).forEach((c) => { crewIdMap[c.id] = uuidv4(); });
  const imported = {
    id: newId,
    name: String(data.name).trim(),
    description: String(data.description || ''),
    start_time: String(data.start_time || '06:00'),
    end_time: String(data.end_time || '22:00'),
    created_at: now,
    updated_at: now,
    settings: { ...DEFAULT_SETTINGS, ...(data.settings && typeof data.settings === 'object' ? {
      clock_enabled: Boolean(data.settings.clock_enabled),
      clock_broker_url: String(data.settings.clock_broker_url || ''),
      clock_topic: String(data.settings.clock_topic || DEFAULT_SETTINGS.clock_topic),
    } : {}) },
    stations: (data.stations || []).map((s) => ({
      id: stationIdMap[s.id],
      timetable_id: newId,
      name: String(s.name || '').trim(),
      short_code: String(s.short_code || ''),
      distance: (s.distance != null && s.distance !== '' && Number.isFinite(Number(s.distance))) ? Number(s.distance) : null,
      graph_pos: Number.isFinite(Number(s.graph_pos)) ? Number(s.graph_pos) : 0,
      sort_order: Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : 0,
    })),
    trains: (data.trains || []).map((tr) => {
      const trainId = uuidv4();
      return {
        id: trainId,
        timetable_id: newId,
        name: String(tr.name || '').trim(),
        color: /^#[0-9a-fA-F]{3,8}$/.test(tr.color) ? tr.color : '#3b82f6',
        notes: String(tr.notes || ''),
        train_type: String(tr.train_type || ''),
        train_id: String(tr.train_id || ''),
        direction: String(tr.direction || ''),
        crew_id: tr.crew_id ? (crewIdMap[tr.crew_id] || null) : null,
        stops: (tr.stops || []).map((stop) => ({
          id: uuidv4(),
          train_id: trainId,
          station_id: stationIdMap[stop.station_id] || String(stop.station_id),
          arrival: stop.arrival ? String(stop.arrival) : null,
          departure: stop.departure ? String(stop.departure) : null,
          special_instructions: stop.special_instructions ? String(stop.special_instructions) : null,
        })),
      };
    }),
    paths: (data.paths || []).map((p) => {
      const pathId = pathIdMap[p.id];
      return {
        id: pathId,
        timetable_id: newId,
        name: String(p.name || '').trim(),
        stops: (p.stops || []).map((ps) => ({
          id: uuidv4(),
          path_id: pathId,
          station_id: stationIdMap[ps.station_id] || String(ps.station_id),
          sort_order: Number.isFinite(Number(ps.sort_order)) ? Number(ps.sort_order) : 0,
          travel_time_from_prev: Number.isFinite(Number(ps.travel_time_from_prev)) ? Number(ps.travel_time_from_prev) : 0,
          dwell_time: Number.isFinite(Number(ps.dwell_time)) ? Number(ps.dwell_time) : 0,
        })),
      };
    }),
    crews: (data.crews || []).map((c) => ({
      id: crewIdMap[c.id],
      timetable_id: newId,
      name: String(c.name || '').trim(),
      color: /^#[0-9a-fA-F]{3,8}$/.test(c.color) ? c.color : '#94a3b8',
    })),
  };
  db.timetables.push(imported);
  writeDB(db);
  res.status(201).json(normalise(imported));
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
  const crewIdMap = {};
  (original.crews || []).forEach((c) => { crewIdMap[c.id] = uuidv4(); });
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
        crew_id: tr.crew_id ? (crewIdMap[tr.crew_id] || null) : null,
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
    crews: (original.crews || []).map((c) => ({ ...c, id: crewIdMap[c.id], timetable_id: newId })),
  };
  db.timetables.push(duplicate);
  writeDB(db);
  res.status(201).json(normalise(duplicate));
});

app.post('/api/timetables/:id/restore', (req, res) => {
  const { stations, trains, paths, crews } = req.body;
  const ttId = req.params.id;
  const updated = mutateTimetable(ttId, (tt) => {
    if (Array.isArray(stations)) tt.stations = stations.map((s) => ({
      id: String(s.id),
      timetable_id: ttId,
      name: String(s.name || '').trim(),
      short_code: String(s.short_code || ''),
      distance: (s.distance != null && s.distance !== '' && Number.isFinite(Number(s.distance))) ? Number(s.distance) : null,
      graph_pos: Number.isFinite(Number(s.graph_pos)) ? Number(s.graph_pos) : 0,
      sort_order: Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : 0,
    }));
    if (Array.isArray(trains)) tt.trains = trains.map((tr) => ({
      id: String(tr.id),
      timetable_id: ttId,
      name: String(tr.name || '').trim(),
      color: /^#[0-9a-fA-F]{3,8}$/.test(tr.color) ? tr.color : '#3b82f6',
      notes: String(tr.notes || ''),
      train_type: String(tr.train_type || ''),
      train_id: String(tr.train_id || ''),
      direction: String(tr.direction || ''),
      crew_id: tr.crew_id ? String(tr.crew_id) : null,
      stops: (tr.stops || []).map((s) => ({
        id: String(s.id),
        train_id: String(tr.id),
        station_id: String(s.station_id),
        arrival: s.arrival ? String(s.arrival) : null,
        departure: s.departure ? String(s.departure) : null,
        special_instructions: s.special_instructions ? String(s.special_instructions) : null,
      })),
    }));
    if (Array.isArray(paths)) tt.paths = paths.map((p) => ({
      id: String(p.id),
      timetable_id: ttId,
      name: String(p.name || '').trim(),
      stops: (p.stops || []).map((ps) => ({
        id: String(ps.id),
        path_id: String(p.id),
        station_id: String(ps.station_id),
        sort_order: Number.isFinite(Number(ps.sort_order)) ? Number(ps.sort_order) : 0,
        travel_time_from_prev: Number.isFinite(Number(ps.travel_time_from_prev)) ? Number(ps.travel_time_from_prev) : 0,
        dwell_time: Number.isFinite(Number(ps.dwell_time)) ? Number(ps.dwell_time) : 0,
      })),
    }));
    if (Array.isArray(crews)) tt.crews = crews.map((c) => ({
      id: String(c.id),
      timetable_id: ttId,
      name: String(c.name || '').trim(),
      color: /^#[0-9a-fA-F]{3,8}$/.test(c.color) ? c.color : '#94a3b8',
    }));
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.put('/api/timetables/:id/settings', (req, res) => {
  const { clock_enabled, clock_broker_url, clock_topic } = req.body;
  if (clock_broker_url !== undefined) {
    // Only allow ws:// or wss:// broker URLs to prevent the client being
    // directed to connect to arbitrary non-MQTT endpoints.
    let parsedUrl = null;
    try { parsedUrl = new URL(String(clock_broker_url)); } catch { /* invalid */ }
    if (clock_broker_url !== '' && (!parsedUrl || !['ws:', 'wss:'].includes(parsedUrl.protocol))) {
      return res.status(400).json({ error: 'clock_broker_url must use ws:// or wss://' });
    }
  }
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
  const { name, color, notes, trainType, trainId: trainIdField, direction, crewId, stops } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const trainId = uuidv4();
  const updated = mutateTimetable(req.params.id, (tt) => {
    tt.trains.push({
      id: trainId, timetable_id: req.params.id, name: name.trim(),
      color: color || '#3b82f6', notes: notes || '',
      train_type: trainType || '', train_id: trainIdField || '', direction: direction || '',
      crew_id: crewId || null,
      stops: buildStops(trainId, stops || []),
    });
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.status(201).json(normalise(updated));
});

app.put('/api/timetables/:id/trains/:trainId', (req, res) => {
  const { name, color, notes, trainType, trainId: trainIdField, direction, crewId, stops } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    const tr = tt.trains.find((t) => t.id === req.params.trainId);
    if (tr) {
      tr.name = name.trim(); tr.color = color || '#3b82f6'; tr.notes = notes || '';
      tr.train_type = trainType || ''; tr.train_id = trainIdField || ''; tr.direction = direction || '';
      tr.crew_id = crewId || null;
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

// ── Crews ─────────────────────────────────────────────────────

app.post('/api/timetables/:id/crews', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.crews) tt.crews = [];
    tt.crews.push({ id: uuidv4(), timetable_id: req.params.id, name: name.trim(), color: color || '#94a3b8' });
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.status(201).json(normalise(updated));
});

// Must be defined before /:crewId to avoid 'reorder' being matched as an ID
app.put('/api/timetables/:id/crews/reorder', (req, res) => {
  const { order } = req.body; // array of crew IDs in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.crews) tt.crews = [];
    const map = new Map(tt.crews.map((c) => [c.id, c]));
    const reordered = order.map((id) => map.get(id)).filter(Boolean);
    // Append any crews not mentioned in order (safety net)
    const mentioned = new Set(order);
    tt.crews.filter((c) => !mentioned.has(c.id)).forEach((c) => reordered.push(c));
    tt.crews = reordered;
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.put('/api/timetables/:id/crews/:crewId', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.crews) tt.crews = [];
    const crew = tt.crews.find((c) => c.id === req.params.crewId);
    if (crew) { crew.name = name.trim(); crew.color = color || crew.color; }
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(normalise(updated));
});

app.delete('/api/timetables/:id/crews/:crewId', (req, res) => {
  const updated = mutateTimetable(req.params.id, (tt) => {
    if (!tt.crews) tt.crews = [];
    tt.crews = tt.crews.filter((c) => c.id !== req.params.crewId);
    // Clear crew assignment from all trains
    tt.trains.forEach((tr) => { if (tr.crew_id === req.params.crewId) tr.crew_id = null; });
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
      special_instructions: s.specialInstructions || null,
    }));
}

function normalise(tt) {
  return {
    ...tt,
    paths: tt.paths ?? [],
    crews: tt.crews ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(tt.settings ?? {}) },
    stations: [...tt.stations].sort(
      (a, b) =>
        (a.graph_pos ?? a.distance ?? 0) - (b.graph_pos ?? b.distance ?? 0) ||
        a.sort_order - b.sort_order
    ),
  };
}

// ── Auto-assign trains to crews ───────────────────────────────

app.post('/api/timetables/:id/trains/auto-assign', (req, res) => {
  const { crewIds, trainIds, onlyUnassigned } = req.body;
  if (!Array.isArray(crewIds) || crewIds.length === 0) {
    return res.status(400).json({ error: 'crewIds must be a non-empty array' });
  }

  function trainMinutes(tr) {
    let start = Infinity, end = -Infinity;
    for (const s of (tr.stops || [])) {
      const times = [s.arrival, s.departure].filter(Boolean);
      for (const t of times) {
        const [h, m] = t.split(':').map(Number);
        const min = h * 60 + m;
        if (min < start) start = min;
        if (min > end) end = min;
      }
    }
    return { start: start === Infinity ? 0 : start, end: end === -Infinity ? 0 : end };
  }

  const unassignedNames = [];

  const updated = mutateTimetable(req.params.id, (tt) => {
    // Which trains to consider — filter by explicit trainIds list if provided, then by onlyUnassigned
    const trainIdSet = Array.isArray(trainIds) && trainIds.length > 0 ? new Set(trainIds) : null;
    const candidates = tt.trains.filter((t) => {
      if (trainIdSet && !trainIdSet.has(t.id)) return false;
      if (onlyUnassigned && t.crew_id) return false;
      return true;
    });

    // Sort by start time
    const sorted = [...candidates].sort((a, b) => trainMinutes(a).start - trainMinutes(b).start);

    // Track the latest end minute and job count per crew.
    // Pre-seed with any jobs those crews already hold (so existing assignments
    // act as hard constraints and aren't overlapped).
    const crewEnds = {};
    const crewCounts = {};
    const crewIdSet = new Set(crewIds);
    crewIds.forEach((id) => { crewEnds[id] = -1; crewCounts[id] = 0; });
    for (const tr of tt.trains) {
      if (!tr.crew_id || !crewIdSet.has(tr.crew_id)) continue;
      const { end } = trainMinutes(tr);
      if (end > crewEnds[tr.crew_id]) crewEnds[tr.crew_id] = end;
      crewCounts[tr.crew_id]++;
    }

    for (const train of sorted) {
      const { start, end } = trainMinutes(train);
      // Collect all crews who are free (no overlap with this train's start)
      const available = crewIds.filter((id) => crewEnds[id] < start);
      if (!available.length) {
        unassignedNames.push(train.name);
        continue;
      }
      // Pick the crew with the fewest jobs; break ties by who finished earliest
      available.sort((a, b) =>
        crewCounts[a] !== crewCounts[b]
          ? crewCounts[a] - crewCounts[b]
          : crewEnds[a] - crewEnds[b]
      );
      const chosen = available[0];
      train.crew_id = chosen;
      crewEnds[chosen] = end;
      crewCounts[chosen]++;
    }
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ ...normalise(updated), unassigned: unassignedNames });
});

// ── Live API (external system integration) ────────────────────────────────────

// Derive the next service a crew member is assigned to after this train
function computeNextCrewService(tt, train) {
  if (!train.crew_id) return '';
  const crewTrains = (tt.trains || []).filter((t) => t.crew_id === train.crew_id);
  if (crewTrains.length < 2) return '';
  function trainStartMinute(tr) {
    let earliest = Infinity;
    for (const s of (tr.stops || [])) {
      const t = s.arrival || s.departure;
      if (t) {
        const [h, m] = t.split(':').map(Number);
        const min = h * 60 + m;
        if (min < earliest) earliest = min;
      }
    }
    return earliest === Infinity ? 0 : earliest;
  }
  const sorted = [...crewTrains].sort((a, b) => trainStartMinute(a) - trainStartMinute(b));
  const idx = sorted.findIndex((t) => t.id === train.id);
  if (idx === -1 || idx === sorted.length - 1) return '';
  return sorted[idx + 1].name;
}

app.get('/api/timetables/:id/live/trains', (req, res) => {
  const tt = getTimetable(req.params.id);
  if (!tt) return res.status(404).json({ error: 'Not found' });
  function trainStartMinute(tr) {
    let earliest = Infinity;
    for (const s of (tr.stops || [])) {
      const t = s.arrival || s.departure;
      if (t) {
        const [h, m] = t.split(':').map(Number);
        const min = h * 60 + m;
        if (min < earliest) earliest = min;
      }
    }
    return earliest === Infinity ? 0 : earliest;
  }
  const trains = [...(tt.trains || [])]
    .sort((a, b) => trainStartMinute(a) - trainStartMinute(b))
    .map((tr) => ({
      name: tr.name,
      trainType: tr.train_type || '',
      trainId: tr.train_id || '',
      direction: tr.direction || '',
      notes: tr.notes || '',
      nextCrewService: computeNextCrewService(tt, tr),
    }));
  res.json({ trains });
});

app.get('/api/timetables/:id/live/trains/:trainName', (req, res) => {
  const tt = getTimetable(req.params.id);
  if (!tt) return res.status(404).json({ error: 'Not found' });
  const train = (tt.trains || []).find((tr) => tr.name === req.params.trainName);
  if (!train) return res.status(404).json({ error: 'Train not found' });
  const stationMap = new Map((tt.stations || []).map((s) => [s.id, s]));
  const stops = (train.stops || []).map((stop) => {
    const station = stationMap.get(stop.station_id);
    return {
      stopName: station ? station.name : stop.station_id,
      arrival: stop.arrival || null,
      departure: stop.departure || null,
      specialInstructions: stop.special_instructions || null,
    };
  });
  res.json({
    name: train.name,
    trainType: train.train_type || '',
    trainId: train.train_id || '',
    direction: train.direction || '',
    notes: train.notes || '',
    nextCrewService: computeNextCrewService(tt, train),
    stops,
  });
});

// ── JMRI clock script download ────────────────────────────────

app.get('/api/download/jmri-clock-script', (req, res) => {
  const topic = String(req.query.topic || 'jmri/memory/currentTime');
  // Allow only safe MQTT topic characters. Double-quote is intentionally
  // excluded — it is the Python string delimiter used below and must never
  // appear here, even if this regex is widened in future.
  if (!/^[a-zA-Z0-9/_\-.]{1,256}$/.test(topic)) {
    return res.status(400).json({ error: 'Invalid topic' });
  }

  const script = [
    'import jmri',
    'import java',
    'from datetime import datetime',
    '',
    '# Publishes the JMRI internal fast clock to an MQTT topic in 24-hour format.',
    '# Generated by LiveRun — https://liverun.app',
    '#',
    '# Compatible with JMRI 4.17 and later (requires MQTT connection configured in JMRI).',
    '#',
    '# SETUP',
    '# -----',
    '# 1. In JMRI, open Edit > Preferences > Connections.',
    '#    Add a new connection, choose type "MQTT".',
    '#    Enter your broker hostname/IP and port (default: 1883), then save & restart.',
    '#',
    '# 2. Save this file to the "jython" folder inside your JMRI preferences folder.',
    '#      macOS / Linux : ~/JMRI/jython/',
    '#      Windows       : C:\\Users\\<you>\\JMRI\\jython\\',
    '#',
    '# 3. Run manually  : Scripting > Run Script… > select this file.',
    '#    Run at startup : Edit > Preferences > Start Up > Add Action >',
    '#                    "Execute Jython Script" > select this file.',
    '',
    `mqtt_topic = "${topic}"`,
    'memory_variable_name = "IMCURRENTTIME"',
    '',
    'try:',
    '    memory = jmri.InstanceManager.memoryManagerInstance().getMemory(memory_variable_name)',
    '    if memory is None:',
    '        raise ValueError("Memory variable \'" + memory_variable_name + "\' not found.")',
    '',
    '    mqttAdapter = jmri.InstanceManager.getDefault(jmri.jmrix.mqtt.MqttSystemConnectionMemo).getMqttAdapter()',
    '    if mqttAdapter is None:',
    '        raise ValueError("MQTT Adapter not found. Add an MQTT connection in JMRI Preferences.")',
    '',
    '    def to_24_hour(time_str):',
    '        try:',
    '            dt = datetime.strptime(time_str, "%I:%M %p")',
    '            return "%d:%02d" % (dt.hour, dt.minute)',
    '        except Exception as e:',
    '            print("Error converting time \'%s\': %s" % (time_str, e))',
    '            return time_str',
    '',
    '    class MemoryChangeListener(java.beans.PropertyChangeListener):',
    '        def __init__(self, memory, mqttAdapter, topic):',
    '            self.memory = memory',
    '            self.mqttAdapter = mqttAdapter',
    '            self.topic = topic',
    '',
    '        def propertyChange(self, event):',
    '            new_value = self.memory.getValue()',
    '            if new_value is not None:',
    '                formatted_time = to_24_hour(str(new_value))',
    '                self.mqttAdapter.publish(self.topic, formatted_time.encode("utf-8"))',
    '                print("Published \'%s\' to \'%s\'" % (formatted_time, self.topic))',
    '            else:',
    '                print("Memory value is None, skipping publish.")',
    '',
    '    listener = MemoryChangeListener(memory, mqttAdapter, mqtt_topic)',
    '    memory.addPropertyChangeListener(listener)',
    '',
    '    initial_value = memory.getValue()',
    '    if initial_value is not None:',
    '        formatted_time = to_24_hour(str(initial_value))',
    '        mqttAdapter.publish(mqtt_topic, formatted_time.encode("utf-8"))',
    '        print("Initial publish: \'%s\' to \'%s\'" % (formatted_time, mqtt_topic))',
    '    else:',
    '        print("Initial memory value is None, no publish.")',
    '',
    '    print("LiveRun clock script ready — listening for fast clock changes.")',
    '',
    'except Exception as e:',
    '    print("Error: %s" % e)',
  ].join('\n');

  res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="liverun-clock.py"');
  res.send(script);
});

// ── API schema / docs ─────────────────────────────────────────

app.get('/api/schema', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/api/docs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LiveRun API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.32.6/swagger-ui.css"
        integrity="sha384-9Q2fpS+xeS4ffJy6CagnwoUl+4ldAYhOs9pgZuEKxypVModhmZFzeMlvVsAjf7uT"
        crossorigin="anonymous" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.32.6/swagger-ui-bundle.js"
          integrity="sha384-EYdOaiRwn44zNjrw+Tfs06qYz9BGQVo2f4/pLY5i7VorbjnZNhdplAbTBk8FXHUJ"
          crossorigin="anonymous"></script>
  <script>
    SwaggerUIBundle({
      url: ${JSON.stringify(`${BASE_PATH}/api/schema`)},
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
    });
  </script>
</body>
</html>`);
});

if (process.env.NODE_ENV === 'production') {
  // Inject the API key into index.html as window.__API_KEY__ so the browser
  // client can send it with every mutating request without extra configuration.
  //
  // Trade-off: the key is visible in the page source to anyone who can load
  // the app. For this single-user/small-team tool that is an acceptable
  // compromise — the app is intended to run behind a firewall, not exposed to
  // the public internet. And because timetables can be exported and re-imported
  // as JSON, any malicious mutation is trivially reversible: export before an
  // operation session, import if anything goes wrong.
  const rawIndexHtml = fs.readFileSync(path.join(__dirname, '../client/dist', 'index.html'), 'utf8');
  const injectedIndexHtml = rawIndexHtml.replace(
    '<head>',
    `<head><script>window.__API_KEY__=${JSON.stringify(API_KEY)}</script>`
  );
  app.get('*', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injectedIndexHtml);
  });
}

// Global error handler — prevents stack traces leaking to clients
app.use((err, _req, res, _next) => {
  console.error(err);
  // Forward 4xx status codes from body-parser (e.g. 413 Payload Too Large,
  // 400 Bad JSON) so clients get a meaningful response rather than 500.
  const status = err.status ?? err.statusCode ?? 500;
  const clientError = status >= 400 && status < 500;
  res.status(status).json({ error: clientError ? err.message : 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Train Graph server listening on http://localhost:' + PORT);
});
