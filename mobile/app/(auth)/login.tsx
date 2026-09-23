import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme, useThemedStyles, type ThemeColors } from "../../lib/theme";

export default function LoginScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      setError(error);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </TouchableOpacity>

      <Link href="/(auth)/signup" style={styles.link}>
        Don&apos;t have an account? Sign up
      </Link>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      backgroundColor: c.background,
    },
    title: {
      fontSize: 24,
      fontWeight: "600",
      marginBottom: 24,
      color: c.text,
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
    link: {
      marginTop: 20,
      textAlign: "center",
      color: c.text,
      textDecorationLine: "underline",
    },
  });
