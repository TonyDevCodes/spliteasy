// Theme tokens, resolution logic and the theme context. The tokens are an
// identical copy of lib/theme.ts in the web app (same names, same values).
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "spliteasy-theme";

export const themeColors = {
  light: {
    background: "#fafafa",
    surface: "#ffffff",
    surfaceHover: "#f4f4f5",
    text: "#0a0a0a",
    textMuted: "#52525b",
    border: "#d4d4d8",
    primary: "#18181b",
    primaryHover: "#3f3f46",
    onPrimary: "#ffffff",
    disabled: "#e4e4e7",
    onDisabled: "#52525b",
    danger: "#b91c1c",
    dangerBackground: "#fef2f2",
    success: "#15803d",
    link: "#2563eb",
    inputBackground: "#ffffff",
    placeholder: "#71717a",
  },
  dark: {
    background: "#09090b",
    surface: "#18181b",
    surfaceHover: "#27272a",
    text: "#fafafa",
    textMuted: "#a1a1aa",
    border: "#71717a",
    primary: "#fafafa",
    primaryHover: "#d4d4d8",
    onPrimary: "#18181b",
    disabled: "#3f3f46",
    onDisabled: "#d4d4d8",
    danger: "#f87171",
    dangerBackground: "#450a0a",
    success: "#4ade80",
    link: "#60a5fa",
    inputBackground: "#27272a",
    placeholder: "#a1a1aa",
  },
} as const;

export type ThemeColorName = keyof (typeof themeColors)["light"];
export type ThemeColors = Record<ThemeColorName, string>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Anything that is not a known preference (missing, corrupted) means "system". */
export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

export function resolveTheme(
  preference: unknown,
  systemPrefersDark: boolean
): ResolvedTheme {
  const parsed = parseThemePreference(preference);
  if (parsed === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return parsed;
}

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  theme: ResolvedTheme;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => setPreferenceState(parseThemePreference(stored)))
      .catch((error) => console.error("Load theme preference error:", error))
      .finally(() => setLoaded(true));
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch((error) =>
      console.error("Save theme preference error:", error)
    );
  }, []);

  const theme = resolveTheme(preference, systemScheme === "dark");

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, theme, colors: themeColors[theme] }),
    [preference, setPreference, theme]
  );

  // Wait for the saved preference so the wrong theme never flashes.
  if (!loaded) return null;

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}

/** Builds a StyleSheet from the current theme colors, rebuilt only when the theme changes. */
export function useThemedStyles<T>(makeStyles: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [makeStyles, colors]);
}
