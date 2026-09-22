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
import { supabase } from "../../lib/supabase";

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
  const router = useRouter();

  const [groups, setGroups] = useState<GroupWithMemberCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("group_members")
      .select("groups(id, name, created_at)")
      .eq("user_id", user.id)
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
  }, []);

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
          <ActivityIndicator size="large" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: "#444",
    marginBottom: 24,
    textAlign: "center",
  },
  error: {
    color: "#c00",
    padding: 12,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  groupItem: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  groupName: {
    fontSize: 17,
    fontWeight: "600",
  },
  groupSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
    color: "#111",
  },
});
