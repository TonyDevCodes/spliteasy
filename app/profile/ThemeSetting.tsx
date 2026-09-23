"use client";

import { useEffect, useState } from "react";
import {
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";

const LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export default function ThemeSetting() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(readStoredPreference());
  }, []);

  function handleSelect(next: ThemePreference) {
    setPreference(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (e.g. private mode): still apply for this page view.
    }
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", resolveTheme(next, systemPrefersDark));
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">Theme</span>
      <div className="flex gap-2" role="radiogroup" aria-label="Theme">
        {THEME_PREFERENCES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={preference === option}
            onClick={() => handleSelect(option)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              preference === option
                ? "bg-primary text-on-primary"
                : "bg-surface-hover text-text"
            }`}
          >
            {LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
