import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Props = {
  // Fill matches whatever surface color the edge is finishing off (e.g. a
  // card's own background) so it reads as part of that surface, not a
  // separate decoration.
  color: string;
  // Optional thin stroke along the zigzag, like a crease catching the light.
  borderColor?: string;
  height?: number;
  teeth?: number;
};

// The one deliberate "unmistakably Splitsy" signature touch (see the theme
// direction notes) — a small torn/perforated edge, meant to echo tearing a
// receipt off the till. Used sparingly: only on receipt- and
// settlement-related surfaces (BillListItem, ReconciliationCard,
// SettlementCard, the receipt preview screen), never as a general decorative
// pattern.
export function ReceiptTornEdge({ color, borderColor, height = 10, teeth = 16 }: Props) {
  const step = 100 / teeth;
  let path = 'M0,0';
  for (let i = 1; i <= teeth; i++) {
    const x = i * step;
    const y = i % 2 === 1 ? height : 0;
    path += ` L${x.toFixed(2)},${y}`;
  }
  path += ' L100,0 Z';

  return (
    <View pointerEvents="none">
      <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        <Path
          d={path}
          fill={color}
          stroke={borderColor}
          strokeWidth={borderColor ? 1 : 0}
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}
