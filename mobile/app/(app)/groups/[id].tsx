import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabase";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    supabase
      .from("groups")
      .select("name")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          console.error("Group detail query error:", fetchError);
          setError("Something went wrong loading this group.");
        } else {
          setName(data?.name ?? null);
        }
        setLoading(false);
      });
  }, [id]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: name ?? "Group" }} />

      {loading ? (
        <ActivityIndicator size="large" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <Text style={styles.title}>{name ?? "Untitled group"}</Text>
          <Text style={styles.subtitle}>ID: {id}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
  },
  error: {
    color: "#c00",
    fontSize: 16,
    textAlign: "center",
  },
});
