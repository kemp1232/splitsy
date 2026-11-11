import { copy } from '@/constants/copy';

// The one place the trip screens word a bill count: "1 bill" / "N bills", or
// null for zero (callers then show nothing).
export function formatTripBillCount(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return copy.trip.billCountLabelSingular;
  return copy.trip.billCountLabel.replace('{count}', () => String(count));
}

// The delete-trip confirmation body for a trip holding `count` bills.
export function buildTripDeleteConfirmBody(count: number): string {
  if (count <= 0) return copy.trip.deleteConfirmBodyEmpty;
  if (count === 1) return copy.trip.deleteConfirmBodySingular;
  return copy.trip.deleteConfirmBody.replace('{count}', () => String(count));
}
