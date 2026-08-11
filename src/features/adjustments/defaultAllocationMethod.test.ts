import { defaultAllocationMethodForType } from './defaultAllocationMethod';

describe('defaultAllocationMethodForType', () => {
  it('defaults tax to proportional', () => {
    expect(defaultAllocationMethodForType('TAX')).toBe('PROPORTIONAL');
  });

  it('defaults service charge to proportional', () => {
    expect(defaultAllocationMethodForType('SERVICE_CHARGE')).toBe('PROPORTIONAL');
  });

  it('defaults tip to equal', () => {
    expect(defaultAllocationMethodForType('TIP')).toBe('EQUAL');
  });

  it('defaults discount to proportional', () => {
    expect(defaultAllocationMethodForType('DISCOUNT')).toBe('PROPORTIONAL');
  });

  it('defaults other to proportional', () => {
    expect(defaultAllocationMethodForType('OTHER')).toBe('PROPORTIONAL');
  });
});
