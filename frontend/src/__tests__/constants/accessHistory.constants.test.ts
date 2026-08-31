import {
  DENIAL_REASON_LABELS,
  buildAccessHistoryActionFilterOptions,
  buildAccessHistoryMethodFilterOptions,
  accessHistoryMethodMatchesFilter,
} from '@/constants/accessHistory.constants';
import { DENIAL_REASON_MESSAGES as BE_DENIAL_REASON_MESSAGES } from '../../../../backend/src/constants/access-history.constants';

describe('accessHistory.constants', () => {
  it('keeps FE denial reason labels in sync with backend', () => {
    expect(DENIAL_REASON_LABELS).toEqual(BE_DENIAL_REASON_MESSAGES);
  });

  describe('buildAccessHistoryActionFilterOptions', () => {
    it('includes All Actions and remote_access_granted', () => {
      const options = buildAccessHistoryActionFilterOptions();
      expect(options[0]).toEqual({ key: '', label: 'All Actions' });
      expect(options.some((o) => o.key === 'remote_access_granted')).toBe(true);
    });
  });

  describe('buildAccessHistoryMethodFilterOptions', () => {
    it('includes Cloud filter and legacy automatic label', () => {
      const options = buildAccessHistoryMethodFilterOptions();
      expect(options[0]).toEqual({ key: '', label: 'All Methods' });
      expect(options.find((o) => o.key === 'cloud')?.label).toBe('Cloud');
      expect(options.find((o) => o.key === 'automatic')?.label).toBe('Local Device (legacy)');
    });
  });

  describe('accessHistoryMethodMatchesFilter', () => {
    it('matches cloud to admin_remote and remote_gateway', () => {
      expect(accessHistoryMethodMatchesFilter('admin_remote', 'cloud')).toBe(true);
      expect(accessHistoryMethodMatchesFilter('remote_gateway', 'cloud')).toBe(true);
      expect(accessHistoryMethodMatchesFilter('app', 'cloud')).toBe(false);
    });

    it('normalizes automatic to local_device', () => {
      expect(accessHistoryMethodMatchesFilter('automatic', 'local_device')).toBe(true);
      expect(accessHistoryMethodMatchesFilter('local_device', 'automatic')).toBe(true);
      expect(accessHistoryMethodMatchesFilter('automatic', 'automatic')).toBe(true);
    });
  });
});
