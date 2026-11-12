// Hands a just-taken photo from /bill/capture to /bill/preview without
// putting the image itself in the route. On web, expo-camera's photo uri is a
// whole base64 data URI (megabytes), which in a route param ends up in the
// browser URL and history. The route carries only this short id instead.
//
// Module-level, like billEditSession's restoring-ids store: in memory only,
// so a web reload empties it and preview has to cope with a missing id. A
// single slot — a new capture replaces the previous one — keeps memory
// bounded, and reading never removes it, so a re-render (or React's
// StrictMode double-call) of preview's state initializer still finds it.
let slot: { id: string; uri: string } | null = null;
// Only needs to be unique within this JS session (the store doesn't survive
// a reload anyway), so a counter is enough.
let nextId = 0;

export function putCapturedPhoto(uri: string): string {
  nextId += 1;
  const id = `photo-${nextId}`;
  slot = { id, uri };
  return id;
}

// The photo for this id, or undefined when it isn't the current capture
// (never stored, replaced by a newer capture, cleared, or lost on reload).
export function getCapturedPhoto(id: string | undefined): string | undefined {
  if (!id || !slot || slot.id !== id) return undefined;
  return slot.uri;
}

export function clearCapturedPhoto(): void {
  slot = null;
}
