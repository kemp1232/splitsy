import { buildDateRolledOverWarning } from './buildDateRolledOverWarning';

describe('buildDateRolledOverWarning', () => {
  it('explains the rolled-over date while the field still holds it', () => {
    expect(buildDateRolledOverWarning('2026-02-31', '2026-03-03')).toBe(
      "We read the date as 2026-02-31, which doesn't exist, so we changed it to 2026-03-03. Check the date.",
    );
  });

  it('goes away once the user changes the date', () => {
    expect(buildDateRolledOverWarning('2026-02-31', '2026-02-28')).toBeNull();
  });

  it('says nothing without a rolled-over read date', () => {
    expect(buildDateRolledOverWarning(undefined, '2026-03-03')).toBeNull();
    expect(buildDateRolledOverWarning('2026-03-03', '2026-03-03')).toBeNull();
  });
});
