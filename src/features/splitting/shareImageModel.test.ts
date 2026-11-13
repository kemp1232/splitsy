import { buildShareImageModel } from './shareImageModel';
import type { ShareTextInput } from './shareText';
import { calculateSplit } from './splitCalculator';

describe('buildShareImageModel', () => {
  const splitResult = calculateSplit({
    participants: [{ participantId: 'me' }, { participantId: 'b' }],
    items: [{ lineItemId: 'meal', lineTotalCentavos: 2000, assigneeParticipantIds: ['me', 'b'] }],
    adjustments: [],
  });

  function build(overrides: Partial<ShareTextInput> = {}) {
    return buildShareImageModel({
      billTitle: 'Coffee Run',
      participants: [
        { participantId: 'me', name: 'Kemp' },
        { participantId: 'b', name: 'Bea' },
      ],
      items: [{ lineItemId: 'meal', name: 'Meal' }],
      adjustments: [],
      splitResult,
      ...overrides,
    });
  }

  const savedNumbers = {
    meParticipantId: 'me',
    gcashNumber: '09171234567',
    mayaNumber: '09187654321',
  };

  it('maps the title, total and each person with their formatted total', () => {
    const model = build();

    expect(model.title).toBe('Coffee Run');
    expect(model.totalText).toBe('₱20.00');
    expect(model.people).toEqual([
      { participantId: 'me', name: 'Kemp', totalText: '₱10.00', paidText: null },
      { participantId: 'b', name: 'Bea', totalText: '₱10.00', paidText: null },
    ]);
    expect(model.footer).toBe('Calculated with Splitsy.');
  });

  it('keeps a person whose total is zero, with their ₱0.00 total', () => {
    const zeroSplit = calculateSplit({
      participants: [{ participantId: 'me' }, { participantId: 'b' }],
      items: [{ lineItemId: 'meal', lineTotalCentavos: 2000, assigneeParticipantIds: ['me'] }],
      adjustments: [],
    });

    const model = build({ splitResult: zeroSplit });

    expect(model.people.map((person) => person.totalText)).toEqual(['₱20.00', '₱0.00']);
  });

  it('adds a "Paid" line per person when paidCentavos is provided', () => {
    const model = build({
      participants: [
        { participantId: 'me', name: 'Kemp', paidCentavos: 2000 },
        { participantId: 'b', name: 'Bea', paidCentavos: 0 },
      ],
    });

    expect(model.people.map((person) => person.paidText)).toEqual(['Paid: ₱20.00', 'Paid: ₱0.00']);
  });

  it('lists settle-up lines when settlementTransactions is non-empty', () => {
    const model = build({
      settlementTransactions: [
        { fromParticipantId: 'b', toParticipantId: 'me', amountCentavos: 1000 },
      ],
    });

    expect(model.settleLines).toEqual([
      expect.objectContaining({ label: 'Bea owes Kemp', amountText: '₱10.00' }),
    ]);
  });

  it('inserts a name containing "$&" literally in a settle-up line', () => {
    const model = build({
      participants: [
        { participantId: 'me', name: 'Kemp' },
        { participantId: 'b', name: 'B$&a' },
      ],
      settlementTransactions: [
        { fromParticipantId: 'b', toParticipantId: 'me', amountCentavos: 1000 },
      ],
    });

    expect(model.settleLines.map((line) => line.label)).toEqual(['B$&a owes Kemp']);
  });

  it('has no settle-up lines when settlementTransactions is undefined or empty', () => {
    expect(build().settleLines).toEqual([]);
    expect(build({ settlementTransactions: [] }).settleLines).toEqual([]);
  });

  it('adds the payment block when Me is a creditor with saved numbers', () => {
    const model = build({
      settlementTransactions: [
        { fromParticipantId: 'b', toParticipantId: 'me', amountCentavos: 1000 },
      ],
      paymentDetails: savedNumbers,
    });

    expect(model.payment).toEqual({
      heading: 'Pay Kemp via:',
      lines: ['GCash: 0917 123 4567', 'Maya: 0918 765 4321'],
    });
  });

  it('lists only the saved number when just one is saved', () => {
    const model = build({
      settlementTransactions: [
        { fromParticipantId: 'b', toParticipantId: 'me', amountCentavos: 1000 },
      ],
      paymentDetails: { meParticipantId: 'me', gcashNumber: null, mayaNumber: '09187654321' },
    });

    expect(model.payment).toEqual({ heading: 'Pay Kemp via:', lines: ['Maya: 0918 765 4321'] });
  });

  it('omits the payment block when no numbers are saved', () => {
    const model = build({
      settlementTransactions: [
        { fromParticipantId: 'b', toParticipantId: 'me', amountCentavos: 1000 },
      ],
      paymentDetails: { meParticipantId: 'me', gcashNumber: null, mayaNumber: null },
    });

    expect(model.payment).toBeNull();
  });

  it('omits the payment block when Me only owes money', () => {
    const model = build({
      settlementTransactions: [
        { fromParticipantId: 'me', toParticipantId: 'b', amountCentavos: 1000 },
      ],
      paymentDetails: savedNumbers,
    });

    expect(model.payment).toBeNull();
  });

  it('omits the payment block when there are no settle-up lines', () => {
    for (const settlementTransactions of [undefined, []]) {
      expect(build({ settlementTransactions, paymentDetails: savedNumbers }).payment).toBeNull();
    }
  });

  it('throws when a participant display name is missing', () => {
    expect(() => build({ participants: [{ participantId: 'me', name: 'Kemp' }] })).toThrow(
      'no display name provided',
    );
  });
});
