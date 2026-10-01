import { StyleSheet, TouchableOpacity, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { Text } from "./AppText";
import { useTheme, useThemedStyles, type ThemeColors } from "../lib/theme";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
};

// Built from the logo shapes: a soft disc behind the three slices pulled
// slightly apart, with a few small circles around them.
function Illustration() {
  const { theme, colors } = useTheme();
  const indigo = theme === "dark" ? "#6D66F2" : "#4F46E5";

  return (
    <Svg width={160} height={120} viewBox="0 0 160 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={80} cy={60} r={54} fill={colors.primary} opacity={0.1} />
      <G transform="translate(30 10)">
        <Path d="M50 50 L50 10 A40 40 0 0 1 84.64 70 Z" transform="translate(4.3 -2.5)" fill={indigo} opacity={0.9} />
        <Path d="M50 50 L84.64 70 A40 40 0 0 1 15.36 70 Z" transform="translate(0 5)" fill="#FB7185" opacity={0.9} />
        <Path d="M50 50 L15.36 70 A40 40 0 0 1 50 10 Z" transform="translate(-4.3 -2.5)" fill="#2DD4BF" opacity={0.9} />
      </G>
      <Circle cx={22} cy={30} r={6} fill="#FB7185" opacity={0.7} />
      <Circle cx={142} cy={92} r={5} fill="#2DD4BF" opacity={0.7} />
      <Circle cx={138} cy={24} r={4} fill={indigo} opacity={0.7} />
    </Svg>
  );
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <Illustration />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {action && (
        <TouchableOpacity
          style={styles.button}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 32,
      paddingHorizontal: 24,
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: c.text,
      marginTop: 12,
      textAlign: "center",
    },
    description: {
      fontSize: 15,
      color: c.textMuted,
      marginTop: 6,
      textAlign: "center",
      maxWidth: 280,
    },
    button: {
      height: 52,
      borderRadius: 14,
      paddingHorizontal: 32,
      marginTop: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    buttonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
  });
