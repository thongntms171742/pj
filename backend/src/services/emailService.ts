/**
 * emailService.ts — gửi email OTP trực tiếp từ tài khoản Gmail qua
 * Google Apps Script Web App Webhook (hoặc webhook HTTPS bất kỳ).
 *
 * Cách hoạt động:
 *   - Đặt `EMAIL_WEBHOOK_URL` = URL Web App triển khai từ Google Apps Script
 *     (trên chính tài khoản Gmail của shop, gọi `MailApp.sendEmail`).
 *   - Đặt `EMAIL_WEBHOOK_SECRET` (khuyên dùng) để xác thực payload trong body JSON.
 *   - Khi dev/test chưa cấu hình `EMAIL_WEBHOOK_URL`, hệ thống fallback log ra console.
 */

export type EmailProvider = "webhook" | "console-fallback";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  provider: EmailProvider;
  delivered: boolean;
}

export class EmailDeliveryError extends Error {
  public readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = status;
  }
}

export type EmailTransportFn = (input: SendEmailInput) => Promise<SendEmailResult>;

let testTransportOverride: EmailTransportFn | null = null;

/** Cho phép unit test giả lập transport gửi mail (không gọi mạng thật). */
export function setEmailTransportForTest(fn: EmailTransportFn | null): void {
  testTransportOverride = fn;
}

function getWebhookUrl(): string {
  return process.env.EMAIL_WEBHOOK_URL?.trim() || "";
}

function getWebhookSecret(): string {
  return process.env.EMAIL_WEBHOOK_SECRET?.trim() || "";
}

export function isEmailProviderConfigured(): boolean {
  const url = getWebhookUrl();
  return /^https?:\/\//i.test(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_EMAIL_OUTAGE_MESSAGE = "Dịch vụ gửi email tạm thời gián đoạn";

function looksLikeHtml(body: string, contentType?: string | null): boolean {
  if (contentType && /\btext\/html\b/i.test(contentType)) return true;
  const trimmed = body.trim();
  if (!trimmed) return false;
  return (
    /^(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]|<style[\s>]|<div[\s>])/i.test(
      trimmed
    ) || /<\/(html|body|head|title|script|div)>/i.test(trimmed)
  );
}

