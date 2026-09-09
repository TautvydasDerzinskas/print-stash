import { useEffect, useState } from "react";
import { settingsApi } from "../api/settings";

// Module-level cache so every mounted "Open in {Slicer}" menu item (one per model card) shares
// a single GET /settings/slicer instead of each firing its own request, and so SlicerPicker can
// push a freshly-saved value into all of them immediately via setCachedSlicerPreference below.
let cached: string | null | undefined; // undefined = not loaded yet
let inFlight: Promise<string | null> | null = null;
const listeners = new Set<(value: string | null) => void>();

function load(): Promise<string | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = settingsApi.getSlicer()
      .then(res => { cached = res.slicer ?? null; return cached; })
      .catch(() => null)
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export function setCachedSlicerPreference(value: string | null) {
  cached = value;
  listeners.forEach(listener => listener(value));
}

/** The user's preferred slicer id (or null if unset/unknown), for the "Open in {Slicer}" model
 *  menu action. Kept up to date across every mounted instance when the Profile page's
 *  SlicerPicker saves a change. */
export function useSlicerPreference(): string | null {
  const [value, setValue] = useState<string | null>(cached ?? null);

  useEffect(() => {
    let cancelled = false;
    void load().then(v => { if (!cancelled) setValue(v); });
    listeners.add(setValue);
    return () => {
      cancelled = true;
      listeners.delete(setValue);
    };
  }, []);

  return value;
}
