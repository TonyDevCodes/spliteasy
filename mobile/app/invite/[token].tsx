// Invite screen for spliteasy://invite/<token> (and the /invite/<token> path of
// the web invite URL). Same behaviour as the web invite page: look up the
// invite, show the group name and "Join group"; signed-out users sign in first
// and come back here afterwards.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { invitePath, joinGroupByToken, parseInviteToken } from "../../lib/invites";
import { setPendingRedirect } from "../../lib/pendingRedirect";
import { useTheme, useThemedStyles, type ThemeColors } from "../../lib/theme";

type InviteRow = {
  invite_id: string;
  group_id: string;
  group_name: string;
  expires_at: string;
  is_expired: boolean;
};

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | { kind: "ready"; invite: InviteRow }
  | { kind: "member"; invite: InviteRow };

export default function InviteScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ token: string }>();
  const token = parseInviteToken(params.token);
  const userId = session?.user.id ?? null;

  const [state, setState] = useState<State>({ kind: "loading" });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    if (!userId) {
      // get_invite_by_token is only available to signed-in users.
      setState({ kind: "signed-out" });
      return;
    }

    setState({ kind: "loading" });
    const { data, error } = await supabase.rpc("get_invite_by_token", { p_token: token });

    if (error) {
      console.error("Invite lookup error:", error);
      setState({ kind: "error", message: "The invite could not be loaded. Check your connection and try again." });
      return;
    }

    const invite = (data as InviteRow[] | null)?.[0];
    if (!invite) {
      setState({ kind: "invalid" });
      return;
    }
    if (invite.is_expired) {
      setState({ kind: "expired" });
      return;
    }

    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", invite.group_id)
      .eq("user_id", userId)
      .maybeSingle();

    setState(membership ? { kind: "member", invite } : { kind: "ready", invite });
  }, [token, userId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  // withAnchor keeps the groups list underneath, so back works.
  function openGroup(groupId: string) {
    router.replace(`/(app)/groups/${groupId}`, { withAnchor: true });
  }

  function goToAuth(screen: "login" | "signup") {
    if (token) setPendingRedirect(invitePath(token));
    router.replace(screen === "login" ? "/(auth)/login" : "/(auth)/signup");
  }

  // Joins through the join_group_by_token RPC (checked in the database);
  // already a member: the RPC just returns the group.
  async function handleJoin() {
    if (!userId || !token) return;
    setJoining(true);
    setJoinError(null);

    const result = await joinGroupByToken(supabase, token);

    setJoining(false);

    if (result.ok) {
      openGroup(result.groupId);
    } else if (result.reason === "invalid") {
      setState({ kind: "invalid" });
    } else if (result.reason === "expired") {
      setState({ kind: "expired" });
    } else if (result.reason === "not-signed-in") {
      setState({ kind: "signed-out" });
    } else {
      setJoinError(result.message);
    }
  }

  function leave() {
    router.replace(session ? "/(app)" : "/(auth)/login");
  }

  let content;
  switch (state.kind) {
    case "loading":
      content = <ActivityIndicator size="large" color={colors.text} />;
      break;
    case "signed-out":
      content = (
        <>
          <Text style={styles.title}>You&apos;ve been invited to a group</Text>
          <Text style={styles.body}>Sign in to see the group and join it.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => goToAuth("login")}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => goToAuth("signup")}>
            <Text style={styles.secondaryButtonText}>Create an account</Text>
          </TouchableOpacity>
        </>
      );
      break;
    case "invalid":
    case "expired":
    case "error":
      content = (
        <>
          <Text style={styles.errorTitle}>
            {state.kind === "invalid"
              ? "This invite link is invalid."
              : state.kind === "expired"
                ? "This invite link has expired."
                : state.message}
          </Text>
          <Text style={styles.body}>
            {state.kind === "error"
              ? ""
              : "Ask a member of the group to share a new invite link."}
          </Text>
          {state.kind === "error" && (
            <TouchableOpacity style={styles.primaryButton} onPress={load}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.secondaryButton} onPress={leave}>
            <Text style={styles.secondaryButtonText}>{session ? "Your groups" : "Sign in"}</Text>
          </TouchableOpacity>
        </>
      );
      break;
    case "member":
      content = (
        <>
          <Text style={styles.body}>You&apos;re already a member of</Text>
          <Text style={styles.groupName}>{state.invite.group_name}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => openGroup(state.invite.group_id)}
          >
            <Text style={styles.primaryButtonText}>Open group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={leave}>
            <Text style={styles.secondaryButtonText}>Your groups</Text>
          </TouchableOpacity>
        </>
      );
      break;
    case "ready":
      content = (
        <>
          <Text style={styles.body}>You&apos;ve been invited to join</Text>
          <Text style={styles.groupName}>{state.invite.group_name}</Text>
          {joinError && <Text style={styles.error}>{joinError}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Join group</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={leave} disabled={joining}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </>
      );
      break;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>{content}</View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: c.background,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 24,
      alignItems: "stretch",
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: c.text,
      textAlign: "center",
      marginBottom: 8,
    },
    body: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: "center",
      marginBottom: 8,
    },
    groupName: {
      fontSize: 22,
      fontWeight: "700",
      color: c.text,
      textAlign: "center",
      marginBottom: 16,
    },
    errorTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: c.danger,
      textAlign: "center",
      marginBottom: 8,
    },
    error: {
      color: c.danger,
      textAlign: "center",
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
    },
    primaryButtonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 12,
    },
    secondaryButtonText: {
      color: c.text,
      fontSize: 16,
      fontWeight: "600",
    },
  });