async function sendViaWebhook(input: SendEmailInput): Promise<SendEmailResult> {
  const webhookUrl = getWebhookUrl();
  if (!/^https?:\/\//i.test(webhookUrl)) {
    throw new EmailDeliveryError(
      "EMAIL_WEBHOOK_URL phải là URL http/https hợp lệ",
      503
    );
  }

  const secret = getWebhookSecret();
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(secret ? { secret } : {}),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  const contentType = res.headers?.get?.("content-type");

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[email] Webhook HTTP ${res.status} (${res.statusText || "error"}):`,
      errText.slice(0, 2000)
    );
    throw new EmailDeliveryError(SAFE_EMAIL_OUTAGE_MESSAGE, 502);
  }

  // Google Apps Script thường trả HTTP 200 kể cả khi script báo lỗi trong JSON,
  // hoặc trả trang HTML đăng nhập nếu deployment chưa mở quyền "Anyone".
  const rawBody = await res.text().catch(() => "");
  if (rawBody) {
    if (looksLikeHtml(rawBody, contentType)) {
      console.error(
        `[email] Webhook trả HTML ngoài dự kiến (HTTP ${res.status}):`,
        rawBody.slice(0, 2000)
      );
      throw new EmailDeliveryError(SAFE_EMAIL_OUTAGE_MESSAGE, 502);
    }

    try {
      const parsed = JSON.parse(rawBody) as { ok?: boolean; error?: unknown };
      if (parsed && parsed.ok === false) {
        const rawErr = typeof parsed.error === "string" ? parsed.error.trim() : "";
        console.error("[email] Webhook từ chối gửi mail:", rawErr || parsed.error);
        const safeErr =
          rawErr && !looksLikeHtml(rawErr) && rawErr.length <= 200
            ? `Email webhook từ chối: ${rawErr}`
            : SAFE_EMAIL_OUTAGE_MESSAGE;
        throw new EmailDeliveryError(safeErr, 502);
      }
    } catch (err) {
      if (err instanceof EmailDeliveryError) throw err;
      // Response text thuần (VD: "OK") → coi như thành công.
    }
  }

  return {
    provider: "webhook",
    delivered: true,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (testTransportOverride) {
    return testTransportOverride(input);
  }

  if (getWebhookUrl()) {
    return sendViaWebhook(input);
  }

  const allowConsoleInProd =
    process.env.EMAIL_CONSOLE_FALLBACK?.trim().toLowerCase() === "true";
  if (process.env.NODE_ENV === "production" && !allowConsoleInProd) {
    throw new EmailDeliveryError(
      "Dịch vụ gửi email chưa được cấu hình (cần EMAIL_WEBHOOK_URL)",
      503
    );
  }

  console.info(
    `[email][console-fallback] to=${input.to} subject="${input.subject}"\n${input.text}`
  );
  return {
    provider: "console-fallback",
    delivered: false,
  };
}

const DEFAULT_PUBLIC_BACKEND_URL = "https://christmas-8ca4.onrender.com";

export function getEmailLogoUrl(): string {
  const explicit = process.env.EMAIL_LOGO_URL?.trim();
  if (explicit) {
    if (/^(none|false|off)$/i.test(explicit)) return "";
    if (/^https?:\/\//i.test(explicit)) return explicit;
  }

  const baseUrl = (
    process.env.BACKEND_PUBLIC_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    DEFAULT_PUBLIC_BACKEND_URL
  ).replace(/\/+$/, "");

  return `${baseUrl}/api/brand/logo.png`;
}

function renderOtpEmailContent(params: {
  name: string;
  otp: string;
  expiresInMinutes: number;
  subject: string;
  introText: string;
  footerText: string;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(params.name || "bạn");
  const safeOtp = escapeHtml(params.otp);
  const mins = params.expiresInMinutes;
  const logoUrl = getEmailLogoUrl();

  const text = [
    `Xin chào ${params.name || "bạn"},`,
    "",
    `${params.introText} Mã OTP của bạn là: ${params.otp}`,
    `Mã có hiệu lực trong ${mins} phút và chỉ dùng được 1 lần.`,
    "",
    params.footerText,
  ].join("\n");

  const logoCell = logoUrl
    ? `<td style="width:52px;vertical-align:middle;padding-right:12px;">
        <img src="${escapeHtml(logoUrl)}" alt="Rừng Trong Phố" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;border:0;outline:none;text-decoration:none;" />
      </td>`
    : "";

  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;color:#111827;background-color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;padding-bottom:14px;border-bottom:1px solid #f3f4f6;">
    <tr>
      ${logoCell}
      <td style="vertical-align:middle;">
        <h2 style="margin:0;color:#2D6A4F;font-size:20px;line-height:1.25;">Rừng Trong Phố</h2>
        <p style="margin:2px 0 0;font-size:12px;color:#C4973B;font-weight:600;letter-spacing:0.4px;">Build Your Christmas</p>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 12px;">Xin chào <strong>${safeName}</strong>,</p>
  <p style="margin:0 0 16px;">${escapeHtml(params.introText)} Vui lòng nhập mã OTP 6 số dưới đây:</p>
  <div style="background:#fef2f2;border:1px dashed #dc2626;border-radius:8px;padding:16px;text-align:center;margin:0 0 16px;">
    <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#b91c1c;">${safeOtp}</span>
  </div>
  <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">Mã có hiệu lực trong <strong>${mins} phút</strong> và chỉ dùng được 1 lần.</p>
  <p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(params.footerText)}</p>
</div>`.trim();

  return { subject: params.subject, html, text };
}

export function buildPasswordResetEmailContent(params: {
  name: string;
  otp: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  return renderOtpEmailContent({
    ...params,
    subject: "[Rừng Trong Phố] Mã OTP khôi phục mật khẩu",
    introText: "Bạn vừa yêu cầu đặt lại mật khẩu.",
    footerText: "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này để giữ an toàn cho tài khoản.",
  });
}

export function buildEmailVerificationContent(params: {
  name: string;
  otp: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  return renderOtpEmailContent({
    ...params,
    subject: "[Rừng Trong Phố] Mã OTP xác thực tài khoản",
    introText: "Cảm ơn bạn đã đăng ký tài khoản Build Your Christmas.",
    footerText: "Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.",
  });
}

export async function sendPasswordResetOtpEmail(params: {
  to: string;
  name: string;
  otp: string;
  expiresInMinutes: number;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    ...buildPasswordResetEmailContent(params),
  });
}

export async function sendEmailVerificationOtpEmail(params: {
  to: string;
  name: string;
  otp: string;
  expiresInMinutes: number;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    ...buildEmailVerificationContent(params),
  });
}
