import { GatewayService } from './gateway/gateway.service';
import { logger } from '@/utils/logger';

export interface KeyDistributionPort {
  addKeyToLock(lockId: string, publicKey: string, userId: string): Promise<void>;
  removeKeyFromLock(lockId: string, publicKey: string, userId: string): Promise<void>;
}

export class GatewayKeyDistributionAdapter implements KeyDistributionPort {
  // TODO: Inject GatewayService when implementing actual gateway commands
  constructor(_gatewayService?: GatewayService) {
    // gatewayService will be used here when gateway command protocol is implemented
  }

  async addKeyToLock(lockId: string, publicKey: string, userId: string): Promise<void> {
    try {
      // TODO: Implement actual gateway command to add key to lock
      // This will require:
      // 1. Finding which gateway the lock belongs to
      // 2. Sending an add-key command with the public key
      // 3. The gateway should queue the command for the lock

      logger.info(`Key distribution: Adding key for user ${userId} to lock ${lockId}`, {
        lockId,
        userId,
        publicKeyLength: publicKey.length
      });

      // Placeholder - will be implemented when gateway command protocol is ready
      // await this.gatewayService.sendCommandToLock(lockId, {
      //   type: 'add_key',
      //   userId,
      //   publicKey
      // });

    } catch (error) {
      logger.error(`Failed to add key for user ${userId} to lock ${lockId}:`, error);
      throw error;
    }
  }

  async removeKeyFromLock(lockId: string, publicKey: string, userId: string): Promise<void> {
    try {
      // TODO: Implement actual gateway command to remove key from lock
      logger.info(`Key distribution: Removing key for user ${userId} from lock ${lockId}`, {
        lockId,
        userId,
        publicKeyLength: publicKey.length
      });

      // Placeholder - will be implemented when gateway command protocol is ready
      // await this.gatewayService.sendCommandToLock(lockId, {
      //   type: 'remove_key',
      //   userId,
      //   publicKey
      // });

    } catch (error) {
      logger.error(`Failed to remove key for user ${userId} from lock ${lockId}:`, error);
      throw error;
    }
  }
}

export class NoopKeyDistributionAdapter implements KeyDistributionPort {
  async addKeyToLock(_lockId: string, _publicKey: string, _userId: string): Promise<void> {
    // No-op for testing or when gateway integration is disabled
  }

  async removeKeyFromLock(_lockId: string, _publicKey: string, _userId: string): Promise<void> {
    // No-op for testing or when gateway integration is disabled
  }
}


