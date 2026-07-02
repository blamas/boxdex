import type { Translations } from "../i18n";
import { DEFAULT_LOCALE, useTranslations } from "../i18n";
import { BASE } from "../lib/site";

export function getClientTranslations(): Translations {
  if (typeof window === "undefined") return useTranslations(DEFAULT_LOCALE);
  // Strip the base path so the regex works on subpath deployments (/boxdex/fr/... → /fr/...).
  // (\/|$) also handles the bare locale root (/fr with no trailing slash).
  const path = window.location.pathname.slice(BASE.length);
  const match = path.match(/^\/([a-z]{2})(\/|$)/);
  return useTranslations(match?.[1]);
}
