import { useState } from 'react';
import type { Path, Timetable, TimetableSummary, Train } from '../types';
import { StationPanel } from './StationPanel';
import { useLocalStorage } from '../utils';

interface Props {
  timetables: TimetableSummary[];
  selectedId: string | null;
  timetable: Timetable | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectTimetable: (id: string) => void;
  onNewTimetable: () => void;
  onEditTimetable: () => void;
  onDeleteTimetable: (id: string) => void;
  onDuplicateTimetable: (id: string) => void;
  onAddStation: (data: { name: string; shortCode: string; distance: number | null; graphPos: number }) => void;
  onUpdateStation: (id: string, data: { name: string; shortCode: string; distance: number | null; graphPos: number; sortOrder: number }) => void;
  onDeleteStation: (id: string) => void;
  onNewPath: () => void;
  onEditPath: (path: Path) => void;
  onDeletePath: (pathId: string) => void;
  onNewTrain: () => void;
  onEditTrain: (train: Train) => void;
  onDeleteTrain: (trainId: string) => void;
  hiddenTrainIds: Set<string>;
  onToggleTrainVisibility: (trainId: string) => void;
}

export function Sidebar({
  timetables,
  selectedId,
  timetable,
  collapsed,
  onToggleCollapse,
  onSelectTimetable,
  onNewTimetable,
  onEditTimetable,
  onDeleteTimetable,
  onDuplicateTimetable,
  onAddStation,
  onUpdateStation,
  onDeleteStation,
  onNewPath,
  onEditPath,
  onDeletePath,
  onNewTrain,
  onEditTrain,
  onDeleteTrain,
  hiddenTrainIds,
  onToggleTrainVisibility,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [openSections, setOpenSections] = useLocalStorage('tg:openSections', { trains: true, stations: true, paths: false });

  function toggleSection(s: 'trains' | 'stations' | 'paths') {
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 flex flex-col items-center bg-slate-900 border-r border-slate-800 py-4 gap-4">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-500 hover:text-slate-300 rounded transition-colors"
          title="Expand sidebar"
        >
          <ChevronRightIcon />
        </button>
        <span className="text-lg">🚂</span>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🚂</span>
          <span className="font-bold text-white tracking-tight text-lg flex-1">Train Graph</span>
          <button
            onClick={onToggleCollapse}
            className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeftIcon />
          </button>
        </div>

        {/* Timetable section */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Timetables
          </span>
          <button
            onClick={onNewTimetable}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            + New
          </button>
        </div>

        {/* Timetable list */}
        <div className="space-y-1">
          {timetables.length === 0 && (
            <p className="text-xs text-slate-600 py-2">No timetables yet</p>
          )}
          {timetables.map((tt) => (
            <div
              key={tt.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                tt.id === selectedId
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              onClick={() => onSelectTimetable(tt.id)}
            >
              <span className="flex-1 text-sm font-medium truncate">{tt.name}</span>
              {tt.id === selectedId && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicateTimetable(tt.id); }}
                    title="Duplicate timetable"
                    className="p-1 text-slate-400 hover:text-slate-200 rounded"
                  >
                    <CopyIcon />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditTimetable(); }}
                    title="Edit timetable settings"
                    className="p-1 text-slate-400 hover:text-slate-200 rounded"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(tt.id); }}
                    title="Delete timetable"
                    className="p-1 text-slate-400 hover:text-red-400 rounded"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Trains ── */}
      {timetable && (
        <>
          <div className="border-t border-slate-800 mx-4" />
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => toggleSection('trains')}
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-400 transition-colors"
              >
                <Chevron open={openSections.trains} />
                Trains
              </button>
              <button
                onClick={onNewTrain}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                + Add
              </button>
            </div>
            {openSections.trains && (
              <>
                {timetable.trains.length === 0 && (
                  <p className="text-xs text-slate-600 py-1">No trains yet</p>
                )}
                <div className="space-y-1">
                  {sortTrains(timetable.trains).map((train) => {
                    const hidden = hiddenTrainIds.has(train.id);
                    return (
                    <div
                      key={train.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-800 cursor-pointer transition-colors"
                      onClick={() => onEditTrain(train)}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/20"
                        style={{ background: train.color, opacity: hidden ? 0.35 : 1 }}
                      />
                      <span className={`flex-1 text-sm truncate ${hidden ? 'text-slate-600' : 'text-slate-300'}`}>{train.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleTrainVisibility(train.id); }}
                        title={hidden ? 'Show on graph' : 'Hide from graph'}
                        className="p-1 text-slate-600 hover:text-slate-300 rounded shrink-0 transition-colors"
                      >
                        {hidden ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditTrain(train); }}
                          className="p-1 text-slate-400 hover:text-slate-200 rounded"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(`train-${train.id}`); }}
                          className="p-1 text-slate-400 hover:text-red-400 rounded"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Stations ── */}
      {timetable && (
        <>
          <div className="border-t border-slate-800 mx-4" />
          <StationPanel
            stations={timetable.stations}
            open={openSections.stations}
            onToggle={() => toggleSection('stations')}
            onAdd={onAddStation}
            onUpdate={onUpdateStation}
            onDelete={onDeleteStation}
          />
        </>
      )}

      {/* ── Paths ── */}
      {timetable && (
        <>
          <div className="border-t border-slate-800 mx-4" />
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => toggleSection('paths')}
                className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-400 transition-colors"
              >
                <Chevron open={openSections.paths} />
                Paths
              </button>
              <button
                onClick={onNewPath}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                + Add
              </button>
            </div>
            {openSections.paths && (
              <>
                {timetable.paths.length === 0 && (
                  <p className="text-xs text-slate-600 py-1">No paths yet</p>
                )}
                <div className="space-y-1">
                  {timetable.paths.map((path) => (
                    <div
                      key={path.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-800 cursor-pointer transition-colors"
                      onClick={() => onEditPath(path)}
                    >
                      <RouteIcon />
                      <span className="flex-1 text-sm text-slate-300 truncate">{path.name}</span>
                      <span className="text-xs text-slate-600">{path.stops.length} stops</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditPath(path); }}
                          className="p-1 text-slate-400 hover:text-slate-200 rounded"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(`path-${path.id}`); }}
                          className="p-1 text-slate-400 hover:text-red-400 rounded"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl p-6 max-w-xs w-full mx-4">
            <h3 className="text-white font-semibold mb-2">Confirm delete</h3>
            <p className="text-slate-400 text-sm mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.startsWith('train-')) {
                    onDeleteTrain(confirmDelete.slice(6));
                  } else if (confirmDelete.startsWith('path-')) {
                    onDeletePath(confirmDelete.slice(5));
                  } else {
                    onDeleteTimetable(confirmDelete);
                  }
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trainStartMinute(train: Train): number {
  let earliest = Infinity;
  for (const s of train.stops) {
    const t = s.arrival ?? s.departure;
    if (t) {
      const [h, m] = t.split(':').map(Number);
      const min = h * 60 + m;
      if (min < earliest) earliest = min;
    }
  }
  return earliest === Infinity ? 0 : earliest;
}

function sortTrains(trains: Train[]): Train[] {
  return [...trains].sort((a, b) => trainStartMinute(a) - trainStartMinute(b));
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />
    </svg>
  );
}
