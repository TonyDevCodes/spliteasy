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
    background: "#f4f5fb",
    surface: "#ffffff",
    surfaceHover: "#eceef8",
    text: "#14162b",
    textMuted: "#5b5f7a",
    border: "#e1e3f0",
    primary: "#4338ca",
    primaryHover: "#3730a3",
    onPrimary: "#ffffff",
    disabled: "#e1e3f0",
    onDisabled: "#5b5f7a",
    danger: "#b91c1c",
    dangerBackground: "#fef2f2",
    success: "#047857",
    link: "#4338ca",
    inputBackground: "#ffffff",
    placeholder: "#6b6f8c",
    overlay: "#14162b66",
    hero: "#4338ca",
    onHero: "#ffffff",
  },
  dark: {
    background: "#0b0c1a",
    surface: "#16182e",
    surfaceHover: "#202340",
    text: "#f1f2fa",
    textMuted: "#a3a7c4",
    border: "#2a2d4a",
    primary: "#5f55e8",
    primaryHover: "#4f46e5",
    onPrimary: "#ffffff",
    disabled: "#2a2d4a",
    onDisabled: "#a3a7c4",
    danger: "#f87171",
    dangerBackground: "#3a1020",
    success: "#34d399",
    link: "#a5a0ff",
    inputBackground: "#202340",
    placeholder: "#9a9ebe",
    overlay: "#05060fb3",
    hero: "#4338ca",
    onHero: "#ffffff",
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
