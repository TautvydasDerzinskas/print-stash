import type { TFunction } from "i18next";
import type { Collection } from "../api/collections";

/** System collections (Favourites / Browsing History) carry an untranslated server-side `name`
 *  fallback -- always prefer the translated label keyed off `system_key` instead. */
export function collectionDisplayName(collection: Collection, t: TFunction): string {
  if (collection.system_key === "favorites") return t("models:collections.system.favorites");
  if (collection.system_key === "history") return t("models:collections.system.history");
  return collection.name;
}
