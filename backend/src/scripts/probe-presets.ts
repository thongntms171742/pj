// ── Probe: simulate getPresets on a real DB to reproduce 500 ───────────────
// Identifies the SPECIFIC preset that fails hydration, with full error.

import mongoose from "mongoose";
import { TreeDesign } from "../models/TreeDesign";
import { loadCatalogForDesign } from "../services/designService";
import { buildDesignResponse } from "../services/designService";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const presets = await TreeDesign.find({ isPreset: true }).lean();
  console.log(`[probe] Found ${presets.length} presets`);

  for (let i = 0; i < presets.length; i++) {
    const p = presets[i];
    console.log(`\n[probe] [${i + 1}/${presets.length}] "${p.name}" (id=${p._id})`);
    console.log(`         treeId=${p.config?.treeId} styleId=${p.config?.styleId} accessories=${p.config?.accessories?.length ?? 0}`);
    try {
      const { design, pricing } = await loadCatalogForDesign(p);
      const response = buildDesignResponse(design, pricing);
      console.log(`         OK - unitTotal=${response.pricing.unitTotal}`);
    } catch (err: unknown) {
      const e = err as { code?: string; httpCode?: number; message?: string };
      console.log(`         FAIL: ${e?.code ?? "(no code)"} (httpCode=${e?.httpCode ?? "?"}) - ${e?.message ?? String(err)}`);
      if (e?.code === undefined) {
        console.log("         Raw error:", err);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[probe] Crashed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
