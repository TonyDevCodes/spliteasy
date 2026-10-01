import { useCallback, useState } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "../../components/AppText";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "../../lib/supabase";
import { useTheme, useThemedStyles, type ThemeColors } from "../../lib/theme";
import { Logo } from "../../components/Logo";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonList } from "../../components/Skeleton";
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
          headerTitle: "",
          headerLeft: () => <Logo size={24} withWordmark />,
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
                accessibilityRole="button"
                accessibilityLabel="Profile"
              >
                <Ionicons name="person-circle-outline" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <SkeletonList count={3} label="Loading your groups" />
      ) : groups.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            title="No groups yet"
            description="Create your first group and start splitting costs."
            action={{ label: "Create group", onPress: () => router.push("/(app)/groups/new") }}
          />
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/(app)/groups/new")}
        accessibilityRole="button"
        accessibilityLabel="New group"
      >
        <Ionicons name="add" size={28} color={colors.onHero} />
      </TouchableOpacity>
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
    error: {
      color: c.danger,
      padding: 12,
      textAlign: "center",
    },
    listContent: {
      padding: 16,
      paddingBottom: 96,
    },
    groupItem: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
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
    fab: {
      position: "absolute",
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.hero,
      elevation: 6,
      shadowColor: c.text,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
  });
