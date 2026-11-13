import { act, renderHook } from '@testing-library/react-native';

import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';

import { applyAdjustmentPreset, SENIOR_PWD_DISCOUNT_PRESET } from './adjustmentPresets';
import { useAdjustmentEditor } from './useAdjustmentEditor';

// No SQLite under Jest: both repositories are faked so the test records what
// the save path writes.
jest.mock('@/db/repositories/adjustments.repository', () => ({
  adjustmentsRepository: { create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));
jest.mock('@/db/repositories/adjustmentAllocations.repository', () => ({
  adjustmentAllocationsRepository: { setForAdjustment: jest.fn(), listByAdjustmentId: jest.fn() },
}));
jest.mock('@/lib/ids', () => ({ createId: jest.fn(() => 'adj-1') }));

const mockCreate = adjustmentsRepository.create as jest.Mock;
const mockSetForAdjustment = adjustmentAllocationsRepository.setForAdjustment as jest.Mock;

describe('useAdjustmentEditor', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockImplementation((row: { id: string }) => Promise.resolve(row));
    mockSetForAdjustment.mockReset().mockResolvedValue(undefined);
  });

  it('saves a preset discount as a MANUAL adjustment', async () => {
    const refresh = jest.fn(() => Promise.resolve());
    const setActionError = jest.fn();
    const { result } = await renderHook(() =>
      useAdjustmentEditor({ billId: 'bill-1', adjustmentCount: 2, refresh, setActionError }),
    );
    const applied = applyAdjustmentPreset(SENIOR_PWD_DISCOUNT_PRESET, {
      customAllocationAvailable: true,
    });
    const customAllocations = [
      { participantId: 'p1', amountCentavos: -2000 },
      { participantId: 'p2', amountCentavos: 0 },
    ];

    await act(async () => {
      result.current.openNewEditor();
    });
    await act(async () => {
      await result.current.saveAdjustment({
        ...applied,
        amountCentavos: -2000,
        customAllocations,
      });
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'adj-1',
        billId: 'bill-1',
        sortOrder: 2,
        type: 'DISCOUNT',
        label: 'Senior/PWD discount',
        amountCentavos: -2000,
        allocationMethod: 'CUSTOM',
        source: 'MANUAL',
      }),
    );
    expect(mockSetForAdjustment).toHaveBeenCalledWith('adj-1', customAllocations);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setActionError).not.toHaveBeenCalledWith(expect.any(String));
    expect(result.current.isEditorVisible).toBe(false);
  });
});
