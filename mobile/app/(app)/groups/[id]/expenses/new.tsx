import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../../lib/supabase";

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string;
};

type MemberRow = {
  user_id: string;
  profiles: ProfileRow | null;
};

type Member = {
  id: string;
  name: string;
};

type SplitMode = "equally" | "custom";

export default function NewExpenseScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equally");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadMembers = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: memberRows, error: membersError } = await supabase
      .from("group_members")
      .select("user_id, profiles(id, display_name, email)")
      .eq("group_id", id)
      .returns<MemberRow[]>();

    if (membersError) {
      console.error("Members query error:", membersError);
      setLoadError("Something went wrong loading group members.");
      setLoading(false);
      return;
    }

    const formatted = (memberRows ?? [])
      .filter((m): m is MemberRow & { profiles: ProfileRow } => m.profiles !== null)
      .map((m) => ({
        id: m.profiles.id,
        name: m.profiles.display_name || m.profiles.email,
      }));

    setMembers(formatted);
    setPaidBy((prev) => prev ?? user?.id ?? formatted[0]?.id ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (groupId) loadMembers(groupId);
    }, [groupId, loadMembers])
  );

  const amountCents = Math.round(parseFloat(amount || "0") * 100);

  const splits = useMemo(() => {
    if (splitMode === "equally") {
      const share = Math.floor(amountCents / (members.length || 1));
      const remainder = amountCents - share * (members.length || 1);
      return members.map((m, i) => ({
        userId: m.id,
        amountCents: share + (i < remainder ? 1 : 0),
      }));
    }

    return members.map((m) => ({
      userId: m.id,
      amountCents: Math.round(parseFloat(customSplits[m.id] || "0") * 100),
    }));
  }, [splitMode, members, amountCents, customSplits]);

  const splitTotal = splits.reduce((sum, s) => sum + s.amountCents, 0);
  const splitMismatch = splitMode === "custom" && splitTotal !== amountCents;

  async function handleSubmit() {
    setError(null);

    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (!amountCents || amountCents <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!paidBy) {
      setError("Select who paid");
      return;
    }
    if (splitMismatch) {
      setError(
        `Split total (${(splitTotal / 100).toFixed(2)}) does not match the expense amount (${(amountCents / 100).toFixed(2)})`
      );
      return;
    }

    setSubmitting(true);

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        description: description.trim(),
        amount: amountCents / 100,
      })
      .select("id")
      .single();

    if (expenseError || !expense) {
      console.error("Create expense error:", expenseError);
      setError(expenseError?.message || "Failed to create expense");
      setSubmitting(false);
      return;
    }

    const splitRows = splits.map((s) => ({
      expense_id: expense.id,
      user_id: s.userId,
      amount_owed: s.amountCents / 100,
    }));

    const { error: splitsError } = await supabase.from("expense_splits").insert(splitRows);

    if (splitsError) {
      console.error("Create expense splits error:", splitsError);
      setError(splitsError.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Add expense" }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Add expense" }} />
        <Text style={styles.error}>{loadError}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: "Add expense" }} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Dinner"
      />

      <Text style={styles.label}>Total amount</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Paid by</Text>
      <View style={styles.chipRow}>
        {members.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, paidBy === m.id && styles.chipActive]}
            onPress={() => setPaidBy(m.id)}
          >
            <Text style={[styles.chipText, paidBy === m.id && styles.chipTextActive]}>
              {m.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Split</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={[styles.chip, splitMode === "equally" && styles.chipActive]}
          onPress={() => setSplitMode("equally")}
        >
          <Text style={[styles.chipText, splitMode === "equally" && styles.chipTextActive]}>
            Equally
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, splitMode === "custom" && styles.chipActive]}
          onPress={() => setSplitMode("custom")}
        >
          <Text style={[styles.chipText, splitMode === "custom" && styles.chipTextActive]}>
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {splitMode === "custom" && (
        <View style={styles.customSplits}>
          {members.map((m) => (
            <View key={m.id} style={styles.customSplitRow}>
              <Text style={styles.customSplitName}>{m.name}</Text>
              <TextInput
                style={styles.customSplitInput}
                value={customSplits[m.id] || ""}
                onChangeText={(text) =>
                  setCustomSplits((prev) => ({ ...prev, [m.id]: text }))
                }
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          ))}
          <Text style={[styles.mutedText, splitMismatch && styles.error]}>
            Total: {(splitTotal / 100).toFixed(2)} / {(amountCents / 100).toFixed(2)}
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Add expense</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  label: {
    fontSize: 14,
    color: "#444",
    marginBottom: 4,
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  chipText: {
    fontSize: 14,
    color: "#333",
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  customSplits: {
    marginBottom: 16,
  },
  customSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  customSplitName: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  customSplitInput: {
    width: 100,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  mutedText: {
    fontSize: 13,
    color: "#666",
  },
  error: {
    color: "#c00",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
