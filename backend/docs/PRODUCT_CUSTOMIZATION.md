# Cá nhân hóa cây tùng BASE

## Phạm vi và luồng sử dụng

Web: `/customizer/pick` → chọn **Cây raw M / BASE / 160.000đ** hoặc **Cây raw L / BASE-L / 220.000đ** → studio hiện có tại `/customizer`. Hai SKU dùng chế độ `free` và cùng catalog 24 phụ kiện; các cây và thiết kế dạng slot cũ giữ luồng cũ. Size L dùng lại biến thể đã có, giữ ID và tồn kho. Cây `free` không cần SlotMap để xuất hiện và được chọn; `hasSlotMap` vẫn phản ánh dữ liệu thật.

Giá/size lưu trong `src/data/customization-trees.json`. Chạy `npm run configure:customization-trees` để xem trước; thêm `-- --apply` để cập nhật đúng hai SKU hiện có. Script sao lưu trước khi ghi, không thêm biến thể trùng hoặc tự thay số đo/tồn kho. Ảnh L là PNG tách nền từ ảnh người dùng gửi bằng công cụ imagegen tích hợp, tại `assets/customization-trees/base-l-studio.png`; cần đóng gói thư mục này khi triển khai. Prompt và nguồn được ghi trong `assets/customization-trees/README.md`.

Studio có 24 ảnh gốc, tìm kiếm, danh mục, bộ lọc treo/cạnh cây, thêm nhiều bản phụ kiện, kéo thả, xoay và chỉnh tỷ lệ từng phụ kiện, xóa, hoàn tác/làm lại, làm mới, lưu và thêm giỏ. Máy tính dùng chuột; điện thoại dùng cảm ứng. Kéo nền xoay camera 360°, cuộn/chụm hai ngón để thu phóng. Khách cần đăng nhập khi lưu hoặc mua; bản nháp lưu trong trình duyệt.

Cập nhật theo yêu cầu dùng ảnh ban đầu: studio mặc định mở **Ảnh cây gốc**, lấy đúng `Tree.bareImage` và giữ nguyên ảnh, không tạo lại bằng AI. Có thể kéo phụ kiện và thu phóng trên ảnh. Chế độ này cố định góc nhìn phía trước, không quảng bá xoay 360° cho ảnh 2D. Nút **Mô phỏng 3D · 360°** mở lại góc nhìn 3D riêng khi cần; chuyển chế độ không sửa tọa độ, giá hoặc dữ liệu thiết kế đã lưu.

Luồng dữ liệu dùng các thành phần có sẵn:

1. `TreeProduct` → `Tree` xác định cây BASE và catalog phụ kiện.
2. `GET /api/catalog/customizer/base-trees` và `GET /api/catalog/accessories?variantId=...` trả cây và phụ kiện.
3. `POST /api/designs`, `PUT /api/designs/:id/configuration`, `GET /api/designs/:id` tạo/lưu/mở thiết kế. Ghi cấu hình `free` cần `expectedConfigVersion`; xung đột trả 409. Backend kiểm tra quyền sở hữu và vị trí 3D.
4. Báo giá dùng API quote hiện có, được tính lại trên server. Đơn giá không nhận từ client.
5. `POST /api/cart/items` nhận `designId`, đóng băng cấu hình. Sửa thiết kế sau đó không thay đổi bố trí đã thêm giỏ.
6. Tạo đơn theo API đơn hàng hiện có. Mỗi item giữ cấu hình bố trí và snapshot tên/giá/thông số mô hình của phụ kiện. Các bố trí khác nhau không bị gộp mất dữ liệu. Giỏ hàng, chi tiết đơn khách và quản trị đều có xem lại 3D.

Không tạo collection cho thiết kế, catalog hoặc giỏ mới. Các trường bổ sung nằm trong `Accessory`, `Tree`, `Design`, `CartItem` và `Order` hiện có. Vị trí lưu dưới `configuration.placements[].position3d = {x,y,z}`, kèm `mounting`, `rotation`, `scale` và `placementMode: free`. Các tọa độ thuộc không gian mô phỏng, không phải số đo sản phẩm thật. Số lượng phụ kiện là số instance trong thiết kế. Logic trừ/hoàn tồn kho cây tiếp tục theo hệ thống hiện tại; thay đổi này không triển khai tồn kho biến thể phụ kiện mới.

## Nguồn ảnh và giá

Manifest: `src/data/customization-accessories.json`. Ảnh nguyên gốc: `assets/customization-docx/figure-01.png` đến `figure-24.png`, phục vụ tại `/assets/customization-docx/`. Khi triển khai phải đóng gói cả thư mục assets này cùng backend.

Đã đối chiếu 24 ảnh giữa `phụ kiện giáng sinh.docx` và `Bang_Gia.docx`; các ảnh tương ứng trùng SHA-256. Manifest giữ số hình, nguyên văn giá, ghi chú và hash để truy nguyên. Tên hiển thị mô tả nội dung ảnh, kèm số hình gốc.

7 dòng có đơn giá xác định được dùng để mua:

| Hình | Phụ kiện | Giá một chiếc (đồng) |
| --- | --- | ---: |
| 1 | Vòng quay Giáng Sinh | 342.300 |
| 5 | Tuần lộc áo len | 129.000 |
| 7 | Búp bê váy đỏ | 128.480 |
| 11 | Búp bê áo xanh tím | 128.480 |
| 17 | Gấu váy đỏ | 69.000 |
| 18 | Gấu quần yếm đỏ | 69.000 |
| 19 | Tất đỏ | 43.482 |

