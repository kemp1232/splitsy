import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { avatarPalette, onBadge } from '@/theme/palettes';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

// Splitsy has no accounts and no real photo avatars (spec-adjacent — see the
// theme direction notes). This is the deliberate substitute for the reference
// UI's overlapping-circular-photo-avatar motif: a deterministic,
// hashed-per-name fill from a small fixed palette, rather than a random or
// always-primary color, so the same person reads as the same color everywhere
// they appear (a list row today, an expanded card tomorrow). Every tone here
// (lavender/indigo/violet/teal, matching the 2026-11 palette) is dark enough
// that it clears 4.5:1 contrast against the fixed white initials label, so this
// palette doesn't need a separate light/dark variant of its own the way
// surface-dependent tokens do.
// The palette itself lives in src/theme/palettes.ts (avatarPalette).

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function colorForName(name: string): string {
  const index = hashName(name.trim().toLowerCase() || '?') % avatarPalette.length;
  return avatarPalette[index]!;
}

// First whole code point, not first UTF-16 unit: slice(0, 1) on "🍜" returns
// a lone surrogate half, which renders as a broken "�" glyph.
function firstCharacter(word: string): string {
  return Array.from(word)[0] ?? '';
}

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return firstCharacter(words[0]!).toUpperCase();
  return `${firstCharacter(words[0]!)}${firstCharacter(words[1]!)}`.toUpperCase();
}

type AvatarProps = {
  name: string;
  size?: number;
  // Set false when this avatar is standalone (not part of an AvatarStack
  // whose own container already carries a combined accessibility label) —
  // decorative (the default) hides it from screen readers since its name is
  // shown as plain text right next to it in every current usage.
  decorative?: boolean;
};

export const InitialsAvatar = memo(function InitialsAvatar({
  name,
  size = 36,
  decorative = true,
}: AvatarProps) {
  const backgroundColor = useMemo(() => colorForName(name), [name]);
  const initials = useMemo(() => initialsForName(name), [name]);
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
      ]}
      accessible={!decorative}
      accessibilityLabel={!decorative ? name : undefined}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      <AppText style={[styles.initials, { fontSize, lineHeight: fontSize + 2 }]}>
        {initials}
      </AppText>
    </View>
  );
});

type AvatarStackProps = {
  names: string[];
  size?: number;
  // How many circles to render before collapsing the remainder into a
  // trailing "+N" bubble (the reference's own "+N more" treatment).
  max?: number;
};

// The reference's overlapping-circular-avatar-stack shape/spacing, built from
// InitialsAvatar rather than photos (see that component's own header note).
// The whole stack is one accessible element with a combined spoken label
// (e.g. "3 people: Alex, Sam, Jo") — the individual circles underneath are
// hidden from the accessibility tree rather than read out one at a time.
export const AvatarStack = memo(function AvatarStack({
  names,
  size = 32,
  max = 3,
}: AvatarStackProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStackStyles(colors), [colors]);
  const overlap = Math.round(size * 0.35);
  const visible = names.slice(0, max);
  const remainder = names.length - visible.length;
  const combinedLabel =
    names.length === 0
      ? undefined
      : names.length <= max
        ? `${names.length} ${names.length === 1 ? 'person' : 'people'}: ${names.join(', ')}`
        : `${names.length} people: ${names.join(', ')}`;

  if (names.length === 0) return null;

  return (
    <View style={styles.row} accessible accessibilityLabel={combinedLabel} accessibilityRole="text">
      {visible.map((name, index) => (
        <View
          key={`${name}-${index}`}
          style={[
            styles.item,
            { marginLeft: index === 0 ? 0 : -overlap, zIndex: visible.length - index },
          ]}
        >
          <InitialsAvatar name={name} size={size} decorative />
        </View>
      ))}
      {remainder > 0 ? (
        <View style={[styles.item, { marginLeft: -overlap, zIndex: 0 }]}>
          <View style={[styles.more, { width: size, height: size, borderRadius: size / 2 }]}>
            <AppText variant="caption" color="textSecondary" style={styles.moreText}>
              +{remainder}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: onBadge,
    fontWeight: '700',
  },
});

function createStackStyles(colors: ColorTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    item: {
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    more: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    moreText: {
      fontSize: 11,
    },
  });
}
