import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme, useThemedStyles, type ThemeColors } from "../../lib/theme";

function parseTokensFromUrl(url: string): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const { queryParams } = Linking.parse(url);
  let accessToken = typeof queryParams?.access_token === "string" ? queryParams.access_token : null;
  let refreshToken =
    typeof queryParams?.refresh_token === "string" ? queryParams.refresh_token : null;

  if (!accessToken || !refreshToken) {
    const hashIndex = url.indexOf("#");
    if (hashIndex !== -1) {
      const fragmentParams = new URLSearchParams(url.slice(hashIndex + 1));
      accessToken = accessToken ?? fragmentParams.get("access_token");
      refreshToken = refreshToken ?? fragmentParams.get("refresh_token");
    }
  }

  return { accessToken, refreshToken };
}

export default function AuthCallbackScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url || handledRef.current) return;
      handledRef.current = true;

      const { accessToken, refreshToken } = parseTokensFromUrl(url);

      if (!accessToken || !refreshToken) {
        setError(
          "This confirmation link is missing or invalid. Please request a new confirmation email and try again."
        );
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        handledRef.current = false;
        setError(sessionError.message);
        return;
      }

      router.replace("/(app)");
    }

    Linking.getInitialURL().then(handleUrl);

    const subscription = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => subscription.remove();
  }, [router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirmation failed</Text>
        <Text style={styles.message}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.text} />
      <Text style={styles.message}>Confirming your account…</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: c.background,
    },
    title: {
      fontSize: 24,
      fontWeight: "600",
      marginBottom: 12,
      textAlign: "center",
      color: c.text,
    },
    message: {
      fontSize: 16,
      color: c.text,
      marginTop: 12,
      textAlign: "center",
    },
  });
