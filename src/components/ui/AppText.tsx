import type { ComponentProps } from 'react';
import { Text, type Text as RNText } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { typography, type TypographyVariant } from '@/theme/typography';

type Props = ComponentProps<typeof RNText> & {
  variant?: TypographyVariant;
  color?: keyof ColorTokens;
};

export function AppText({ variant = 'body', color = 'textPrimary', style, ...rest }: Props) {
  const { colors } = useTheme();
  return <Text style={[typography[variant], { color: colors[color] }, style]} {...rest} />;
}
