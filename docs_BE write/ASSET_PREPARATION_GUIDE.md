# Hướng dẫn Chuẩn bị Ảnh — Context-aware Compositing (4 lớp)

> Tài liệu dành cho **đội ngữ ảnh / designer / admin vận hành**.
> Mục tiêu: chuẩn bị bộ ảnh đủ chất lượng để cây + phụ kiện tự chọn trông như **ảnh thương mại**, không còn cảm giác "dán sticker".
>
> **Không dùng tài liệu này cho code.** Phần API/schema nằm ở [`BE_HANDOFF_COMPOSITING.md`](./BE_HANDOFF_COMPOSITING.md).

---

## 0. Tóm tắt: vì sao ảnh quan trọng hơn code

Hệ thống 4 lớp đã giải quyết phần "kỹ thuật". Còn lại là **chất lượng ảnh**:

| Vấn đề | Nguyên nhân gốc | Cách sửa |
| :-- | :-- | :-- |
| Phụ kiện trông "dán" | Neo giữa ảnh thay vì neo móc treo | Đặt `anchor` đúng điểm móc (y ≈ 0.06) |
| Phụ kiện "lơ lửng" trên cành | Không có bóng tiếp xúc | Đặt `shadow = 'contact'` |
| Quả châu to bằng nơ | Ảnh phụ kiện không cùng tỉ lệ thật | Dùng `defaultScale` + `scaleHint` |
| Cành không che được phụ kiện | Thiếu ảnh mask cành trước | Chuẩn bị `foregroundMask` |
| Ruy băng thẳng, cứng | Dùng PNG ruy băng dàn thẳng | Dùng slot `garland` (SVG sinh tự động) |

> **Nguyên tắc số 1:** Nếu ảnh phụ kiện còn mang **cành/lá cây ở phía sau** thì khi ghép, người dùng sẽ thấy "mảng lá cây" lơ lửng giữa không trung ⇒ ảnh sai. Phải khoét sạch.

---

## 1. Yêu cầu chung cho MỌI ảnh

| Thuộc tính | Yêu cầu | Lý do |
| :-- | :-- | :-- |
| Định dạng | **PNG** (có alpha) | Cần nền trong suốt để lớp ghép hoạt động |
| Không gian màu | sRGB | Khớp hiển thị màn hình |
| Kênh alpha | **Không** bake nền trắng/đen | Nền đục sẽ thành "viền" khi ghép |
| Cắt nền | Sạch, không viền trắng/quầng sáng | Viền sáng = dấu hiệu "dán" rõ nhất |
| Tỉ lệ | Giữ nguyên tỉ lệ gốc, **không** méo | FE tự tính theo aspect ratio |
| Nền | Trong suốt hoàn toàn (alpha = 0) | |

### Cỡ ảnh khuyến nghị

| Loại ảnh | Kích thước dài cạnh | Ghi chú |
| :-- | :-- | :-- |
| Quả châu, quả thông, bông | 512–1024 px | Nhỏ hơn cũng được (scaled nhỏ trên cây) |
| Nơ (bow) | 1024 px | Nơ chi tiết, cần độ nét |
| Ngôi sao đỉnh | 1024–2048 px | Hiển thị to nhất |
| Chân cây (stand) | 1024 px | |
| Cây trơn (`bareImage`) | 1600–3000 px | Ảnh lớn để export PNG độ phân giải cao |
| Mask cành trước (`foregroundMask`) | **= `bareImage` (chính xác từng pixel)** | Bắt buộc |

> **Giữ dư định dạng gốc:** nếu ảnh nguồn là JPEG 4000px, hãy xuất PNG ở **cùng kích thước** với `bareImage` khi làm mask.

---

## 2. Lớp 1 — Cây trơn (`bareImage`)

Ảnh cây **chưa trang trí**, nhìn chính diện.

**Yêu cầu:**

- Cây đứng thẳng, **chính diện** (camera vuông góc, không xiên, không perspective mạnh).
- Toàn bộ cây (từ đỉnh xuống gốc) nằm trong khung, có lề an toàn ~3–5%.
- Nền trắng hoặc nền studio đồng nhất ⇒ FE tự tách nền qua Cloudinary `e_background_removal`.
- Có thể giữ **chân cây (stand)** trong ảnh — nó là một phần của cây trơn.
- **Ánh sáng studio đều, không đổ bóng mạnh** trên nền (bóng đổ trên nền sẽ bị tách nền mang theo).

