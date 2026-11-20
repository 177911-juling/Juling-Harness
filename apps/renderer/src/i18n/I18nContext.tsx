import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import { zh } from "./locales/zh";
import { en } from "./locales/en";
import { ru } from "./locales/ru";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { hi } from "./locales/hi";
import type { AppLanguage, I18nContextValue, Locale, TranslationParams } from "./types";
import { getAppSettings, useAppSettings } from "../settings/appSettings";

const dictionaries: Record<Locale, typeof zh> = {
  zh,
  en,
  ru,
  ja,
  ko,
  hi,
};

export function detectSystemLanguage(): Locale {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const lang = (nav?.language || (nav?.languages && nav.languages[0]) || "").toLowerCase();
    for (const code of ["zh", "en", "ru", "ja", "ko", "hi"] as const) {
      if (lang.startsWith(code)) return code;
    }
  } catch {
    /* fallback to English if navigator is not accessible */
  }
  return "en";
}

export function resolveLanguage(preference?: AppLanguage): Locale {
  if (preference !== undefined && preference !== "system") {
    return preference;
  }
  return detectSystemLanguage();
}

export function activeLanguage(): Locale {
  return resolveLanguage(getAppSettings().language);
}

export function isZh(): boolean {
  return activeLanguage() === "zh";
}

export function pickLocale<T>(zhValue: T, enValue: T): T {
  return activeLanguage() === "zh" ? zhValue : enValue;
}

function lookupKey(dict: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

export function formatTranslation(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in params ? String(params[key]) : match;
  });
}

export function translate(locale: Locale, key: string, params?: TranslationParams): string {
  const dict = dictionaries[locale] ?? dictionaries.en;
  const direct = lookupKey(dict as unknown as Record<string, unknown>, key);
  if (direct !== undefined) {
    return formatTranslation(direct, params);
  }
  // Fallback to English, then Chinese.
  const fallbackDict = locale === "zh" ? dictionaries.en : (locale === "en" ? dictionaries.zh : dictionaries.en);
  const fallback = lookupKey(fallbackDict as unknown as Record<string, unknown>, key);
  if (fallback !== undefined) {
    return formatTranslation(fallback, params);
  }
  // If key not found at all, return the key itself
  return key;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const HTML_LANG: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
  ru: "ru",
  ja: "ja",
  ko: "ko",
  hi: "hi",
};

const WORKBENCH_TITLE: Record<Locale, string> = {
  zh: "Juling Harness — 工作台",
  en: "Juling Harness — Workbench",
  ru: "Juling Harness — Рабочее место",
  ja: "Juling Harness — ワークベンチ",
  ko: "Juling Harness — 워크벤치",
  hi: "Juling Harness — वर्कबेंच",
};

export function I18nProvider({ children, forcedLanguage }: { children: ReactNode; forcedLanguage?: AppLanguage }) {
  const { settings, update } = useAppSettings();
  const language = forcedLanguage ?? settings.language;
  const resolvedLanguage = resolveLanguage(language);

  useLayoutEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = HTML_LANG[resolvedLanguage];
      document.title = WORKBENCH_TITLE[resolvedLanguage];
    }
    if (forcedLanguage === undefined) {
      /* Native menus and window chrome only speak zh/en today. */
      void globalThis.julingHarnessChrome?.setLanguage?.(resolvedLanguage === "zh" ? "zh" : "en");
    }
  }, [resolvedLanguage, forcedLanguage]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      language,
      resolvedLanguage,
      t: (key: string, params?: TranslationParams) => translate(resolvedLanguage, key, params),
      setLanguage: (next: AppLanguage) => update({ language: next }),
    };
  }, [language, resolvedLanguage, update]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context !== null) {
    return context;
  }
  // Fallback when used outside provider
  const resolvedLanguage = detectSystemLanguage();
  return {
    language: "system",
    resolvedLanguage,
    t: (key: string, params?: TranslationParams) => translate(resolvedLanguage, key, params),
    setLanguage: () => undefined,
  };
}
