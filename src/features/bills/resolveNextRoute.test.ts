import { resolveNextRoute, type ResolveNextRouteInput } from './resolveNextRoute';

// A fully complete draft — every rule's "don't route here" condition. Tests
// override only the field(s) relevant to the branch under test.
const completeInput: ResolveNextRouteInput = {
  hasItems: true,
  participantCount: 2,
  hasUnassignedItems: false,
  hasUnresolvedDiscrepancy: false,
};

describe('resolveNextRoute', () => {
  it('routes to receipt-review when there are no items', () => {
    expect(resolveNextRoute({ ...completeInput, hasItems: false })).toEqual({
      screen: 'receipt-review',
    });
  });

  it('routes to participants when there are zero participants', () => {
    expect(resolveNextRoute({ ...completeInput, participantCount: 0 })).toEqual({
      screen: 'participants',
    });
  });

  it('routes to participants when there is exactly one participant', () => {
    expect(resolveNextRoute({ ...completeInput, participantCount: 1 })).toEqual({
      screen: 'participants',
    });
  });

  it('does not route to participants at exactly the minimum of two participants', () => {
    expect(resolveNextRoute({ ...completeInput, participantCount: 2 })).toEqual({
      screen: 'summary',
    });
  });

  it('routes to assignments when any item is unassigned', () => {
    expect(resolveNextRoute({ ...completeInput, hasUnassignedItems: true })).toEqual({
      screen: 'assignments',
    });
  });

  it('routes to adjustments when there is an unresolved discrepancy', () => {
    expect(resolveNextRoute({ ...completeInput, hasUnresolvedDiscrepancy: true })).toEqual({
      screen: 'adjustments',
    });
  });

  it('routes to summary when everything is complete', () => {
    expect(resolveNextRoute(completeInput)).toEqual({ screen: 'summary' });
  });

  it('resolves the first matching rule: missing items wins over every other broken condition', () => {
    expect(
      resolveNextRoute({
        hasItems: false,
        participantCount: 0,
        hasUnassignedItems: true,
        hasUnresolvedDiscrepancy: true,
      }),
    ).toEqual({ screen: 'receipt-review' });
  });

  it('resolves the first matching rule: too few participants wins over unassigned items and a discrepancy', () => {
    expect(
      resolveNextRoute({
        hasItems: true,
        participantCount: 1,
        hasUnassignedItems: true,
        hasUnresolvedDiscrepancy: true,
      }),
    ).toEqual({ screen: 'participants' });
  });

  it('resolves the first matching rule: unassigned items win over an unresolved discrepancy', () => {
    expect(
      resolveNextRoute({
        hasItems: true,
        participantCount: 2,
        hasUnassignedItems: true,
        hasUnresolvedDiscrepancy: true,
      }),
    ).toEqual({ screen: 'assignments' });
  });
});
