import { buildSettlementParticipants } from './buildSettlementParticipants';

describe('buildSettlementParticipants', () => {
  it('pairs each share with its fair share and contributed amount', () => {
    const shares = [
      { participantId: 'p1', finalTotalCentavos: 30000 },
      { participantId: 'p2', finalTotalCentavos: 30000 },
    ];
    const contributionByParticipantId = new Map([
      ['p1', { contributedCentavos: 90000 }],
      ['p2', { contributedCentavos: 0 }],
    ]);

    expect(buildSettlementParticipants(shares, contributionByParticipantId)).toEqual([
      { participantId: 'p1', fairShareCentavos: 30000, contributedCentavos: 90000 },
      { participantId: 'p2', fairShareCentavos: 30000, contributedCentavos: 0 },
    ]);
  });

  it('preserves the input order of shares rather than sorting', () => {
    const shares = [
      { participantId: 'z', finalTotalCentavos: 100 },
      { participantId: 'a', finalTotalCentavos: 200 },
    ];
    const contributionByParticipantId = new Map([
      ['z', { contributedCentavos: 0 }],
      ['a', { contributedCentavos: 0 }],
    ]);

    const result = buildSettlementParticipants(shares, contributionByParticipantId);

    expect(result.map((r) => r.participantId)).toEqual(['z', 'a']);
  });

  it('throws when a share has no matching contribution info', () => {
    const shares = [{ participantId: 'missing', finalTotalCentavos: 100 }];
    const contributionByParticipantId = new Map<string, { contributedCentavos: number }>();

    expect(() => buildSettlementParticipants(shares, contributionByParticipantId)).toThrow(
      /missing/,
    );
  });
});
