import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import lt from "./locales/lt.json";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "../constants/languages";

// Namespaces are split by ownership area rather than kept in one giant file:
// "common" - generic actions/words reused everywhere (Save, Cancel, Delete, ...)
// "app"    - shell chrome: login, sidebar, settings, upload bar, import/zip modals, tag editor
// "library" - the print grid/card, print preview modal + plate switcher, model viewer overlays,
//             LightBurn preview
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en.common, app: en.app, library: en.library },
      lt: { common: lt.common, app: lt.app, library: lt.library },
    },
    ns: ["common", "app", "library"],
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
