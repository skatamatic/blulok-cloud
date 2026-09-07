import type { GatewayProfile } from '../persistence/FileStateStore';
import type { UserProfile } from '@protocol/user-simulator-state';

export type SimulatorSnapshot = {
  profiles: GatewayProfile[];
  userProfiles: UserProfile[];
  activeInstanceId: string | null;
  activeUserId: string | null;
};

export type HistoryEntry = {
  label: string;
  before: SimulatorSnapshot;
  after: SimulatorSnapshot;
  coalesceKey?: string;
};
