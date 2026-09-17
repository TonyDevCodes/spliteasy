import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { computeSettlements, type BalanceLine } from "../../../../lib/settlements";

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Group = {
  id: string;
  name: string;
  created_at: string;
};

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

type Expense = {
  id: string;
  paid_by: string;
  amount: number;
  description: string;
  created_at: string;
};

type Split = {
  expense_id: string;
  user_id: string;
  amount_owed: number;
};

type Settlement = {
  from_user: string;
  to_user: string;
  amount: number;
};

type Invite = {
  id: string;
  token: string;
  expires_at: string;
};

type Tab = "balances" | "expenses" | "invite";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("balances");
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState(false);
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const loadGroupData = useCallback(async (groupId: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .select("id, name, created_at")
      .eq("id", groupId)
      .maybeSingle();

    if (groupError) {
      console.error("Group detail query error:", groupError);
    }

    if (!groupData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setGroup(groupData);

    const [
      { data: memberRows, error: membersError },
      { data: expenseRows, error: expensesError },
      { data: splitRows, error: splitsError },
      { data: settlementRows, error: settlementsError },
      { data: inviteRows, error: invitesError },
    ] = await Promise.all([
      supabase
        .from("group_members")
        .select("user_id, profiles(id, display_name, email)")
        .eq("group_id", groupId)
        .returns<MemberRow[]>(),
      supabase
        .from("expenses")
        .select("id, paid_by, amount, description, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .returns<Expense[]>(),
      supabase
        .from("expense_splits")
        .select("expense_id, user_id, amount_owed, expenses!inner(group_id)")
        .eq("expenses.group_id", groupId)
        .returns<Split[]>(),
      supabase
        .from("settlements")
        .select("from_user, to_user, amount")
        .eq("group_id", groupId)
        .returns<Settlement[]>(),
      supabase
        .from("group_invites")
        .select("id, token, expires_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<Invite[]>(),
    ]);

    const hasLoadError = Boolean(
      membersError || expensesError || splitsError || settlementsError || invitesError
    );

    if (hasLoadError) {
      console.error("Group detail partial load error:", {
        membersError,
        expensesError,
        splitsError,
        settlementsError,
        invitesError,
      });
    }

    setLoadWarning(hasLoadError);

    setMembers(
      (memberRows ?? [])
        .filter((m): m is MemberRow & { profiles: ProfileRow } => m.profiles !== null)
        .map((m) => ({
          id: m.profiles.id,
          name: m.profiles.display_name || m.profiles.email,
        }))
    );
    setExpenses(expenseRows ?? []);
    setSplits(splitRows ?? []);
    setSettlements(settlementRows ?? []);
    setInvite(inviteRows?.[0] ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (id) loadGroupData(id);
    }, [id, loadGroupData])
  );

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`group-${id}-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        () => loadGroupData(id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settlements" },
        () => loadGroupData(id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_splits" },
        () => loadGroupData(id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        () => loadGroupData(id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadGroupData]);

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [members]);

  const balanceLines = useMemo<BalanceLine[]>(() => {
    const net: Record<string, number> = {};

    expenses.forEach((e) => {
      net[e.paid_by] = (net[e.paid_by] ?? 0) + Number(e.amount);
    });

    splits.forEach((s) => {
      net[s.user_id] = (net[s.user_id] ?? 0) - Number(s.amount_owed);
    });

    settlements.forEach((s) => {
      net[s.from_user] = (net[s.from_user] ?? 0) + Number(s.amount);
      net[s.to_user] = (net[s.to_user] ?? 0) - Number(s.amount);
    });

    return computeSettlements(net);
  }, [expenses, splits, settlements]);

  const hasExpenses = expenses.length > 0;

  const totalOwedByMe = useMemo(
    () =>
      balanceLines
        .filter((line) => line.from === currentUserId)
        .reduce((sum, line) => sum + line.amount, 0),
    [balanceLines, currentUserId]
  );

  const totalOwedToMe = useMemo(
    () =>
      balanceLines
        .filter((line) => line.to === currentUserId)
        .reduce((sum, line) => sum + line.amount, 0),
    [balanceLines, currentUserId]
  );

  const myNet = Math.round((totalOwedToMe - totalOwedByMe) * 100) / 100;

  async function handleSettle(line: BalanceLine) {
    if (!id) return;
    const key = `${line.from}-${line.to}`;
    setSettlingKey(key);

    const { error: settleError } = await supabase.from("settlements").insert({
      group_id: id,
      from_user: line.from,
      to_user: line.to,
      amount: line.amount,
    });

    if (settleError) {
      console.error("Record settlement error:", settleError);
      setError("Something went wrong recording the settlement.");
    } else {
      await loadGroupData(id);
    }

    setSettlingKey(null);
  }

  async function handleGenerateInvite() {
    if (!id || !currentUserId) return;
    setGeneratingInvite(true);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: inviteError } = await supabase.from("group_invites").insert({
      group_id: id,
      created_by: currentUserId,
      expires_at: expiresAt,
    });

    if (inviteError) {
      console.error("Create invite error:", inviteError);
      setError("Something went wrong creating the invite link.");
    } else {
      await loadGroupData(id);
    }

    setGeneratingInvite(false);
  }

  async function handleShareInvite() {
    if (!invite) return;
    try {
      await Share.share({
        message: `Join my SplitEasy group: ${SITE_URL}/invite/${invite.token}`,
      });
    } catch (shareError) {
      console.error("Share invite error:", shareError);
    }
  }

  if (notFound) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Group" }} />
        <Text style={styles.errorText}>This group could not be found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: group?.name ?? "Group",
          headerRight: () =>
            tab === "expenses" ? (
              <TouchableOpacity
                onPress={() => router.push(`/(app)/groups/${id}/expenses/new`)}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>+ Add expense</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <>
          {error && <Text style={styles.error}>{error}</Text>}
          {loadWarning && (
            <Text style={styles.warning}>
              Some data failed to load — the numbers below may be incomplete.
            </Text>
          )}

          <View style={styles.tabBar}>
            {(["balances", "expenses", "invite"] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabButton, tab === t && styles.tabButtonActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabButtonText, tab === t && styles.tabButtonTextActive]}>
                  {t === "balances" ? "Balances" : t === "expenses" ? "Expenses" : "Invite"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "balances" && (
            <FlatList
              data={balanceLines}
              keyExtractor={(item, idx) => `${item.from}-${item.to}-${idx}`}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Your balance</Text>
                  {myNet === 0 ? (
                    <Text style={styles.mutedText}>You&apos;re all settled up!</Text>
                  ) : (
                    <>
                      {totalOwedByMe > 0 && (
                        <Text style={styles.negativeText}>
                          You owe €{totalOwedByMe.toFixed(2)}
                        </Text>
                      )}
                      {totalOwedToMe > 0 && (
                        <Text style={styles.positiveText}>
                          You are owed €{totalOwedToMe.toFixed(2)}
                        </Text>
                      )}
                      <Text style={styles.mutedText}>
                        Net:{" "}
                        {myNet > 0
                          ? `You are owed €${myNet.toFixed(2)}`
                          : `You owe €${Math.abs(myNet).toFixed(2)}`}
                      </Text>
                    </>
                  )}

                  <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
                    All balances in this group
                  </Text>
                  {!hasExpenses ? (
                    <Text style={styles.mutedText}>No expenses yet.</Text>
                  ) : balanceLines.length === 0 ? (
                    <Text style={styles.mutedText}>All settled up!</Text>
                  ) : null}
                </View>
              }
              renderItem={({ item }) => {
                const key = `${item.from}-${item.to}`;
                return (
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceRowText}>
                      {nameById[item.from] ?? "Someone"} owes{" "}
                      {nameById[item.to] ?? "someone"}: €{item.amount.toFixed(2)}
                    </Text>
                    <TouchableOpacity
                      style={styles.settleButton}
                      onPress={() => handleSettle(item)}
                      disabled={settlingKey === key}
                    >
                      {settlingKey === key ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <Text style={styles.settleButtonText}>Mark as settled</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}

          {tab === "expenses" && (
            <FlatList
              data={expenses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={styles.mutedText}>No expenses yet.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.expenseRow}>
                  <View style={styles.expenseRowLeft}>
                    <Text style={styles.expenseDescription}>{item.description}</Text>
                    <Text style={styles.mutedText}>
                      paid by {nameById[item.paid_by] ?? "someone"} ·{" "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.expenseAmount}>€{Number(item.amount).toFixed(2)}</Text>
                </View>
              )}
            />
          )}

          {tab === "invite" && (
            <View style={styles.listContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invite link</Text>
                {invite ? (
                  <>
                    <Text style={styles.mutedText}>
                      {SITE_URL}/invite/{invite.token}
                    </Text>
                    <TouchableOpacity style={styles.button} onPress={handleShareInvite}>
                      <Text style={styles.buttonText}>Share invite</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.mutedText}>No active invite link.</Text>
                )}
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={handleGenerateInvite}
                  disabled={generatingInvite}
                >
                  {generatingInvite ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Generate invite link</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Members</Text>
                {members.map((m) => (
                  <Text key={m.id} style={styles.memberRow}>
                    {m.name}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#c00",
    fontSize: 16,
    textAlign: "center",
  },
  error: {
    color: "#c00",
    padding: 12,
    textAlign: "center",
  },
  warning: {
    color: "#c00",
    backgroundColor: "#fdecec",
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 6,
    fontSize: 13,
    textAlign: "center",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: "#111",
  },
  tabButtonText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#111",
  },
  listContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionTitleSpaced: {
    marginTop: 16,
  },
  mutedText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  positiveText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a7f37",
    marginBottom: 4,
  },
  negativeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#c00",
    marginBottom: 4,
  },
  balanceRow: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  balanceRowText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
  },
  settleButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  settleButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  expenseRowLeft: {
    flex: 1,
    marginRight: 8,
  },
  expenseDescription: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonSecondary: {
    backgroundColor: "#444",
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  memberRow: {
    fontSize: 14,
    color: "#333",
    paddingVertical: 4,
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
});