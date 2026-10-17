// Barrel re-export — `routes/admin.ts` continues to import from one place.
// Each sub-module below owns one bounded context (tree products, codes,
// variants, orders, users, stats).
//
// All routes in this folder require admin role (enforced by
// `router.use(requireAuth, requireAdmin)` in routes/admin.ts) so we don't
// repeat the check inside every controller.
//
// Sau refactor phụ kiện: đã purge `styles`, `accessories`, `presets`, `categories`.
export * from "./treesLegacy";
export * from "./treeProducts";
export * from "./treeCodes";
export * from "./treeVariants";
export * from "./orders";
export * from "./users";
export * from "./stats";
export * from "./banners";
export * from "./reviews";
