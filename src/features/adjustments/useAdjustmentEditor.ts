import { useCallback, useState } from 'react';

import type { AdjustmentDraft } from '@/components/bill/AdjustmentEditorSheet';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';

type AdjustmentEditorParams = {
  billId: string;
  // How many adjustments the bill already has — a new one is appended at the
  // end (its sortOrder).
  adjustmentCount: number;
  // The caller's own reload after a save/delete (each screen decides how much
  // to re-fetch).
  refresh: () => Promise<void>;
  // The caller's own shared write-path error slot.
  setActionError: (message: string | null) => void;
};

// Shared by the adjustments screen and receipt-review.tsx so the add/edit/
// delete flow around AdjustmentEditorSheet (including custom allocations)
// only exists once — same shared-hook precedent as useBillSourceActions.
export function useAdjustmentEditor({
  billId,
  adjustmentCount,
  refresh,
  setActionError,
}: AdjustmentEditorParams) {
  const [editingAdjustment, setEditingAdjustment] = useState<Adjustment | 'new' | null>(null);
  const [editingCustomAllocations, setEditingCustomAllocations] = useState<AdjustmentAllocation[]>(
    [],
  );
  const [deletingAdjustment, setDeletingAdjustment] = useState<Adjustment | null>(null);

  // useCallback (RN list-performance rule): one stable reference passed to
  // every memoized AdjustmentRow, which calls it with its own adjustment.
  // Only touches state setters and a module-level repository, so no deps.
  const openEditor = useCallback(async (adjustment: Adjustment) => {
    const allocations =
      adjustment.allocationMethod === 'CUSTOM'
        ? await adjustmentAllocationsRepository.listByAdjustmentId(adjustment.id)
        : [];
    setEditingCustomAllocations(allocations);
    setEditingAdjustment(adjustment);
  }, []);

  function openNewEditor() {
    setEditingCustomAllocations([]);
    setEditingAdjustment('new');
  }

  async function saveAdjustment(draft: AdjustmentDraft) {
    setActionError(null);
    try {
      const timestamp = nowIso();
      let adjustmentId: string;

      if (editingAdjustment === 'new') {
        const created = await adjustmentsRepository.create({
          id: createId(),
          billId,
          sortOrder: adjustmentCount,
          type: draft.type,
          label: draft.label,
          amountCentavos: draft.amountCentavos,
          allocationMethod: draft.allocationMethod,
          source: 'MANUAL',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        adjustmentId = created.id;
      } else if (editingAdjustment) {
        adjustmentId = editingAdjustment.id;
        await adjustmentsRepository.update(adjustmentId, {
          type: draft.type,
          label: draft.label,
          amountCentavos: draft.amountCentavos,
          allocationMethod: draft.allocationMethod,
          updatedAt: timestamp,
        });
      } else {
        return;
      }

      // Custom allocations only ever exist for a CUSTOM adjustment (spec 9.6) —
      // clearing them out here whenever the saved method isn't CUSTOM keeps a
      // stale set from lingering if the user switches an adjustment away from
      // custom allocation.
      await adjustmentAllocationsRepository.setForAdjustment(
        adjustmentId,
        draft.allocationMethod === 'CUSTOM' ? (draft.customAllocations ?? []) : [],
      );

      setEditingAdjustment(null);
      await refresh();
    } catch {
      setEditingAdjustment(null);
      setActionError(copy.global.storageFailure);
    }
  }

  function requestDelete() {
    if (editingAdjustment && editingAdjustment !== 'new') {
      setDeletingAdjustment(editingAdjustment);
    }
    setEditingAdjustment(null);
  }

  async function confirmDelete() {
    if (!deletingAdjustment) return;
    setDeletingAdjustment(null);
    setActionError(null);
    try {
      await adjustmentsRepository.remove(deletingAdjustment.id);
      await refresh();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  const editingInitial =
    editingAdjustment && editingAdjustment !== 'new'
      ? {
          type: editingAdjustment.type,
          label: editingAdjustment.label,
          amountCentavos: editingAdjustment.amountCentavos,
          allocationMethod: editingAdjustment.allocationMethod,
        }
      : null;

  return {
    isEditorVisible: editingAdjustment !== null,
    editingInitial,
    editingCustomAllocations,
    isDeleteConfirmVisible: deletingAdjustment !== null,
    openEditor,
    openNewEditor,
    saveAdjustment,
    requestDelete,
    confirmDelete,
    cancelEditor: () => setEditingAdjustment(null),
    cancelDelete: () => setDeletingAdjustment(null),
  };
}
