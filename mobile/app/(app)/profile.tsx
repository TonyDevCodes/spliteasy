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

type Status = "idle" | "saving" | "saved" | "error";

export default function ProfileScreen() {
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
        <ActivityIndicator size="large" />
      ) : (
        <>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
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
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save</Text>
            )}
          </TouchableOpacity>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
  },
  label: {
    fontSize: 14,
    color: "#444",
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: "#111",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 16,
  },
  error: {
    color: "#c00",
    marginBottom: 12,
  },
  saved: {
    color: "#1a7f37",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  signOutButton: {
    backgroundColor: "#444",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
