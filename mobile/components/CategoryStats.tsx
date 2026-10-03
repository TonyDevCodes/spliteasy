import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { CategoryIcon } from "./CategoryIcon";
import { getCategory } from "../lib/categories";
import { computeCategoryTotals, computeGrandTotal, formatPercent } from "../lib/categoryTotals";
import { formatMoney } from "../lib/money";
import { useThemedStyles, type ThemeColors } from "../lib/theme";

type Props = {
  expenses: { amount: number | string; description: string; category?: string | null }[];
  currency: string;
};

export function CategoryStats({ expenses, currency }: Props) {
  const styles = useThemedStyles(makeStyles);
  const totals = useMemo(() => computeCategoryTotals(expenses), [expenses]);
  const grandTotal = useMemo(() => computeGrandTotal(expenses), [expenses]);

  if (expenses.length === 0) return null;

  const barLabel = totals.map((t) => `${t.label} ${formatPercent(t.percent)}`).join(", ");

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Spending by category</Text>
      <Text style={styles.grandTotal}>{formatMoney(grandTotal, currency)}</Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Spending by category: ${barLabel}`}
        style={styles.bar}
      >
        {totals.map((t) => (
          <View key={t.key} style={{ flexGrow: t.total, flexShrink: 1, flexBasis: 0, backgroundColor: t.color }} />
        ))}
      </View>
      {totals.map((t) => (
        <View key={t.key} style={styles.row}>
          <CategoryIcon category={getCategory(t.key)} />
          <View style={styles.rowLeft}>
            <Text style={styles.label} numberOfLines={1}>
              {t.label}
            </Text>
            <Text style={styles.mutedText}>
              {t.count} {t.count === 1 ? "expense" : "expenses"}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.amount}>{formatMoney(t.total, currency)}</Text>
            <Text style={styles.mutedText}>{formatPercent(t.percent)}</Text>
          </View>
        </View>
      ))}
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
    grandTotal: {
      fontSize: 20,
      fontWeight: "700",
      color: c.text,
      marginBottom: 12,
    },
    bar: {
      flexDirection: "row",
      height: 12,
      gap: 2,
      borderRadius: 6,
      overflow: "hidden",
      marginBottom: 14,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    rowLeft: {
      flex: 1,
      marginHorizontal: 12,
    },
    rowRight: {
      alignItems: "flex-end",
    },
    label: {
      fontSize: 15,
      fontWeight: "600",
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
