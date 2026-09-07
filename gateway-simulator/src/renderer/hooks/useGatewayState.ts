import { useEffect, useState } from 'react';
import type { GatewayInstanceState } from '@protocol/ipc-channels';

export function useGatewayState() {
  const [instances, setInstances] = useState<GatewayInstanceState[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const setActiveId = (id: string | null) => {
    setActiveIdState(id);
    void window.simulator.setActiveInstance(id);
  };

  useEffect(() => {
    void window.simulator.hydrate().then(({ instances: list, activeInstanceId }) => {
      setInstances(list);
      if (activeInstanceId && list.some((g) => g.id === activeInstanceId)) {
        setActiveIdState(activeInstanceId);
      } else if (list.length) {
        setActiveIdState(list[0].id);
      }
      setHydrated(true);
    });

    const unsubUpdate = window.simulator.onGatewayUpdated(({ state }) => {
      setInstances((prev) => {
        const idx = prev.findIndex((g) => g.id === state.id);
        if (idx < 0) return [...prev, state];
        const next = [...prev];
        next[idx] = state;
        return next;
      });
    });

    const unsubLog = window.simulator.onGatewayLog(({ instanceId, entry }) => {
      setInstances((prev) =>
        prev.map((g) => {
          if (g.id !== instanceId) return g;
          if (g.events.some((existing) => existing.id === entry.id)) return g;
          return { ...g, events: [...g.events, entry].slice(-200) };
        }),
      );
    });

    return () => {
      unsubUpdate();
      unsubLog();
    };
  }, []);

  const active = instances.find((g) => g.id === activeId) ?? null;

  return { instances, activeId, active, setActiveId, setInstances, hydrated };
}
