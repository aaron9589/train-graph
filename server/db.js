/**
 * Pure-JSON file database — no native modules required.
 *
 * All timetable data is stored in a single JSON file. Each timetable
 * embeds its stations and trains (with stops) for fast, simple access.
 *
 * Writes use a tmp-file → rename pattern for crash-safety.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH
  ? process.env.DB_PATH.replace(/\.db$/, '.json')
  : path.join(__dirname, 'data', 'train-graph.json');

/** @returns {{ timetables: object[] }} */
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { timetables: [] };
  }
}

/** Atomically write the DB to disk. */
function writeDB(data) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

/** Returns the full timetable object (with stations & trains), or null. */
function getTimetable(id) {
  const { timetables } = readDB();
  return timetables.find((t) => t.id === id) ?? null;
}

/** Persist a mutation to a specific timetable. fn receives the timetable and may mutate it. */
function mutateTimetable(id, fn) {
  const db = readDB();
  const idx = db.timetables.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  fn(db.timetables[idx]);
  db.timetables[idx].updated_at = new Date().toISOString();
  writeDB(db);
  return db.timetables[idx];
}

module.exports = { readDB, writeDB, getTimetable, mutateTimetable, uuidv4 };
