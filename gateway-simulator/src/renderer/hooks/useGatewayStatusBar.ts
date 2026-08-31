import { useEffect, useRef, useState } from 'react';
import type { GatewayEventEntry, GatewayInstanceState } from '@protocol/ipc-channels';
import {
  applyStatusBarEvent,
  applyUnprocessedStatusBarEvents,
  createInitialGatewayStatusBarState,
  resolveStatusBarDisplay,
  type GatewayStatusBarState,
} from '../utils/gateway-status-bar.utils';

function seedProcessedIds(events: GatewayEventEntry[]): Set<string> {
  return new Set(events.map((event) => event.id));
}

export function useGatewayStatusBar(gateway: GatewayInstanceState | null): {
  state: GatewayStatusBarState;
  display: ReturnType<typeof resolveStatusBarDisplay>;
} {
  const [state, setState] = useState(createInitialGatewayStatusBarState);
  const [, setTick] = useState(0);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const gatewayIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gateway) {
      gatewayIdRef.current = null;
      processedIdsRef.current = new Set();
      setState(createInitialGatewayStatusBarState());
      return;
    }

    if (gatewayIdRef.current !== gateway.id) {
      gatewayIdRef.current = gateway.id;
      processedIdsRef.current = seedProcessedIds(gateway.events);
      setState(createInitialGatewayStatusBarState());
    }
  }, [gateway?.id, gateway]);

  useEffect(() => {
    if (!gateway) return;

    setState((previous) => {
      const result = applyUnprocessedStatusBarEvents(previous, gateway.events, processedIdsRef.current);
      processedIdsRef.current = result.processedIds;
      return result.state;
    });
  }, [gateway?.events, gateway?.id, gateway]);

  useEffect(() => {
    const unsubLog = window.simulator.onGatewayLog(({ instanceId, entry }) => {
      if (instanceId !== gatewayIdRef.current) return;
      if (processedIdsRef.current.has(entry.id)) return;
      processedIdsRef.current.add(entry.id);
      setState((previous) => applyStatusBarEvent(previous, entry));
    });
    return unsubLog;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, []);

  return {
    state,
    display: resolveStatusBarDisplay(state, Date.now()),
  };
}
