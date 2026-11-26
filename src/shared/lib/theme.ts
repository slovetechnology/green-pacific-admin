import { useEffect } from "react";

export type ThemeMode = "light" | "dark";

// v2: the app used to follow the device's dark setting and saved that automatic pick, so the key changed
// when light became the default. Only a theme the user picks with the toggle is saved now.
const THEME_STORAGE_KEY = "green-pacific-theme-v2";

function readStored(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

/** The signed-in user's saved theme: light unless they chose dark with the theme toggle. */
export function getInitialTheme(): ThemeMode {
  return readStored() ?? "light";
}

/** Applies a theme to the page without saving it. */
export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

/** Applies and remembers a theme the user picked. */
export function saveTheme(theme: ThemeMode) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/**
 * Dark mode is for signed-in people only. Every page starts light (root.tsx); the staff app shell calls
 * this, which applies the saved theme while it is on screen and goes back to light when it unmounts
 * (signing out).
 */
export function useSignedInTheme() {
  useEffect(() => {
    applyTheme(getInitialTheme());
    return () => applyTheme("light");
  }, []);
}
