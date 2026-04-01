import { useState } from 'react';
import type { Path, PathStopRequest, Station } from '../types';

interface StopForm {
  stationId: string;
  travelTimeFromPrev: string; // string for input binding
  dwellTime: string;
}

interface Props {
  path?: Path;
  stations: Station[];
  onSave: (data: { name: string; stops: PathStopRequest[] }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function blankStop(stationId = ''): StopForm {
  return { stationId, travelTimeFromPrev: '0', dwellTime: '0' };
}

function initStops(path: Path | undefined, stations: Station[]): StopForm[] {
  if (path && path.stops.length > 0) {
    return [...path.stops]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        stationId: s.station_id,
        travelTimeFromPrev: String(s.travel_time_from_prev),
        dwellTime: String(s.dwell_time),
      }));
  }
  // Default: add the first station as a starter
  const first = stations[0];
  return first ? [blankStop(first.id)] : [blankStop()];
}

export function PathEditor({ path, stations, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(path?.name ?? '');
  const [stops, setStops] = useState<StopForm[]>(() => initStops(path, stations));
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function updateStop(idx: number, field: keyof StopForm, value: string) {
    setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  function addStop() {
    // Pick the first station not already in the list, or first station as fallback
    const usedIds = new Set(stops.map((s) => s.stationId));
    const next = stations.find((st) => !usedIds.has(st.id));
    setStops((prev) => [...prev, blankStop(next?.id ?? stations[0]?.id ?? '')]);
  }

  function removeStop(idx: number) {
    setStops((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveStop(idx: number, direction: -1 | 1) {
    setStops((prev) => {
      const arr = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }

  function handleSave() {
    if (!name.trim()) { setError('Path name is required'); return; }
    if (stops.length === 0) { setError('Add at least one station'); return; }
    if (stops.some((s) => !s.stationId)) { setError('All stops must have a station selected'); return; }
    setError('');
    onSave({
      name: name.trim(),
      stops: stops.map((s) => ({
        stationId: s.stationId,
        travelTimeFromPrev: Number(s.travelTimeFromPrev) || 0,
        dwellTime: Number(s.dwellTime) || 0,
      })),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative h-full w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-white font-semibold text-base">
            {path ? 'Edit Path' : 'New Path'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Path name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Up Express, Path 1"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Stops */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Stops</span>
              <button
                onClick={addStop}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                + Add stop
              </button>
            </div>

            {stops.length === 0 && (
              <p className="text-xs text-slate-600 py-2">No stops yet. Add a station above.</p>
            )}

            <div className="space-y-2">
              {stops.map((stop, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-3"
                >
                  {/* Stop header row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-slate-500 w-5 text-center">{idx + 1}</span>
                    <select
                      value={stop.stationId}
                      onChange={(e) => updateStop(idx, 'stationId', e.target.value)}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- select station --</option>
                      {stations.map((st) => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                    {/* Move buttons */}
                    <button
                      onClick={() => moveStop(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors rounded"
                      title="Move up"
                    >
                      <UpIcon />
                    </button>
                    <button
                      onClick={() => moveStop(idx, 1)}
                      disabled={idx === stops.length - 1}
                      className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors rounded"
                      title="Move down"
                    >
                      <DownIcon />
                    </button>
                    <button
                      onClick={() => removeStop(idx)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded"
                      title="Remove stop"
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  {/* Timing row */}
                  <div className="grid grid-cols-2 gap-3 pl-7">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        {idx === 0 ? 'Travel time (unused for first stop)' : 'Travel time from prev (min)'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={stop.travelTimeFromPrev}
                        onChange={(e) => updateStop(idx, 'travelTimeFromPrev', e.target.value)}
                        disabled={idx === 0}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Dwell time (min)</label>
                      <input
                        type="number"
                        min="0"
                        value={stop.dwellTime}
                        onChange={(e) => updateStop(idx, 'dwellTime', e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-3 shrink-0">
          {onDelete && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-400 hover:text-red-300 transition-colors mr-auto"
            >
              Delete path
            </button>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-xs text-slate-400">Are you sure?</span>
              <button
                onClick={onDelete}
                className="text-xs text-red-400 hover:text-red-300 font-medium"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
