import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, Share, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "../../../../components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import {
  buildWriteOffRow,
  canWriteOff,
  computeDetailedBalances,
  computeNetBalances,
  computeSettlements,
  WRITE_OFF_CONFIRM_TEXT,
  WRITE_OFF_LABEL,
  type BalanceLine,
} from "../../../../lib/settlements";
import { EmptyState } from "../../../../components/EmptyState";
import { Skeleton, SkeletonList } from "../../../../components/Skeleton";
import { ErrorBoundary } from "../../../../lib/ErrorBoundary";
import { getDisplayName, isDeletedUser, nameForUserId } from "../../../../lib/displayName";
import { subscribeToTableChanges, uniqueChannelName } from "../../../../lib/realtime";
import {
  buildBalancesCsv,
  buildExpensesCsv,
  buildGroupSummary,
  computeGroupBalances,
  exportFileName,
} from "../../../../lib/export";
import { shareCsv, sharePdf } from "../../../../lib/exportFiles";
import { CURRENCY_CHANGE_WARNING, DEFAULT_CURRENCY, formatMoney } from "../../../../lib/money";
import { CurrencyPicker } from "../../../../components/CurrencyPicker";
import { useTheme, useThemedStyles, type ThemeColors } from "../../../../lib/theme";
import { useAuth } from "../../../../lib/auth-context";
import { ActivityFeed } from "../../../../components/ActivityFeed";
import { CategoryIcon } from "../../../../components/CategoryIcon";
import { CategoryStats } from "../../../../components/CategoryStats";
import { RecurringList, type RecurringRow } from "../../../../components/RecurringList";
import { ACTIVITY_COLUMNS, toActivityItems, type ActivityItem, type ActivityRow } from "../../../../lib/activity";
import { categoryForExpense } from "../../../../lib/categories";
import { inviteUrl } from "../../../../lib/invites";
import {
  collectReceiptPaths,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  RECEIPT_UNAVAILABLE_TEXT,
  RECEIPTS_BUCKET,
  signedUrlsByPath,
} from "../../../../lib/receipts";

const ACTIVITY_LIMIT = 50;

const WATCHED_TABLES = ["expenses", "settlements", "expense_splits", "group_members", "groups"];

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Group = {
  id: string;
  name: string;
  created_at: string;
  currency: string;
  created_by: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string;
};

type MemberRow = {
  user_id: string;
  role: string;
  profiles: ProfileRow | null;
};

type Member = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  paid_by: string | null;
  amount: number;
  description: string;
  category: string | null;
  created_at: string;
  receipt_url: string | null;
};

type Split = {
  expense_id: string;
  user_id: string | null;
  amount_owed: number;
};

type Settlement = {
  from_user: string | null;
  to_user: string | null;
  amount: number;
  settled_at: string;
  kind: string;
};

type Invite = {
  id: string;
  token: string;
  expires_at: string;
};

type Tab = "balances" | "expenses" | "invite";

type ExportKind = "expenses-csv" | "balances-csv" | "pdf";

const EXPORT_OPTIONS: { kind: ExportKind; label: string }[] = [
  { kind: "expenses-csv", label: "CSV (expenses)" },
  { kind: "balances-csv", label: "CSV (balances)" },
  { kind: "pdf", label: "PDF summary" },
];

