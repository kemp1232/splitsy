import { buildTripShareText, type TripShareTextInput } from './buildTripShareText';

describe('buildTripShareText', () => {
  it('renders trip total, per-person items grouped by bill, paid, and a settlement section', () => {
    const input: TripShareTextInput = {
      tripTitle: 'Baguio weekend',
      tripTotalCentavos: 300000,
      people: [
        {
          name: 'Kemp',
          fairShareCentavos: 200000,
          contributedCentavos: 200000,
          billItems: [
            {
              billLabel: 'Balinsasayaw Restaurant',
              items: [
                {
                  lineItemId: 'bulalo',
                  name: 'Half Bulalo',
                  amountCentavos: 53000,
                  sharedWithNames: [],
                },
                {
                  lineItemId: 'rice',
                  name: 'Plain Rice',
                  amountCentavos: 2750,
                  sharedWithNames: ['Alex'],
                },
              ],
            },
            {
              billLabel: 'Starbucks',
              items: [
                { lineItemId: 'latte', name: 'Latte', amountCentavos: 19500, sharedWithNames: [] },
              ],
            },
          ],
        },
        {
          name: 'Alex',
          fairShareCentavos: 100000,
          contributedCentavos: 0,
          billItems: [
            {
              billLabel: 'Balinsasayaw Restaurant',
              items: [
                {
                  lineItemId: 'rice',
                  name: 'Plain Rice',
                  amountCentavos: 2750,
                  sharedWithNames: ['Kemp'],
                },
              ],
            },
          ],
        },
      ],
      settlement: {
        transactions: [
          { fromParticipantId: 'alex', toParticipantId: 'kemp', amountCentavos: 100000 },
        ],
        unaccountedCentavos: 0,
      },
      nameByIdentityId: new Map([
        ['kemp', 'Kemp'],
        ['alex', 'Alex'],
      ]),
    };

    const expected = [
      'Splitsy — Baguio weekend',
      'Trip total: ₱3,000.00',
      '',
      'Kemp — ₱2,000.00',
      'Balinsasayaw Restaurant',
      '• Half Bulalo — ₱530.00',
      '• Plain Rice (split with Alex) — ₱27.50',
      'Starbucks',
      '• Latte — ₱195.00',
      'Paid: ₱2,000.00',
      '',
      'Alex — ₱1,000.00',
      'Balinsasayaw Restaurant',
      '• Plain Rice (split with Kemp) — ₱27.50',
      'Paid: ₱0.00',
      '',
      'Settle up',
      'Alex owes Kemp — ₱1,000.00',
      '',
      'Calculated with Splitsy.',
    ].join('\n');

    expect(buildTripShareText(input)).toBe(expected);
  });

  it('shows "Everyone\'s settled up." when there are no settlement transactions', () => {
    const input: TripShareTextInput = {
      tripTitle: 'Solo Trip',
      tripTotalCentavos: 10000,
      people: [
        {
          name: 'Kemp',
          fairShareCentavos: 10000,
          contributedCentavos: 10000,
          billItems: [
            {
              billLabel: 'Cafe',
              items: [
                {
                  lineItemId: 'coffee',
                  name: 'Coffee',
                  amountCentavos: 10000,
                  sharedWithNames: [],
                },
              ],
            },
          ],
        },
      ],
      settlement: { transactions: [], unaccountedCentavos: 0 },
      nameByIdentityId: new Map([['kemp', 'Kemp']]),
    };

    expect(buildTripShareText(input)).toBe(
      [
        'Splitsy — Solo Trip',
        'Trip total: ₱100.00',
        '',
        'Kemp — ₱100.00',
        'Cafe',
        '• Coffee — ₱100.00',
        'Paid: ₱100.00',
        '',
        'Settle up',
        "Everyone's settled up.",
        '',
        'Calculated with Splitsy.',
      ].join('\n'),
    );
  });

  it('omits a bill entirely from a person block when they have no nonzero items in it', () => {
    const input: TripShareTextInput = {
      tripTitle: 'Trip',
      tripTotalCentavos: 5000,
      people: [
        {
          name: 'Kemp',
          fairShareCentavos: 5000,
          contributedCentavos: 0,
          billItems: [
            { billLabel: 'Bill A', items: [] },
            {
              billLabel: 'Bill B',
              items: [{ lineItemId: 'x', name: 'Item', amountCentavos: 5000, sharedWithNames: [] }],
            },
          ],
        },
      ],
      settlement: { transactions: [], unaccountedCentavos: 0 },
      nameByIdentityId: new Map([['kemp', 'Kemp']]),
    };

    const text = buildTripShareText(input);
    expect(text).not.toContain('Bill A');
    expect(text).toContain('Bill B\n• Item — ₱50.00');
  });

  it('appends the unaccounted-for note when the settlement has money still uncollected', () => {
    const input: TripShareTextInput = {
      tripTitle: 'Trip',
      tripTotalCentavos: 10000,
      people: [
        { name: 'Kemp', fairShareCentavos: 10000, contributedCentavos: 4000, billItems: [] },
      ],
      settlement: { transactions: [], unaccountedCentavos: 6000 },
      nameByIdentityId: new Map([['kemp', 'Kemp']]),
    };

    expect(buildTripShareText(input)).toContain(
      "₱60.00 of the bill hasn't been marked as paid yet.",
    );
  });

  it('appends the over-collected note when more was contributed than the trip required', () => {
    const input: TripShareTextInput = {
      tripTitle: 'Trip',
      tripTotalCentavos: 10000,
      people: [
        { name: 'Kemp', fairShareCentavos: 10000, contributedCentavos: 15000, billItems: [] },
      ],
      settlement: { transactions: [], unaccountedCentavos: -5000 },
      nameByIdentityId: new Map([['kemp', 'Kemp']]),
    };

    expect(buildTripShareText(input)).toContain(
      "₱50.00 more was marked as paid than the bill's total.",
    );
  });
});
