import { useEffect, useState } from 'react';
import { formatFullDate, formatTime } from '../../lib/date.ts';

/** Re-renders once per minute, aligned to the minute boundary. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);
  return now;
}

export function Clock({ now }: { now: Date }) {
  return (
    <div className="clock">
      <time className="clock-time tabular" dateTime={now.toISOString()}>
        {formatTime(now)}
      </time>
      <span className="clock-date">{formatFullDate(now)}</span>
    </div>
  );
}
