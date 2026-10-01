import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../lib/theme";

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

// Placeholder block shown while data loads; pulses between half and full opacity.
export function Skeleton({ width = "100%", height = 16, radius = 8, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.border, opacity }, style]}
    />
  );
}

type SkeletonListProps = {
  count?: number;
  itemHeight?: number;
  radius?: number;
  label: string;
};

// A padded column of skeleton cards for list screens.
export function SkeletonList({ count = 3, itemHeight = 72, radius = 20, label }: SkeletonListProps) {
  return (
    <View
      style={styles.list}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={itemHeight} radius={radius} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
});
