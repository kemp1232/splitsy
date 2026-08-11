import type { ComponentProps } from 'react';
import { Text, type Text as RNText } from 'react-native';

import { colors } from '@/theme/tokens';
import { typography, type TypographyVariant } from '@/theme/typography';

type Props = ComponentProps<typeof RNText> & {
  variant?: TypographyVariant;
  color?: keyof typeof colors;
};

export function AppText({ variant = 'body', color = 'textPrimary', style, ...rest }: Props) {
  return <Text style={[typography[variant], { color: colors[color] }, style]} {...rest} />;
}
