// Trims a trip name and maps blank to null, matching trips.name being
// nullable (the UI falls back to copy.trip.unknownTripTitle).
export function normalizeTripName(raw: string): string | null {
  return raw.trim() || null;
}
