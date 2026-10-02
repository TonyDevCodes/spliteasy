import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "./AppText";
import { supabase } from "../lib/supabase";
import { nameForUserId } from "../lib/displayName";
import { formatMoney } from "../lib/money";
import { frequencyLabel } from "../lib/recurring";
import { useThemedStyles, type ThemeColors } from "../lib/theme";

export type RecurringRow = {
  id: string;
  paid_by: string | null;
  description: string;
  amount: number | string;
  frequency: string;
  next_due: string;
  active: boolean;
  created_by: string | null;
};

type Props = {
  groupId: string;
  templates: RecurringRow[];
  nameById: Record<string, string>;
  currency: string;
  currentUserId: string | null;
  onChanged: () => void | Promise<void>;
};

function formatDueDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RecurringList({ groupId, templates, nameById, currency, currentUserId, onChanged }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) return null;

  async function setActive(template: RecurringRow) {
    if (busyId || !currentUserId) return;
    setBusyId(template.id);
    setError(null);

    const { error: updateError } = await supabase
      .from("recurring_expenses")
      .update({ active: !template.active })
      .eq("id", template.id)
      .eq("group_id", groupId)
      .eq("created_by", currentUserId);

    if (updateError) {
      console.error("Update recurring expense error:", updateError);
      setError("Something went wrong updating the recurring expense.");
    } else {
      await onChanged();
    }
    setBusyId(null);
  }

  function confirmDelete(template: RecurringRow) {
    Alert.alert(
      "Delete recurring expense?",
      `"${template.description}" will stop repeating. Expenses already created are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDelete(template) },
      ]
    );
  }

  async function handleDelete(template: RecurringRow) {
    if (busyId || !currentUserId) return;
    setBusyId(template.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from("recurring_expenses")
      .delete()
      .eq("id", template.id)
      .eq("group_id", groupId)
      .eq("created_by", currentUserId);

    if (deleteError) {
      console.error("Delete recurring expense error:", deleteError);
      setError("Something went wrong deleting the recurring expense.");
    } else {
      await onChanged();
    }
    setBusyId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Recurring</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {templates.map((t) => {
        const isCreator = currentUserId !== null && t.created_by === currentUserId;
        const busy = busyId === t.id;
        return (
          <View key={t.id} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.description} numberOfLines={1}>
                {t.description}
              </Text>
              <Text style={styles.amount}>{formatMoney(Number(t.amount), currency)}</Text>
            </View>
            <Text style={styles.mutedText}>
              {frequencyLabel(t.frequency)} · {t.active ? `next ${formatDueDate(t.next_due)}` : "Paused"} · paid by{" "}
              {nameForUserId(t.paid_by, nameById)}
            </Text>
            {isCreator && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => setActive(t)}
                  disabled={busyId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.active ? "Pause" : "Resume"} ${t.description}`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={styles.actionText}>{t.active ? "Pause" : "Resume"}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => confirmDelete(t)}
                  disabled={busyId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${t.description}`}
                >
                  <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    section: {
      marginTop: 10,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 8,
      color: c.text,
    },
    error: {
      color: c.danger,
      marginBottom: 8,
    },
    row: {
      marginBottom: 14,
    },
    rowTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    description: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: c.text,
    },
    amount: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
    mutedText: {
      fontSize: 14,
      color: c.textMuted,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    actionButton: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      minWidth: 64,
      alignItems: "center",
    },
    actionText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.text,
    },
    deleteText: {
      color: c.danger,
    },
  });
