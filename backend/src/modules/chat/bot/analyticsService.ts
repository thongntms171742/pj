/**
 * analyticsService.ts — ghi & đọc báo cáo hiệu suất chatbot.
 *
 * Ứng dụng bước 5 của bài hướng dẫn ("Đánh giá và tối ưu"):
 *   - Tỉ lệ trúng intent, tỉ lệ rơi sang AI, tỉ lệ chuyển người thật.
 *   - Độ trễ trung bình theo từng route.
 *   - Danh sách FAQ bị miss để biết cần viết thêm câu trả lời nào.
 *
 * Ghi log là best-effort: lỗi analytics KHÔNG được làm hỏng luồng chat.
 */

import { ChatLog, IChatLog, type ChatRoute } from "../../../models/ChatLog";

export interface ChatAnalyticsInput {
  conversationId: string;
  input: string;
  normalized?: string;
  intent?: string;
  confidence?: number;
  route: ChatRoute;
  slots?: Record<string, unknown>;
  latencyMs: number;
  toolsUsed?: string[];
  escalated?: boolean;
  reason?: string;
}

/**
 * Ghi 1 dòng analytics. Nuốt lỗi để không ảnh hưởng luồng chat.
 */
export async function logChatEvent(data: ChatAnalyticsInput): Promise<void> {
  try {
    await ChatLog.create({
      conversationId: data.conversationId,
      input: (data.input || "").slice(0, 2000),
      normalized: data.normalized || "",
      intent: data.intent,
      confidence: data.confidence,
      route: data.route,
      slots: data.slots || {},
      latencyMs: Math.max(0, Math.round(data.latencyMs || 0)),
      toolsUsed: data.toolsUsed || [],
      escalated: Boolean(data.escalated),
      reason: data.reason,
    });
  } catch (err) {
    console.warn("[chatAnalytics] Không ghi được log analytics:", (err as Error)?.message);
  }
}

export interface AnalyticsSummary {
  /** Tổng số lượt hội thoại. */
  total: number;
  /** Tỉ lệ theo route (0..1). */
  routeRates: Record<string, number>;
  /** Số lượt theo route. */
  routeCounts: Record<string, number>;
  /** Top intent (kèm số lượt). */
  topIntents: Array<{ intent: string; count: number }>;
  /** Độ trễ trung bình (ms) theo route. */
  avgLatencyMs: Record<string, number>;
  /** Tỉ lệ escalate. */
  escalationRate: number;
  /** Điểm CSAT trung bình (null nếu chưa có). */
  avgSatisfaction: number | null;
  /** Số lượng đã ghi nhận. */
  windowDays: number;
}

/**
 * Tổng hợp analytics trong N ngày gần nhất.
 */
export async function getAnalyticsSummary(windowDays = 7): Promise<AnalyticsSummary> {
  const days = Math.min(90, Math.max(1, windowDays));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = (await ChatLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        escalated: { $sum: { $cond: ["$escalated", 1, 0] } },
        byRoute: {
          $push: {
            route: "$route",
            latencyMs: "$latencyMs",
            escalated: "$escalated",
          },
        },
        byIntent: { $push: "$intent" },
        satisfactions: { $push: "$satisfaction" },
      },
    },
  ])) as any[];

  if (!rows.length) {
    return {
      total: 0,
      routeRates: {},
      routeCounts: {},
      topIntents: [],
      avgLatencyMs: {},
      escalationRate: 0,
      avgSatisfaction: null,
      windowDays: days,
    };
  }

  const row = rows[0];
  const total: number = row.total || 0;

  const routeCounts: Record<string, number> = {};
  const latencySum: Record<string, number> = {};
  const latencyCount: Record<string, number> = {};

  for (const item of row.byRoute || []) {
    const r = item.route || "UNKNOWN";
    routeCounts[r] = (routeCounts[r] || 0) + 1;
    latencySum[r] = (latencySum[r] || 0) + (item.latencyMs || 0);
    latencyCount[r] = (latencyCount[r] || 0) + 1;
  }

  const routeRates: Record<string, number> = {};
  for (const [r, c] of Object.entries(routeCounts)) {
    routeRates[r] = total > 0 ? Number((c / total).toFixed(4)) : 0;
  }

  const avgLatencyMs: Record<string, number> = {};
  for (const [r, sum] of Object.entries(latencySum)) {
    avgLatencyMs[r] = Math.round(sum / (latencyCount[r] || 1));
  }

  const intentCounts: Record<string, number> = {};
  for (const intent of row.byIntent || []) {
    if (!intent) continue;
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }
  const topIntents = Object.entries(intentCounts)
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const ratings = (row.satisfactions || []).filter(
    (s: unknown) => typeof s === "number" && s >= 1 && s <= 5
  );
  const avgSatisfaction = ratings.length
    ? Number((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(2))
    : null;

  return {
    total,
    routeRates,
    routeCounts,
    topIntents,
    avgLatencyMs,
    escalationRate: total > 0 ? Number(((row.escalated || 0) / total).toFixed(4)) : 0,
    avgSatisfaction,
    windowDays: days,
  };
}

/**
 * Các intent hay rơi sang AI ⇒ ứng viên cần bổ sung FAQ.
 */
export async function getAiFallbackGaps(limit = 10): Promise<
  Array<{ intent: string; count: number; sampleInputs: string[] }>
> {
  const rows = (await ChatLog.aggregate([
    { $match: { route: { $in: ["AI", "FALLBACK"] } } },
    { $group: { _id: "$intent", count: { $sum: 1 }, samples: { $push: "$input" } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ])) as any[];

  return rows.map((r) => ({
    intent: r._id || "unknown",
    count: r.count || 0,
    sampleInputs: (r.samples || []).slice(0, 3),
  }));
}
