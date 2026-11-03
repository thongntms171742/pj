/**
 * copy.ts — nguồn nội dung hội thoại DUY NHẤT cho bot.
 *
 * Trước refactor Hybrid, câu chào + quickReplies bị hard-code rải ở:
 *   - modules/chat/services/conversationService.ts  (sendWelcomeMessage)
 *   - services/ai/chatbotService.ts                   (handleFallbackBotResponse)
 * Mọi thay đổi copy giờ chỉ sửa ở file này.
 */

/** Tên hiển thị của bot (dùng cho sender.name + DTO peer). */
export const BOT_NAME = "Trợ lý AI";

/** Tên hiển thị của người gửi hệ thống. */
export const SYSTEM_NAME = "Hệ thống";

/** Nội dung chào mừng khi mở hội thoại AI mới. */
export const WELCOME_CONTENT =
  "Xin chào! Tôi là trợ lý ảo của Build Your Christmas. Tôi có thể giúp gì cho anh/chị hôm nay ạ? Anh/chị có thể hỏi về tư vấn cây thông, giá cả, hoặc tra cứu đơn hàng nhé!";

/** Quick replies mặc định (mở hội thoại + fallback). */
export const DEFAULT_QUICK_REPLIES: ReadonlyArray<string> = [
  "Tư vấn cây ",
  "Tra cứu đơn hàng",
  "Gặp nhân viên hỗ trợ",
];

/** Quick replies sau khi bot đã tư vấn xong, gợi ý bước tiếp theo. */
export const CONSULT_FOLLOWUP_REPLIES: ReadonlyArray<string> = [
  "Tư vấn thêm mẫu khác",
  "Tra cứu đơn hàng",
  "Gặp nhân viên hỗ trợ",
];

/** Quick replies cho node tra cứu đơn hàng. */
export const ORDER_LOOKUP_REPLIES: ReadonlyArray<string> = [
  "Tra cứu đơn hàng",
  "Tư vấn cây thông Noel",
  "Gặp nhân viên hỗ trợ",
];

/** Reply khi bot chưa hiểu yêu cầu. */
export const UNKNOWN_INTENT_REPLY =
  "Dạ em chưa nắm rõ lắm anh/chị muốn hỏi về gì ạ? Anh/chị có thể chọn một trong các mục em gợi ý bên dưới, hoặc gõ rõ nội dung cần tư vấn nhé! 🎄";

/** Reply khi AI lỗi / mất API key — vẫn phải trả lời được. */
export const AI_UNAVAILABLE_REPLY =
  "Dạ em đang gặp chút trục trặc kỹ thuật ạ. Anh/chị có thể chọn một trong các mục em gợi ý bên dưới, hoặc bấm “Gặp nhân viên hỗ trợ” để được tư vấn viên phản hồi nhanh hơn nhé! 🎄";

/** Reply khi chuyển tiếp tư vấn viên. */
export const ESCALATION_REPLY =
  "Dạ vâng, em đã gửi yêu cầu kết nối với chuyên viên tư vấn rồi ạ. Anh/chị đợi trong giây lát, nhân viên sẽ vào hỗ trợ mình ngay nhé! 👩‍💼";

/** Nội dung tin hệ thống khi escalate. */
export const ESCALATION_SYSTEM_CONTENT =
  "Đã gửi yêu cầu kết nối với tư vấn viên. Vui lòng chờ trong giây lát...";

/** Reply chào lại (intent GREETING). */
export const GREETING_REPLY =
  "Chào anh/chị! 🎄 Em là trợ lý ảo của Build Your Christmas. Em có thể tư vấn cây thông, tra cứu đơn hàng, hoặc giải đáp các câu hỏi thường gặp. Anh/chị cần em hỗ trợ gì ạ?";

/** Reply yêu cầu thông tin để tra cứu đơn. */
export const ORDER_LOOKUP_PROMPT =
  "Dạ, anh/chị có thể gửi giúp em Mã đơn hàng (ví dụ: BYC-2026-9812) hoặc Số điện thoại đặt hàng để em tra cứu trạng thái đơn ngay ạ! 📦";

/** Reply hỏi kích thước / ngân sách. */
export const CONSULT_PROMPT =
  "Dạ em hiểu rồi ạ! Để em tư vấn chính xác, anh/chị cho em biết cây cao khoảng bao nhiêu (VD: 1m8, 1m65) và ngân sách dự kiến của mình là bao nhiêu nhé? 🎄";

/** Reply CSAT (sau khi cuộc trò chuyện được xử lý xong). */
export const CSAT_PROMPT =
  "Cảm ơn anh/chị đã liên hệ Build Your Christmas! 🎄 Anh/chị đánh giá trải nghiệm hỗ trợ hôm nay được mấy điểm ạ (1 = rất không hài lòng, 5 = rất hài lòng)?";

/** Format tiền VNĐ dùng chung. */
export function formatVnd(amount: number | undefined | null): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("vi-VN")}đ`;
}
