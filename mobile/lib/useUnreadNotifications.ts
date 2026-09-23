import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "./supabase";
import { subscribeToTableChanges, uniqueChannelName } from "./realtime";

/** Live count of the user's unread notifications (0 when signed out). */
export function useUnreadNotifications(userId: string | null | undefined): number {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) {
      setUnread(0);
      return;
    }
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      console.error("Unread notifications query error:", error);
      return;
    }
    setUnread(count ?? 0);
  }, [userId]);

  // Refresh when coming back from the Notifications screen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!userId) return;

    const channel = subscribeToTableChanges(
      supabase,
      uniqueChannelName(`notifications-${userId}`),
      ["notifications"],
      load,
      `user_id=eq.${userId}`
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return unread;
}
