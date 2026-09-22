// Categories — derived from the MongoDB `categories` collection via /api/categories.
// Hardcoded fallback list below so the UI is functional even before the API
// responds. Kept in sync with backend/seed.ts.

export interface Category {
  slug: string;
  name: string;
  icon: string;
}

// Filter chips used by Header/Search/Home. Includes a synthetic "Tất cả" entry.
export const FILTER_TAGS: string[] = [
  "Tất cả",
  "Áo",
  "Quần",
  "Váy",
  "Áo khoác",
  "Phụ kiện",
  "Độ mới >90%",
  "Gần đây",
];

export const FALLBACK_CATEGORIES: Category[] = [
  { slug: "ao", name: "Áo", icon: "👕" },
  { slug: "quan", name: "Quần", icon: "👖" },
  { slug: "vay", name: "Váy", icon: "👗" },
  { slug: "ao-khoac", name: "Áo khoác", icon: "🧥" },
  { slug: "phu-kien", name: "Phụ kiện", icon: "👜" },
];
