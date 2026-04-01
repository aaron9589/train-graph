import { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';

function parseClockTime(raw: string): number | null {
  let s = raw.trim();
  // Try JSON with a .value field (e.g. JMRI memory messages)
  try {
    const obj = JSON.parse(s);
    s = String(obj.value ?? obj.time ?? obj.Value ?? s).trim();
  } catch { /* not JSON */ }
  // Match HH:MM or H:MM (ignoring seconds / AM/PM suffix)
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return null;
}

export type ClockStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useFastClock(
  brokerUrl: string,
  topic: string,
  enabled: boolean
): { clockTime: number | null; status: ClockStatus } {
  const [clockTime, setClockTime] = useState<number | null>(null);
  const [status, setStatus] = useState<ClockStatus>('disconnected');
  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);

  useEffect(() => {
    if (!enabled || !brokerUrl) {
      setClockTime(null);
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    let client: ReturnType<typeof mqtt.connect>;
    try {
      client = mqtt.connect(brokerUrl, { reconnectPeriod: 5000 });
    } catch {
      setStatus('error');
      return;
    }
    clientRef.current = client;

    client.on('connect', () => {
      setStatus('connected');
      client.subscribe(topic, (err) => {
        if (err) setStatus('error');
      });
    });

    client.on('message', (_t, message) => {
      const parsed = parseClockTime(message.toString());
      if (parsed !== null) setClockTime(parsed);
    });

    client.on('error', () => setStatus('error'));
    client.on('close', () => {
      if (status !== 'error') setStatus('disconnected');
    });

    return () => {
      client.end(true);
      clientRef.current = null;
      setClockTime(null);
      setStatus('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, brokerUrl, topic]);

  return { clockTime, status };
}
