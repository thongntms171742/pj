// ── Prune orphaned presets (Build Your Christmas) ───────────────────────────
//
// Background (2026-10-08 production incident):
//   /api/catalog/presets returned 500 because at least one preset in the
//   production DB pointed to a treeId / styleId / accessoryId that no longer
//   exists. Root cause: a destructive seed/reset on the DB left orphan refs.
//
// What this script does:
//   1. Find all TreeDesign where isPreset=true.
//   2. For each preset, batch-load tree + style + all accessories by their
//      ObjectIds.
//   3. Flag a preset as orphaned if:
//        - treeId missing
//        - styleId missing
//        - any accessoryId missing
//        - any accessory inactive (`isActive: false`) AND admin chose to purge
//   4. Print a report (do NOT delete by default — safer).
//   5. With --execute flag, perform one of these actions:
//        a) --action=delete   : hard-delete orphaned presets
//        b) --action=repair   : null-out missing accessory refs, keep preset
//        c) --action=disable  : set isPublic=false on orphaned presets (hide
//                               from FE without losing data)
//
// Usage:
//   ts-node --transpile-only src/scripts/prune-orphaned-presets.ts
//   ts-node --transpile-only src/scripts/prune-orphaned-presets.ts --action=delete  --execute
//   ts-node --transpile-only src/scripts/prune-orphaned-presets.ts --action=repair  --execute
//   ts-node --transpile-only src/scripts/prune-orphaned-presets.ts --action=disable --execute
//
// No flag = dry-run report only.
//
// SAFETY: This script never touches Tree/Style/Accessory catalogs. It only
// reads them, then acts on TreeDesign docs. Refuses to run if MONGODB_URI
// points to a `thriftit*` database (mirrors seed-christmas.ts guard).

import mongoose from "mongoose";
import { TreeDesign } from "../models/TreeDesign";
import { Tree } from "../models/Tree";
import { Style } from "../models/Style";
import { Accessory } from "../models/Accessory";
import * as dotenv from "dotenv";

dotenv.config();

interface OrphanReport {
  presetId: string;
  name: string;
  slug: string;
  isPublic: boolean;
  reasons: string[];
  missingTreeIds: string[];
  missingStyleIds: string[];
  missingAccessoryIds: string[];
  inactiveAccessoryIds: string[];
}

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const actionArg = args.find((a) => a.startsWith("--action="));
const ACTION: "delete" | "repair" | "disable" | "report" =
  (actionArg?.split("=")[1] as "delete" | "repair" | "disable" | undefined) ?? "report";

