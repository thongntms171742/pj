/**
 * shipping.tools.ts — tool `shippingInfo` cho AI.
 *
 * Tra chính sách giao hàng từ config nghiệp vụ (không hardcode trong prompt).
 */

import { SHIPPING_CONFIG } from "../../../config/shipping.config";
import type { AiTool } from "./index";

export interface ShippingInfoArgs {
  province?: string;
  topic?: string;
}

export const shippingInfoTool: AiTool = {
  declaration: {
    name: "shippingInfo",
    description:
      "Tra thông tin chính sách giao hàng: phí vận chuyển, thời gian giao, vùng giao được, hình thức thanh toán khi giao. Dùng khi khách hàng hỏi về giao hàng, phí ship, thời gian nhận hàng.",
    parameters: {
      type: "object",
      properties: {
        province: {
          type: "string",
          description:
            "Tỉnh/thành phố khách hàng muốn giao tới (để tính phí ship theo vùng).",
        },
        topic: {
          type: "string",
          description:
            "Chủ đề cụ thể: 'fee' (phí ship), 'time' (thời gian giao), 'area' (vùng giao), 'payment' (thanh toán khi giao).",
        },
      },
      required: [],
    },
  },

  async execute(args) {
    const province = typeof args.province === "string" ? args.province.trim() : "";
    const topic = typeof args.topic === "string" ? args.topic.trim().toLowerCase() : "";

    const cfg = SHIPPING_CONFIG;

    const base = {
      shippingFee: cfg.shippingFee,
      shippingFeeFormatted: `${cfg.shippingFee.toLocaleString("vi-VN")}đ`,
      productionDays: cfg.productionDays,
      productionDaysText: `${cfg.productionDays} ngày`,
      estimatedDeliveryDays: cfg.estimatedDeliveryDays,
      estimatedDeliveryText: `${cfg.estimatedDeliveryDays} ngày`,
      supportedProvinces: cfg.supportedProvinces ?? [],
      codSupported: cfg.codSupported ?? false,
      codFee: cfg.codFee ?? 0,
      note:
        "Thời gian giao là ước tính và không bao gồm thời gian làm sản phẩm handmade.",
    };

    // Lọc theo chủ đề nếu AI chỉ định rõ.
    if (topic === "fee" || topic === "phi ship") {
      return {
        data: {
          topic: "fee",
          shippingFee: base.shippingFee,
          shippingFeeFormatted: base.shippingFeeFormatted,
          codFee: base.codFee,
          codSupported: base.codSupported,
          note: base.note,
        },
      };
    }

    if (topic === "time" || topic === "thoi gian") {
      return {
        data: {
          topic: "time",
          productionDays: base.productionDays,
          productionDaysText: base.productionDaysText,
          estimatedDeliveryDays: base.estimatedDeliveryDays,
          estimatedDeliveryText: base.estimatedDeliveryText,
          note: base.note,
        },
      };
    }

    if (topic === "area" || topic === "vung giao") {
      return {
        data: {
          topic: "area",
          supportedProvinces: base.supportedProvinces,
          count: base.supportedProvinces.length,
          note:
            base.supportedProvinces.length > 0
              ? `Giao được tới ${base.supportedProvinces.length} tỉnh/thành.`
              : "Chưa có cấu hình vùng giao. Hãy chuyển nhân viên để xác nhận.",
        },
      };
    }

    if (topic === "payment" || topic === "thanh toan") {
      return {
        data: {
          topic: "payment",
          codSupported: base.codSupported,
          codFee: base.codFee,
          note: base.codSupported
            ? "Hỗ trợ thanh toán khi nhận hàng (COD)."
            : "Không hỗ trợ thanh toán khi nhận hàng. Khách cần chuyển khoản trước.",
        },
      };
    }

    // Không chỉ định chủ đề ⇒ trả toàn bộ.
    return {
      data: {
        topic: "all",
        ...base,
        requestedProvince: province || null,
      },
    };
  },
};