// Hermes may lack crypto.randomUUID; the key only needs to be unique, not secret.
function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function GroupDetailScreen() {
  const authUserId = useAuth().user?.id ?? null;
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("balances");
  const [balanceView, setBalanceView] = useState<"detailed" | "simplified">("detailed");
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<ProfileRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState(false);
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  // Synchronous lock: state updates are async, so a fast double tap would slip through.
  const settlingRef = useRef(false);
  // One idempotency key per submit intent (kind + line); dropped on success.
  const idempotencyKeysRef = useRef<Record<string, string>>({});
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Signed URLs (private bucket) by receipt path, and the one shown full-size.
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  // Signed URLs whose image failed to load (missing or not a real image).
  const [brokenReceiptUrls, setBrokenReceiptUrls] = useState<Record<string, boolean>>({});
  const markReceiptBroken = useCallback((url: string) => {
    setBrokenReceiptUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }, []);

  const loadGroupData = useCallback(async (groupId: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    // The session user from the auth context: no network call, so a flaky
    // connection cannot make a signed-in user look signed out here.
    const user = authUserId ? { id: authUserId } : null;

    if (!user) {
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .select("id, name, created_at, currency, created_by")
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
      { data: activityRows, error: activityError },
      { data: recurringRows, error: recurringError },
    ] = await Promise.all([
      supabase
        .from("group_members")
        .select("user_id, role, profiles(id, display_name, email)")
        .eq("group_id", groupId)
        .returns<MemberRow[]>(),
      supabase
        .from("expenses")
        .select("id, paid_by, amount, description, category, created_at, receipt_url")
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
        .select("from_user, to_user, amount, settled_at, kind")
        .eq("group_id", groupId)
        .returns<Settlement[]>(),
      supabase
        .from("group_invites")
        .select("id, token, expires_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<Invite[]>(),
      supabase
        .from("group_activity")
        .select(ACTIVITY_COLUMNS)
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT)
        .returns<ActivityRow[]>(),
      supabase
        .from("recurring_expenses")
        .select("id, paid_by, description, amount, frequency, next_due, active, created_by")
        .eq("group_id", groupId)
        .order("next_due", { ascending: true })
        .returns<RecurringRow[]>(),
    ]);

    const hasLoadError = Boolean(
      membersError ||
        expensesError ||
        splitsError ||
        settlementsError ||
        invitesError ||
        activityError ||
        recurringError
    );

    if (hasLoadError) {
      console.error("Group detail partial load error:", {
        membersError,
        expensesError,
        splitsError,
        settlementsError,
        invitesError,
        activityError,
        recurringError,
      });
    }

    setLoadWarning(hasLoadError);

    const profiles = (memberRows ?? [])
      .map((m) => m.profiles)
      .filter((p): p is ProfileRow => p !== null);
    setMemberProfiles(profiles);
    // Group settings (currency) are editable by group admins, matching the
    // groups_update RLS policy. Write-offs are admin-only as well.
    const myRole = (memberRows ?? []).find((m) => m.user_id === user.id)?.role;
    setIsAdmin(myRole === "admin" || myRole === "owner");
    setMembers(profiles.map((p) => ({ id: p.id, name: getDisplayName(p) })));
    setExpenses(expenseRows ?? []);
    setSplits(splitRows ?? []);
    setSettlements(settlementRows ?? []);
    setInvite(inviteRows?.[0] ?? null);
    setActivity(toActivityItems(activityRows ?? []));
    setRecurring(recurringRows ?? []);
    setLoading(false);

    // Re-signed on every load, so the 60-minute URLs stay fresh.
    const receiptPaths = collectReceiptPaths(expenseRows ?? []);
    if (receiptPaths.length === 0) {
      setReceiptUrls({});
      return;
    }
    const { data: signed, error: signError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrls(receiptPaths, RECEIPT_SIGNED_URL_TTL_SECONDS);
    if (signError) {
      console.error("Receipt signed URL error:", signError);
    }
    setReceiptUrls(signedUrlsByPath(signed));
  }, [authUserId]);

  useFocusEffect(
    useCallback(() => {
      if (id) loadGroupData(id);
    }, [id, loadGroupData])
  );

  useEffect(() => {
    if (!id) return;

    const channel = subscribeToTableChanges(
      supabase,
      uniqueChannelName(`group-${id}-changes`),
      WATCHED_TABLES,
      () => loadGroupData(id)
    );

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

  const simplifiedLines = useMemo<BalanceLine[]>(
    () => computeSettlements(computeNetBalances(expenses, splits, settlements)),
    [expenses, splits, settlements]
  );

  const detailedLines = useMemo<BalanceLine[]>(
    () => computeDetailedBalances(expenses, splits, settlements),
    [expenses, splits, settlements]
  );

  const balanceLines = balanceView === "detailed" ? detailedLines : simplifiedLines;

  const hasExpenses = expenses.length > 0;

  const totalOwedByMe = useMemo(
    () =>
      simplifiedLines
        .filter((line) => line.from === currentUserId)
        .reduce((sum, line) => sum + line.amount, 0),
    [simplifiedLines, currentUserId]
  );

  const totalOwedToMe = useMemo(
    () =>
      simplifiedLines
        .filter((line) => line.to === currentUserId)
        .reduce((sum, line) => sum + line.amount, 0),
    [simplifiedLines, currentUserId]
  );

  const myNet = Math.round((totalOwedToMe - totalOwedByMe) * 100) / 100;
  const currency = group?.currency ?? DEFAULT_CURRENCY;

  function idempotencyKeyFor(intent: string): string {
    return (idempotencyKeysRef.current[intent] ??= newIdempotencyKey());
  }

  async function handleSettle(line: BalanceLine) {
    if (!id || settlingRef.current) return;
    settlingRef.current = true;
    const key = `${line.from}-${line.to}`;
    setSettlingKey(key);

    const { error: settleError } = await supabase.from("settlements").insert({
      group_id: id,
      from_user: line.from,
      to_user: line.to,
      amount: line.amount,
      idempotency_key: idempotencyKeyFor(`settle-${key}`),
    });

    // 23505: this exact submit already landed, so treat it as success.
    if (settleError && settleError.code !== "23505") {
      console.error("Record settlement error:", settleError);
      setError("Something went wrong recording the settlement.");
    } else {
      delete idempotencyKeysRef.current[`settle-${key}`];
      await loadGroupData(id);
    }

    setSettlingKey(null);
    settlingRef.current = false;
  }

  // Closes a debt with a deleted user. The settlements_insert_write_off RLS
  // policy only accepts this from group admins.
  function confirmWriteOff(line: BalanceLine) {
    Alert.alert(WRITE_OFF_LABEL, WRITE_OFF_CONFIRM_TEXT, [
      { text: "Cancel", style: "cancel" },
      { text: WRITE_OFF_LABEL, style: "destructive", onPress: () => handleWriteOff(line) },
    ]);
  }

  async function handleWriteOff(line: BalanceLine) {
    if (!id || settlingRef.current) return;
    settlingRef.current = true;
    const key = `${line.from}-${line.to}`;
    setSettlingKey(key);

    const { error: writeOffError } = await supabase.from("settlements").insert({
      ...buildWriteOffRow(id, line),
      idempotency_key: idempotencyKeyFor(`writeoff-${key}`),
    });

    if (writeOffError && writeOffError.code !== "23505") {
      console.error("Record write-off error:", writeOffError);
      setError("Something went wrong writing off the debt.");
    } else {
      delete idempotencyKeysRef.current[`writeoff-${key}`];
      await loadGroupData(id);
    }

    setSettlingKey(null);
    settlingRef.current = false;
  }

  // Changing the currency does not convert amounts, so ask first.
  function confirmChangeCurrency(nextCurrency: string) {
    if (!group || nextCurrency === group.currency) return;
    Alert.alert(`Change currency to ${nextCurrency}?`, CURRENCY_CHANGE_WARNING, [
      { text: "Cancel", style: "cancel" },
      { text: "Change currency", onPress: () => handleChangeCurrency(nextCurrency) },
    ]);
  }

  async function handleChangeCurrency(nextCurrency: string) {
    if (!id || !group || nextCurrency === group.currency) return;

    setSavingCurrency(true);
    setCurrencyError(null);

    const { error: currencyUpdateError } = await supabase
      .from("groups")
      .update({ currency: nextCurrency })
      .eq("id", id);

    setSavingCurrency(false);

    if (currencyUpdateError) {
      console.error("Update currency error:", currencyUpdateError);
      setCurrencyError("Something went wrong changing the currency.");
      return;
    }

    setGroup({ ...group, currency: nextCurrency });
  }

  function openExport() {
    setExportError(null);
    setExportOpen(true);
  }

  async function handleExport(kind: ExportKind) {
    if (!group) return;
    setExporting(kind);
    setExportError(null);

    try {
      const exportGroup = { name: group.name, currency: group.currency };
      const balances = computeGroupBalances(expenses, splits, settlements);

      if (kind === "pdf") {
        const summary = buildGroupSummary(exportGroup, expenses, settlements, memberProfiles, balances, currentUserId);
        await sharePdf(summary, exportFileName(group.name, "pdf"));
      } else {
        const csv =
          kind === "expenses-csv"
            ? buildExpensesCsv(exportGroup, expenses, memberProfiles, splits)
            : buildBalancesCsv(exportGroup, balances, memberProfiles, settlements);
        await shareCsv(csv, exportFileName(group.name, "csv"));
      }
      setExportOpen(false);
    } catch (exportErr) {
      console.error("Export error:", exportErr);
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
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
        message: `Join my SplitEasy group: ${inviteUrl(SITE_URL, invite.token)}`,
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
          headerTitle: () => (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group?.name ?? "Group"}
            </Text>
          ),
          headerRight: () => (
            <View style={styles.headerRightRow}>
              {group && (
                <TouchableOpacity
                  onPress={openExport}
                  style={styles.headerIconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Export"
                >
                  <Ionicons name="share-outline" size={24} color={colors.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push(`/(app)/groups/${id}/expenses/new`)}
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel="Add expense"
              >
                <Ionicons name="add-circle-outline" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <Modal
        visible={exportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !exporting && setExportOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !exporting && setExportOpen(false)}>
          <Pressable style={styles.modalSheet}>
            <Text style={styles.sectionTitle}>Export {group?.name}</Text>
            {EXPORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.kind}
                style={styles.exportOption}
                onPress={() => handleExport(option.kind)}
                disabled={exporting !== null}
              >
                <Text style={styles.exportOptionText}>{option.label}</Text>
                {exporting === option.kind && <ActivityIndicator size="small" color={colors.text} />}
              </TouchableOpacity>
            ))}
            {exportError && <Text style={styles.error}>{exportError}</Text>}
            <TouchableOpacity
              style={styles.exportCancel}
              onPress={() => setExportOpen(false)}
              disabled={exporting !== null}
            >
              <Text style={styles.exportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={viewingReceiptUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingReceiptUrl(null)}
      >
        <Pressable
          style={styles.receiptViewer}
          onPress={() => setViewingReceiptUrl(null)}
          accessibilityLabel="Close receipt"
        >
          {viewingReceiptUrl && brokenReceiptUrls[viewingReceiptUrl] && (
            <Text style={styles.receiptViewerMessage}>{RECEIPT_UNAVAILABLE_TEXT}</Text>
          )}
          {viewingReceiptUrl && !brokenReceiptUrls[viewingReceiptUrl] && (
            <Image
              source={{ uri: viewingReceiptUrl }}
              alt=""
              style={styles.receiptFull}
              resizeMode="contain"
              onError={() => markReceiptBroken(viewingReceiptUrl)}
            />
          )}
          <Text style={styles.receiptViewerHint}>Tap to close</Text>
        </Pressable>
      </Modal>

      {loading ? (
        <View accessible accessibilityLabel="Loading group" accessibilityState={{ busy: true }}>
          <View style={styles.loadingHeader}>
            <Skeleton width="60%" height={28} />
            <Skeleton height={64} radius={20} />
          </View>
          <SkeletonList count={4} itemHeight={20} radius={8} label="Loading expenses" />
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
            <ErrorBoundary>
            <FlatList
              data={balanceLines}
              keyExtractor={(item, idx) => `${item.from}-${item.to}-${idx}`}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Currency</Text>
                  {group && isAdmin ? (
                    <>
                      <CurrencyPicker
                        value={group.currency}
                        onChange={confirmChangeCurrency}
                        disabled={savingCurrency}
                      />
                      {currencyError && <Text style={styles.error}>{currencyError}</Text>}
                    </>
                  ) : (
                    <Text style={[styles.mutedText, styles.sectionTitleSpaced]}>
                      {group?.currency}
                    </Text>
                  )}

                  <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
                    Your balance
                  </Text>
                  {myNet === 0 ? (
                    <Text style={styles.mutedText}>You&apos;re all settled up!</Text>
                  ) : (
                    <>
                      {totalOwedByMe > 0 && (
                        <Text style={styles.negativeText}>
                          You owe {formatMoney(totalOwedByMe, currency)}
                        </Text>
                      )}
                      {totalOwedToMe > 0 && (
                        <Text style={styles.positiveText}>
                          You are owed {formatMoney(totalOwedToMe, currency)}
                        </Text>
                      )}
                      <Text style={styles.mutedText}>
                        Net:{" "}
                        {myNet > 0
                          ? `You are owed ${formatMoney(myNet, currency)}`
                          : `You owe ${formatMoney(Math.abs(myNet), currency)}`}
                      </Text>
                    </>
                  )}

                  <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
                    All balances in this group
                  </Text>
                  {!hasExpenses ? (
                    <Text style={styles.mutedText}>No expenses yet.</Text>
                  ) : (
                    <>
                      <View style={styles.chipRow}>
                        <TouchableOpacity
                          style={[
                            styles.chip,
                            balanceView === "detailed" && styles.chipActive,
                          ]}
                          onPress={() => setBalanceView("detailed")}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              balanceView === "detailed" && styles.chipTextActive,
                            ]}
                          >
                            Detailed
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.chip,
                            balanceView === "simplified" && styles.chipActive,
                          ]}
                          onPress={() => setBalanceView("simplified")}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              balanceView === "simplified" && styles.chipTextActive,
                            ]}
                          >
                            Simplified
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {balanceLines.length === 0 && (
                        <EmptyState
                          title="You're all settled up"
                          description="No one owes anything in this group."
                        />
                      )}
                    </>
                  )}
                </View>
              }
              renderItem={({ item }) => {
                const key = `${item.from}-${item.to}`;
                return (
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceRowText}>
                      {nameForUserId(item.from, nameById)} owes{" "}
                      {nameForUserId(item.to, nameById)}:{" "}
                      {formatMoney(item.amount, currency)}
                    </Text>
                    {/* A settlement needs two existing users. */}
                    {!isDeletedUser(item.from) && !isDeletedUser(item.to) && (
                    <TouchableOpacity
                      style={styles.settleButton}
                      onPress={() => handleSettle(item)}
                      disabled={settlingKey !== null}
                    >
                      {settlingKey === key ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <Text style={styles.settleButtonText}>Mark as settled</Text>
                      )}
                    </TouchableOpacity>
                    )}
                    {/* Only admins can close a debt with a deleted user. */}
                    {canWriteOff(item, isAdmin) && (
                    <TouchableOpacity
                      style={styles.settleButton}
                      onPress={() => confirmWriteOff(item)}
                      disabled={settlingKey !== null}
                    >
                      {settlingKey === key ? (
                        <ActivityIndicator size="small" color={colors.text} />
                      ) : (
                        <Text style={styles.settleButtonText}>{WRITE_OFF_LABEL}</Text>
                      )}
                    </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
            </ErrorBoundary>
          )}

          {tab === "expenses" && (
            <FlatList
              data={expenses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListFooterComponent={
                <>
                  <CategoryStats expenses={expenses} currency={currency} />
                  <RecurringList
                    groupId={group?.id ?? id}
                    templates={recurring}
                    nameById={nameById}
                    currency={currency}
                    currentUserId={currentUserId}
                    onChanged={() => loadGroupData(id)}
                  />
                  <ActivityFeed items={activity} nameById={nameById} currency={currency} />
                </>
              }
              ListEmptyComponent={
                <EmptyState
                  title="No expenses yet"
                  description="Add the first expense to see who owes what."
                  action={{
                    label: "Add expense",
                    onPress: () => router.push(`/(app)/groups/${id}/expenses/new`),
                  }}
                />
              }
              renderItem={({ item }) => {
                const receiptUrl = item.receipt_url ? receiptUrls[item.receipt_url] : undefined;
                return (
                  <View style={styles.expenseRow}>
                    <CategoryIcon category={categoryForExpense(item)} />
                    <View style={styles.expenseRowLeft}>
                      <Text style={styles.expenseDescription}>{item.description}</Text>
                      <Text style={styles.mutedText}>
                        paid by {nameForUserId(item.paid_by, nameById)} ·{" "}
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                      {receiptUrl && brokenReceiptUrls[receiptUrl] && (
                        <Text style={styles.receiptUnavailable}>{RECEIPT_UNAVAILABLE_TEXT}</Text>
                      )}
                      {receiptUrl && !brokenReceiptUrls[receiptUrl] && (
                        <TouchableOpacity
                          style={styles.receiptLink}
                          onPress={() => setViewingReceiptUrl(receiptUrl)}
                          accessibilityRole="button"
                          accessibilityLabel={`View receipt for ${item.description}`}
                        >
                          <Image
                            source={{ uri: receiptUrl }}
                            alt=""
                            style={styles.receiptThumb}
                            onError={() => markReceiptBroken(receiptUrl)}
                          />
                          <Text style={styles.receiptLinkText}>Receipt</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.expenseAmount}>
                      {formatMoney(Number(item.amount), currency)}
                    </Text>
                  </View>
                );
              }}
            />
          )}

          {tab === "invite" && (
            <View style={styles.listContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Invite link</Text>
                {invite ? (
                  <>
                    <Text style={styles.mutedText}>
                      {inviteUrl(SITE_URL, invite.token)}
                    </Text>
                    <TouchableOpacity style={styles.button} onPress={handleShareInvite}>
                      <Text style={styles.buttonText}>Share</Text>
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
                    <ActivityIndicator color={colors.onPrimary} />
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    loadingHeader: {
      padding: 16,
      gap: 12,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    errorText: {
      color: c.danger,
      fontSize: 16,
      textAlign: "center",
    },
    error: {
      color: c.danger,
      padding: 12,
      textAlign: "center",
    },
    warning: {
      color: c.danger,
      backgroundColor: c.dangerBackground,
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
      borderBottomColor: c.border,
    },
    tabButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabButtonActive: {
      borderBottomColor: c.text,
    },
    tabButtonText: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: "600",
    },
    tabButtonTextActive: {
      color: c.text,
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
      color: c.text,
    },
    sectionTitleSpaced: {
      marginTop: 16,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 8,
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
    mutedText: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: 4,
    },
    positiveText: {
      fontSize: 15,
      fontWeight: "600",
      color: c.success,
      marginBottom: 4,
    },
    negativeText: {
      fontSize: 15,
      fontWeight: "600",
      color: c.danger,
      marginBottom: 4,
    },
    balanceRow: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
    },
    balanceRowText: {
      fontSize: 14,
      color: c.text,
      marginBottom: 8,
    },
    settleButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    settleButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.text,
    },
    expenseRow: {
      backgroundColor: c.surface,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
    },
    expenseRowLeft: {
      flex: 1,
      marginHorizontal: 12,
    },
    expenseDescription: {
      fontSize: 15,
      fontWeight: "600",
      marginBottom: 2,
      color: c.text,
    },
    expenseAmount: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    receiptLink: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 8,
      marginTop: 6,
    },
    receiptThumb: {
      width: 40,
      height: 40,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceHover,
    },
    receiptLinkText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.link,
    },
    receiptUnavailable: {
      marginTop: 6,
      alignSelf: "flex-start",
      fontSize: 12,
      fontStyle: "italic",
      color: c.textMuted,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    receiptViewerMessage: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
      backgroundColor: c.surface,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      overflow: "hidden",
    },
    receiptViewer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.overlay,
      padding: 16,
    },
    receiptFull: {
      width: "100%",
      height: "85%",
    },
    receiptViewerHint: {
      marginTop: 12,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.surface,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
      overflow: "hidden",
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 8,
    },
    buttonSecondary: {
      backgroundColor: c.primaryHover,
    },
    buttonText: {
      color: c.onPrimary,
      fontSize: 15,
      fontWeight: "600",
    },
    memberRow: {
      fontSize: 14,
      color: c.text,
      paddingVertical: 4,
    },
    headerRightRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: c.overlay,
    },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: 32,
    },
    exportOption: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    exportOptionText: {
      fontSize: 16,
      color: c.text,
    },
    exportCancel: {
      marginTop: 16,
      paddingVertical: 12,
      alignItems: "center",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    exportCancelText: {
      fontSize: 16,
      fontWeight: "600",
      color: c.text,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: "700",
      color: c.text,
    },
    headerIconButton: {
      width: 36,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
  });