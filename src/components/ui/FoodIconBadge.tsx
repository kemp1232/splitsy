import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/theme/tokens';

// Not from the spec — a decorative, food-themed icon+color badge shown on
// bill rows (BillListItem.tsx) and line-item rows (LineItemRow.tsx): this
// app has no real receipt-category data to draw an icon from, so a small
// fixed set stands in, picked deterministically per row (hashed from the
// row's own id, never re-randomized on re-render — a given row's icon never
// flickers between renders, it just looks arbitrary across *different*
// rows). Ionicons, not this app's usual content-icon family (Feather) —
// Feather's set has essentially no food glyphs (just `coffee`), so it can't
// cover "food-related, several distinct options" on its own.
// Every color here is a distinct mid-tone hue chosen only for visual variety
// — purely decorative (the row's own title text already names it), never
// used to convey status, so it doesn't need the same WCAG-text-contrast
// rigor a legible-text palette (e.g. InitialsAvatar's own) would.
const FOOD_ICON_BADGES: { icon: keyof typeof Ionicons.glyphMap; background: string }[] = [
  { icon: 'fast-food-outline', background: '#B0682F' },
  { icon: 'pizza-outline', background: '#B03A2F' },
  { icon: 'restaurant-outline', background: '#2E8A6E' },
  { icon: 'cafe-outline', background: '#8A5A2E' },
  { icon: 'wine-outline', background: '#6A3FA0' },
  { icon: 'beer-outline', background: '#A98A2E' },
  { icon: 'ice-cream-outline', background: '#2F6FB0' },
  { icon: 'nutrition-outline', background: '#3E8A4A' },
];

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function foodIconBadgeFor(id: string) {
  return FOOD_ICON_BADGES[hashId(id) % FOOD_ICON_BADGES.length]!;
}

type Props = {
  // Hashed to pick the icon/color — pass the row's own stable id (bill.id,
  // lineItem.id, …), never anything that could collide across unrelated rows.
  id: string;
  size?: number;
};

export function FoodIconBadge({ id, size = 44 }: Props) {
  const badge = useMemo(() => foodIconBadgeFor(id), [id]);
  const iconSize = Math.round(size * 0.45);
  return (
    <View
      style={[styles.base, { width: size, height: size, backgroundColor: badge.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={badge.icon} size={iconSize} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
});
