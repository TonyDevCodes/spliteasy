import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A channel name unique to this subscription instance. Reusing a fixed name
 * across mounts can race with the previous mount's async removeChannel(),
 * causing "cannot add postgres_changes callbacks ... after subscribe()".
 */
export function uniqueChannelName(base: string): string {
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Subscribes to postgres_changes on the given tables under one channel.
 * All .on() handlers are registered before .subscribe(), and the channel
 * name is expected to be unique per mount (see uniqueChannelName).
 */
export function subscribeToTableChanges(
  supabase: SupabaseClient,
  channelName: string,
  tables: string[],
  onChange: () => void
) {
  let channel = supabase.channel(channelName);

  tables.forEach((table) => {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      onChange
    );
  });

  channel.subscribe();

  return channel;
}
