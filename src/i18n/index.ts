import { BASE } from "../lib/site";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export type Translations = typeof en;

// Add a locale here + a matching src/i18n/locales/<code>.json to support a new language.
// DEFAULT_LOCALE must also match astro.config.mjs i18n.defaultLocale.
const locales: Record<string, Translations> = { en, fr };
export const LOCALES = Object.keys(locales) as string[];
export const DEFAULT_LOCALE = "en";

export function localeStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale } }));
}

export function useTranslations(locale: string | undefined): Translations {
  return locales[locale ?? DEFAULT_LOCALE] ?? locales[DEFAULT_LOCALE];
}

export function useLocale(params: { locale?: string | undefined }) {
  const locale = params.locale ?? DEFAULT_LOCALE;
  return { locale, t: useTranslations(locale), localeBase: `${BASE}/${locale}` };
}

export function tt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
