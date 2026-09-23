import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "../../../lib/money";
import { useTheme, useThemedStyles, type ThemeColors } from "../../../lib/theme";
import { useAuth } from "../../../lib/auth-context";

export default function NewGroupScreen() {
  const authUserId = useAuth().user?.id ?? null;
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameMissing = name.trim().length === 0;

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setError(null);
    setSubmitting(true);

    // The session user from the auth context: no network call, so a flaky
    // connection cannot make a signed-in user look signed out here.
    const user = authUserId ? { id: authUserId } : null;

    if (!user) {
      setError("You must be signed in to create a group.");
      setSubmitting(false);
      return;
    }

    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: trimmedName, created_by: user.id, currency })
      .select("id")
      .single();

    if (groupError || !group) {
      console.error("Create group error:", groupError);
      setError("Something went wrong creating the group.");
      setSubmitting(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: user.id, role: "admin" });

    if (memberError) {
      console.error("Add group member error:", memberError);
      setError("Something went wrong creating the group.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.replace(`/(app)/groups/${group.id}`);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Create a group" }} />

      <Text style={styles.label}>Group name</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Group name"
        autoCapitalize="words"
      />

      <Text style={styles.label}>Currency</Text>
      <View style={styles.chipRow}>
        {SUPPORTED_CURRENCIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.chip, currency === c && styles.chipActive]}
            onPress={() => setCurrency(c)}
          >
            <Text
              style={[styles.chipText, currency === c && styles.chipTextActive]}
            >
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, nameMissing && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={submitting || nameMissing}
      >
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.buttonText, nameMissing && styles.buttonTextDisabled]}>
            Create
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      backgroundColor: c.background,
    },
    label: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 4,
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
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
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
    button: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
    },
    buttonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    buttonDisabled: {
      backgroundColor: c.disabled,
    },
    buttonTextDisabled: {
      color: c.onDisabled,
    },
  });
