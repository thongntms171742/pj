import fs from "fs";
import path from "path";
import { isCloudinaryEnabled } from "../services/cloudinaryService";
import { uploadMedia } from "../controllers/uploadController";

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
  } else {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
}

function createMockReqRes(headers: Record<string, string>, body: any) {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {
    headers,
    body,
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
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };
}

async function runTests() {
  console.log("\n── Running Upload & Cloudinary Service Tests ──\n");

  // Test 1: isCloudinaryEnabled returns boolean
  assert(
    typeof isCloudinaryEnabled() === "boolean",
    "isCloudinaryEnabled returns a boolean value"
  );

  // Test 2: Reject empty body
  {
    const { req, res, getStatusCode, getData } = createMockReqRes(
      { "content-type": "application/json" },
      {}
    );
    await uploadMedia(req, res);
    assert(getStatusCode() === 400, "Empty payload returns HTTP 400");
    assert(getData()?.error?.code === "MISSING_FIELD", "Empty payload code is MISSING_FIELD");
  }

  // Test 3: Reject unsupported MIME type
  {
    // data:text/plain;base64,SGVsbG8=
    const { req, res, getStatusCode, getData } = createMockReqRes(
      { "content-type": "application/json" },
      { file: "data:text/plain;base64,SGVsbG8=" }
    );
    await uploadMedia(req, res);
    assert(getStatusCode() === 415, "Unsupported media type returns HTTP 415");
    assert(getData()?.error?.code === "UNSUPPORTED_MEDIA_TYPE", "Error code is UNSUPPORTED_MEDIA_TYPE");
  }

  // Test 4: Local fallback upload with valid PNG Base64 Data URL
  // 1x1 transparent PNG Base64
  const tinyPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  let localFilename = "";
  {
    const originalRequire = process.env.REQUIRE_CLOUDINARY;
    process.env.REQUIRE_CLOUDINARY = "false";

    const { req, res, getStatusCode, getData } = createMockReqRes(
      { "content-type": "application/json" },
      { dataUrl: tinyPngBase64 }
    );
    await uploadMedia(req, res);
    assert(getStatusCode() === 201, "Valid base64 upload returns HTTP 201");
    const data = getData();
    assert(Boolean(data?.url), "Response contains url");
    assert(Boolean(data?.path), "Response contains path");
    assert(Boolean(data?.publicId), "Response contains publicId");
    assert(data?.format === "png", "Format matches image format (png)");

    if (data?.path?.startsWith("/uploads/")) {
      localFilename = data.path.replace("/uploads/", "");
    }

    process.env.REQUIRE_CLOUDINARY = originalRequire;
  }

  // Clean up created file if local
  if (localFilename) {
    const filePath = path.resolve(__dirname, "../../uploads", localFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ PASS: Successfully cleaned up temporary test file ${localFilename}`);
    }
  }

  // Test 5: Require Cloudinary enforcement on production
  {
    const originalRequire = process.env.REQUIRE_CLOUDINARY;
    const originalUrl = process.env.CLOUDINARY_URL;
    const originalName = process.env.CLOUDINARY_CLOUD_NAME;

    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    process.env.REQUIRE_CLOUDINARY = "true";

    const { req, res, getStatusCode, getData } = createMockReqRes(
      { "content-type": "application/json" },
      { dataUrl: tinyPngBase64 }
    );
    await uploadMedia(req, res);
    assert(getStatusCode() === 500, "REQUIRE_CLOUDINARY=true without credentials returns HTTP 500");
    assert(getData()?.error?.code === "INTERNAL_ERROR", "Error code is INTERNAL_ERROR");

    process.env.REQUIRE_CLOUDINARY = originalRequire;
    if (originalUrl) process.env.CLOUDINARY_URL = originalUrl;
    if (originalName) process.env.CLOUDINARY_CLOUD_NAME = originalName;
  }

  console.log("\n========================================");
  console.log("Upload Test Summary: All tests passed!");
  console.log("========================================\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