**Vì sao quan trọng:** toàn bộ hệ toạ độ 0–1 của SlotMap được đo trên ảnh này. Ảnh phải **ổn định** — không đổi giữa các lần upload (nếu đổi thì mọi slot đã khai sẽ lệch).

---

## 3. Lớp 4 — Mask cành trước (`foregroundMask`)

Đây là **ảnh mới quan trọng nhất** — nó là thứ biến cây "phẳng" thành cây "thật".

### 3.1 Khái niệm

Từ ảnh cây trơn, tách riêng **các nhánh/cành ở phía trước** (những cành che được vật ở sau) thành một PNG alpha riêng.

Khi ghép:

```
Lớp 1  Cây trơn        ┐
Lớp 2  Phụ kiện SAU   ┘ bị lớp 4 che
Lớp 3  Phụ kiện TRƯỚC  → nằm trên lớp 4
Lớp 4  Cành trước      ┐
                        ┘ che phụ kiện SAU
```

⇒ Phụ kiện "sau cành" **biến mất một phần** sau cành ⇒ trông như đang nằm trong tán cây.

### 3.2 Yêu cầu bắt buộc

| # | Yêu cầu | Kiểm tra |
| :-- | :-- | :-- |
| 1 | **Cùng pixel size với `bareImage`** (W×H khớp tuyệt đối) | Admin UI tự cảnh báo khi lệch |
| 2 | Cùng khung, cùng vị trí, cùng góc máy | So trực quan 2 ảnh chồng lên nhau |
| 3 | PNG có alpha | Alpha = 0 ngoài cành |
| 4 | **KHÔNG** dùng `e_background_removal` khi phục vụ | Đây là PNG đã cắt sẵn |
| 5 | Cành ở lớp 4 **chồng khít** với cành ở lớp 1 | Lệch 1–2 px là chấp nhận được |

### 3.3 Cách tách mask (khuyến nghị)

**Cách A — Chụp lại cùng bộ (tốt nhất):**
Chụp cây với **chỉ các cành trước** hiện diện (bỏ/tối đa hóa phần tán sau). Nhưng thực tế khó.

**Cách B — Dùng ảnh cây trơn, khoét thủ công (Photoshop / Affinity):**
1. Mở `bareImage`.
2. Tạo layer mới, chọn vùng **cành tiền cảnh** (những cành ở gần camera, thường ở rìa ngoài tán và phía dưới).
3. Khoét alpha, giữ chi tiết lá kim.
4. Export PNG cùng kích thước.

**Cách C — Dùng công cụ "remove background" cho từng cành:**
Cắt từng cành riêng, ghép lại. Chậm hơn nhưng kiểm soát tốt.

### 3.4 Nguyên tắc chọn cành nào thuộc "lớp 4"

Chọn **những cành che được vật ở phía sau**. Thường là:

- ✅ Cành ở **rìa ngoài** tán (trước mặt phẳng người).
- ✅ Cành ở **phía dưới** tán, nằm ngang trước thân cây.
- ✅ Cành có **độ dày, sắc nét** — che được vật sau.
- ❌ Cành **mảnh, mờ, ở sâu** — che vật sẽ trông lỗi.
- ❌ **Toàn bộ** tán cây — nếu che hết thì phụ kiện "sau" biến mất hoàn toàn.

> **Heuristic kiểm tra:** sau khi ghép, slot `depth = 'behind'` phải **vẫn thấy được khoảng 40–70%** phụ kiện. Nếu mất hết ⇒ che quá nặng.

---

## 4. Phụ kiện — ảnh PNG tách nền

### 4.1 Quy tắc vàng

1. **Tách nền sạch** — không viền trắng, không quầng sáng, không viền đen.
2. **KHÔNG mang theo cành/lá cây ở phía sau.** Đây là lỗi phổ biến nhất. Nếu ảnh nguồn chụp trên cây, phải khoét sạch phần nền.
3. **Không khoét cắt mất bóng của chính vật** (bóng đổ trên mặt đất / mặt cành) — bóng đó là chiều sâu.
4. **Vuông?** Không bắt buộc, nhưng ảnh vuông dễ đo `anchor` hơn.
5. Giữ **mềm mại, không cắt gọn** cạnh (aliasing) — ảnh quá sắc nhìn "dán".

### 4.2 Ảnh `image` vs `previewImage`

| Field | Dùng để | Yêu cầu |
| :-- | :-- | :-- |
| `image` | Ảnh được kéo-thả lên cây (có alpha, chính là ảnh `anchor` đo trên) | PNG alpha, sạch |
| `previewImage` | Ảnh xem trước to (catalog, admin) | JPG/PNG chất lượng cao, nền đẹp |

