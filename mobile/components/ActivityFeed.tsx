import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { EmptyState } from "./EmptyState";
import { groupActivityByDay, type ActivityItem } from "../lib/activity";
import { nameForUserId } from "../lib/displayName";
import { formatMoney } from "../lib/money";
import { useThemedStyles, type ThemeColors } from "../lib/theme";

type Props = {
  items: ActivityItem[];
  nameById: Record<string, string>;
  currency: string;
};

function kindLabel(item: ActivityItem): string {
  if (item.kind === "expense") return "Expense";
  return item.isWriteOff ? "Write-off" : "Payment";
}

function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function metaLine(item: ActivityItem, nameById: Record<string, string>): string {
  const label = kindLabel(item);
  const parts = [nameForUserId(item.actorId, nameById), formatTime(item.createdAt)];
  if (item.title !== label) parts.unshift(label);
  return parts.join(" · ");
}

export function ActivityFeed({ items, nameById, currency }: Props) {
  const styles = useThemedStyles(makeStyles);
  const days = useMemo(() => groupActivityByDay(items), [items]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Activity</Text>
      {items.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Expenses and payments will show up here."
        />
      ) : (
        days.map((day) => (
          <View key={day.day}>
            <Text style={styles.dayTitle}>{formatDay(day.day)}</Text>
            {day.items.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.mutedText}>{metaLine(item, nameById)}</Text>
                </View>
                <Text style={styles.amount}>{formatMoney(item.amount, currency)}</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    section: {
      marginTop: 10,
      marginBottom: 20,
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
    dayTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textMuted,
      marginTop: 8,
      marginBottom: 6,
    },
    row: {
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
    rowLeft: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: "600",
      marginBottom: 2,
      color: c.text,
    },
    mutedText: {
      fontSize: 14,
      color: c.textMuted,
    },
    amount: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
  });
