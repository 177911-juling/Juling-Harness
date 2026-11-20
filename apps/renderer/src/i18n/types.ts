import type { AppLanguage } from "../settings/appSettings";
export type { AppLanguage };

/** Interface language with the `system` preference resolved away. */
export type Locale = Exclude<AppLanguage, "system">;

export type TranslationParams = Record<string, string | number>;

export interface I18nContextValue {
  readonly language: AppLanguage;
  readonly resolvedLanguage: Locale;
  readonly t: (key: string, params?: TranslationParams) => string;
  readonly setLanguage: (language: AppLanguage) => void;
}
