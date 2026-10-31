# 🎬 HƯỚNG DẪN TRIỂN KHAI MEDIA — FE (WEB) & MOBILE

> **Ngày**: 2026-10-30 · **Nhánh BE**: `christmas` · **Trạng thái BE**: ✅ Hoàn tất & đã merge
> **Đối tượng**: Team Frontend (Web) & Team Mobile (Expo/React Native)
> **Phạm vi**: Backend đã hoàn tất. Tài liệu này mô tả contract API + hướng triển khai phía client.
> **Mục tiêu**: Tích hợp 3 tính năng cảm xúc — **Video nền Hero**, **Story feed dọc (Reels)**, **Nhạc nền toàn app**

---

## 📑 MỤC LỤC

1. [Tóm tắt nhanh](#1-tóm-tắt-nhanh)
2. [Backend đã có gì](#2-backend-đã-có-gì)
3. [Quy trình 2 bước: Upload → Tạo MediaAsset](#3-quy-trình-2-bước-upload--tạo-mediaasset)
4. [Hướng dẫn cho FRONTEND (Web)](#4-hướng-dẫn-cho-frontend-web)
5. [Hướng dẫn cho MOBILE (Expo)](#5-hướng-dẫn-cho-mobile-expo)
6. [Quy tắc bắt buộc (không được vi phạm)](#6-quy-tắc-bắt-buộc-không-được-vi-phạm)
7. [Edge cases & xử lý lỗi](#7-edge-cases--xử-lý-lỗi)
8. [Checklist bàn giao](#8-checklist-bàn-giao)
9. [Phụ lục: cây file đề xuất](#9-phụ-lục-cây-file-đề-xuất)

---

## 1. TÓM TẮT NHANH

| Tính năng | API BE | Web (React) | Mobile (Expo) |
|---|---|---|---|
| Video nền Hero | `GET /api/media/hero` | `<video>` + poster fallback | `expo-av` `<Video>` |
| Story feed dọc | `GET /api/media?placement=STORY_FEED` | Modal fullscreen 9:16 | Modal fullscreen 9:16 |
| Nhạc nền toàn app | `GET /api/media/background-music` | HTML5 `<audio>` | `expo-av` `Audio.Sound` |

**Nguyên tắc cốt lõi:**
- BE chỉ cung cấp *danh sách media do admin curate*. FE/Mobile **không upload video từ client** — chỉ đọc và phát.
- Mọi endpoint `/api/media/*` là **public** → gọi được không cần token, kể cả khách chưa đăng nhập.
- **Luôn có fallback**: không có media → app vẫn chạy bình thường, dùng ảnh/UI mặc định.

---

## 2. BACKEND ĐÃ CÓ GÌ

### 2.1. Model `MediaAsset`

```typescript
{
  _id: string;
  kind: 'VIDEO' | 'AUDIO' | 'IMAGE';
  placement: 'HERO_BACKGROUND' | 'STORY_FEED' | 'MUSIC_TRACK' | 'PROMO';
  title: string;          // BẮT BUỘC
  caption?: string;
  url: string;            // BẮT BUỘC — URL Cloudinary
  publicId?: string;
  posterUrl?: string;     // Ảnh poster/thumbnail cho video
  format?: string;        // 'mp4' | 'mp3' | 'm4a'...
  size?: number;          // byte
  duration?: number;      // giây
  ctaLabel?: string;      // 'Mua ngay'
  ctaLink?: string;       // '/tree/xxx' hoặc URL ngoài
  linkType: 'PRODUCT' | 'CATEGORY' | 'NONE';
  linkId?: string;
  musicArtist?: string;
  isLoop: boolean;        // mặc định true
  volume: number;         // 0–100, mặc định 40
  isActive: boolean;      // mặc định true
  sortOrder: number;      // nhỏ hiển thị trước
}
```

### 2.2. Bảng endpoint

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/api/media?placement=&limit=` | Public | Danh sách media active |
| `GET` | `/api/media/hero` | Public | Media hero (fallback `PROMO`) |
| `GET` | `/api/media/background-music` | Public | Nhạc nền active đầu tiên |
| `POST` | `/api/uploads` | optionalAuth | Upload file lên Cloudinary |
| `GET` | `/api/admin/media` | Admin | List tất cả (kể cả đã tắt) |
| `POST` | `/api/admin/media` | Admin | Tạo MediaAsset |
| `PATCH` | `/api/admin/media/:id` | Admin | Cập nhật MediaAsset |
| `DELETE` | `/api/admin/media/:id` | Admin | Xóa MediaAsset |

Chi tiết đầy đủ: [`FE_API_REFERENCE.md` → PHẦN 10B](./FE_API_REFERENCE.md)

### 2.3. Response shape chuẩn

```jsonc
// GET /api/media
{ "assets": [ /* MediaAsset[] */ ] }

// GET /api/media/hero  &  GET /api/media/background-music
{ "asset": { /* MediaAsset */ } | null }
```

> ⚠️ Lưu ý envelope: **không** có `{ success: true }` ở response public. FE đọc `res.data.assets` / `res.data.asset` (axios đã unwrap `data`).

---

## 3. QUY TRÌNH 2 BƯỚC: UPLOAD → TẠO MEDIAASSET

Đây là phần **BE đã sẵn sàng**, admin chỉ cần gọi API. Nếu team muốn làm UI admin (khuyến nghị), làm theo 2 bước:

```
┌─────────────┐  POST /api/uploads   ┌──────────────┐  POST /api/admin/media   ┌──────────┐
│ Admin chọn  │ ───────────────────► │ Cloudinary   │ ───────────────────────► │ MediaAsset │
│ file local  │   multipart/form-data│ trả url/     │  body: {kind, placement,  │ trong DB  │
└─────────────┘                      │ publicId,... │  title, url, ...}        └──────────┘
```

**Bước 1 — Upload file** (`multipart/form-data`, field tên `file`):

```typescript
const formData = new FormData();
formData.append('file', file);   // File (web) hoặc {uri,name,type} (mobile)

const res = await api.post('/uploads', formData);   // ⚠️ KHÔNG set Content-Type thủ công
// res.data = { url, publicId, format, size, kind, duration, posterUrl? }
```

> 💡 **Video**: BE tự sinh `posterUrl` (Cloudinary trích frame đầu tiên) → FE dùng làm `poster` / thumbnail, **không cần admin upload ảnh riêng**.

> 🔴 **QUAN TRỌNG — Web**: axios interceptor đã tự xóa `Content-Type` khi body là `FormData` (để browser tự set boundary). Nếu bạn set `Content-Type: multipart/form-data` thủ công → **mất boundary → BE trả 400 `MISSING_FIELD`**. Cứ `api.post('/uploads', formData)` là đủ.

**Bước 2 — Tạo MediaAsset** (JSON):

```json
{
  "kind": "VIDEO",
  "placement": "STORY_FEED",
  "title": "Cây thông 2m trong phòng khách",
  "caption": "Không gian ấm áp mùa Giáng Sinh",
  "url": "<url từ bước 1>",
  "publicId": "<publicId từ bước 1>",
  "posterUrl": "<posterUrl nếu có>",
  "format": "mp4",
  "size": 8421376,
  "duration": 12,
  "ctaLabel": "Mua ngay",
  "ctaLink": "/tree/670a...",
  "linkType": "PRODUCT",
  "linkId": "670a...",
  "isLoop": true,
  "volume": 40,
  "isActive": true,
  "sortOrder": 0
}
```

**Giới hạn dung lượng:** ảnh 5MB · video MP4 30MB · audio 15MB.

---

## 4. HƯỚNG DẪN CHO FRONTEND (WEB)

> Stack web: React + Vite + TypeScript. Không cần thêm thư viện mới — video dùng HTML5 `<video>` native, nhạc dùng HTML5 `<audio>` native.

### 4.2. Bước 1 — Type & API layer

**Tạo `src/types/media.ts`:**

```typescript
export type MediaKind = 'VIDEO' | 'AUDIO' | 'IMAGE';
export type MediaPlacement = 'HERO_BACKGROUND' | 'STORY_FEED' | 'MUSIC_TRACK' | 'PROMO';
export type MediaLinkType = 'PRODUCT' | 'CATEGORY' | 'NONE';

export interface MediaAsset {
  _id: string;
  kind: MediaKind;
  placement: MediaPlacement;
  title: string;
  caption?: string;
  url: string;
  publicId?: string;
  posterUrl?: string;
  format?: string;
  size?: number;
  duration?: number;
  ctaLabel?: string;
  ctaLink?: string;
  linkType: MediaLinkType;
  linkId?: string;
  musicArtist?: string;
  isLoop: boolean;
  volume: number;
  isActive: boolean;
  sortOrder: number;
}
```

**Thêm vào `src/lib/api.ts`:**

```typescript
// --- Media (Hero video / Story feed / Background music) ---
export const mediaApi = {
  list: (placement?: MediaPlacement, limit = 20) => {
    const qs = new URLSearchParams();
    if (placement) qs.set('placement', placement);
    if (limit) qs.set('limit', String(limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return api.get<{ assets: MediaAsset[] }>(`/media${suffix}`).then((r) => r.data);
  },

  stories: (limit = 12) => mediaApi.list('STORY_FEED', limit),
  hero: () => api.get<{ asset: MediaAsset | null }>('/media/hero').then((r) => r.data),
  backgroundMusic: () =>
    api.get<{ asset: MediaAsset | null }>('/media/background-music').then((r) => r.data),
};
```

> `import type { MediaAsset, MediaPlacement } from '@/types/media';` ở đầu file `api.ts`.

### 4.3. Bước 2 — Hook `useMediaAssets`

**Tạo `src/hooks/useMediaAssets.ts`:**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { mediaApi } from '@/lib/api';
import type { MediaAsset } from '@/types/media';

interface MediaState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useHeroMedia(): MediaState<MediaAsset> {
  const [state, setState] = useState<MediaState<MediaAsset>>({
    data: null, loading: true, error: null, reload: () => {},
  });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    mediaApi
      .hero()
      .then((res) => setState({ data: res.asset, loading: false, error: null, reload: load }))
      .catch(() => setState({ data: null, loading: false, error: 'Lỗi tải media', reload: load }));
  }, []);

  useEffect(() => { load(); }, [load]);
  return state;
}

export function useStoryFeed(limit = 12): MediaState<MediaAsset[]> {
  // ... tương tự, dùng mediaApi.stories(limit)
}

export function useBackgroundMusic(): MediaState<MediaAsset> {
  // ... tương tự, dùng mediaApi.backgroundMusic()
}
```

> **Không** để lỗi media làm crash app — luôn `catch` và trả `null` / `[]`.

### 4.4. Bước 3 — Nhạc nền toàn app (`BackgroundMusic`)

**Tạo `src/components/media/BackgroundMusic.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Music } from 'lucide-react';
import { useBackgroundMusic } from '@/hooks/useMediaAssets';

const VOLUME_KEY = 'byc_music_volume';
const MUTED_KEY = 'byc_music_muted';

export function BackgroundMusic({ enabled = true }: { enabled?: boolean }) {
  const { data: track } = useBackgroundMusic();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTED_KEY) === '1');
  const [volume, setVolume] = useState(() => Number(localStorage.getItem(VOLUME_KEY) ?? 40));
  const [expanded, setExpanded] = useState(false);

  // ── Autoplay + fallback theo gesture đầu tiên ──
  useEffect(() => {
    if (!enabled || !track?.url) return;

    const audio = new Audio(track.url);
    audio.loop = track.isLoop !== false;
    audio.volume = muted ? 0 : volume / 100;
    audioRef.current = audio;

    // 1) Thử phát ngay (thường bị chặn nếu chưa có gesture)
    const attempt = () => {
      audio.play()
        .then(() => setPlaying(true))
        .catch(() => {
          // 2) Bị chặn → chờ gesture đầu tiên của user
          const onGesture = () => {
            audio.play().then(() => setPlaying(true)).catch(() => {});
          };
          const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
          events.forEach((e) => document.addEventListener(e, onGesture, { once: true }));
        });
    };

    attempt();
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [track?.url, enabled]);

  // ── Volume / mute ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume / 100;
    localStorage.setItem(VOLUME_KEY, String(volume));
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  }, [volume, muted]);

  if (!track?.url) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      <button
        onClick={() => { setMuted(!muted); if (!muted) audioRef.current?.play().catch(() => {}); }}
        aria-label={muted ? 'Bật nhạc' : 'Tắt nhạc'}
        className="w-12 h-12 rounded-full bg-espresso/90 text-white shadow-lg flex items-center justify-center hover:scale-105 transition"
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
      {/* Mở rộng: tên nhạc + slider volume */}
      {expanded && (
        <div className="mt-2 p-3 rounded-2xl bg-white/95 shadow-xl w-56">
          <p className="text-xs font-semibold text-espresso truncate">
            {track.musicArtist ? `${track.musicArtist} — ` : ''}{track.title}
          </p>
          <input
            type="range" min={0} max={100} value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Âm lượng nhạc nền"
            className="w-full mt-2"
          />
        </div>
      )}
    </div>
  );
}
```

**Gắn vào layout gốc** (`src/App.tsx` hoặc `Layout.tsx` — nơi chứa `<Outlet />`/children):

```tsx
<BackgroundMusic enabled={!isPaymentRoute && !isAdminRoute} />
```

> 💡 Nên **tắt nhạc** ở màn hình thanh toán / admin (người dùng cần tập trung). Có thể dùng `useLocation()` để lấy pathname.

### 4.5. Bước 4 — Video nền Hero

**Tạo `src/components/media/HeroVideo.tsx`:**

```tsx
import { useState } from 'react';
import { useHeroMedia } from '@/hooks/useMediaAssets';

export function HeroVideo({ className = '' }: { className?: string }) {
  const { data: media } = useHeroMedia();
  const [failed, setFailed] = useState(false);

  // Không có media → không render gì (layout hiện tại giữ nguyên)
  if (!media?.url) return null;

  // VIDEO → <video> | IMAGE → <img>
  if (media.kind === 'IMAGE') {
    return (
      <img
        src={media.posterUrl || media.url}
        alt={media.title}
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  if (failed) {
    // Fallback sang poster nếu video không load được
    return media.posterUrl ? (
      <img src={media.posterUrl} alt={media.title} className={className} />
    ) : null;
  }

  return (
    <video
      key={media._id}
      className={className}
      src={media.url}
      poster={media.posterUrl}
      autoPlay
      muted          // ⚠️ BẮT BUỘC: video autoplay bị chặn nếu có tiếng
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
    />
  );
}
```

**Gắn vào `src/components/HeroBanner.tsx`** (đã có sẵn `bannersApi`):

```tsx
// Bên trong <section className="hero-banner-section">, phía trên <div className="hero-slider-box">
<HeroVideo className="absolute inset-0 w-full h-full object-cover" />
```

> Nếu banner slider đang có ảnh nền riêng, hãy cho `HeroVideo` làm lớp nền **phía sau** ảnh banner, hoặc thay ảnh banner đầu tiên bằng video khi `media.kind === 'VIDEO'`.

### 4.6. Bước 5 — Story feed dọc (Reels)

**Tạo `src/components/media/StoryFeed.tsx`** (hàng bong bóng ngang):

```tsx
import { useState } from 'react';
import { Play } from 'lucide-react';
import { useStoryFeed } from '@/hooks/useMediaAssets';
import { StoryViewer } from './StoryViewer';

export function StoryFeed() {
  const { data: stories } = useStoryFeed(12);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!stories?.length) return null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-4 py-4">
        {stories.map((s, i) => (
          <button
            key={s._id}
            onClick={() => setOpenIndex(i)}
            className="flex flex-col items-center gap-1 w-16 shrink-0"
          >
            <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-emerald-600 to-amber-400">
              <div className="w-full h-full rounded-full overflow-hidden border-2 border-white bg-espresso/10 flex items-center justify-center">
                {s.kind === 'VIDEO' ? (
                  <video src={s.url} poster={s.posterUrl} muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={s.posterUrl || s.url} alt={s.title} className="w-full h-full object-cover" />
                )}
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{s.title}</span>
          </button>
        ))}
      </div>

      <StoryViewer
        assets={stories}
        startIndex={openIndex ?? 0}
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
```

**Tạo `src/components/media/StoryViewer.tsx`** (modal dọc 9:16):

```tsx
import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaAsset } from '@/types/media';

interface Props {
  assets: MediaAsset[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}

const STORY_MS = 5000;

export function StoryViewer({ assets, startIndex, open, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => { if (open) { setIndex(startIndex); setProgress(0); } }, [open, startIndex]);

  // Đếm tiến trình bằng requestAnimationFrame
  useEffect(() => {
    if (!open) return;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const pct = Math.min(1, (now - startRef.current) / STORY_MS);
      setProgress(pct);
      if (pct >= 1) {
        setIndex((i) => {
          if (i + 1 < assets.length) { startRef.current = performance.now(); return i + 1; }
          onClose();
          return i;
        });
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [open, index, assets.length, onClose]);

  if (!open || !assets[index]) return null;
  const current = assets[index];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Vùng video 9:16 */}
      <div
        className="relative h-[85vh] aspect-[9/16] max-w-[95vw] rounded-2xl overflow-hidden bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        {current.kind === 'VIDEO' ? (
          <video
            key={current._id}
            src={current.url}
            poster={current.posterUrl}
            autoPlay
            muted
            playsInline
            loop={false}
            className="w-full h-full object-cover"
          />
        ) : (
          <img src={current.posterUrl || current.url} alt={current.title} className="w-full h-full object-cover" />
        )}

        {/* Thanh tiến trình */}
        <div className="absolute top-3 left-3 right-3 flex gap-1">
          {assets.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded overflow-hidden">
              <div
                className="h-full bg-white transition-none"
                style={{ width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Caption + CTA */}
        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white font-semibold">{current.title}</p>
          {current.caption && <p className="text-white/80 text-sm">{current.caption}</p>}
          {current.ctaLabel && (
            <a
              href={current.ctaLink || '#'}
              className="inline-block mt-2 px-4 py-2 rounded-full bg-white text-espresso font-semibold text-sm"
            >
              {current.ctaLabel}
            </a>
          )}
        </div>

        {/* Nút đóng */}
        <button onClick={onClose} aria-label="Đóng" className="absolute top-3 right-3 text-white">
          <X size={24} />
        </button>

        {/* Vùng chạm: trái = trước, phải = sau */}
        <button
          className="absolute inset-y-0 left-0 w-1/3 cursor-pointer"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          aria-label="Story trước"
        />
        <button
          className="absolute inset-y-0 right-0 w-2/3 cursor-pointer"
          onClick={() => setIndex((i) => Math.min(assets.length - 1, i + 1))}
          aria-label="Story sau"
        />
      </div>
    </div>
  );
}
```

**Gắn vào trang chủ** (`src/pages/Home.tsx` hoặc tương tự):

```tsx
<StoryFeed />
```

> 📍 Đặt **ngay dưới Hero** — đây là vị trí có tỷ lệ click cao nhất.

### 4.7. Bước 6 — Admin: trang quản lý Media (khuyến nghị)

Tạo `src/pages/admin/MediaManager.tsx` — bảng list + form upload:

| Chức năng | Gọi API |
|---|---|
| Upload file | `POST /api/uploads` (FormData) → lấy `url`, `publicId` |
| Tạo asset | `POST /api/admin/media` |
| Sửa asset | `PATCH /api/admin/media/:id` |
| Bật/tắt | `PATCH /api/admin/media/:id` với `{ isActive: !old }` |
| Xóa | `DELETE /api/admin/media/:id` |
| Danh sách | `GET /api/admin/media` |

> Trang admin media gồm: bảng list asset (checkbox bật/tắt, xóa) + form upload file (chọn `kind`, `placement`, `title`, `caption`, `ctaLabel`, `ctaLink`, `linkType`, `linkId`, `sortOrder`).
>
> Flow upload 2 bước (xem §3): chọn file → `POST /api/uploads` → lấy `url`/`publicId` → `POST /api/admin/media` với các field còn lại.

---

## 5. HƯỚNG DẪN CHO MOBILE (EXPO)

> Stack mobile: Expo (SDK 52) + React Native.

### 5.1. Bước 1 — Cài dependency

```bash
npx expo install expo-av
```

`expo-av` đã được chọn sẵn (video + audio đều dùng chung 1 lib). Nếu team muốn dùng `expo-video`/`expo-audio` mới (SDK 52+), cần đổi toàn bộ API dưới đây — **khuyến nghị giữ `expo-av`** để đồng nhất với web.

### 5.2. Bước 2 — API layer

**Thêm vào `src/api/index.ts`:**

```typescript
import type { MediaAsset, MediaPlacement } from '../types/media';

// --- Media (Hero video / Story feed / Background music) ---
export const mediaApi = {
  list: (placement?: MediaPlacement, limit = 20) => {
    const qs = new URLSearchParams();
    if (placement) qs.set('placement', placement);
    if (limit) qs.set('limit', String(limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return api.get<{ assets: MediaAsset[] }>(`/media${suffix}`).then((r) => r.data);
  },
  stories: (limit = 12) => mediaApi.list('STORY_FEED', limit),
  hero: () => api.get<{ asset: MediaAsset | null }>('/media/hero').then((r) => r.data),
  backgroundMusic: () =>
    api.get<{ asset: MediaAsset | null }>('/media/background-music').then((r) => r.data),
};
```

**Tạo `src/types/media.ts`** — copy nguyên interface `MediaAsset` từ mục [4.2](#42-bước-1--type--api-layer).

> ⚠️ Mobile axios interceptor gửi `X-Session-Id` cho khách — hoàn toàn OK vì `/api/media/*` là public.

### 5.3. Bước 3 — Nhạc nền toàn app

**Tạo `src/components/BackgroundMusic.tsx`:**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBackgroundMusic } from '../hooks/useMedia';

const VOLUME_KEY = 'byc_music_volume';
const MUTED_KEY = 'byc_music_muted';

export function BackgroundMusic({ enabled = true }: { enabled?: boolean }) {
  const { data: track } = useBackgroundMusic();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.4);

  // Load trạng thái đã lưu
  useEffect(() => {
    (async () => {
      const [v, m] = await Promise.all([
        AsyncStorage.getItem(VOLUME_KEY),
        AsyncStorage.getItem(MUTED_KEY),
      ]);
      if (v) setVolume(Number(v));
      setMuted(m === '1');
    })();
  }, []);

  // Phát nhạc nền
  useEffect(() => {
    if (!enabled || !track?.url) return;

    let cancelled = false;

    (async () => {
      // Cấu hình audio session: cho phát kể cả khi máy im
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true, isLooping: track.isLoop !== false, volume: muted ? 0 : volume }
      );

      if (cancelled) { await sound.unloadAsync(); return; }
      soundRef.current = sound;
      setPlaying(true);
    })();

    return () => {
      cancelled = true;
      soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlaying(false);
    };
  }, [track?.url, enabled]);

  // Đồng bộ volume/mute
  useEffect(() => {
    soundRef.current?.setVolumeAsync(muted ? 0 : volume);
    AsyncStorage.setItem(VOLUME_KEY, String(volume));
    AsyncStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  }, [volume, muted]);

  if (!track?.url) return null;

  return (
    <Pressable
      style={styles.fab}
      onPress={() => {
        const next = !muted;
        setMuted(next);
        if (!next) soundRef.current?.playAsync();
      }}
      accessibilityLabel={muted ? 'Bật nhạc nền' : 'Tắt nhạc nền'}
    >
      <Text style={styles.icon}>{muted ? '🔇' : '🎵'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 16, bottom: 24,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(12,56,35,0.9)',
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
  },
  icon: { fontSize: 20 },
});
```

> 🎨 Áp dụng **design token / theme của app** (màu thương hiệu, bo góc, typography) thay vì hardcode màu — chỉnh theo hệ thống style sẵn có trong repo mobile.
> ⚠️ iOS: `playsInSilentModeIOS: true` là bắt buộc, nếu không nhạc sẽ không phát khi user đang im lặng máy.

**Gắn vào root navigation** (nơi chứa `NavigationContainer` / bottom tabs):

```tsx
<BackgroundMusic enabled={!isPaymentScreen} />
```

> ⚠️ **iOS**: `playsInSilentModeIOS: true` là bắt buộc, nếu không nhạc sẽ không phát khi user đang im lặng máy.

### 5.4. Bước 4 — Video nền Hero

**Trong `src/screens/HomeScreen.tsx`:**

```tsx
import { Video, VideoSurfaceType } from 'expo-av';
import { useHeroMedia } from '../hooks/useMedia';

const { data: heroMedia } = useHeroMedia();
const [heroFailed, setHeroFailed] = useState(false);

useEffect(() => { setHeroFailed(false); }, [heroMedia?.url]);
```

```tsx
<View style={styles.hero}>
  {heroMedia?.url && heroMedia.kind === 'VIDEO' && !heroFailed ? (
    <Video
      source={{ uri: heroMedia.url }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      shouldPlay
      isLooping
      isMuted                    // ⚠️ bắt buộc cho autoplay
      useNativeControls={false}
      videoSurfaceType={VideoSurfaceType.TextureView}
      onError={() => setHeroFailed(true)}
    />
  ) : (
    <Image
      source={{ uri: heroMedia?.posterUrl ?? DEFAULT_HERO_IMAGE }}
      style={styles.heroImage}
      resizeMode="cover"
    />
  )}
  {/* ... overlay + nội dung hero hiện có ... */}
</View>
```

> 💡 `VideoSurfaceType.TextureView` giúp video nằm đúng layer với UI RN (quan trọng khi có overlay).

### 5.5. Bước 5 — Story feed dọc (Reels)

**Tạo `src/components/StoryFeed.tsx`** (hàng bong bóng ngang):

```tsx
import React from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Video } from 'expo-av';
import { Colors, Radius, Spacing, Typography } from '../theme/colors';
import type { MediaAsset } from '../types/media';

interface Props {
  assets: MediaAsset[];
  onOpen: (index: number) => void;
}

export function StoryFeed({ assets, onOpen }: Props) {
  if (!assets.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {assets.map((s, i) => (
        <Pressable key={s._id} style={styles.item} onPress={() => onOpen(i)}>
          <View style={styles.ring}>
            {s.kind === 'VIDEO' ? (
              <Video
                source={{ uri: s.posterUrl || s.url }}
                style={styles.thumb}
                shouldPlay={false}
                isMuted
              />
            ) : (
              <Image source={{ uri: s.posterUrl || s.url }} style={styles.thumb} />
            )}
          </View>
          <Text style={styles.label} numberOfLines={1}>{s.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.lg ?? 16,
    paddingVertical: Spacing.md ?? 12,
    gap: 12,
  },
  item: { width: 64, alignItems: 'center' },
  ring: {
    width: 56, height: 56, borderRadius: 28, padding: 2,
    backgroundColor: Colors.primaryDarker,
    borderWidth: 2, borderColor: Colors.gold,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%', borderRadius: 26 },
  label: { fontSize: 10, marginTop: 4, color: Colors.textSecondary },
});
```

**Tạo `src/components/StoryViewer.tsx`** (modal dọc 9:16):

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Dimensions, Pressable, TouchableOpacity } from 'react-native';
import { Video } from 'expo-av';
import { Colors } from '../theme/colors';
import type { MediaAsset } from '../types/media';

const { width: SCREEN_W } = Dimensions.get('window');
const STORY_MS = 5000;

interface Props {
  assets: MediaAsset[];
  startIndex: number;
  visible: boolean;
  onClose: () => void;
  onCta?: (asset: MediaAsset) => void;
}

export function StoryViewer({ assets, startIndex, visible, onClose, onCta }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (visible) { setIndex(startIndex); setProgress(0); startRef.current = Date.now(); } }, [visible, startIndex]);

  // Đếm tiến trình
  useEffect(() => {
    if (!visible) return;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = elapsed / STORY_MS;
      setProgress(pct);
      if (pct >= 1) {
        setIndex((i) => {
          if (i + 1 < assets.length) { startRef.current = Date.now(); return i + 1; }
          onClose();
          return i;
        });
      }
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, index, assets.length, onClose]);

  if (!visible || !assets[index]) return null;
  const current = assets[index];
  const H = SCREEN_W * (16 / 9);

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.frame, { height: H }]}>
          {current.kind === 'VIDEO' ? (
            <Video
              key={current._id}
              source={{ uri: current.url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              shouldPlay
              isMuted
              useNativeControls={false}
              videoSurfaceType={VideoSurfaceType.TextureView}
            />
          ) : (
            <Image source={{ uri: current.posterUrl || current.url }} style={StyleSheet.absoluteFill} />
          )}

          {/* Thanh tiến trình */}
          <View style={styles.progressBar}>
            {assets.map((_, i) => (
              <View key={i} style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, {
                    width: i < index ? '100%' : i === index ? `${Math.min(100, progress * 100)}%` : '0%',
                  }]}
                />
              </View>
            ))}
          </View>

          {/* Caption + CTA */}
          <View style={styles.footer}>
            <Text style={styles.title}>{current.title}</Text>
            {current.caption ? <Text style={styles.caption}>{current.caption}</Text> : null}
            {current.ctaLabel ? (
              <TouchableOpacity style={styles.cta} onPress={() => onCta?.(current)}>
                <Text style={styles.ctaText}>{current.ctaLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Chạm trái/giữa/phải */}
          <Pressable style={styles.tapLeft} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
          <Pressable style={styles.tapRight} onPress={() => setIndex((i) => Math.min(assets.length - 1, i + 1))} />
        </View>

        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Đóng">
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: SCREEN_W, aspectRatio: 9 / 16, backgroundColor: '#000' },
  progressBar: { position: 'absolute', top: 40, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  progressTrack: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressFill: { height: 2, backgroundColor: '#fff' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  caption: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  cta: { marginTop: 12, alignSelf: 'flex-start', backgroundColor: Colors.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  ctaText: { color: Colors.primaryDarker, fontWeight: '700', fontSize: 13 },
  tapLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '30%' },
  tapRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '70%' },
  close: { position: 'absolute', top: 50, right: 20 },
  closeText: { color: '#fff', fontSize: 26 },
});
```

**Gắn vào `src/screens/HomeScreen.tsx`:**

```tsx
// Repo dùng custom hook `useAppNavigation()` — không phải useNavigation trực tiếp.
const { data: stories } = useStories(12);
const [storyIndex, setStoryIndex] = useState<number | null>(null);

// ... trong ScrollView, ngay dưới Hero:
<StoryFeed assets={stories ?? []} onOpen={(i) => setStoryIndex(i)} />

// ... ở cuối component (trong SafeAreaView, cùng cấp với ScrollView):
<StoryViewer
  assets={stories ?? []}
  startIndex={storyIndex ?? 0}
  visible={storyIndex !== null}
  onClose={() => setStoryIndex(null)}
  onCta={(asset) => {
    setStoryIndex(null);
    if (asset.linkType === 'PRODUCT' && asset.linkId) {
      navigation.navigate('ProductDetail', { productId: asset.linkId });
    }
  }}
/>
```

> 📌 Trước khi dùng `navigation.navigate('ProductDetail', ...)`, kiểm tra tên route trong `src/navigation/types.ts` — repo có `RootStackParamList`. Điều chỉnh tên route cho khớp.

### 5.6. Bước 6 — Hook mobile

**Tạo `src/hooks/useMedia.ts`:**

```typescript
import { useEffect, useState } from 'react';
import { mediaApi } from '../api';
import type { MediaAsset } from '../types/media';

export function useHeroMedia() {
  const [data, setData] = useState<MediaAsset | null>(null);
  useEffect(() => {
    mediaApi.hero().then((r) => setData(r.asset)).catch(() => setData(null));
  }, []);
  return { data };
}

export function useStories(limit = 12) {
  const [data, setData] = useState<MediaAsset[]>([]);
  useEffect(() => {
    mediaApi.stories(limit).then((r) => setData(r.assets)).catch(() => setData([]));
  }, [limit]);
  return { data };
}

export function useBackgroundMusic() {
  const [data, setData] = useState<MediaAsset | null>(null);
  useEffect(() => {
    mediaApi.backgroundMusic().then((r) => setData(r.asset)).catch(() => setData(null));
  }, []);
  return { data };
}
```

---

## 6. QUY TẮC BẮT BUỘC (KHÔNG ĐƯỢC VI PHẠM)

| # | Quy tắc | Lý do |
|---|---|---|
| 1 | **Luôn `muted` cho video autoplay** | Browser (web) và iOS (mobile) chặn autoplay video có tiếng |
| 2 | **Luôn có fallback** (poster / ảnh mặc định) | Media có thể 404, mạng yếu, admin tắt asset |
| 3 | **Không để lỗi media làm crash app** | `try/catch` → trả `null` / `[]` |
| 4 | **`isActive=false` → FE không hiển thị** | BE đã lọc ở API public, nhưng admin list thì không — lọc thêm ở UI |
| 5 | **Nhạc nền tắt ở màn hình thanh toán / admin** | UX — user cần tập trung |
| 6 | **Upload bằng multipart, KHÔNG base64** | Base64 tăng 33% dung lượng, dễ vượt giới hạn 15/30MB |
| 7 | **Không set `Content-Type` thủ công khi gửi FormData** | Mất boundary → BE trả 400 |
| 8 | **Video story dọc nên 720×1280 (9:16), ≤ 15–20s** | Tối ưu băng thông mobile |
| 9 | **Luôn khai báo `posterUrl` cho video** | Hiển thị ngay khi video chưa load xong |
| 10 | **Tôn trọng `prefers-reduced-motion`** (web) | Accessibility — tự tắt autoplay nếu user giảm motion |

---

## 7. EDGE CASES & XỬ LÝ LỖI

| Tình huống | Xử lý |
|---|---|
| `GET /api/media` trả `{ assets: [] }` | Không render StoryFeed, không hiện FAB nhạc — app bình thường |
| `GET /api/media/hero` trả `{ asset: null }` | Dùng ảnh hero mặc định / banner hiện có |
| Video lỗi load (`onError`) | Fallback sang `posterUrl` → ẩn hẳn video |
| Audio bị chặn autoplay | Chờ gesture đầu tiên (`pointerdown`/`keydown`/`touchstart`/`scroll` — web) hoặc nút play thủ công (mobile) |
| User đã mute nhạc | Lưu `localStorage` / `AsyncStorage`, tôn trọng khi vào lại app |
| Admin xóa asset đang hiển thị | FE phải refetch (`reload()`) hoặc lắng nghe event để cập nhật |
| Mạng chậm, video nặng | `preload="metadata"` (web), `shouldPlay` + `isMuted` (mobile), luôn có poster |
| `placement` không hợp lệ từ client | BE trả `{ assets: [] }` — không lỗi |

---

## 8. CHECKLIST BÀN GIAO

### Backend (BE) — ✅ ĐÃ XONG
- [x] Model `MediaAsset` + đăng ký `models/index.ts`
- [x] `uploadController` hỗ trợ audio (mp3/m4a/wav/ogg, 15MB)
- [x] `mediaController` public: `/api/media`, `/api/media/hero`, `/api/media/background-music`
- [x] Admin CRUD: `/api/admin/media` (GET/POST/PATCH/DELETE)
- [x] Routes + mount vào `app.ts`
- [x] Fix bug `createBanner`/`updateBanner` persist đủ field
- [x] `tsc --noEmit` pass ✅
- [x] Docs: `FE_API_REFERENCE.md` (PHẦN 10B) + `API_CHANGELOG.md`

### Frontend (Web) — TODO
- [ ] `src/types/media.ts` — interface `MediaAsset`
- [ ] `src/lib/api.ts` — thêm `mediaApi`
- [ ] `src/hooks/useMediaAssets.ts` — 3 hooks
- [ ] `src/components/media/BackgroundMusic.tsx` — autoplay + fallback + FAB + volume
- [ ] `src/components/media/HeroVideo.tsx` — video + poster fallback
- [ ] `src/components/media/StoryFeed.tsx` + `StoryViewer.tsx` — dọc 9:16 + progress + CTA
- [ ] Gắn `StoryFeed` dưới Hero ở trang chủ
- [ ] `src/pages/admin/MediaManager.tsx` — trang quản lý media (khuyến nghị)

### Mobile (Expo) — TODO
- [ ] `npx expo install expo-av`
- [ ] `src/types/media.ts` + `src/api/index.ts` (`mediaApi`)
- [ ] `src/hooks/useMedia.ts` — 3 hooks
- [ ] `src/components/BackgroundMusic.tsx` — `Audio.Sound` + audio session
- [ ] Hero video trong `HomeScreen.tsx` (`Video` + `TextureView`)
- [ ] `src/components/StoryFeed.tsx` + `StoryViewer.tsx` (modal)
- [ ] Gắn `StoryFeed` + `StoryViewer` trong `HomeScreen.tsx`

### Kiểm thử
- [ ] Upload 1 video MP4 + 1 file MP3 qua admin → tạo MediaAsset → thấy hiển thị ở FE/mobile
- [ ] Tắt `isActive` → FE/mobile ẩn ngay
- [ ] Test autoplay: mở app lần đầu (chưa gesture) → sau khi tap → nhạc phát
- [ ] Test iOS silent mode → nhạc vẫn phát
- [ ] Test mất mạng → poster/ảnh fallback hiện đúng
- [ ] Test admin xóa asset → FE reload không crash

---

## 9. PHỤ LỤC: CÂY FILE ĐỀ XUẤT

### Frontend (Web)
```
src/
├── types/media.ts                    # NEW
├── lib/api.ts                        # + mediaApi
├── hooks/useMediaAssets.ts           # NEW
├── components/media/
│   ├── BackgroundMusic.tsx           # NEW
│   ├── HeroVideo.tsx                 # NEW
│   ├── StoryFeed.tsx                 # NEW
│   └── StoryViewer.tsx               # NEW
└── pages/admin/MediaManager.tsx      # NEW (khuyến nghị)
```

### Mobile (Expo)
```
src/
├── types/media.ts                    # NEW
├── api/index.ts                      # + mediaApi
├── hooks/useMedia.ts                 # NEW
├── components/
│   ├── BackgroundMusic.tsx           # NEW
│   ├── StoryFeed.tsx                 # NEW
│   └── StoryViewer.tsx               # NEW
└── screens/HomeScreen.tsx            # + Hero video + Story
```

---

## 📞 LIÊN HỆ & GHI CHÚ

- **BE branch**: `christmas` (đã push, đã merge)
- **BE đã merge & deploy**: ✅
- **Tài liệu API chi tiết**: [`FE_API_REFERENCE.md` → PHẦN 10B](./FE_API_REFERENCE.md)
- **Lịch sử thay đổi**: [`API_CHANGELOG.md` → 2026-10-30](./API_CHANGELOG.md)
- **OpenAPI**: `openapi.yaml` (cần cập nhật nếu team muốn đồng bộ — BE có thể bổ sung)
- **Nếu cần thêm endpoint** (vd: `GET /api/media?kind=VIDEO` filter, hoặc nhiều nhạc nền) → liên hệ BE.

---

**Hết tài liệu.** Nếu team FE/Mobile cần hỗ trợ khi triển khai, hãy gửi lỗi cụ thể — BE sẽ hỗ trợ.
