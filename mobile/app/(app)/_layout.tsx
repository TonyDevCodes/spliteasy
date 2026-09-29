import { Stack } from "expo-router";
import { useTheme } from "../../lib/theme";

// The groups list is always the bottom of the stack, so a screen opened
// directly (e.g. a group from an invite link) still has a back button.
export const unstable_settings = {
  anchor: "index",
};

export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
