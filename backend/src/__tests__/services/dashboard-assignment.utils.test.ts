import { DashboardAssignmentModel } from '@/models/saved-dashboard.model';
import {
  ASSIGNMENT_SCOPE_ENTITY_ZERO,
  computeScopeEntityId,
  parseActiveFacilityContext,
} from '@/utils/dashboard-assignment.utils';

describe('computeScopeEntityId', () => {
  it('uses zero UUID for global scope', () => {
    expect(computeScopeEntityId('global', null, null)).toBe(
      ASSIGNMENT_SCOPE_ENTITY_ZERO
    );
  });

  it('uses facility id or zero UUID for facility scope', () => {
    expect(computeScopeEntityId('facility', 'f1', null)).toBe('f1');
    expect(computeScopeEntityId('facility', null, null)).toBe(
      ASSIGNMENT_SCOPE_ENTITY_ZERO
    );
  });

  it('uses user id for user scope', () => {
    expect(computeScopeEntityId('user', null, 'u1')).toBe('u1');
  });
});

describe('parseActiveFacilityContext', () => {  it('returns all mode for __ALL_FACILITIES__', () => {
    expect(parseActiveFacilityContext('__ALL_FACILITIES__', ['f1'])).toEqual({
      mode: 'all',
    });
  });

  it('returns specific mode for known facility', () => {
    expect(parseActiveFacilityContext('f1', ['f1', 'f2'])).toEqual({
      mode: 'specific',
      facilityId: 'f1',
    });
  });

  it('falls back to all when facility not in user list', () => {
    expect(parseActiveFacilityContext('f3', ['f1'])).toEqual({ mode: 'all' });
  });
});

describe('DashboardAssignmentModel.scopePriority', () => {
  it('orders user above facility above global', () => {
    expect(DashboardAssignmentModel.scopePriority('user')).toBeGreaterThan(
      DashboardAssignmentModel.scopePriority('facility')
    );
    expect(DashboardAssignmentModel.scopePriority('facility')).toBeGreaterThan(
      DashboardAssignmentModel.scopePriority('global')
    );
  });
});
