import { computeContributionUpdates } from './computeContributionUpdates';

describe('computeContributionUpdates', () => {
  it('returns nothing when no contribution changed', () => {
    const original = [
      { id: 'p1', contributedCentavos: 0 },
      { id: 'p2', contributedCentavos: 5000 },
    ];
    const current = new Map([
      ['p1', 0],
      ['p2', 5000],
    ]);

    expect(computeContributionUpdates(original, current)).toEqual([]);
  });

  it('returns only the participants whose amount changed', () => {
    const original = [
      { id: 'p1', contributedCentavos: 0 },
      { id: 'p2', contributedCentavos: 0 },
      { id: 'p3', contributedCentavos: 0 },
    ];
    const current = new Map([
      ['p1', 90000],
      ['p2', 0],
      ['p3', 0],
    ]);

    expect(computeContributionUpdates(original, current)).toEqual([
      { participantId: 'p1', contributedCentavos: 90000 },
    ]);
  });

  it('detects a change back to a previous value as a no-op only when it matches the original', () => {
    const original = [{ id: 'p1', contributedCentavos: 5000 }];
    const current = new Map([['p1', 5000]]);

    expect(computeContributionUpdates(original, current)).toEqual([]);
  });

  it('ignores a participant missing from the current form state entirely', () => {
    const original = [{ id: 'p1', contributedCentavos: 0 }];
    const current = new Map<string, number>();

    expect(computeContributionUpdates(original, current)).toEqual([]);
  });

  it('detects a change to zero from a nonzero original value', () => {
    const original = [{ id: 'p1', contributedCentavos: 90000 }];
    const current = new Map([['p1', 0]]);

    expect(computeContributionUpdates(original, current)).toEqual([
      { participantId: 'p1', contributedCentavos: 0 },
    ]);
  });
});