Hình 19 còn ghi 57.728đ/set 2 chiếc. Hiện studio bán theo chiếc; không tự áp dụng giá set hoặc chiết khấu khi thêm hai chiếc.

Theo xác nhận của người dùng, 17 dòng từng chờ giá (Hình 2–4, 6, 8–10, 12–16, 20–24) đã được chốt. Các khoảng giá dùng mức thấp nhất. Nhóm quả châu Hình 15, 16, 22, 23, 24 tính **5.500đ/quả**, theo giá lẻ ghi trong tài liệu, vì mỗi placement là một quả. Hình 20 và 21 dùng **37.000đ/chiếc**. Cả 24 phụ kiện có `priceStatus: confirmed`; nguyên văn giá và ghi chú tài liệu vẫn nằm trong `source` để đối chiếu. Chính sách này được ghi trong `pricingPolicy` của manifest. Backend tiếp tục chặn mua các sản phẩm mới chưa có giá xác nhận.

## 3D và giới hạn tài nguyên

Không có GLB/GLTF hay ảnh đa góc trong tài nguyên đầu vào. Theo yêu cầu hỗ trợ dựng 360°, frontend tạo mesh Three.js cho cây BASE trong chậu và các loại phụ kiện dựa theo ảnh: quả châu, sao, chuông, tất, gấu, nhân vật, đèn lồng và vòng quay. Đây là hình học 3D thực sự, không xoay ảnh 2D. Phụ kiện giữ tọa độ thế giới khi camera xoay; kéo phụ kiện bám lên bề mặt cây hoặc mặt sàn.

Các mesh là **mô phỏng hình khối**, chưa phải bản số hóa sản phẩm với số đo/vật liệu được xác minh. UI ghi rõ điều này và giữ ảnh sản phẩm gốc để đối chiếu. Chưa đáp ứng yêu cầu hình ảnh 3D giống tuyệt đối hàng thực tế; cần model được dựng và kiểm duyệt theo kích thước sản phẩm nếu dùng làm bản duyệt sản xuất.

## Chạy và nhập dữ liệu

Trong `pj/backend`, với file env gốc đã được cấu hình:

```powershell
$env:DOTENV_CONFIG_PATH='D:/SUPPORT_FULL/christmas/.env'
npm run import:customization
```

Để chỉ chốt các mục đang chờ giá trong database hiện có, dùng `npm run import:customization -- --prices-only`. Lệnh này chỉ cập nhật đơn giá, trạng thái xác nhận và đơn vị cho các SKU của catalog DOCX đang chờ giá hoặc có giá null. Chạy lại trả về số cập nhật bằng 0 khi đã hoàn tất.

Tiến trình dev cần nạp env qua `node -r dotenv/config` hoặc cấu hình môi trường tương đương. Ví dụ đang dùng:

```powershell
$env:DOTENV_CONFIG_PATH='D:/SUPPORT_FULL/christmas/.env'
node -r dotenv/config node_modules/ts-node-dev/lib/bin.js --respawn --transpile-only src/server.ts
```

Import upsert 24 SKU `DOCX-H01`–`DOCX-H24`, không thêm cây, chỉ bật BASE. Chạy lại không tạo trùng; giá đã được quản trị xác nhận cho các mục chưa rõ được giữ nguyên. Import không sinh số tồn kho phụ kiện giả; mục mới có `stockQuantity: 0`, theo cách quản lý phụ kiện chưa trừ tồn của hệ thống hiện tại.

Frontend ở `christmas_UI/frontend`: đặt `VITE_API_BASE_URL=http://localhost:4000/api`, `VITE_API_TARGET=http://localhost:4000` và chạy `npm run dev -- --host localhost --port 5173`. Không đưa bí mật backend vào Vite.

## Kiểm chứng

`npm run build` ở backend và frontend đều đạt. `npm run test:customization` (với env trên) kiểm tra 9 nhóm nghiệp vụ: ảnh nguồn; catalog và giá null; chặn mua giá chưa rõ; xung đột phiên bản; lưu vị trí và từ chối tọa độ sai; giá từng instance và quyền sở hữu; snapshot giỏ → đơn, trừ/hoàn tồn cây; tương thích slot cũ; quyền quản trị xác nhận/thu hồi đơn giá. Test này tạo database riêng tên `byc_custom_test_*` và dọn đúng database đó khi kết thúc, không dùng dữ liệu khách hàng để kiểm thử.

Đã chạy thêm 31 kiểm tra pricing và 15 kiểm tra orderService hiện có. Kiểm thử Chrome tự động đạt 8 nhóm: vào từ Cá nhân hóa; tìm/lọc; kéo mesh và kiểm tra tọa độ đã lưu; xoay 3D giữ bố trí; tính tiền/xóa/hoàn tác; lưu/mở lại phụ kiện chưa chốt giá; màn hình 390px và vuốt cảm ứng; giỏ hàng thường với snapshot 3D xem lại được. Tài khoản kiểm thử trình duyệt đã được xóa. Kiểm thử tạo/hủy đơn chỉ thực hiện trong database riêng, không tạo đơn thử trên database ứng dụng.
