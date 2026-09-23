import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "../../lib/supabase";
import { useTheme, useThemedStyles, type ThemeColors } from "../../lib/theme";
import { useAuth } from "../../lib/auth-context";
import { formatBadgeCount } from "../../lib/notifications";
import { useUnreadNotifications } from "../../lib/useUnreadNotifications";

type GroupRow = {
  id: string;
  name: string;
  created_at: string;
};

type MembershipRow = {
  groups: GroupRow | null;
};

type GroupWithMemberCount = GroupRow & { memberCount: number | null };

export default function GroupsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const unreadBadge = formatBadgeCount(useUnreadNotifications(user?.id));

  const [groups, setGroups] = useState<GroupWithMemberCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    // The session user from the auth context: no network call, so a flaky
    // connection cannot make a signed-in user look signed out here.
    if (!authUserId) {
      setLoading(false);
      return;
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("group_members")
      .select("groups(id, name, created_at)")
      .eq("user_id", authUserId)
      .order("created_at", { referencedTable: "groups", ascending: false })
      .returns<MembershipRow[]>();

    if (membershipsError) {
      console.error("Groups query error:", membershipsError);
      setError("Something went wrong loading your groups.");
      setLoading(false);
      return;
    }

    const userGroups = (memberships ?? [])
      .map((m) => m.groups)
      .filter((g): g is GroupRow => g !== null);

    if (userGroups.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }

    const groupIds = userGroups.map((g) => g.id);
    const { data: memberRows, error: memberCountError } = await supabase
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds);

    if (memberCountError) {
      console.error("Member count query error:", memberCountError);
    }

    const countByGroupId: Record<string, number> = {};
    (memberRows ?? []).forEach((row: { group_id: string }) => {
      countByGroupId[row.group_id] = (countByGroupId[row.group_id] ?? 0) + 1;
    });

    setGroups(
      userGroups.map((g) => ({
        ...g,
        memberCount: memberCountError ? null : countByGroupId[g.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [authUserId]);

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [loadGroups])
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Your groups",
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <TouchableOpacity
                onPress={() => router.push("/(app)/notifications")}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel={unreadBadge ? `Notifications, ${unreadBadge} unread` : "Notifications"}
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadBadge}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/(app)/profile")}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/(app)/groups/new")}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>+ New Group</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            You&apos;re not part of any group yet.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push("/(app)/groups/new")}
          >
            <Text style={styles.buttonText}>Create a group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.groupItem}
              onPress={() => router.push(`/(app)/groups/${item.id}`)}
            >
              <Text style={styles.groupName}>{item.name}</Text>
              {item.memberCount !== null && (
                <Text style={styles.groupSubtitle}>
                  {item.memberCount}{" "}
                  {item.memberCount === 1 ? "member" : "members"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
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
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    emptyText: {
      fontSize: 16,
      color: c.textMuted,
      marginBottom: 24,
      textAlign: "center",
    },
    error: {
      color: c.danger,
      padding: 12,
      textAlign: "center",
    },
    listContent: {
      padding: 16,
    },
    groupItem: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    },
    groupName: {
      fontSize: 17,
      fontWeight: "600",
      color: c.text,
    },
    groupSubtitle: {
      fontSize: 14,
      color: c.textMuted,
      marginTop: 4,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 14,
      paddingHorizontal: 32,
      alignItems: "center",
    },
    buttonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    badge: {
      position: "absolute",
      top: -2,
      right: 0,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.danger,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.surface,
    },
    headerRightRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    headerButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
  });
