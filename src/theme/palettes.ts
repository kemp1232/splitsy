// Named decorative palettes (2026-11 redesign) — kept here so no component
// carries raw hex literals. Each fill is dark enough to carry `onBadge`
// (white) glyphs/initials at 4.5:1 or better (see tokens.test.ts).

// Initials avatars: lavender / indigo / violet / teal family, deterministic
// per name (InitialsAvatar.tsx).
export const avatarPalette = [
  '#4A4FC4', // lavender-indigo (light primary)
  '#5B45B8', // violet
  '#3A5AA0', // steel blue
  '#6A3FA0', // purple
  '#2E5C8A', // deep blue
  '#146B85', // teal-blue
] as const;

// Food category badges (FoodIconBadge.tsx), keyed by the badge's own
// Ionicons glyph name so each icon and its fill stay paired. Muted so they
// sit calmly on the dark surfaces. Insertion order is the badge rotation
// order FoodIconBadge hashes into.
export const foodBadgePalette = {
  'fast-food-outline': '#A35E2A',
  'pizza-outline': '#A8392F',
  'restaurant-outline': '#24785F',
  'cafe-outline': '#7E5329',
  'wine-outline': '#6A3FA0',
  'beer-outline': '#86681C',
  'ice-cream-outline': '#2F67A6',
  'nutrition-outline': '#2F7A3D',
} as const;

// Glyph / initials color laid on top of both palettes above.
export const onBadge = '#FFFFFF';
