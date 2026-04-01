import { useState } from 'react';
import type { TimetableSummary } from '../types';

interface Props {
  initial?: TimetableSummary;
  onSave: (data: {
    name: string;
    description: string;
    startTime: string;
    endTime: string;
  }) => void;
  onClose: () => void;
}

export function TimetableForm({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startTime, setStartTime] = useState(initial?.start_time ?? '06:00');
  const [endTime, setEndTime] = useState(initial?.end_time ?? '22:00');
  const [error, setError] = useState('');

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (startTime >= endTime) {
      setError('Start time must be before end time');
      return;
    }
    setError('');
    onSave({ name: name.trim(), description, startTime, endTime });
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-lg font-semibold text-white">
              {initial ? 'Edit timetable' : 'New timetable'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-950/40 border border-red-800 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekday Suburban"
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description…"
                rows={2}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 text-sm resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Graph start time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Graph end time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-slate-600">
              The graph will display from {startTime} to {endTime} on the time axis. Stations and
              trains can be added after creation.
            </p>
          </div>

          {/* Footer */}
          <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-800">
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
              {initial ? 'Save changes' : 'Create timetable'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
