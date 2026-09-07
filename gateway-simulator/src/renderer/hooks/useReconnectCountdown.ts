import { useEffect, useState } from 'react';

/** Live countdown (seconds) until `reconnectAt` epoch ms, or null when not scheduled. */
export function useReconnectCountdown(reconnectAt?: number): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    reconnectAt ? Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000)) : null,
  );

  useEffect(() => {
    if (!reconnectAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.ceil((reconnectAt - Date.now()) / 1000);
      setSecondsLeft(left > 0 ? left : null);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [reconnectAt]);

  return secondsLeft;
}

export function formatReconnectLabel(secondsLeft: number): string {
  return secondsLeft === 1 ? 'Reconnecting in 1s…' : `Reconnecting in ${secondsLeft}s…`;
}
