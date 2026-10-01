import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { Logo } from "./Logo";
import { useThemedStyles, type ThemeColors } from "../lib/theme";

// Shared frame for sign-in and sign-up: logo and slogan on top, form below.
// Scrolls and avoids the keyboard so the fields stay visible.
export function AuthScreen({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Logo size={72} withWordmark />
          <Text style={styles.slogan}>Share costs. Stay friends.</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 24,
    },
    brand: {
      alignItems: "center",
      marginBottom: 32,
    },
    slogan: {
      marginTop: 12,
      fontSize: 16,
      color: c.textMuted,
      textAlign: "center",
    },
  });
