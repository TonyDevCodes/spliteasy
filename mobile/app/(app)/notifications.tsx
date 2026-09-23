import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { subscribeToTableChanges, uniqueChannelName } from "../../lib/realtime";
import {
  NOTIFICATION_COLUMNS,
  NO_NOTIFICATIONS_TEXT,
  buildNotificationMessage,
  formatRelativeTime,
  type AppNotification,
} from "../../lib/notifications";
import { useTheme, useThemedStyles, type ThemeColors } from "../../lib/theme";

const PAGE_SIZE = 100;

export default function NotificationsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<AppNotification[]>();

    if (loadError) {
      console.error("Notifications query error:", loadError);
      setError("Something went wrong loading your notifications.");
    } else {
      setError(null);
      setNotifications(data ?? []);
    }
    setNow(new Date());
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!userId) return;

    const channel = subscribeToTableChanges(
      supabase,
      uniqueChannelName(`notifications-list-${userId}`),
      ["notifications"],
      load,
      `user_id=eq.${userId}`
    );
    // Keep "2 min ago" labels fresh while the screen stays open.
    const timer = setInterval(() => setNow(new Date()), 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [userId, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markRead(ids: string[]) {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: readAt } : n))
    );
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", ids)
      .is("read_at", null);
    if (updateError) {
      console.error("Mark notifications read error:", updateError);
      setError("Could not mark notifications as read.");
      load();
    }
  }

  async function handleOpen(notification: AppNotification) {
    if (!notification.read_at) {
      await markRead([notification.id]);
    }
    if (notification.group_id) {
      router.push(`/(app)/groups/${notification.group_id}`);
    }
  }

  async function handleMarkAll() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    await markRead(unreadIds);
    setMarkingAll(false);
  }

  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () => (
            <TouchableOpacity
              onPress={handleMarkAll}
              disabled={!hasUnread || markingAll}
              style={styles.headerButton}
            >
              <Text style={[styles.headerButtonText, (!hasUnread || markingAll) && styles.headerButtonTextDisabled]}>
                Mark all as read
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={notifications.length === 0 ? styles.emptyContent : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
              progressBackgroundColor={colors.surface}
            />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>{NO_NOTIFICATIONS_TEXT}</Text>}
          renderItem={({ item }) => {
            const unread = !item.read_at;
            return (
              <TouchableOpacity
                style={[styles.item, unread && styles.itemUnread]}
                onPress={() => handleOpen(item)}
                accessibilityRole="button"
                accessibilityLabel={`${buildNotificationMessage(item)}${unread ? ", unread" : ""}`}
              >
                <View style={[styles.dot, unread && styles.dotUnread]} />
                <View style={styles.itemBody}>
                  <Text style={[styles.message, unread && styles.messageUnread]}>
                    {buildNotificationMessage(item)}
                  </Text>
                  <Text style={styles.time}>{formatRelativeTime(item.created_at, now)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
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
    },
    listContent: {
      padding: 16,
    },
    emptyContent: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    emptyText: {
      fontSize: 16,
      color: c.textMuted,
      textAlign: "center",
    },
    error: {
      color: c.danger,
      padding: 12,
      textAlign: "center",
    },
    item: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      padding: 12,
      marginBottom: 10,
      backgroundColor: c.surface,
    },
    itemUnread: {
      borderColor: c.link,
      backgroundColor: c.surfaceHover,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
      marginRight: 10,
    },
    dotUnread: {
      backgroundColor: c.link,
    },
    itemBody: {
      flex: 1,
    },
    message: {
      fontSize: 15,
      color: c.text,
    },
    messageUnread: {
      fontWeight: "600",
    },
    time: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
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
    headerButtonTextDisabled: {
      color: c.textMuted,
    },
  });
