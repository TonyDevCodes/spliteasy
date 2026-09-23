// Theme tokens and resolution logic. The mobile app keeps an identical copy of
// the tokens in mobile/lib/theme.ts (same names, same values).

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
