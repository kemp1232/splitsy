import { Image } from 'expo-image';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import { illustrationInk } from '@/theme/tokens';

import { AppText } from './AppText';

// greeting.png's own pixel dimensions (1774x528). Must match the file
// exactly — a mismatch makes contentFit="contain" letterbox the image inside
// a box shaped for different proportions, leaving visible gaps. Re-check with
// `file assets/images/greeting.png` if the asset changes.
const GREETING_ASPECT_RATIO = 1774 / 528;

type Props = {
  heading: string;
  subtitle?: string;
  // Width of the block relative to its parent (Home uses 80%).
  width?: DimensionValue;
  // Caps the rendered height (dp); the width cap is derived from the image's
  // own aspect ratio, so the block only ever shrinks, never distorts.
  maxHeight?: number;
};

// The ninja mascot + speech-bubble artwork (assets/images/greeting.png) with
// real text laid over the bubble's empty interior. Shared by Home and the
// Add-receipt screen. The container is locked to the image's aspect ratio so
// it scales to any width, and the overlay percentages are the bubble's
// measured position within that fixed image, so they stay aligned at any
// size. Only the image is hidden from screen readers; the overlaid text is a
// normal sibling and is still announced.
export function GreetingBubble({ heading, subtitle, width = '80%', maxHeight }: Props) {
  const sizeStyle = maxHeight ? { width, maxWidth: maxHeight * GREETING_ASPECT_RATIO } : { width };
  return (
    <View style={[styles.imageWrap, sizeStyle]}>
      <Image
        source={require('../../../assets/images/greeting.png')}
        style={styles.image}
        contentFit="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.textOverlay}>
        {/* The speech bubble is a fixed white graphic baked into the image —
            it doesn't repaint for dark mode, so the text over it uses the
            fixed illustrationInk tokens rather than the theme's text tokens
            (which flip to near-white in dark mode). */}
        <AppText
          variant="heading"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={styles.headingText}
        >
          {heading}
        </AppText>
        {subtitle ? (
          <AppText
            variant="body"
            numberOfLines={2}
            style={styles.subtitleText}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    aspectRatio: GREETING_ASPECT_RATIO,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // Sizes stepped down from the heading/body variants (22/15) to match the
  // block's reduced width.
  headingText: {
    color: illustrationInk.heading,
    fontSize: 18,
    lineHeight: 23,
  },
  subtitleText: {
    color: illustrationInk.body,
    fontSize: 13,
    lineHeight: 18,
  },
  // The speech bubble's own measured interior within greeting.png — the
  // ninja + bubble tail occupy the left ~35%; the rounded corners get a
  // further margin so text never touches the bubble's border.
  textOverlay: {
    pointerEvents: 'none',
    position: 'absolute',
    left: '37%',
    right: '7%',
    top: '10%',
    bottom: '18%',
    justifyContent: 'center',
    gap: 2,
  },
});
