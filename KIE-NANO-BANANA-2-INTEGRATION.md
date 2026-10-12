# KIE API – Nano Banana 2 integration (Rừng Thông Phố)

## What changed
- Replaced the Gemini image provider in `backend/src/services/ai/googleImageService.ts` with KIE's async task API.
- Uses `POST https://api.kie.ai/api/v1/jobs/createTask` with model `nano-banana-2`, then polls `GET /api/v1/jobs/recordInfo?taskId=...`.
- Downloads the generated image and uploads it to Cloudinary, so `imageUrl` and `imagePublicId` keep their existing meaning.
- Keeps the existing endpoint `POST /api/ai-designer/:id/generate-image` and response fields `designId`, `status`, `imageUrl`, `imagePublicId`.
- Keeps authorization, catalog prompt composition, `AIDesign` status tracking, and error handling. Removes `@google/genai` dependency.

## Configure Render
1. Create a KIE API key at https://kie.ai/api-key.
2. In Render, open the backend Web Service → Environment.
3. Add `KIE_API_KEY` with the secret key value. Do not put this key in the frontend, Git, or chat.
4. Save changes and deploy/restart the service.
5. `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and `GEMINI_IMAGE_MODEL` are no longer used by this image generation service; remove them from Render only after confirming no other backend feature uses them.
6. Ensure Cloudinary environment variables remain configured; generated images are persisted to Cloudinary rather than relying on temporary KIE URLs.

## Test
- `cd backend`
- `npm install`
- `npm run build`
- `npm run test:ai`
- `npm run test:all` (the address tests need external CAS Address Kit access; they may fail in network-restricted environments)

## Notes
- KIE charges its own credits. Check current pricing and task history at https://kie.ai/pricing and https://kie.ai/logs.
- KIE output URLs are temporary (KIE documentation says generated files are retained for 14 days); this implementation downloads the result and uploads it to Cloudinary.
- The task polling timeout is 8 minutes. If it times out, the design record remains and its status/error is saved; the user can retry image generation.
- Model ID is `nano-banana-2`, output defaults here to PNG, 1K, portrait 3:4.
