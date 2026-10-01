import { useEffect, useMemo } from "react";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  DarkTheme,
  DefaultTheme,
  Slot,
  ThemeProvider as NavigationThemeProvider,
  useRouter,
  useSegments,
  type Href,
  type Theme,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { ThemeProvider, useTheme, useThemedStyles, type ThemeColors } from "../lib/theme";
import { takePendingRedirect } from "../lib/pendingRedirect";
import { applyDefaultFont, fontAssets } from "../lib/fonts";

applyDefaultFont();
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigation() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    // No route yet: on a cold start from a link (e.g. an invite) the router
    // has not resolved it. Redirecting now would override the link.
    if (loading || (segments as string[]).length === 0) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAuthCallback = segments[0] === "auth";
    // The invite screen handles signed-out users itself (asks them to sign in).
    const inInvite = segments[0] === "invite";

    if (!session && !inAuthGroup && !inAuthCallback && !inInvite) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      // After signing in, return to an invite opened while signed out.
      const next = takePendingRedirect();
      router.replace((next ?? "/(app)") as Href);
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
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fontsReady = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // Keep the splash screen up until the fonts are loaded (or failed: fall back to the system font).
  if (!fontsReady) return null;

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
