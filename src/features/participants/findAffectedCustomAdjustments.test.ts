import { findAffectedCustomAdjustments } from './findAffectedCustomAdjustments';

const adjustments = [
  { id: 'tip', label: 'Tip', allocationMethod: 'CUSTOM' },
  { id: 'tax', label: 'VAT', allocationMethod: 'PROPORTIONAL' },
  { id: 'fee', label: 'Corkage', allocationMethod: 'CUSTOM' },
  { id: 'svc', label: 'Service charge', allocationMethod: 'EQUAL' },
];

describe('findAffectedCustomAdjustments', () => {
  it('lists every custom adjustment the person has an amount in, in adjustment order', () => {
    const allocations = [
      { adjustmentId: 'fee', participantId: 'p1' },
      { adjustmentId: 'tip', participantId: 'p1' },
      { adjustmentId: 'tip', participantId: 'p2' },
    ];

    expect(findAffectedCustomAdjustments(adjustments, allocations, 'p1')).toEqual([
      'Tip',
      'Corkage',
    ]);
  });

  it('skips a custom adjustment the person has no amount in', () => {
    const allocations = [
      { adjustmentId: 'tip', participantId: 'p2' },
      { adjustmentId: 'fee', participantId: 'p1' },
    ];

    expect(findAffectedCustomAdjustments(adjustments, allocations, 'p1')).toEqual(['Corkage']);
  });

  it('ignores proportional and equal adjustments even if a stray allocation row exists', () => {
    const allocations = [
      { adjustmentId: 'tax', participantId: 'p1' },
      { adjustmentId: 'svc', participantId: 'p1' },
    ];

    expect(findAffectedCustomAdjustments(adjustments, allocations, 'p1')).toEqual([]);
  });

  it('returns an empty list when the bill has no adjustments', () => {
    expect(findAffectedCustomAdjustments([], [], 'p1')).toEqual([]);
  });
});
