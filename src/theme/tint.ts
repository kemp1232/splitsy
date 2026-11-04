// Low-alpha wash of a tone token — the same `${token}26` convention
// StatusBadge.tsx and receipt-review.tsx use for their own tone fills, shared
// here so the redesigned bill screens never carry scattered hex literals.
export function tint(hex: string): string {
  return `${hex}26`;
}
