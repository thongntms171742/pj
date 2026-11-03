/**
 * knowledge.service.ts — truy cập & retrieval kho tri thức (TDD §6.5).
 *
 * 2 tầng:
 *   1. `matchKnowledge` — rule/keyword scoring (0 token, <300ms) ⇒ dùng cho
 *      tool `policySearch` khi AI cần nguồn sự thật nhanh.
 *   2. `searchKnowledge` — MongoDB `$text` search ⇒ dùng khi câu hỏi mơ hồ.
 *
 * Cache in-memory TTL 60s: admin sửa tài liệu ⇒ gọi `invalidateKnowledgeCache()`.
 *
 * KHÔNG được bịa: mọi thứ AI nói về chính sách đều phải từ đây.
 */

import {
  KnowledgeDocument,
  type IKnowledgeDocument,
  type KnowledgeCategory,
} from "../../../models/KnowledgeDocument";
import { FEATURE_KNOWLEDGE_BASE } from "../../../config/ai.config";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string;
  title: string;
  slug: string;
  category: KnowledgeCategory;
  summary: string;
  content: string;
  keywords: string[];
  tags: string[];
  priority: number;
  version: number;
}

export interface KnowledgeMatch {
  entry: KnowledgeEntry;
  /** Điểm khớp (đã cộng priority/100). */
  score: number;
  /** Các từ khoá đã khớp. */
  matched: string[];
}

// ── Normalize ─────────────────────────────────────────────────────────────────

/** Bỏ dấu + lowercase + gộp khoảng trắng. */
export function canon(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000;

let cache: KnowledgeEntry[] | null = null;
let cacheExpiry = 0;

/** Xoá cache (gọi sau khi admin sửa/xoá tài liệu). */
export function invalidateKnowledgeCache(): void {
  cache = null;
  cacheExpiry = 0;
}

/** Load tất cả tài liệu đang publish (có cache). */
export async function loadPublishedKnowledge(): Promise<KnowledgeEntry[]> {
  const now = Date.now();
  if (cache && now < cacheExpiry) return cache;

  const docs = (await KnowledgeDocument.find({
    status: "published",
    isActive: true,
  })
    .sort({ priority: -1 })
    .lean()) as unknown as IKnowledgeDocument[];

  cache = docs.map((d) => ({
    id: String(d._id),
    title: d.title,
    slug: d.slug,
    category: d.category,
    summary: d.summary ?? "",
    content: d.content ?? "",
    keywords: (d.keywords ?? []).map(canon).filter(Boolean),
    tags: (d.tags ?? []).filter(Boolean),
    priority: d.priority ?? 0,
    version: d.version ?? 1,
  }));

  cacheExpiry = now + CACHE_TTL_MS;
  return cache;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Chấm điểm 1 tài liệu với 1 câu hỏi (đã chuẩn hoá).
 *
 * - Mỗi keyword khớp → +1.
 * - Cụm từ trùng `title` → +2 (mạnh hơn).
 * - `priority` của admin được cộng (chia 100) ⇒ admin đẩy tài liệu cụ thể
 *   lên trên tài liệu chung.
 */
export function scoreKnowledge(
  entry: KnowledgeEntry,
  haystackCanon: string
): { raw: number; effective: number } {
  let raw = 0;
  for (const kw of entry.keywords) {
    if (kw && haystackCanon.includes(kw)) raw += 1;
  }

  const titleCanon = canon(entry.title);
  if (titleCanon && haystackCanon.includes(titleCanon)) raw += 2;

  return { raw, effective: raw + entry.priority / 100 };
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Tìm tài liệu khớp nhất với 1 câu hỏi.
 * Trả `null` nếu không tài liệu nào khớp keyword nào.
 */
export async function matchKnowledge(
  query: string,
  options: { category?: KnowledgeCategory; limit?: number } = {}
): Promise<KnowledgeMatch[]> {
  if (!FEATURE_KNOWLEDGE_BASE) return [];

  const entries = await loadPublishedKnowledge();
  if (entries.length === 0) return [];

  const haystack = canon(query);
  if (!haystack) return [];

  const pool = options.category
    ? entries.filter((e) => e.category === options.category)
    : entries;

  const matches: KnowledgeMatch[] = [];

  for (const entry of pool) {
    const { raw, effective } = scoreKnowledge(entry, haystack);
    if (raw <= 0) continue;

    const matched = entry.keywords.filter((kw) => haystack.includes(kw));
    matches.push({ entry, score: effective, matched });
  }

  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, options.limit ?? 3);
}

/**
 * Tìm kiếm toàn văn (fallback khi keyword không khớp).
 * Dùng MongoDB `$text` — cần text index (đã khai báo trong schema).
 */
export async function searchKnowledge(
  query: string,
  options: { category?: KnowledgeCategory; limit?: number } = {}
): Promise<KnowledgeMatch[]> {
  if (!FEATURE_KNOWLEDGE_BASE) return [];

  const trimmed = (query ?? "").trim();
  if (!trimmed) return [];

  const filter: Record<string, unknown> = {
    status: "published",
    isActive: true,
    $text: { $search: trimmed },
  };
  if (options.category) filter.category = options.category;

  let docs: IKnowledgeDocument[];
  try {
    docs = (await KnowledgeDocument.find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } })
      .limit(options.limit ?? 3)
      .lean()) as unknown as IKnowledgeDocument[];
  } catch {
    // Text index chưa được build ⇒ fallback về keyword matching.
    return matchKnowledge(query, options);
  }

  return docs.map((d) => ({
    entry: {
      id: String(d._id),
      title: d.title,
      slug: d.slug,
      category: d.category,
      summary: d.summary ?? "",
      content: d.content ?? "",
      keywords: (d.keywords ?? []).map(canon).filter(Boolean),
      tags: (d.tags ?? []).filter(Boolean),
      priority: d.priority ?? 0,
      version: d.version ?? 1,
    },
    score: 1,
    matched: [],
  }));
}

/**
 * Tìm kiếm "thông minh": thử keyword trước, không khớp mới dùng full-text.
 */
export async function retrieveKnowledge(
  query: string,
  options: { category?: KnowledgeCategory; limit?: number } = {}
): Promise<KnowledgeMatch[]> {
  const keywordMatches = await matchKnowledge(query, options);
  if (keywordMatches.length > 0) return keywordMatches;
  return searchKnowledge(query, options);
}

export { KnowledgeDocument };
