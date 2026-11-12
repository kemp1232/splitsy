// Whether a bill has anything a share summary could describe. A draft with
// no items or nobody in it yet gets a "nothing to share yet" message instead
// of the generic share failure (calculateSplit would throw on zero people).
export function hasShareableContent(itemCount: number, participantCount: number): boolean {
  return itemCount > 0 && participantCount > 0;
}
