import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../../../../lib/supabase";
import { getDisplayName } from "../../../../../lib/displayName";
import { DEFAULT_CURRENCY, formatMoney, getCurrencySymbol } from "../../../../../lib/money";
import { useTheme, useThemedStyles, type ThemeColors } from "../../../../../lib/theme";

const RECEIPTS_BUCKET = "receipts";

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
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equally");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadMembers = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

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
  const currencySymbol = getCurrencySymbol(currency);

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

  async function uploadReceiptPhoto(uri: string, groupId: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const extMatch = uri.match(/\.(\w+)$/);
      const ext = (extMatch?.[1] || "jpg").toLowerCase();
      const path = `${groupId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, arrayBuffer, {
          contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
        });

      if (uploadError) {
        console.error("Receipt upload error:", uploadError);
        return null;
      }

      return path;
    } catch (uploadException) {
      console.error("Receipt upload error:", uploadException);
      return null;
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

    setSubmitting(true);

    let receiptPath: string | null = null;
    let receiptUploadFailed = false;

    if (photoUri) {
      receiptPath = await uploadReceiptPhoto(photoUri, groupId);
      receiptUploadFailed = receiptPath === null;
    }

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        description: description.trim(),
        amount: amountCents / 100,
        // Only set once the "receipts" storage bucket exists — see report.
        ...(receiptPath ? { receipt_url: receiptPath } : {}),
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

    if (receiptUploadFailed) {
      Alert.alert(
        "Expense added without receipt",
        "The expense was saved, but the receipt photo couldn't be uploaded (receipt storage isn't set up yet)."
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

      <Text style={styles.label}>Receipt photo</Text>
      {photoError && <Text style={styles.error}>{photoError}</Text>}

      {photoUri ? (
        <View style={styles.photoPreviewRow}>
          <Image source={{ uri: photoUri }} style={styles.photoThumbnail} />
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

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>Add expense</Text>
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
