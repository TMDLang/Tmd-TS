import { en } from "./locales/en.js";
import { zhTW } from "./locales/zh-TW.js";

export type Locale = "en" | "zh-TW";

export const translations = {
  en,
  "zh-TW": zhTW,
};

let currentLocale: Locale = "en";
const changeListeners: Array<(lang: Locale) => void> = [];

export function detectLanguage(): Locale {
  const saved = localStorage.getItem("tmd-locale") as Locale | null;
  if (saved && (saved === "en" || saved === "zh-TW")) {
    return saved;
  }

  const langParam = new URLSearchParams(window.location.search).get("lang");
  if (langParam) {
    if (/^(zh|tw|hant)/i.test(langParam)) return "zh-TW";
    if (/^en/i.test(langParam)) return "en";
  }

  const navLanguages = navigator.languages?.length ? navigator.languages : [navigator.language || ""];
  for (const lang of navLanguages) {
    if (/^zh(-|_)?(tw|hk|mo|hant)|^zh$/i.test(lang.trim())) return "zh-TW";
    if (/^en/i.test(lang.trim())) return "en";
  }

  return "en";
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}

export function t(key: keyof typeof en, params?: Record<string, string | number>): string {
  const dict = translations[currentLocale] || translations["en"];
  let str: string = dict[key] || translations["zh-TW"][key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

export function onLanguageChange(fn: (lang: Locale) => void) {
  changeListeners.push(fn);
}

export function applyI18n(lang: Locale) {
  currentLocale = lang;
  localStorage.setItem("tmd-locale", lang);
  const dict = translations[lang];

  document.documentElement.lang = lang;
  document.title = dict.pageTitle;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", dict.pageDescription);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", dict.pageTitle);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", dict.pageDescription);

  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", dict.pageTitle);

  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute("content", dict.pageDescription);

  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute("content", lang === "zh-TW" ? "zh_TW" : "en_US");

  // [data-i18n]
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as keyof typeof en;
    if (key && typeof dict[key] === "string") {
      if (el.dataset.i18nHtml === "true") {
        el.innerHTML = dict[key];
      } else {
        el.textContent = dict[key];
      }
    }
  });

  // [data-i18n-title]
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle as keyof typeof en;
    if (key && typeof dict[key] === "string") {
      el.title = dict[key];
    }
  });

  // [data-i18n-aria-label]
  document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel as keyof typeof en;
    if (key && typeof dict[key] === "string") {
      el.setAttribute("aria-label", dict[key]);
    }
  });

  // [data-i18n-placeholder]
  document.querySelectorAll<HTMLInputElement>("input[data-i18n-placeholder], textarea[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder as keyof typeof en;
    if (key && typeof dict[key] === "string") {
      el.placeholder = dict[key];
    }
  });

  changeListeners.forEach((listener) => listener(lang));
}
