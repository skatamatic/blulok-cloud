import type { AccessEventAction, AccessEventDenialReason } from '@protocol/access-events';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import type { DeviceSimulatorState } from '@protocol/device-simulator-state';
import type {
  TryOpenWithAccessCodeRequest,
  TryOpenWithAccessCodeResult,
} from '@protocol/user-simulator-state';
import { evaluateAccessCodeEntry } from './access-code-evaluation.utils';

export type TryAccessCodeContext = {
  deviceKey: string;
  inventoryItem: DeviceInventoryItem;
  deviceSim?: DeviceSimulatorState;
  enteredCode: string;
  applyUnlock: () => void | Promise<void>;
  emitAccessEvent: (input: {
    success: boolean;
    action: AccessEventAction;
    denial_reason?: AccessEventDenialReason;
    keypad?: { entered_code?: string; code_label?: string };
  }) => Promise<void>;
};

export async function tryOpenWithAccessCode(
  ctx: TryAccessCodeContext,
): Promise<TryOpenWithAccessCodeResult> {
  if (ctx.inventoryItem.kind !== 'access_control') {
    return {
      granted: false,
      message: 'Keypad access is only supported for access control devices',
      lockUpdated: false,
    };
  }

  const codes = ctx.deviceSim?.accessCodes ?? [];
  const evaluation = evaluateAccessCodeEntry(ctx.enteredCode, codes, ctx.deviceSim);
  const entered = ctx.enteredCode.trim();

  if (!evaluation.granted) {
    await ctx.emitAccessEvent({
      success: false,
      action: 'access_denied',
      denial_reason: evaluation.denial_reason,
      keypad: { entered_code: entered },
    });
    return {
      granted: false,
      message: evaluation.message,
      denial_reason: evaluation.denial_reason,
      lockUpdated: false,
    };
  }

  await Promise.resolve(ctx.applyUnlock());
  try {
    await ctx.emitAccessEvent({
      success: true,
      action: 'keypad_attempt',
      keypad: {
        entered_code: entered,
        code_label: evaluation.matchedCode.schedule_name ?? undefined,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      granted: true,
      message: `Unlocked locally; failed to report access event: ${detail}`,
      lockUpdated: true,
      schedule_name: evaluation.matchedCode.schedule_name ?? undefined,
    };
  }

  return {
    granted: true,
    message: evaluation.message,
    lockUpdated: true,
    schedule_name: evaluation.matchedCode.schedule_name ?? undefined,
  };
}

export type { TryOpenWithAccessCodeRequest };
