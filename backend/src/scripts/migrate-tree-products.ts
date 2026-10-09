// ── migrate-tree-products: DEPRECATED (2026-10-09) ───────────────────────────
//
// This script was used for the 2-tier (Product + Variant with `color` field)
// migration. After the 3-tier refactor (Product → Code → Variant), this
// migration path is no longer needed.
//
// The 3-tier equivalent is at: src/scripts/migrate-to-3tier.ts
//
// This file is kept as a no-op for backward compatibility. If invoked
// directly, it just prints a deprecation notice and exits.
//
// Original documentation:
//
// Before: 3 legacy trees (one per size) carrying "color" encoded in name.
// After:  1 TreeProduct + 9 SKUs from 3 colors × 3 sizes.

import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  console.log(
    "[migrate-tree-products] DEPRECATED — 3-tier refactor uses src/scripts/migrate-to-3tier.ts"
  );
}

main().catch((err) => {
  console.error("[migrate-tree-products] Failed:", err);
  process.exit(1);
});
