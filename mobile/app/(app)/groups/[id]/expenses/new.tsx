import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "../../../../../components/AppText";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { supabase } from "../../../../../lib/supabase";
import { getDisplayName } from "../../../../../lib/displayName";
import { DEFAULT_CURRENCY, formatMoney, getCurrencySymbol } from "../../../../../lib/money";
import { useTheme, useThemedStyles, type ThemeColors } from "../../../../../lib/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CATEGORIES, DEFAULT_CATEGORY_KEY, type CategoryKey } from "../../../../../lib/categories";
import { useCategoryTint } from "../../../../../components/CategoryIcon";
import { useAuth } from "../../../../../lib/auth-context";
import {
  buildReceiptPath,
  RECEIPT_HEADER_BYTES,
  receiptContentType,
  RECEIPTS_BUCKET,
  validateReceiptImage,
} from "../../../../../lib/receipts";
import {
  buildRecurringRow,
  isDueNow,
  isValidDateString,
  type RecurringFrequency,
} from "../../../../../lib/recurring";

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

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

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
  const authUserId = useAuth().user?.id ?? null;
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const categoryTint = useCategoryTint();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryKey>(DEFAULT_CATEGORY_KEY);
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equally");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [repeat, setRepeat] = useState<"none" | RecurringFrequency>("none");
  // Empty means "today" (in the device's time zone).
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per screen instance: a retry after a failed save reuses it.
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadMembers = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);

    // The session user from the auth context: no network call, so a flaky
    // connection cannot make a signed-in user look signed out here.
    const user = authUserId ? { id: authUserId } : null;

    const [
      { data: memberRows, error: membersError },
      { data: groupData, error: groupError },
    ] = await Promise.all([
      supabase
        .from("group_members")
        .select("user_id, profiles(id, display_name, email)")
        .eq("group_id", id)
        .returns<MemberRow[]>(),
      supabase.from("groups").select("currency").eq("id", id).maybeSingle(),
    ]);

    if (membersError) {
      console.error("Members query error:", membersError);
      setLoadError("Something went wrong loading group members.");
      setLoading(false);
      return;
    }

    if (groupError) {
      console.error("Group currency query error:", groupError);
    } else if (groupData) {
      setCurrency(groupData.currency);
    }

    const formatted = (memberRows ?? [])
      .filter((m): m is MemberRow & { profiles: ProfileRow } => m.profiles !== null)
      .map((m) => ({
        id: m.profiles.id,
        name: getDisplayName(m.profiles),
      }));

    setMembers(formatted);
    setPaidBy((prev) => prev ?? user?.id ?? formatted[0]?.id ?? null);
    setLoading(false);
  }, [authUserId]);

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
  const currencySymbol = getCurrencySymbol(currency);
  const effectiveStart = startDate.trim() || localToday();

  async function handleTakePhoto() {
    setPhotoError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setPhotoError(
        "Camera access is required to take a receipt photo. Enable it in your device settings."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleChooseFromLibrary() {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setPhotoError(
        "Photo library access is required to attach a receipt. Enable it in your device settings."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  function handleRemovePhoto() {
    setPhotoUri(null);
    setPhotoError(null);
  }

  // Reads the photo with expo-file-system, never fetch(uri): fetch can return
  // an error body (e.g. "File not found") that would be stored as the receipt.
  async function uploadReceiptPhoto(
    uri: string,
    groupId: string
  ): Promise<{ path: string } | { error: string }> {
    try {
      const file = new File(uri);
      if (!file.exists) {
        return { error: "The photo file could not be found." };
      }

      const bytes = await file.bytes();
      const check = validateReceiptImage(bytes.subarray(0, RECEIPT_HEADER_BYTES), bytes.length);
      if (!check.ok) {
        return { error: check.error };
      }

      const path = buildReceiptPath(groupId, check.extension);
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, bytes, {
          contentType: receiptContentType(check.extension),
        });

      if (uploadError) {
        console.error("Receipt upload error:", uploadError);
        return { error: "The photo could not be uploaded." };
      }

      return { path };
    } catch (uploadException) {
      console.error("Receipt upload error:", uploadException);
      return { error: "The photo could not be read." };
    }
  }

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
        `Split total (${formatMoney(splitTotal / 100, currency)}) does not match the expense amount (${formatMoney(amountCents / 100, currency)})`
      );
      return;
    }

    // Weekly or monthly saves a template for the daily run instead of an
    // expense; the receipt picker is hidden for it.
    if (repeat !== "none") {
      if (!authUserId) {
        setError("You need to be signed in");
        return;
      }
      const built = buildRecurringRow({
        groupId,
        createdBy: authUserId,
        paidBy,
        description,
        category,
        amountCents,
        splits,
        frequency: repeat,
        startDate: effectiveStart,
        memberIds: members.map((m) => m.id),
      });
      if (!built.ok) {
        setError(built.error);
        return;
      }

      setSubmitting(true);
      const { error: recurringError } = await supabase.from("recurring_expenses").insert(built.row);
      if (recurringError) {
        console.error("Create recurring expense error:", recurringError);
        setError(recurringError.message || "Failed to create recurring expense");
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      router.back();
      return;
    }

    setSubmitting(true);

    // A receipt that fails validation or upload is dropped; the expense is
    // still saved, without a receipt.
    let receiptPath: string | null = null;
    let receiptError: string | null = null;

    if (photoUri) {
      const upload = await uploadReceiptPhoto(photoUri, groupId);
      if ("path" in upload) {
        receiptPath = upload.path;
      } else {
        receiptError = upload.error;
      }
    }

    const { error: expenseError } = await supabase.rpc("create_expense_with_splits", {
      p_group_id: groupId,
      p_paid_by: paidBy,
      p_amount: amountCents / 100,
      p_description: description.trim(),
      p_category: category,
      p_receipt_url: receiptPath ?? null,
      p_idempotency_key: idempotencyKeyRef.current,
      p_splits: splits.map((s) => ({
        user_id: s.userId,
        amount_owed: s.amountCents / 100,
      })),
    });

    if (expenseError) {
      console.error("Create expense error:", expenseError);
      setError(expenseError.message || "Failed to create expense");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    if (receiptError) {
      Alert.alert(
        "Expense added without receipt",
        `The expense was saved, but the receipt was not attached: ${receiptError}`
      );
    }

    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Add expense" }} />
        <ActivityIndicator size="large" color={colors.text} />
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
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Dinner"
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow} accessibilityRole="radiogroup">
        {CATEGORIES.map((c) => {
          const selected = category === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.categoryChip,
                selected && { borderColor: c.color, backgroundColor: `${c.color}${categoryTint}` },
              ]}
              onPress={() => setCategory(c.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={c.label}
            >
              <Ionicons name={c.ionIcon as keyof typeof Ionicons.glyphMap} size={16} color={c.color} />
              <Text style={styles.chipText}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Total amount ({currencySymbol})</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
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
                placeholderTextColor={colors.placeholder}
                style={styles.customSplitInput}
                value={customSplits[m.id] || ""}
                onChangeText={(text) =>
                  setCustomSplits((prev) => ({ ...prev, [m.id]: text }))
                }
                placeholder={`${currencySymbol}0.00`}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
          <Text style={[styles.mutedText, splitMismatch && styles.error]}>
            Total: {formatMoney(splitTotal / 100, currency)} / {formatMoney(amountCents / 100, currency)}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Repeat</Text>
      <View style={styles.chipRow} accessibilityRole="radiogroup">
        {(
          [
            { value: "none", label: "Does not repeat" },
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
          ] as const
        ).map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.chip, repeat === option.value && styles.chipActive]}
            onPress={() => setRepeat(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: repeat === option.value }}
          >
            <Text style={[styles.chipText, repeat === option.value && styles.chipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {repeat !== "none" && (
        <>
          <Text style={styles.label}>Starts on</Text>
          <TextInput
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={startDate || localToday()}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
          />
          {isValidDateString(effectiveStart) && isDueNow(effectiveStart, localToday()) && (
            <Text style={[styles.mutedText, styles.noteSpacing]}>
              This date is today or in the past, so the first expense will be created by the next daily run.
            </Text>
          )}
        </>
      )}

      {repeat === "none" && (
        <>
      <Text style={styles.label}>Receipt photo</Text>
      {photoError && <Text style={styles.error}>{photoError}</Text>}

      {photoUri ? (
        <View style={styles.photoPreviewRow}>
          <Image source={{ uri: photoUri }} alt="" style={styles.photoThumbnail} />
          <View style={styles.chipRow}>
            <TouchableOpacity style={styles.chip} onPress={handleTakePhoto}>
              <Text style={styles.chipText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={handleRemovePhoto}>
              <Text style={styles.chipText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.chipRow}>
          <TouchableOpacity style={styles.chip} onPress={handleTakePhoto}>
            <Text style={styles.chipText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={handleChooseFromLibrary}>
            <Text style={styles.chipText}>Choose from library</Text>
          </TouchableOpacity>
        </View>
      )}
        </>
      )}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>
            {repeat === "none" ? "Add expense" : "Add recurring expense"}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      padding: 24,
      backgroundColor: c.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
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
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 2,
      borderColor: c.border,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 12,
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
      color: c.text,
    },
    customSplitInput: {
      width: 100,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.inputBackground,
    },
    mutedText: {
      fontSize: 13,
      color: c.textMuted,
    },
    noteSpacing: {
      marginTop: -8,
      marginBottom: 16,
    },
    photoPreviewRow: {
      marginBottom: 16,
    },
    photoThumbnail: {
      width: 120,
      height: 120,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: c.surfaceHover,
    },
    error: {
      color: c.danger,
      marginBottom: 12,
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
  });
