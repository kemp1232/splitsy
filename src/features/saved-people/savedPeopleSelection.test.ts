import {
  diffGroupMembers,
  SAVED_PEOPLE_SUGGESTION_LIMIT,
  selectGroupMembersToAdd,
  selectSavedPeopleSuggestions,
} from './savedPeopleSelection';

function person(name: string, lastUsedAt: string) {
  return { id: `id-${name}`, name, lastUsedAt };
}

describe('selectSavedPeopleSuggestions', () => {
  it('excludes saved people already on the bill, case-insensitively and trimmed', () => {
    const saved = [
      person('Ana', '2026-11-03T00:00:00.000Z'),
      person('Ben', '2026-11-02T00:00:00.000Z'),
      person('Cy', '2026-11-01T00:00:00.000Z'),
    ];

    const result = selectSavedPeopleSuggestions(saved, ['  ana ', 'CY']);

    expect(result.map((p) => p.name)).toEqual(['Ben']);
  });

  it('orders by lastUsedAt, most recent first, with ties broken by name', () => {
    const saved = [
      person('Old', '2026-01-01T00:00:00.000Z'),
      person('Zed', '2026-11-13T00:00:00.000Z'),
      person('Amy', '2026-11-13T00:00:00.000Z'),
      person('Mid', '2026-06-01T00:00:00.000Z'),
    ];

    const result = selectSavedPeopleSuggestions(saved, []);

    expect(result.map((p) => p.name)).toEqual(['Amy', 'Zed', 'Mid', 'Old']);
  });

  it(`caps the result at ${SAVED_PEOPLE_SUGGESTION_LIMIT} by default, or at a given limit`, () => {
    const saved = Array.from({ length: 20 }, (_, index) =>
      person(
        `P${String(index).padStart(2, '0')}`,
        `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      ),
    );

    const capped = selectSavedPeopleSuggestions(saved, []);
    expect(capped).toHaveLength(SAVED_PEOPLE_SUGGESTION_LIMIT);
    expect(capped[0]?.name).toBe('P19');
    expect(selectSavedPeopleSuggestions(saved, [], 3)).toHaveLength(3);
  });

  it('returns nothing when nothing is saved or everyone is already on the bill', () => {
    expect(selectSavedPeopleSuggestions([], ['Ana'])).toEqual([]);
    expect(
      selectSavedPeopleSuggestions([person('Ana', '2026-11-01T00:00:00.000Z')], ['ANA']),
    ).toEqual([]);
  });
});

describe('selectGroupMembersToAdd', () => {
  it('returns only the members not already on the bill', () => {
    expect(selectGroupMembersToAdd(['Ana', 'Ben', 'Cy'], ['ben'])).toEqual(['Ana', 'Cy']);
  });

  it('drops case duplicates within the group itself', () => {
    expect(selectGroupMembersToAdd(['Ana', 'ANA', 'Ben'], [])).toEqual(['Ana', 'Ben']);
  });

  it('skips names that fail participant name validation (blank or too long)', () => {
    expect(selectGroupMembersToAdd(['  ', 'x'.repeat(31), ' Ana '], [])).toEqual(['Ana']);
  });

  it('returns nothing for an empty group or when every member is already present', () => {
    expect(selectGroupMembersToAdd([], ['Ana'])).toEqual([]);
    expect(selectGroupMembersToAdd(['Ana', 'Ben'], ['ana', 'BEN'])).toEqual([]);
  });
});

describe('diffGroupMembers', () => {
  it('lists the ids to add and the ids to remove', () => {
    expect(diffGroupMembers(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('returns no changes when the members are the same', () => {
    expect(diffGroupMembers(['a', 'b'], ['b', 'a'])).toEqual({ added: [], removed: [] });
  });
});
