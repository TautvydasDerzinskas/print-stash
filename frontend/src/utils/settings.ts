import { THEME_OPTIONS, type ThemeSelection } from "../constants/settingsOptions";

export type ThemeSettings = {
  selected: ThemeSelection;
};

export type MakerWorldSettings = {
  cookie: string;
};

export type AppSettings = {
  theme: ThemeSettings;
  makerworld: MakerWorldSettings;
};

const STORAGE_KEY = "printstash_settings";

const DEFAULT_SETTINGS: AppSettings = {
  theme: {
    selected: "light",
  },
  makerworld: {
    cookie: "",
  },
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) || {} : {};
    const theme = parsed.theme || {};
    const themeSelected = typeof theme.selected === "string" ? theme.selected : DEFAULT_SETTINGS.theme.selected;
    const themeValid = THEME_OPTIONS.some(opt => opt.id === themeSelected);
    const makerworld = parsed.makerworld || {};
    const cookie = typeof makerworld.cookie === "string" ? makerworld.cookie : DEFAULT_SETTINGS.makerworld.cookie;
    return {
      theme: {
        selected: (themeValid ? themeSelected : DEFAULT_SETTINGS.theme.selected) as ThemeSelection,
      },
      makerworld: {
        cookie,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}
