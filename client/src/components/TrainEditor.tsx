import { useEffect, useRef, useState, useCallback } from 'react';
import type { Station, Train, TrainStop, TrainRequest, Path, PathStop } from '../types';

interface StopForm {
  stationId: string;
  stationName: string;
  distance: number | null;
  arrival: string;
  departure: string;
  dwell: string; // minutes, used to compute departure and cascade
}

interface Props {
  train?: Train;
  stations: Station[];
  paths: Path[];
  onDraftChange: (draft: Train) => void;
  onSave: (data: TrainRequest) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#a855f7',
  '#84cc16', '#fb923c',
];

export function TrainEditor({ train, stations, paths, onDraftChange, onSave, onDelete, onClose }: Props) {
  const sorted = [...stations].sort((a, b) => (a.graph_pos ?? 0) - (b.graph_pos ?? 0));
  // Keep original stops around so we can restore all-stations view if path is deselected
  const trainStopsRef = useRef(train?.stops);

  const [name, setName] = useState(train?.name ?? '');
  const [color, setColor] = useState(train?.color ?? PRESET_COLORS[0]);
  const [notes, setNotes] = useState(train?.notes ?? '');
  const [stops, setStops] = useState<StopForm[]>(() => buildStopForms(sorted, train?.stops));
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Sync form → draft for live graph preview ─────────────────
  const buildDraft = useCallback((): Train => {
    const draftStops: TrainStop[] = stops
      .filter((s) => s.arrival || s.departure)
      .map((s) => ({
        id: `draft-${s.stationId}`,
        train_id: train?.id ?? '__new__',
        station_id: s.stationId,
        arrival: s.arrival || null,
        departure: s.departure || null,
      }));

    return {
      id: train?.id ?? '__new__',
      timetable_id: train?.timetable_id ?? '',
      name: name || '(unnamed)',
      color,
      notes,
      stops: draftStops,
    };
  }, [name, color, notes, stops, train]);

  useEffect(() => {
    onDraftChange(buildDraft());
  }, [buildDraft, onDraftChange]);

  // ── Handlers ─────────────────────────────────────────────────

  function getPathStops(): PathStop[] | null {
    if (!selectedPathId) return null;
    const path = paths.find((p) => p.id === selectedPathId);
    return path ? [...path.stops].sort((a, b) => a.sort_order - b.sort_order) : null;
  }

  function updateStop(idx: number, field: 'arrival' | 'departure' | 'dwell', value: string) {
    const pathStops = getPathStops();
    setStops((prev) => {
      // Apply the raw field change
      let next = prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s));

      // If arrival or dwell changed, recompute departure for this stop
      if (field === 'arrival' || field === 'dwell') {
        const s = next[idx];
        if (s.arrival && s.dwell !== '') {
          next = next.map((r, i) =>
            i === idx ? { ...r, departure: addMinutes(s.arrival, Number(s.dwell)) } : r
          );
        }
      }

      // If departure was manually changed and arrival is set, back-compute dwell
      if (field === 'departure') {
        const s = next[idx];
        if (s.arrival && s.departure) {
          const inferredDwell = diffMinutes(s.arrival, s.departure);
          next = next.map((r, i) =>
            i === idx ? { ...r, dwell: inferredDwell >= 0 ? String(inferredDwell) : r.dwell } : r
          );
        }
      }

      // Cascade downstream whenever departure effectively changed
      if (next[idx].departure) {
        next = cascadeFrom(idx, next, pathStops, prev);
      }

      return next;
    });
  }

  function inferDeparture(idx: number) {
    // If arrival is set but departure isn't, populate departure (respecting dwell)
    setStops((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        if (s.arrival && !s.departure) {
          const dep = s.dwell !== '' ? addMinutes(s.arrival, Number(s.dwell)) : s.arrival;
          return { ...s, departure: dep };
        }
        return s;
      })
    );
  }

  function handlePathChange(pathId: string) {
    const pid = pathId || null;
    setSelectedPathId(pid);
    if (!pid) {
      setStops(buildStopForms(sorted, trainStopsRef.current));
      return;
    }
    const path = paths.find((p) => p.id === pid);
    if (!path) return;
    const currentMap = new Map(stops.map((s) => [s.stationId, s]));
    const newStops = [...path.stops]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ps) => {
        const station = sorted.find((s) => s.id === ps.station_id);
        const existing = currentMap.get(ps.station_id);
        return {
          stationId: ps.station_id,
          stationName: station?.name ?? 'Unknown',
          distance: station?.distance ?? 0,
          arrival: existing?.arrival ?? '',
          departure: existing?.departure ?? '',
          dwell: existing?.dwell ?? '',
        };
      });
    setStops(newStops);
  }

  function autoFill() {
    if (!selectedPathId) return;
    const path = paths.find((p) => p.id === selectedPathId);
    if (!path) return;
    const firstDep = stops[0]?.departure;
    if (!firstDep) {
      setError('Enter a departure time for the first stop to auto-fill');
      return;
    }
    setError('');
    const pathStops = [...path.stops].sort((a, b) => a.sort_order - b.sort_order);
    setStops((prev) => {
      const next = [...prev];
      let prevDep = firstDep;
      for (let i = 1; i < next.length; i++) {
        const ps = pathStops[i];
        if (!ps) break;
        const arrival = addMinutes(prevDep, ps.travel_time_from_prev);
        const departure = addMinutes(arrival, ps.dwell_time);
        next[i] = { ...next[i], arrival, departure };
        prevDep = departure;
      }
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Train name is required');
      return;
    }
    const hasAnyStop = stops.some((s) => s.arrival || s.departure);
    if (!hasAnyStop) {
      setError('Add at least one stop time');
      return;
    }
    setError('');

    const saveStops = stops
      .filter((s) => s.arrival || s.departure)
      .map((s) => ({
        stationId: s.stationId,
        arrival: s.arrival || null,
        departure: s.departure || null,
      }));

    onSave({ id: train?.id, name: name.trim(), color, notes, stops: saveStops });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel from right */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {train ? 'Edit train' : 'New train'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-950/40 border border-red-800 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Path selector */}
          {paths.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Path (optional)</label>
              <select
                value={selectedPathId ?? ''}
                onChange={(e) => handlePathChange(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
              >
                <option value="">— No path (show all stations) —</option>
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPathId && (
                <p className="text-xs text-slate-500 mt-1">
                  Showing {stops.length} station{stops.length !== 1 ? 's' : ''} for this path.
                  Set the first departure time then use Auto-fill.
                </p>
              )}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Train name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 1A15 Express"
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Line colour</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: color === c ? `2px solid white` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
              {/* Custom picker */}
              <label className="relative w-7 h-7 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-slate-600 hover:border-slate-400 transition-colors flex items-center justify-center" title="Custom colour">
                <span className="text-xs text-slate-500">+</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="w-4 h-4 rounded-full" style={{ background: color }} />
              <span className="font-mono text-xs">{color}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              rows={2}
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
            />
          </div>

          {/* Stop times table */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-slate-400 flex-1">
                Stop times
                <span className="ml-1 text-slate-600 font-normal">— leave blank to skip a station</span>
              </label>
              {selectedPathId && (
                <button
                  type="button"
                  onClick={autoFill}
                  className="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-medium transition-colors"
                  title="Auto-fill stops from first departure using path timings"
                >
                  ⚡ Auto-fill
                </button>
              )}
            </div>

            {sorted.length === 0 && (
              <p className="text-xs text-slate-600 py-2">Add stations to the timetable first</p>
            )}

            {sorted.length > 0 && (
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_100px_100px_58px] gap-0 bg-slate-800 border-b border-slate-700 text-xs text-slate-500 font-medium">
                  <div className="px-3 py-2">Station</div>
                  <div className="px-2 py-2 border-l border-slate-700">Arrive</div>
                  <div className="px-2 py-2 border-l border-slate-700">Depart</div>
                  <div className="px-2 py-2 border-l border-slate-700" title="Dwell time in minutes — auto-computes departure and cascades subsequent stops">Dwell</div>
                </div>

                {/* Rows */}
                {stops.map((stop, idx) => (
                  <div
                    key={stop.stationId}
                    className={`grid grid-cols-[1fr_100px_100px_58px] gap-0 border-b border-slate-800 last:border-0 ${
                      stop.arrival || stop.departure ? 'bg-slate-800/40' : ''
                    }`}
                  >
                    {/* Station cell */}
                    <div className="px-3 py-2 flex flex-col justify-center">
                      <span className="text-sm text-slate-300">{stop.stationName}</span>
                      <span className="text-xs text-slate-600">{stop.distance != null ? `${stop.distance} km` : ''}</span>
                    </div>

                    {/* Arrival */}
                    <div className="border-l border-slate-800 flex items-center px-1">
                      <input
                        type="time"
                        value={stop.arrival}
                        onChange={(e) => updateStop(idx, 'arrival', e.target.value)}
                        onBlur={() => inferDeparture(idx)}
                        className="w-full bg-transparent text-sm text-slate-200 focus:outline-none focus:bg-slate-700/50 px-1 py-1.5 rounded"
                      />
                    </div>

                    {/* Departure */}
                    <div className="border-l border-slate-800 flex items-center px-1">
                      <input
                        type="time"
                        value={stop.departure}
                        onChange={(e) => updateStop(idx, 'departure', e.target.value)}
                        className="w-full bg-transparent text-sm text-slate-200 focus:outline-none focus:bg-slate-700/50 px-1 py-1.5 rounded"
                      />
                    </div>

                    {/* Dwell */}
                    <div className="border-l border-slate-800 flex items-center px-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={stop.dwell}
                        onChange={(e) => updateStop(idx, 'dwell', e.target.value)}
                        placeholder="min"
                        title="Dwell time in minutes"
                        className="w-full bg-transparent text-sm text-slate-200 focus:outline-none focus:bg-slate-700/50 px-1 py-1.5 rounded text-center placeholder:text-slate-600"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
          {onDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 text-sm rounded-lg text-red-400 hover:bg-red-950/40 border border-red-900/50 hover:border-red-800 transition-colors"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            Save train
          </button>
        </div>
      </aside>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl p-6 max-w-xs w-full mx-4">
            <h3 className="text-white font-semibold mb-2">Delete "{train?.name}"?</h3>
            <p className="text-slate-400 text-sm mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete?.();
                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStopForms(stations: Station[], existingStops?: TrainStop[]): StopForm[] {
  const stopMap = new Map(existingStops?.map((s) => [s.station_id, s]) ?? []);
  return stations.map((s) => {
    const existing = stopMap.get(s.id);
    return {
      stationId: s.id,
      stationName: s.name,
      distance: s.distance,
      arrival: existing?.arrival ?? '',
      departure: existing?.departure ?? '',
      dwell: '',
    };
  });
}

function cascadeFrom(fromIdx: number, stops: StopForm[], pathStops: PathStop[] | null, original: StopForm[]): StopForm[] {
  const next = [...stops];
  let prevDep = next[fromIdx].departure;
  if (!prevDep) return next;

  // For non-path cascade, track the original departure of the last processed stop
  // so we can infer travel time as: original_arrival[i] - original_departure[prev]
  let prevOrigDep = original[fromIdx].departure;

  for (let i = fromIdx + 1; i < next.length; i++) {
    // Skip stops that were blank — don't fill them in
    if (!original[i].arrival && !original[i].departure) continue;

    let travelMins: number;
    if (pathStops) {
      const ps = pathStops[i];
      travelMins = ps ? (ps.travel_time_from_prev ?? 0) : 0;
    } else {
      // Infer travel time from the gap in the original schedule
      if (!prevOrigDep || !original[i].arrival) break;
      travelMins = diffMinutes(prevOrigDep, original[i].arrival);
      if (travelMins < 0) travelMins = 0;
    }

    const arrival = addMinutes(prevDep, travelMins);
    // Use dwell from form if set, otherwise preserve original dwell gap
    const origDwell =
      original[i].arrival && original[i].departure
        ? diffMinutes(original[i].arrival, original[i].departure)
        : 0;
    const dwellMins = next[i].dwell !== '' ? Number(next[i].dwell) : origDwell;
    const departure = addMinutes(arrival, dwellMins);

    next[i] = { ...next[i], arrival, departure };
    prevDep = departure;
    prevOrigDep = original[i].departure;
  }
  return next;
}

function diffMinutes(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let diff = th * 60 + tm - (fh * 60 + fm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
