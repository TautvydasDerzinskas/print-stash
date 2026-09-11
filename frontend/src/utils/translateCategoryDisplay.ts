import type { i18n as I18n } from "i18next";
import type { Category } from "../api/categories";

export type CategoryDisplayText = {
  name: string;
  metaTitle: string | null;
  metaDescription: string | null;
};

type DefaultCategoryText = { name: string; metaTitle: string; metaDescription: string };

function firstMakerworldCatId(category: Category): number | null {
  const first = category.makerworld_cat_ids.split(";")[0]?.trim();
  if (!first) return null;
  const id = Number(first);
  return Number.isFinite(id) ? id : null;
}

/** Looks up one locale's text for a starter category by its MakerWorld id, straight from
 * i18next's own loaded resources (i18n/locales/en.json and lt.json's models.defaultCategories.*
 * -- both are always loaded, not just the active language, so "en" is available as the
 * reference text even while the UI itself is running in Lithuanian). */
function defaultCategoryText(i18n: I18n, lng: string, id: number): DefaultCategoryText | undefined {
  return i18n.getResourceBundle(lng, "models")?.defaultCategories?.[id];
}

/** Swaps in the built-in starter category tree's Lithuanian text (see
 * i18n/locales/lt.json's models.defaultCategories) wherever the current language is Lithuanian
 * AND the category's stored field still matches that category's original English text verbatim --
 * i.e. the user hasn't renamed it or rewritten its meta text. There's no way to translate a
 * category someone typed themselves (name, metaTitle, and metaDescription are each checked and
 * swapped independently, so editing just one of the three still translates the other two).
 * English needs no lookup at all: the seed data a fresh account gets *is* English, so the stored
 * value already is the answer. */
export function translateCategoryDisplay(category: Category, i18n: I18n): CategoryDisplayText {
  const stored: CategoryDisplayText = {
    name: category.name,
    metaTitle: category.meta_title,
    metaDescription: category.meta_description,
  };

  const lang = i18n.language.slice(0, 2).toLowerCase();
  if (lang !== "lt") return stored; // only Lithuanian has a translation table today

  const id = firstMakerworldCatId(category);
  if (id === null) return stored;
  const en = defaultCategoryText(i18n, "en", id);
  const lt = defaultCategoryText(i18n, "lt", id);
  if (!en || !lt) return stored;

  return {
    name: category.name === en.name ? lt.name : category.name,
    metaTitle: category.meta_title === en.metaTitle ? lt.metaTitle : category.meta_title,
    metaDescription: category.meta_description === en.metaDescription ? lt.metaDescription : category.meta_description,
  };
}
