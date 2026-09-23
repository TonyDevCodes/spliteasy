import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { validateDisplayNameInput } from "../../lib/displayName";
import {
  THEME_PREFERENCES,
  useTheme,
  useThemedStyles,
  type ThemeColors,
  type ThemePreference,
} from "../../lib/theme";

type Status = "idle" | "saving" | "saved" | "error";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors, preference, setPreference } = useTheme();
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Load profile error:", profileError);
    }

    setName(data?.display_name ?? "");
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  async function handleSave() {
    if (!user) return;

    setStatus("saving");
    setError(null);

    const result = validateDisplayNameInput(name);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: result.value })
      .eq("id", user.id);

    if (updateError) {
      setStatus("error");
      setError(updateError.message);
      return;
    }

    setName(result.value ?? "");
    setStatus("saved");
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Profile" }} />

      {loading ? (
        <ActivityIndicator size="large" color={colors.text} />
      ) : (
        <>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          {status === "error" && error && (
            <Text style={styles.error}>{error}</Text>
          )}
          {status === "saved" && <Text style={styles.saved}>Saved</Text>}

          <TouchableOpacity
            style={styles.button}
            onPress={handleSave}
            disabled={status === "saving"}
          >
            {status === "saving" ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.buttonText}>Save</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.label, styles.themeLabel]}>Theme</Text>
          <View style={styles.chipRow}>
            {THEME_PREFERENCES.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, preference === option && styles.chipActive]}
                onPress={() => setPreference(option)}
              >
                <Text style={[styles.chipText, preference === option && styles.chipTextActive]}>
                  {THEME_LABELS[option]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, styles.signOutButton]}
            onPress={signOut}
          >
            <Text style={styles.buttonText}>Sign out</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 24,
      backgroundColor: c.background,
    },
    label: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 4,
    },
    value: {
      fontSize: 16,
      color: c.text,
      marginBottom: 16,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.inputBackground,
    },
    error: {
      color: c.danger,
      marginBottom: 12,
    },
    saved: {
      color: c.success,
      marginBottom: 12,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
    },
    signOutButton: {
      backgroundColor: c.primaryHover,
      marginTop: 24,
    },
    buttonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    themeLabel: {
      marginTop: 24,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    chipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    chipText: {
      fontSize: 14,
      color: c.text,
    },
    chipTextActive: {
      color: c.onPrimary,
      fontWeight: "600",
    },
  });
