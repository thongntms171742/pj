import mongoose from "mongoose";

/**
 * Slug helpers — currently duplicated in `adminController.ts`
 * (slugify/ensureUniqueSlug) and `designService.ts`
 * (generateDesignSlug/findUniqueSlug). These two will converge in
 * Phase 2/3, but for Phase 1 we expose a single canonical implementation
 * that both call sites can use.
 */

/**
 * Convert a human-readable name into a URL-friendly slug.
 * - Lowercase
 * - Strip Vietnamese diacritics
 * - Replace non-alphanumerics with single hyphens
 * - Trim leading/trailing hyphens
 * - Truncate to `maxLen` characters
 */
export function slugify(s: string, maxLen = 80): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

/**
 * Ensure `base` is unique in the given Mongoose model. If the base slug
 * already exists, append `-2`, `-3`, ... until a free slug is found.
 *
 * @param model   Mongoose model that has a `slug` field
 * @param base    Candidate slug (will be slugified again for safety)
 * @param root    Fallback when `base` is empty
 */
export async function ensureUniqueSlug(
  model: mongoose.Model<any>,
  base: string,
  root = "item"
): Promise<string> {
  const seed = slugify(base) || root;
  let candidate = seed;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop -- serial, can't parallelize
  while (await model.exists({ slug: candidate })) {
    candidate = `${seed}-${i++}`;
  }
  return candidate;
}
