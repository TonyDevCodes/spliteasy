// Theme tokens and resolution logic. The mobile app keeps an identical copy of
// the tokens in mobile/lib/theme.ts (same names, same values).

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
  },
} as const;

export type ThemeColorName = keyof (typeof themeColors)["light"];

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

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function cssVariables(theme: ResolvedTheme): string {
  return Object.entries(themeColors[theme])
    .map(([name, value]) => `--${toKebab(name)}:${value};`)
    .join("");
}

/**
 * CSS custom properties for both themes. data-theme on <html> is set before
 * first paint by the inline script in the root layout; the media query is only
 * a fallback for when that script cannot run.
 */
export function themeCss(): string {
  return [
    `:root{${cssVariables("light")}color-scheme:light;}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${cssVariables("dark")}color-scheme:dark;}}`,
    `:root[data-theme="dark"]{${cssVariables("dark")}color-scheme:dark;}`,
  ].join("\n");
}

/**
 * Runs in <head> before the page paints: applies the saved theme, and keeps
 * following the OS setting (and other tabs) while the preference is "system".
 * Must stay in sync with resolveTheme() above.
 */
export const themeInitScript = `(function(){
var k=${JSON.stringify(THEME_STORAGE_KEY)};
var mq=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){
var p="system";
try{p=localStorage.getItem(k)||"system";}catch(e){}
if(p!=="light"&&p!=="dark"){p="system";}
var t=p==="system"?(mq.matches?"dark":"light"):p;
document.documentElement.setAttribute("data-theme",t);
}
apply();
mq.addEventListener("change",apply);
window.addEventListener("storage",function(e){if(e.key===k){apply();}});
})();`;

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}
