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

export default function SignupScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const { error } = await signUp(email, password, name);
    setSubmitting(false);

    if (error) {
      setError(error);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.message}>
          We sent a confirmation link to {email}. Confirm your account, then sign in.
        </Text>
        <Link href="/(auth)/login" style={styles.link}>
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <Text style={styles.label}>Name (optional)</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

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
          <Text style={styles.buttonText}>Create account</Text>
        )}
      </TouchableOpacity>

      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Sign in
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
    message: {
      fontSize: 16,
      color: c.text,
      marginBottom: 24,
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