> ⚠️ **`anchor` đo trên `image`, KHÔNG phải `previewImage`.** Nếu 2 ảnh khác tỉ lệ ⇒ neo sẽ lệch.

---

## 5. Checklist theo nhóm phụ kiện

### 5.1 Quả châu (BAUBLE / `slotType: 'ball'`)

| Mục | Giá trị khuyến nghị |
| :-- | :-- |
| Tỉ lệ ảnh | Vuông hoặc gần vuông |
| `anchor` | `{ x: 0.5, y: 0.06 }` — **móc treo ở trên** |
| `shadow` | `contact` |
| `defaultScale` | `1.0` (quả nhỏ) → `1.3` (quả cây lớn) |
| Ghi chú ảnh | Ảnh phải có **móc/sợi treo** ở trên, cắt sát mép trên |

> **Quan trọng:** nếu ảnh quả châu **không có móc**, hãy đặt `anchor.y ≈ 0.02` và cắt sát mép trên — miễn là phần "trên cùng" của quả tiếp xúc với cành.

### 5.2 Nơ / ruy băng nơ (BOW / `slotType: 'bow'`)

| Mục | Giá trị khuyến nghị |
| :-- | :-- |
| Tỉ lệ ảnh | Vuông |
| `anchor` | `{ x: 0.5, y: 0.45 }` — **nút thắt ở giữa** |
| `shadow` | `contact` |
| `defaultScale` | `1.2` |

> Nơ phải có **nút thắt ở chính giữa** ảnh để neo đúng. Nếu nơ lệch, cắt lại ảnh cho cân.

### 5.3 Ruy băng uốn (GARLAND / `slotType: 'garland'`)

| Mục | Ghi chú |
| :-- | :-- |
| Ảnh PNG | **Không cần** — slot `garland` được vẽ bằng **SVG sinh tự động** |
| `anchor` | Không dùng |
| `shadow` | Không dùng (SVG có sẵn lớp bóng) |
| `depth` | `front` (ruy băng phải nằm trước cành) |
| Màu | Đặt trong slot/slotType hoặc theme |

**Nếu vẫn muốn dùng ảnh ruy băng PNG** (ruy băng vải cuộn, ruy băng kim tuyến cứng): dùng `slotType` khác (ví dụ `ribbon`) và khai `anchor` ở **đầu cuộn dây** để nó móc vào cành.

### 5.4 Quả thông / bông / kim cương (PINEAPPLE, FLOWER, `slotType: 'pine'`/`'flower'`)

| Mục | Giá trị khuyến nghị |
| :-- | :-- |
| Tỉ lệ ảnh | Theo thật |
| `anchor` | `{ x: 0.5, y: 0.5 }` — tâm |
| `shadow` | `contact` |
| `defaultScale` | `1.0` |

> Các vật này thường **gắn nhiều cụm**. Ảnh nên là **một cụm** để lặp lại không bị lặp lại rõ.

### 5.5 Ngôi sao đỉnh (STAR / `slotType: 'star-top'`)

| Mục | Giá trị khuyến nghị |
| :-- | :-- |
| Tỉ lệ ảnh | Vuông |
| `anchor` | `{ x: 0.5, y: 0.5 }` |
| `shadow` | `soft` |
| `defaultScale` | `1.4` |

### 5.6 Chân cây (STAND / `slotType: 'stand'`)

| Mục | Giá trị khuyến nghị |
| :-- | :-- |
| `anchor` | `{ x: 0.5, y: 0.95 }` — **đáy ảnh** |
| `shadow` | `contact` |

> Chân cây thường **đã nằm trong `bareImage`**. Chỉ cần phụ kiện riêng khi muốn cho khách đổi kiểu chân.

### 5.7 Đèn (LIGHT_STRING / `slotType: 'light'`)

| Mục | Giá trị khuyến nghị |
| :-- | :-- |
| `shadow` | `none` hoặc `soft` nhẹ |
| `anchor` | `{ x: 0.5, y: 0.5 }` |
| Ghi chú | Dây đèn neon phẳng ⇒ `shadow: 'none'` |

---

## 6. Hướng dẫn khai `anchor` trong Admin UI

1. Vào **Admin → Phụ kiện**.
2. Cột **"Ghép ảnh"** → bấm nút *"Ghép ảnh"*.
3. Ở khung preview, **kéo chéo để chỉnh vị trí neo** tới:
   - móc treo (quả châu),
   - nút thắt (nơ),
   - tâm vật (bông, thông).
