import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../lib/theme";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
};

// Three equal slices; the gaps between them are the surface color of the theme.
export function Logo({ size = 28, withWordmark = false }: LogoProps) {
  const { theme, colors } = useTheme();
  const first = theme === "dark" ? "#6D66F2" : "#4F46E5";

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="SplitEasy">
      <Path
        d="M50 50 L50 10 A40 40 0 0 1 84.64 70 Z"
        fill={first}
        stroke={colors.surface}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <Path
        d="M50 50 L84.64 70 A40 40 0 0 1 15.36 70 Z"
        fill="#FB7185"
        stroke={colors.surface}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <Path
        d="M50 50 L15.36 70 A40 40 0 0 1 50 10 Z"
        fill="#2DD4BF"
        stroke={colors.surface}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
    </Svg>
  );

  if (!withWordmark) return mark;

  const fontSize = Math.round(size * 0.72);
  return (
    <View style={styles.row}>
      {mark}
      <Text style={[styles.wordmark, { fontSize, color: colors.text }]}>
        <Text style={styles.part}>Split</Text>
        <Text style={[styles.part, { color: theme === "dark" ? colors.link : colors.primary }]}>Easy</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: { fontWeight: "800" },
  part: { fontWeight: "800" },
});
