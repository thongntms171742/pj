/**
 * Test contract cho Media API (public + admin).
 *
 * Chạy: npm run test:media
 *
 * Phạm vi:
 *  - Phân loại MIME (image / video / audio) của uploadController
 *  - Validation đầu và của admin create/update MediaAsset
 *  - Public endpoints: /api/media, /api/media/hero, /api/media/background-music
 *    (placement lạ → trả danh sách rỗng, không lỗi 500; limit được clamp)
 *
 * Test tự stub tầng model nên KHÔNG cần kết nối MongoDB.
 */

import { classifyMedia } from "../controllers/uploadController";
import {
  listMedia,
  getHeroMedia,
  getBackgroundMusic,
} from "../controllers/mediaController";
import {
  createMediaAsset,
  updateMediaAsset,
  deleteMediaAsset,
} from "../controllers/admin/media";
import { MediaAsset } from "../models/MediaAsset";

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
  } else {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
}

function createMockReqRes(query: Record<string, unknown> = {}, body: any = {}) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    query,
    body,
    params: {},
    get: (key: string) => (key === "host" ? "localhost:4000" : undefined),
    protocol: "http",
  };

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    send: (data: any) => {
      responseData = data;
      return res;
    },
  };

  return {
    req,
    res,
    next: (err?: any) => {
      throw err ?? new Error("next() called without error");
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };
}

// ── Stub layer model ─────────────────────────────────────────────────────────
// Ghi lại các query để assert, đồng thời trả dữ liệu giả nên không cần DB.

type FindCall = { filter: any; sort?: any; limit?: any };

const calls: { find: FindCall[]; findOne: FindCall[] } = { find: [], findOne: [] };

function stubModel() {
  const original = {
    find: (MediaAsset as any).find,
    findOne: (MediaAsset as any).findOne,
    findById: (MediaAsset as any).findById,
    findByIdAndDelete: (MediaAsset as any).findByIdAndDelete,
    create: (MediaAsset as any).create,
  };

  const chain = (filter: any, sort?: any, limit?: any) => {
    const c = { filter, sort, limit };
    calls.find.push(c);
    const self: any = {
      sort: (s: any) => {
        c.sort = s;
        return self;
      },
      limit: (n: number) => {
        c.limit = n;
        return self;
      },
      lean: async () => [],
    };
    return self;
  };

  (MediaAsset as any).find = (filter: any) => chain(filter);
  (MediaAsset as any).findOne = (filter: any) => {
    calls.findOne.push({ filter });
    const self: any = {
      sort: () => self,
      limit: () => self,
      lean: async () => null,
    };
    return self;
  };
  (MediaAsset as any).findById = async () => null;
  (MediaAsset as any).findByIdAndDelete = async () => null;
  (MediaAsset as any).create = async (doc: any) => ({ ...doc, _id: "stub-id" });

  return () => {
    (MediaAsset as any).find = original.find;
    (MediaAsset as any).findOne = original.findOne;
    (MediaAsset as any).findById = original.findById;
    (MediaAsset as any).findByIdAndDelete = original.findByIdAndDelete;
    (MediaAsset as any).create = original.create;
  };
}

