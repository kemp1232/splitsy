import { copy } from '@/constants/copy';

import {
  defaultAllocationMethodForType,
  type AdjustmentType,
  type AllocationMethod,
} from './defaultAllocationMethod';

// Quick-fill presets for a new manual adjustment (AdjustmentEditorSheet).
// A preset only pre-fills type, label and the preferred split — never an
// amount: the user always types the figure printed on the receipt, so no
// discount rate or VAT math is computed or stored here.
export type AdjustmentPresetId = 'SENIOR_PWD_DISCOUNT';

export type AdjustmentPreset = {
  id: AdjustmentPresetId;
  chipLabel: string;
  type: AdjustmentType;
  label: string;
  // Used only when the editor can offer it (CUSTOM needs participants);
  // otherwise the type's own default applies.
  preferredAllocationMethod: AllocationMethod;
};

// A senior/PWD discount only reduces that diner's own share, so splitting it
// across everyone (DISCOUNT's PROPORTIONAL default) would be wrong — CUSTOM
// lets the user put the whole amount on the senior/PWD diner.
export const SENIOR_PWD_DISCOUNT_PRESET: AdjustmentPreset = {
  id: 'SENIOR_PWD_DISCOUNT',
  chipLabel: copy.adjustmentEditor.presetSeniorPwd,
  type: 'DISCOUNT',
  label: copy.adjustmentEditor.presetSeniorPwd,
  preferredAllocationMethod: 'CUSTOM',
};

export const ADJUSTMENT_PRESETS: AdjustmentPreset[] = [SENIOR_PWD_DISCOUNT_PRESET];

export type AppliedAdjustmentPreset = {
  type: AdjustmentType;
  label: string;
  allocationMethod: AllocationMethod;
};

export function applyAdjustmentPreset(
  preset: AdjustmentPreset,
  { customAllocationAvailable }: { customAllocationAvailable: boolean },
): AppliedAdjustmentPreset {
  const allocationMethod =
    preset.preferredAllocationMethod === 'CUSTOM' && !customAllocationAvailable
      ? defaultAllocationMethodForType(preset.type)
      : preset.preferredAllocationMethod;
  return { type: preset.type, label: preset.label, allocationMethod };
}
