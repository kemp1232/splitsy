import { copy } from '@/constants/copy';

import { getBulkAssignLabel } from './getBulkAssignLabel';

describe('getBulkAssignLabel', () => {
  it('names the signed-in user when their participant is found', () => {
    expect(getBulkAssignLabel({ name: 'Kemp Sayson' }, 'Kemp Sayson')).toBe(
      'Assign rest to Kemp Sayson',
    );
  });

  it("shows a legacy 'Me' participant as the signed-in user's name", () => {
    expect(getBulkAssignLabel({ name: 'Me' }, 'Kemp Sayson')).toBe('Assign rest to Kemp Sayson');
  });

  it('keeps the generic label when no participant is the signed-in user', () => {
    expect(getBulkAssignLabel(undefined, 'Kemp Sayson')).toBe(copy.assignments.bulkAssignAction);
  });
});
