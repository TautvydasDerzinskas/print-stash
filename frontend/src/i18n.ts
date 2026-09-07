import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import commonEn from "./locales/en/common.json";
import appEn from "./locales/en/app.json";
import libraryEn from "./locales/en/library.json";
import commonLt from "./locales/lt/common.json";
import appLt from "./locales/lt/app.json";
import libraryLt from "./locales/lt/library.json";
import { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from "./constants/languages";

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
      en: { common: commonEn, app: appEn, library: libraryEn },
      lt: { common: commonLt, app: appLt, library: libraryLt },
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
