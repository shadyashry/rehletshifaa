import type { Locale } from "./i18n";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const dictionaries = { en, ar };
export type Dictionary = typeof en;
export function getDictionary(locale: Locale): Dictionary { return dictionaries[locale]; }

