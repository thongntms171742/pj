// Barrel re-export — `routes/admin.ts` continues to import from one place.
// Each sub-module below owns one bounded context (tree products, codes,
// variants, styles, accessories, presets, orders, users, stats).
//
// All routes in this folder require admin role (enforced by
// `router.use(requireAuth, requireAdmin)` in routes/admin.ts) so we don't
// repeat the check inside every controller.
export * from "./treesLegacy";
export * from "./treeProducts";
export * from "./treeCodes";
export * from "./treeVariants";
export * from "./styles";
export * from "./accessories";
export * from "./presets";
export * from "./orders";
export * from "./users";
export * from "./stats";