if (EXECUTE && ACTION === "report") {
  console.error("[prune] --execute requires --action={delete|repair|disable}");
  process.exit(1);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[prune] MONGODB_URI is required");
    process.exit(1);
  }
  if (/thriftit/i.test(uri)) {
    console.error("[prune] Refusing to run on thriftit* database");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`[prune] Connected to ${uri.replace(/\/\/.*@/, "//***@")}`);

  const presets = await TreeDesign.find({ isPreset: true }).lean();
  console.log(`[prune] Found ${presets.length} presets`);

  // Batch-load all referenced tree/style/accessory IDs to minimize roundtrips.
  const treeIds = new Set<string>();
  const styleIds = new Set<string>();
  const accessoryIds = new Set<string>();
  for (const p of presets) {
    treeIds.add(String(p.config?.treeId));
    styleIds.add(String(p.config?.styleId));
    for (const a of p.config?.accessories ?? []) {
      accessoryIds.add(String(a.accessoryId));
    }
  }

  const [trees, styles, accessories] = await Promise.all([
    Tree.find({ _id: { $in: Array.from(treeIds) } }).select("_id isActive").lean(),
    Style.find({ _id: { $in: Array.from(styleIds) } }).select("_id code isActive").lean(),
    Accessory.find({ _id: { $in: Array.from(accessoryIds) } })
      .select("_id name isActive isPersonalizable")
      .lean(),
  ]);

  const treeById = new Map(trees.map((t) => [String(t._id), t]));
  const styleById = new Map(styles.map((s) => [String(s._id), s]));
  const accessoryById = new Map(accessories.map((a) => [String(a._id), a]));

  console.log(`[prune] Catalog snapshot: ${trees.length}/${treeIds.size} trees, ${styles.length}/${styleIds.size} styles, ${accessories.length}/${accessoryIds.size} accessories`);

  // Audit each preset.
  const reports: OrphanReport[] = [];
  for (const p of presets) {
    const reasons: string[] = [];
    const missingTreeIds: string[] = [];
    const missingStyleIds: string[] = [];
    const missingAccessoryIds: string[] = [];
    const inactiveAccessoryIds: string[] = [];

    const t = treeById.get(String(p.config?.treeId));
    if (!t) {
      missingTreeIds.push(String(p.config?.treeId));
      reasons.push(`missing tree ${p.config?.treeId}`);
    } else if (!(t as { isActive?: boolean }).isActive) {
      // Tree exists but soft-deleted. Treat as orphan for FE rendering.
      reasons.push(`tree ${t._id} is inactive`);
    }

    const s = styleById.get(String(p.config?.styleId));
    if (!s) {
      missingStyleIds.push(String(p.config?.styleId));
      reasons.push(`missing style ${p.config?.styleId}`);
    } else if (!(s as { isActive?: boolean }).isActive) {
      reasons.push(`style ${s._id} is inactive`);
    }

    for (const a of p.config?.accessories ?? []) {
      const acc = accessoryById.get(String(a.accessoryId));
      if (!acc) {
        missingAccessoryIds.push(String(a.accessoryId));
        reasons.push(`missing accessory ${a.accessoryId}`);
      } else if (!(acc as { isActive?: boolean }).isActive) {
        inactiveAccessoryIds.push(String(a.accessoryId));
        reasons.push(`accessory ${a.accessoryId} (${(acc as { name?: string }).name}) is inactive`);
      } else if ((acc as { isPersonalizable?: boolean }).isPersonalizable) {
        const text = (a as { personalizationText?: string }).personalizationText ?? "";
        if (!text.trim()) {
          reasons.push(
            `accessory ${a.accessoryId} (${(acc as { name?: string }).name}) is personalizable but personalizationText is empty`
          );
        }
      }
    }

    if (reasons.length > 0) {
      reports.push({
        presetId: String(p._id),
        name: p.name,
        slug: p.slug,
        isPublic: p.isPublic,
        reasons,
        missingTreeIds,
        missingStyleIds,
        missingAccessoryIds,
        inactiveAccessoryIds,
      });
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(`\n[prune] === Report ===`);
  console.log(`[prune] Total presets: ${presets.length}`);
  console.log(`[prune] Orphaned presets: ${reports.length}`);

  if (reports.length === 0) {
    console.log("[prune] All presets are clean. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  for (const r of reports) {
    console.log(`\n  - ${r.name} (id=${r.presetId}, slug=${r.slug}, isPublic=${r.isPublic})`);
    for (const reason of r.reasons) {
      console.log(`      - ${reason}`);
    }
  }

  // ── Action (only if --execute + --action=...) ────────────────────────────
  if (!EXECUTE) {
    console.log(`\n[prune] DRY-RUN. Pass --execute --action={delete|repair|disable} to apply changes.`);
    await mongoose.disconnect();
    return;
  }

  const ids = reports.map((r) => r.presetId);

  if (ACTION === "delete") {
    const result = await TreeDesign.deleteMany({ _id: { $in: ids } });
    console.log(`\n[prune] --action=delete: removed ${result.deletedCount} orphaned presets`);
  } else if (ACTION === "disable") {
    const result = await TreeDesign.updateMany(
      { _id: { $in: ids } },
      { $set: { isPublic: false } }
    );
    console.log(`\n[prune] --action=disable: set isPublic=false on ${result.modifiedCount} orphaned presets`);
    console.log(`[prune] Admin can re-enable via PATCH /api/admin/presets/:id { isPublic: true } after fixing refs.`);
  } else if (ACTION === "repair") {
    // Repair = drop entries that reference missing accessories, but keep the
    // preset itself. If tree or style is missing, we cannot repair — fall
    // back to disable.
    let repaired = 0;
    let fellBackToDisable = 0;
    for (const r of reports) {
      const update: Record<string, unknown> = {};
      if (r.missingAccessoryIds.length > 0) {
        // $pull accessories whose accessoryId is in the missing list.
        await TreeDesign.updateOne(
          { _id: r.presetId },
          {
            $pull: {
              "config.accessories": {
                accessoryId: { $in: r.missingAccessoryIds.map((s) => new mongoose.Types.ObjectId(s)) },
              },
            },
          }
        );
        update["config.accessories"] = "pruned";
      }
      if (r.missingTreeIds.length === 0 && r.missingStyleIds.length === 0) {
        repaired++;
      } else {
        // Tree or style missing — cannot repair, just hide.
        await TreeDesign.updateOne(
          { _id: r.presetId },
          { $set: { isPublic: false } }
        );
        fellBackToDisable++;
      }
    }
    console.log(`\n[prune] --action=repair: pruned accessories on ${repaired} presets; disabled ${fellBackToDisable} presets (missing tree/style)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[prune] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
