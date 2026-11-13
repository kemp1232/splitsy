import {
  ADJUSTMENT_PRESETS,
  SENIOR_PWD_DISCOUNT_PRESET,
  applyAdjustmentPreset,
} from './adjustmentPresets';
import { adjustmentAmountSign } from './adjustmentSign';

describe('applyAdjustmentPreset', () => {
  it('senior/PWD preset fills DISCOUNT and its label', () => {
    const applied = applyAdjustmentPreset(SENIOR_PWD_DISCOUNT_PRESET, {
      customAllocationAvailable: true,
    });
    expect(applied.type).toBe('DISCOUNT');
    expect(applied.label).toBe('Senior/PWD discount');
    expect(ADJUSTMENT_PRESETS).toContain(SENIOR_PWD_DISCOUNT_PRESET);
  });

  it('uses CUSTOM when custom allocation is available', () => {
    expect(
      applyAdjustmentPreset(SENIOR_PWD_DISCOUNT_PRESET, { customAllocationAvailable: true })
        .allocationMethod,
    ).toBe('CUSTOM');
  });

  it('falls back to the DISCOUNT default when custom is unavailable', () => {
    expect(
      applyAdjustmentPreset(SENIOR_PWD_DISCOUNT_PRESET, { customAllocationAvailable: false })
        .allocationMethod,
    ).toBe('PROPORTIONAL');
  });

  it('never pre-fills an amount', () => {
    const applied = applyAdjustmentPreset(SENIOR_PWD_DISCOUNT_PRESET, {
      customAllocationAvailable: true,
    });
    expect(Object.keys(applied).sort()).toEqual(['allocationMethod', 'label', 'type']);
    expect(Object.keys(SENIOR_PWD_DISCOUNT_PRESET)).not.toContain('amountCentavos');
  });

  it('applied preset with a typed amount signs negative', () => {
    const applied = applyAdjustmentPreset(SENIOR_PWD_DISCOUNT_PRESET, {
      customAllocationAvailable: true,
    });
    expect(adjustmentAmountSign(applied.type, null) * 2000).toBe(-2000);
  });
});
