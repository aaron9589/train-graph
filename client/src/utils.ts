import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  }, [key, value]);

  return [value, setValue];
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Generate tick marks between startTime and endTime at the given interval (minutes). */
export function generateTicks(
  startTime: string,
  endTime: string,
  intervalMinutes: number
): number[] {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const ticks: number[] = [];
  const first = Math.ceil(start / intervalMinutes) * intervalMinutes;
  for (let t = first; t <= end; t += intervalMinutes) {
    ticks.push(t);
  }
  return ticks;
}
