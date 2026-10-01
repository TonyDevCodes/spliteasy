import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Category } from "../lib/categories";
import { useTheme } from "../lib/theme";

// 15% (light) and 22% (dark) as a two-digit hex alpha.
const TINT_LIGHT = "26";
const TINT_DARK = "38";

export function useCategoryTint(): string {
  return useTheme().theme === "dark" ? TINT_DARK : TINT_LIGHT;
}

export function CategoryIcon({ category }: { category: Category }) {
  const tint = useCategoryTint();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={category.label}
      style={[styles.box, { backgroundColor: `${category.color}${tint}` }]}
    >
      <Ionicons name={category.ionIcon as keyof typeof Ionicons.glyphMap} size={20} color={category.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
