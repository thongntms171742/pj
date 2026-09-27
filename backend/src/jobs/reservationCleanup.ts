import { Product } from "../models/Product";

export const startReservationCleanupJob = () => {
  console.log("⏰ Starting reservation cleanup job (runs every 5 minutes)");
  
  setInterval(async () => {
    try {
      const now = new Date();
      const expiredProducts = await Product.find({
        status: "reserved",
        reservedUntil: { $lt: now },
      });

      if (expiredProducts.length > 0) {
        console.log(`[Job] Found ${expiredProducts.length} expired reservations. Cleaning up...`);
        for (const product of expiredProducts) {
          product.status = "active";
          product.reservedUntil = null;
          product.reservedByOrderId = null;
          // Restore quantity if it was deducted temporarily, 
          // but our checkout logic only deducts quantity when COD or PAID, 
          // and sets to reserved without deducting when PENDING_PAYMENT.
          // Let's just restore status.
          await product.save();
        }
        console.log(`[Job] Cleanup complete.`);
      }
    } catch (error) {
      console.error("[Job] Error in reservation cleanup:", error);
    }
  }, 5 * 60 * 1000); // 5 minutes
};
