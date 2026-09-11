import { useEffect, useState } from "react";
import type { ResolvedTheme, ThemeSelection } from "../constants/settingsOptions";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

/** Turns the user's persisted ThemeSelection into a concrete ResolvedTheme for rendering. "light"
 *  and "dark" pass straight through; "system" tracks window.matchMedia's prefers-color-scheme
 *  live, so switching the OS theme while "Adapt to system" is selected updates the app
 *  immediately, with no reload. */
export function useResolvedTheme(selection: ThemeSelection): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (selection !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [selection]);

  if (selection === "system") return systemDark ? "dark" : "light";
  return selection;
}
