import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  CreditCardIcon,
  FingerPrintIcon,
  CalendarIcon,
  ComputerDesktopIcon,
  CloudIcon,
} from '@heroicons/react/24/outline';
import { AccessLog } from '@/types/access-history.types';
import {
  isManualLockEvent,
  isCorrelatedRemoteUnlock,
  hasOccupiedUnlockOverride,
} from '@/utils/access-history-display.utils';

const actionIcons = {
  unlock: LockOpenIcon,
  lock: LockClosedIcon,
  access_granted: CheckCircleIcon,
  remote_access_granted: CheckCircleIcon,
  access_denied: XCircleIcon,
  door_open: LockOpenIcon,
  door_close: LockClosedIcon,
  gate_open: LockOpenIcon,
  gate_close: LockClosedIcon,
  elevator_call: ComputerDesktopIcon,
  elevator_access: ComputerDesktopIcon,
  manual_override: KeyIcon,
  system_error: ExclamationTriangleIcon,
  timeout: ClockIcon,
  invalid_credential: XCircleIcon,
  schedule_violation: ClockIcon,
  unlock_attempt: XCircleIcon,
  lock_attempt: XCircleIcon,
};

const methodIcons = {
  app: DevicePhoneMobileIcon,
  mobile_app: DevicePhoneMobileIcon,
  keypad: KeyIcon,
  card: CreditCardIcon,
  physical_key: KeyIcon,
  mobile_key: DevicePhoneMobileIcon,
  manual: KeyIcon,
  automatic: ComputerDesktopIcon,
  local_device: ComputerDesktopIcon,
  remote_gateway: CloudIcon,
  admin_remote: CloudIcon,
  route_pass: KeyIcon,
  system: ComputerDesktopIcon,
  unknown: KeyIcon,
  admin_override: KeyIcon,
  emergency: ExclamationTriangleIcon,
  scheduled: CalendarIcon,
  biometric: FingerPrintIcon,
  rfid: CreditCardIcon,
  pin: KeyIcon,
  remote: CloudIcon,
};

export function getAccessHistoryActionIcon(log: AccessLog) {
  if (isManualLockEvent(log)) return LockClosedIcon;
  if (isCorrelatedRemoteUnlock(log) || hasOccupiedUnlockOverride(log)) return LockOpenIcon;
  if (log.action === 'remote_access_granted') return CheckCircleIcon;
  return actionIcons[log.action as keyof typeof actionIcons] || KeyIcon;
}

export function getAccessHistoryMethodIcon(log: AccessLog) {
  if (isManualLockEvent(log)) return LockClosedIcon;
  if (isCorrelatedRemoteUnlock(log)) return LockOpenIcon;
  if (log.method === 'admin_remote' || log.method === 'remote_gateway') return CloudIcon;
  return methodIcons[log.method as keyof typeof methodIcons] || KeyIcon;
}
