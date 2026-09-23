import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  parseThemePreference,
  resolveTheme,
  themeColors,
  type ThemeColorName,
} from "./theme";

describe("resolveTheme", () => {
  it("follows the system when the preference is system", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("uses an explicit light or dark preference regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("treats missing or invalid stored values as system", () => {
    for (const value of [null, undefined, "", "Dark", "blue", 42, {}]) {
      expect(parseThemePreference(value)).toBe("system");
      expect(resolveTheme(value, true)).toBe("dark");
      expect(resolveTheme(value, false)).toBe("light");
    }
  });
});

describe("theme colors", () => {
  const textPairs: [ThemeColorName, ThemeColorName][] = [
    ["text", "background"],
    ["text", "surface"],
    ["text", "surfaceHover"],
    ["text", "inputBackground"],
    ["textMuted", "background"],
    ["textMuted", "surface"],
    ["textMuted", "inputBackground"],
    ["placeholder", "inputBackground"],
    ["danger", "background"],
    ["danger", "surface"],
    ["danger", "dangerBackground"],
    ["success", "background"],
    ["success", "surface"],
    ["link", "surface"],
    ["onPrimary", "primary"],
    ["onPrimary", "primaryHover"],
    ["onDisabled", "disabled"],
  ];

  for (const theme of ["light", "dark"] as const) {
    it(`meets WCAG AA text contrast in ${theme} mode`, () => {
      for (const [fg, bg] of textPairs) {
        const ratio = contrastRatio(themeColors[theme][fg], themeColors[theme][bg]);
        expect(ratio, `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("has dark mode borders with at least 3:1 contrast against inputs and cards", () => {
    const dark = themeColors.dark;
    for (const bg of ["surface", "background", "inputBackground"] as const) {
      expect(contrastRatio(dark.border, dark[bg])).toBeGreaterThanOrEqual(3);
    }
  });

  it("is identical in the mobile app", () => {
    const extract = (path: string) => {
      const source = readFileSync(path, "utf8");
      const match = source.match(/export const themeColors = \{[\s\S]*?\} as const;/);
      return match?.[0].replace(/\s+/g, "");
    };
    const web = extract(join(__dirname, "theme.ts"));
    const mobile = extract(join(__dirname, "..", "mobile", "lib", "theme.ts"));
    expect(web).toBeTruthy();
    expect(mobile).toBe(web);
  });
});
