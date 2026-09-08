import { ENGRAVER_OPTIONS, SLICER_OPTIONS, THEME_OPTIONS, type ThemeSelection } from "../constants/settingsOptions";

export type SlicerSettings = {
  enabled: boolean;
  selected: string;
};

export type EngravingSettings = {
  enabled: boolean;
  selected: string;
};

export type ThemeSettings = {
  selected: ThemeSelection;
};

export type MakerWorldSettings = {
  cookie: string;
};

export type AppSettings = {
  slicer: SlicerSettings;
  engraving: EngravingSettings;
  theme: ThemeSettings;
  makerworld: MakerWorldSettings;
};

const STORAGE_KEY = "printstash_settings";

const DEFAULT_SETTINGS: AppSettings = {
  slicer: {
    enabled: false,
    selected: "orca",
  },
  engraving: {
    enabled: false,
    selected: "lightburn",
  },
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
    const slicer = parsed.slicer || {};
    const selected = typeof slicer.selected === "string" ? slicer.selected : DEFAULT_SETTINGS.slicer.selected;
    const enabled = typeof slicer.enabled === "boolean" ? slicer.enabled : DEFAULT_SETTINGS.slicer.enabled;
    const valid = SLICER_OPTIONS.some(opt => opt.id === selected);
    const engraving = parsed.engraving || {};
    const engravingSelected = typeof engraving.selected === "string"
      ? engraving.selected
      : DEFAULT_SETTINGS.engraving.selected;
    const engravingEnabled = typeof engraving.enabled === "boolean"
      ? engraving.enabled
      : DEFAULT_SETTINGS.engraving.enabled;
    const engravingValid = ENGRAVER_OPTIONS.some(opt => opt.id === engravingSelected);
    const theme = parsed.theme || {};
    const themeSelected = typeof theme.selected === "string" ? theme.selected : DEFAULT_SETTINGS.theme.selected;
    const themeValid = THEME_OPTIONS.some(opt => opt.id === themeSelected);
    const makerworld = parsed.makerworld || {};
    const cookie = typeof makerworld.cookie === "string" ? makerworld.cookie : DEFAULT_SETTINGS.makerworld.cookie;
    return {
      slicer: {
        enabled,
        selected: valid ? selected : DEFAULT_SETTINGS.slicer.selected,
      },
      engraving: {
        enabled: engravingEnabled,
        selected: engravingValid ? engravingSelected : DEFAULT_SETTINGS.engraving.selected,
      },
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