async function runTests() {
  console.log("\n── Running Media API Contract Tests ──\n");

  const restore = stubModel();

  try {
    // ── 1. classifyMedia ────────────────────────────────────────────────────
    assert(classifyMedia("image/png") === "image", "image/png → image");
    assert(classifyMedia("image/jpeg") === "image", "image/jpeg → image");
    assert(classifyMedia("video/mp4") === "video", "video/mp4 → video");
    assert(classifyMedia("audio/mpeg") === "audio", "audio/mpeg → audio");
    assert(classifyMedia("audio/mp4") === "audio", "audio/mp4 → audio");
    assert(classifyMedia("audio/x-m4a") === "audio", "audio/x-m4a → audio");
    assert(classifyMedia("audio/wav") === "audio", "audio/wav → audio");
    assert(classifyMedia("audio/ogg") === "audio", "audio/ogg → audio");

    // ── 2. Admin create: validation ─────────────────────────────────────────
    {
      const { req, res, next, getStatusCode, getData } = createMockReqRes({}, {});
      await createMediaAsset(req, res, next);
      assert(getStatusCode() === 400, "Create without title/url returns HTTP 400");
      assert(
        getData()?.error?.code === "MISSING_FIELD",
        "Create without title/url code is MISSING_FIELD"
      );
    }

    {
      const { req, res, next, getStatusCode } = createMockReqRes({}, { title: "Chỉ có title" });
      await createMediaAsset(req, res, next);
      assert(getStatusCode() === 400, "Create without url returns HTTP 400");
    }

    {
      const { req, res, next, getStatusCode } = createMockReqRes({}, { url: "https://x/y.mp4" });
      await createMediaAsset(req, res, next);
      assert(getStatusCode() === 400, "Create without title returns HTTP 400");
    }

    // ── 3. Public list: placement không hợp lệ → danh sách rỗng, không 500 ────
    {
      calls.find.length = 0;
      const { req, res, next, getStatusCode, getData } = createMockReqRes({
        placement: "NOT_A_REAL_PLACEMENT",
      });
      await listMedia(req, res, next);
      assert(getStatusCode() === 200, "Invalid placement returns HTTP 200 (không 500)");
      assert(
        Array.isArray(getData()?.assets) && getData()?.assets.length === 0,
        "Invalid placement returns empty assets array"
      );
      assert(
        calls.find.length === 0,
        "Invalid placement không query DB (trả rỗng ngay)"
      );
    }

    // ── 4. Public list: placement hợp lệ → filter đúng, limit clamp [1,50] ───
    {
      calls.find.length = 0;
      const { req, res, next, getStatusCode } = createMockReqRes({
        placement: "STORY_FEED",
        limit: "9999",
      });
      await listMedia(req, res, next);
      assert(getStatusCode() === 200, "Valid placement returns HTTP 200");
      const c = calls.find[0];
      assert(c?.filter?.isActive === true, "Public list chỉ lấy isActive=true");
      assert(c?.filter?.placement === "STORY_FEED", "Filter theo placement");
      assert(c?.limit === 50, "Limit bị clamp tối đa 50");
    }

    {
      calls.find.length = 0;
      const { req, res, next } = createMockReqRes({ limit: "-5" });
      await listMedia(req, res, next);
      assert(calls.find[0]?.limit === 1, "Limit âm được clamp tối thiểu 1");
    }

    {
      calls.find.length = 0;
      const { req, res, next } = createMockReqRes({ limit: "abc" });
      await listMedia(req, res, next);
      assert(calls.find[0]?.limit === 20, "Limit không parse được → default 20");
    }

    // ── 5. Hero endpoint: ưu tiên HERO_BACKGROUND, fallback PROMO ───────────
    {
      calls.findOne.length = 0;
      const { req, res, next, getStatusCode, getData } = createMockReqRes();
      await getHeroMedia(req, res, next);
      assert(getStatusCode() === 200, "GET /api/media/hero returns HTTP 200");
      assert("asset" in (getData() ?? {}), "Hero response có key 'asset'");
      assert(
        calls.findOne[0]?.filter?.placement === "HERO_BACKGROUND",
        "Hero ưu tiên placement HERO_BACKGROUND"
      );
      assert(
        calls.findOne[0]?.filter?.isActive === true,
        "Hero chỉ lấy asset isActive=true"
      );
    }

    {
      calls.findOne.length = 0;
      const { req, res, next } = createMockReqRes();
      await getHeroMedia(req, res, next);
      assert(
        calls.findOne[1]?.filter?.placement === "PROMO",
        "Hero fallback sang placement PROMO khi không có HERO_BACKGROUND"
      );
    }

    // ── 6. Background music: yêu cầu kind=AUDIO ─────────────────────────────
    {
      calls.findOne.length = 0;
      const { req, res, next, getStatusCode, getData } = createMockReqRes();
      await getBackgroundMusic(req, res, next);
      assert(getStatusCode() === 200, "GET /api/media/background-music returns HTTP 200");
      assert(
        "asset" in (getData() ?? {}),
        "Background music response có key 'asset'"
      );
      const f = calls.findOne[0]?.filter;
      assert(f?.placement === "MUSIC_TRACK", "Music lọc placement=MUSIC_TRACK");
      assert(f?.kind === "AUDIO", "Music lọc kind=AUDIO");
      assert(f?.isActive === true, "Music chỉ lấy asset isActive=true");
    }

    // ── 7. Admin update / delete: id không tồn tại → 404 ────────────────────
    {
      const { req, res, next, getStatusCode } = createMockReqRes({}, { title: "x" });
      req.params = { id: "000000000000000000000000" };
      await updateMediaAsset(req, res, next);
      assert(getStatusCode() === 404, "Update unknown id returns HTTP 404");
    }

    {
      const { req, res, next, getStatusCode } = createMockReqRes();
      req.params = { id: "000000000000000000000000" };
      await deleteMediaAsset(req, res, next);
      assert(getStatusCode() === 404, "Delete unknown id returns HTTP 404");
    }

    console.log("\n✅ All Media API contract tests passed.\n");
  } finally {
    restore();
  }
}

runTests().catch((err) => {
  console.error("\n❌ Test runner crashed:", err);
  process.exit(1);
});
