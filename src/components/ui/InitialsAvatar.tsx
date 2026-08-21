import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

// Splitsy has no accounts and no real photo avatars (spec-adjacent — see the
// theme direction notes). This is the deliberate substitute for the reference
// UI's overlapping-circular-photo-avatar motif: a deterministic,
// hashed-per-name fill from a small fixed palette, rather than a random or
// always-primary color, so the same person reads as the same color everywhere
// they appear (a list row today, an expanded card tomorrow). Every tone here
// is a blue/indigo/teal-blue "accent-adjacent" hue (194°-232°, the same
// family as `primary`'s own 232° — never drifting toward purple), and every
// one clears 4.5:1 contrast against the fixed white initials label, so this
// palette doesn't need a separate light/dark variant of its own the way
// surface-dependent tokens do.
const AVATAR_PALETTE = [
  '#2F3EA6', // indigo (primary's own hue)
  '#3A5AA0', // steel blue
  '#2E5C8A', // deep blue
  '#245C99', // blue
  '#456BC4', // medium blue
  '#146B85', // teal-blue
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function colorForName(name: string): string {
  const index = hashName(name.trim().toLowerCase() || '?') % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index]!;
}

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return `${words[0]!.slice(0, 1)}${words[1]!.slice(0, 1)}`.toUpperCase();
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
      <AppText style={{ fontSize, lineHeight: fontSize + 2, color: '#FFFFFF', fontWeight: '700' }}>
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