4. Hoặc bấm preset nhanh: *Giữa / Móc trên / Nút nơ / Đáy*.
5. **Kiểm tra trực quan:** bấm *Gợi ý bố cục* ở trang Customizer ⇒ phụ kiện phải **móc** vào cành, không lơ lửng.

> **Dấu hiệu neo sai:**
> - Phụ kiện **chuim vào trong** cành ⇒ neo đang ở trên quá ⇒ giảm `anchor.y`.
> - Phụ kiện **lơ lửng** dưới cành ⇒ neo đang ở dưới quá ⇒ tăng `anchor.y`.

---

## 7. Quy trình nghiệm thu 1 cây

1. ☐ Upload `bareImage`.
2. ☐ Upload `foregroundMask` — **cùng kích thước** (admin báo lỗi nếu lệch).
3. ☐ Bật preview *"Xem trước lớp"* trong SlotMap Editor ⇒ xác nhận cành che đúng chỗ.
4. ☐ Khai slot: phần lõi tán → `depth: 'behind'`; phần rìa ngoài → `depth: 'front'`.
5. ☐ Cảnh báo *"Vị trí này không nằm trong vùng cành tiền cảnh"* ⇒ đổi sang `front`.
6. ☐ Bấm *"Gợi ý bố cục"* ⇒ kiểm tra phụ kiện có móc đúng cành không.
7. ☐ Kiểm tra bóng: mọi phụ kiện có bóng **cùng hướng** (ánh sáng từ trên-trái).
8. ☐ Bấm *"Tải ảnh"* ⇒ mở file PNG xuất ra, so với màn hình ⇒ phải giống nhau.
9. ☐ Kiểm tra bằng mắt: **không còn cảm giác sticker** — phụ kiện sau cành bị che một phần.

---

## 8. Xử lý sự cố

| Triệu chứng | Nguyên nhân | Khắc phục |
| :-- | :-- | :-- |
| Phụ kiện "sau cành" không bị che | Cây chưa có `foregroundMask` | Upload mask cho variant |
| Cây bị lệch khi ghép | Mask ≠ kích thước `bareImage` | Xuất lại mask đúng kích thước |
| Phụ kiện có viền trắng | Tách nền chưa sạch | Khoét lại, xoá quầng sáng |
| Có "mảng lá cây" lơ lửng | Ảnh phụ kiện mang theo cành sau | Khoét sạch phần nền cây |
| Quả châu lơ lửng dưới cành | `anchor.y` quá lớn | Giảm `anchor.y` về ~0.06 |
| Phụ kiện chuim sâu vào cành | `anchor.y` quá nhỏ | Tăng `anchor.y` |
| Bóng lệch hướng giữa 2 phụ kiện | Không nên xảy ra (dùng chung hướng sáng) | Kiểm tra `shadow` có bị set `'none'` không |
| Quả châu to lệch so với thật | Thiếu `defaultScale` / `scaleHint` | Khai `defaultScale` & `scaleHint` |
| Ruy băng thẳng, cứng | Slot chưa khai `slotType: 'garland'` | Đổi `slotType` sang `garland` |
| PNG xuất ra lệch màn hình | Lỗi transform ở renderer | Báo lại kèm ảnh mẫu |

---

## 9. Template đặt tên file

```
<sku>__<purpose>__<variant>.png

Ví dụ:
  bauble-red-01__bare__tree-green-m.png
  bauble-red-01__mask__tree-green-m.png
  bow-satin-gold__image.png
```

**Quy tắc:** `mask` luôn đi kèm đúng 1 `bare` cùng variant.

---

## 10. Checklist bàn giao

- [ ] `bareImage` — PNG, cây trơn, nền studio đều, chính diện.
- [ ] `foregroundMask` — PNG alpha, **cùng pixel size** `bareImage`, chồng khít.
- [ ] Ảnh phụ kiện — PNG alpha, tách nền sạch, **không mang cành cây phía sau**.
- [ ] Mỗi phụ kiện đã khai `anchor` (đúng điểm móc/nút thắt/tâm).
- [ ] Mỗi phụ kiện đã khai `shadow` (`contact` cho vật nặng, `none` cho vật phẳng).
- [ ] Mỗi phụ kiện đã khai `defaultScale` (khớp kích thước thật).
- [ ] Slot đã khai `depth` & `scaleHint`.
- [ ] Slot `garland` dùng ruy băng SVG, không cần ảnh.
- [ ] Đã test nút *"Tải ảnh"* ⇒ PNG khớp màn hình.
- [ ] Đã test *"Gợi ý bố cục"* ⇒ không phụ kiện nào lơ lửng.
