import { calculateSplit } from '@/features/splitting/splitCalculator';

import { buildTripParticipantAdjustmentShareDisplay } from './buildTripParticipantAdjustmentShareDisplay';
import { buildTripParticipantItemShareDisplay } from './buildTripParticipantItemShareDisplay';

describe('buildTripParticipantAdjustmentShareDisplay', () => {
  it("attaches each adjustment's label, keeping discounts negative", () => {
    const labels = new Map([
      ['svc', 'Service charge'],
      ['disc', 'Senior discount'],
    ]);

    expect(
      buildTripParticipantAdjustmentShareDisplay(
        [
          { adjustmentId: 'svc', amountCentavos: 1500 },
          { adjustmentId: 'disc', amountCentavos: -2000 },
        ],
        labels,
      ),
    ).toEqual([
      { adjustmentId: 'svc', label: 'Service charge', amountCentavos: 1500 },
      { adjustmentId: 'disc', label: 'Senior discount', amountCentavos: -2000 },
    ]);
  });

  it('omits shares that are exactly zero centavos', () => {
    expect(
      buildTripParticipantAdjustmentShareDisplay(
        [{ adjustmentId: 'tip', amountCentavos: 0 }],
        new Map([['tip', 'Tip']]),
      ),
    ).toEqual([]);
  });

  it('throws when no label was provided for a share', () => {
    expect(() =>
      buildTripParticipantAdjustmentShareDisplay(
        [{ adjustmentId: 'missing', amountCentavos: 100 }],
        new Map(),
      ),
    ).toThrow(/no label provided for adjustment missing/);
  });

  it("items plus fee/discount lines add up to each person's bill total", () => {
    const split = calculateSplit({
      participants: [{ participantId: 'alex' }, { participantId: 'bea' }],
      items: [
        { lineItemId: 'ramen', lineTotalCentavos: 45000, assigneeParticipantIds: ['alex'] },
        { lineItemId: 'gyoza', lineTotalCentavos: 25001, assigneeParticipantIds: ['alex', 'bea'] },
      ],
      adjustments: [
        { adjustmentId: 'svc', amountCentavos: 7000, allocationMethod: 'PROPORTIONAL' },
        { adjustmentId: 'tip', amountCentavos: 1001, allocationMethod: 'EQUAL' },
        { adjustmentId: 'disc', amountCentavos: -3333, allocationMethod: 'PROPORTIONAL' },
      ],
    });
    const itemInfo = new Map([
      ['ramen', { name: 'Ramen', assigneeParticipantIds: ['alex'] }],
      ['gyoza', { name: 'Gyoza', assigneeParticipantIds: ['alex', 'bea'] }],
    ]);
    const names = new Map([
      ['alex', 'Alex'],
      ['bea', 'Bea'],
    ]);
    const labels = new Map([
      ['svc', 'Service charge'],
      ['tip', 'Tip'],
      ['disc', 'Discount'],
    ]);

    for (const share of split.participantShares) {
      const items = buildTripParticipantItemShareDisplay(
        share.participantId,
        share.itemShares,
        itemInfo,
        names,
      );
      const adjustments = buildTripParticipantAdjustmentShareDisplay(
        share.adjustmentShares,
        labels,
      );
      const lineSum = [...items, ...adjustments].reduce(
        (sum, line) => sum + line.amountCentavos,
        0,
      );
      expect(lineSum).toBe(share.finalTotalCentavos);
    }
  });
});
