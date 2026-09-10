export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "lt", label: "Lietuvių" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "thingport_language";
