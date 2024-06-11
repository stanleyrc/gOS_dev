import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common_en from "./translations/en/common.json";
import signatures_en from "./translations/en/signatures.json";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: "en",
  resources: {
    en: {
      common: common_en, // 'common' is our custom namespace
      signatures: signatures_en, // 'signatures' is our signatures namespace
    },
  },
  interpolation: {
    escapeValue: false,
  },

  wait: true,
});

export default i18n;
