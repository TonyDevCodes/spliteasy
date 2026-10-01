import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "./AppText";
import { CURRENCY_INFO, SUPPORTED_CURRENCIES, currencyFlagEmoji } from "../lib/money";
import { useThemedStyles, useTheme, type ThemeColors } from "../lib/theme";

type Props = {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
};

/** Row button (flag, code, name, chevron) that opens a bottom sheet with the currency list. */
export function CurrencyPicker({ value, onChange, disabled }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const info = CURRENCY_INFO[value as keyof typeof CURRENCY_INFO];

  function select(currency: string) {
    setOpen(false);
    if (currency !== value) onChange(currency);
  }

  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Currency: ${value}${info ? ` ${info.name}` : ""}. Change currency`}
      >
        <Text style={styles.flag}>{currencyFlagEmoji(value)}</Text>
        <Text style={styles.code}>{value}</Text>
        {info && <Text style={styles.name}>{info.name}</Text>}
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.overlay}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close currency list"
        >
          <Pressable style={styles.sheet} accessible={false}>
            <Text style={styles.sheetTitle}>Currency</Text>
            <ScrollView>
              {SUPPORTED_CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={styles.option}
                  onPress={() => select(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: c === value }}
                  accessibilityLabel={`${c} ${CURRENCY_INFO[c].name}`}
                >
                  <Text style={styles.flag}>{currencyFlagEmoji(c)}</Text>
                  <Text style={styles.code}>{c}</Text>
                  <Text style={styles.name}>{CURRENCY_INFO[c].name}</Text>
                  {c === value && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      backgroundColor: c.inputBackground,
      marginBottom: 8,
    },
    flag: {
      fontSize: 20,
    },
    code: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    name: {
      flex: 1,
      fontSize: 14,
      color: c.textMuted,
    },
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: c.overlay,
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 24,
      maxHeight: "75%",
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
      marginBottom: 8,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
  });
