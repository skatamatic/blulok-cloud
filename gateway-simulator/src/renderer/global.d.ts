import type { SimulatorApi } from '../../preload/index';

declare global {
  interface Window {
    simulator: SimulatorApi;
  }
}

export {};
