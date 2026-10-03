import { Image, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import logoMark from "../assets/logo-mark.png";
import { useTheme } from "../lib/theme";

type BrandLogoProps = {
  tagline?: string;
  // "stacked" puts the wordmark below the mark (auth header); "inline" puts it beside the mark.
  layout?: "stacked" | "inline";
  size?: number;
  // "light" renders a white wordmark for dark or coloured backgrounds.
  tone?: "default" | "light";
};

// Full-colour logo mark with the wordmark, used as the brand header.
export function BrandLogo({ tagline, layout = "stacked", size = 112, tone = "default" }: BrandLogoProps) {
  const { theme, colors } = useTheme();
  const inline = layout === "inline";
  const wordmarkColor = tone === "light" ? "#FFFFFF" : theme === "dark" ? colors.text : "#0F172A";

  return (
    <View style={inline ? styles.inline : styles.container}>
      <Image
        source={logoMark}
        style={{ width: size, height: size }}
        alt="SplitEasy"
      />
      <Text style={[styles.wordmark, { color: wordmarkColor, fontSize: inline ? Math.round(size * 0.5) : 32 }]}>SplitEasy</Text>
      {tagline ? <Text style={[styles.tagline, { color: colors.textMuted }]}>{tagline}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  inline: { flexDirection: "row", alignItems: "center" },
  wordmark: { fontWeight: "800" },
  tagline: { marginTop: 12, fontSize: 16, textAlign: "center" },
});
