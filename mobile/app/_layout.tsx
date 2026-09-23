import { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  DarkTheme,
  DefaultTheme,
  Slot,
  ThemeProvider as NavigationThemeProvider,
  useRouter,
  useSegments,
  type Theme,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { ThemeProvider, useTheme, useThemedStyles, type ThemeColors } from "../lib/theme";

function RootNavigation() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAuthCallback = segments[0] === "auth";

    if (!session && !inAuthGroup && !inAuthCallback) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(app)");
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={styles.spinner.color} />
      </View>
    );
  }

  return <Slot />;
}

function ThemedApp() {
  const { theme, colors } = useTheme();

  // Navigation headers, screen backgrounds and the status bar follow the theme.
  const navigationTheme = useMemo<Theme>(() => {
    const base = theme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.text,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [theme, colors]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    spinner: {
      color: c.text,
    },
  });
