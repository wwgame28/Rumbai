import { useEffect, useState } from 'react';
import { detectCapabilities, type Capabilities } from './capability.ts';

let cached: Promise<Capabilities> | null = null;

export function getCapabilities(force = false) {
  if (force || !cached) cached = detectCapabilities();
  return cached;
}

export function useCapabilities(): [Capabilities | null, () => void] {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    getCapabilities(tick > 0).then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
  }, [tick]);
  return [caps, () => setTick((t) => t + 1)];
}
