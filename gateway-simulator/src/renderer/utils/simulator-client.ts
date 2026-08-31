import type { SimulateAccessEventRequest } from '@protocol/ipc-channels';

function requireSimulatorApi() {
  const api = window.simulator;
  if (!api) {
    throw new Error('Gateway Simulator API unavailable — open the Electron app, not the Vite URL in a browser.');
  }
  return api;
}

export function simulateAccessEvent(gatewayId: string, req: SimulateAccessEventRequest) {
  const api = requireSimulatorApi();
  const invoke = api.simulateAccessEvent;
  if (typeof invoke !== 'function') {
    throw new Error(
      'simulateAccessEvent is missing from the preload bridge — fully quit and restart the Gateway Simulator (Cmd/Ctrl+R is not enough after preload updates).',
    );
  }
  return invoke(gatewayId, req);
}
