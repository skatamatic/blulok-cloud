import { useEffect, useState, useCallback } from 'react';
import type { GatewayInstanceState, HydrateResponse } from '@protocol/ipc-channels';
import type { UserInstanceState } from '@protocol/user-simulator-state';

export function useCatalogState() {
  const [instances, setInstances] = useState<GatewayInstanceState[]>([]);
  const [users, setUsers] = useState<UserInstanceState[]>([]);
  const [activeGatewayId, setActiveGatewayIdState] = useState<string | null>(null);
  const [activeUserId, setActiveUserIdState] = useState<string | null>(null);
  const [sidebarCatalog, setSidebarCatalogState] = useState<'gateways' | 'users'>('gateways');
  const [hydrated, setHydrated] = useState(false);

  const applyHydrate = useCallback((result: HydrateResponse) => {
    setInstances(result.instances);
    setUsers(result.users);
    setSidebarCatalogState(result.sidebarCatalog);
    if (result.activeInstanceId && result.instances.some((g) => g.id === result.activeInstanceId)) {
      setActiveGatewayIdState(result.activeInstanceId);
    } else if (result.instances.length) {
      setActiveGatewayIdState(result.instances[0]?.id ?? null);
    } else {
      setActiveGatewayIdState(null);
    }
    if (result.activeUserId && result.users.some((u) => u.id === result.activeUserId)) {
      setActiveUserIdState(result.activeUserId);
    } else if (result.users.length) {
      setActiveUserIdState(result.users[0]?.id ?? null);
    } else {
      setActiveUserIdState(null);
    }
  }, []);

  const setActiveGatewayId = (id: string | null) => {
    setActiveGatewayIdState(id);
    setSidebarCatalogState('gateways');
    void window.simulator.setActiveInstance(id);
    void window.simulator.setSidebarCatalog('gateways');
  };

  const setActiveUserId = (id: string | null) => {
    setActiveUserIdState(id);
    setSidebarCatalogState('users');
    void window.simulator.setActiveUser(id);
    void window.simulator.setSidebarCatalog('users');
  };

  const setSidebarCatalog = (catalog: 'gateways' | 'users') => {
    setSidebarCatalogState(catalog);
    void window.simulator.setSidebarCatalog(catalog);
  };

  useEffect(() => {
    void window.simulator.hydrate().then((result) => {
      applyHydrate(result);
      setHydrated(true);
    });

    const unsubGateway = window.simulator.onGatewayUpdated(({ state }) => {
      setInstances((prev) => {
        const idx = prev.findIndex((g) => g.id === state.id);
        if (idx < 0) return [...prev, state];
        const next = [...prev];
        next[idx] = state;
        return next;
      });
    });

    const unsubUser = window.simulator.onUserUpdated(({ state }) => {
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === state.id);
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
      unsubGateway();
      unsubUser();
      unsubLog();
    };
  }, [applyHydrate]);

  const activeGateway = instances.find((g) => g.id === activeGatewayId) ?? null;
  const activeUser = users.find((u) => u.id === activeUserId) ?? null;

  return {
    instances,
    users,
    activeGatewayId,
    activeUserId,
    activeGateway,
    activeUser,
    sidebarCatalog,
    setInstances,
    setUsers,
    setActiveGatewayId,
    setActiveUserId,
    setSidebarCatalog,
    applyHydrate,
    hydrated,
  };
}
