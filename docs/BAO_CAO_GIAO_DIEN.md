# Báo cáo Nghiệm thu Toàn diện Giao diện Mới: Wallet May Cry

Tài liệu này tổng kết toàn bộ quá trình tái thiết kế và nâng cấp giao diện người dùng của ứng dụng **Wallet May Cry** (tiền thân là Sổ Mộc), thực hiện theo [đặc tả giao diện mới](./GIAO_DIEN_MOI.md).

---

## 1. Tổng quan & Kết quả chính

- **Thương hiệu & Tôn chỉ mới:**
  - **Tên:** **Wallet May Cry**
  - **Khẩu hiệu (Slogan):** _"Ví có thể khóc… trừ khi bạn ghi lại."_
  - **Logo:** Chiếc ví nét mảnh thanh lịch với giọt nước mắt xanh dương (`--accent`) ở góc dưới phải.
  - **Phong cách:** Sổ cái không màu (colorless ledger), không viền thô, không đổ bóng ở trạng thái tĩnh, không gradient, không icon ô màu. Toàn bộ màu sắc dành cho dữ liệu, phân loại và cảnh báo.
- **Hai vỏ hiển thị tách biệt (Desktop & Mobile):**
  - Ngưỡng di động: `≤ 760px` sử dụng `PhoneShell` với thanh tab 4 mục dưới đáy (cao 56px + safe-area) và nút ghi nhanh **+** lớn ở giữa.
  - Cửa sổ vừa: `761px – 1100px` chuyển thanh bên thành thanh ngang trên cùng.
  - Máy tính: `> 1100px` sử dụng `DesktopShell` với thanh bên trái 232px trực tiếp trên nền trang.
- **Biểu đồ SVG tự vẽ (Phong cách Copilot Money):**
  - Đường chi tiêu tích lũy tháng so với cùng kỳ tháng trước (màu xám) và đường ngân sách nét đứt có nhãn viên ở đầu đường (`"Dưới mức 1,2 tr"` hoặc `"Vượt 300 nghìn"`).
  - Biểu đồ tài sản ròng 12 tháng (sparkline ở Tổng quan, bản lớn ở Phân tích).
  - Cột thu - chi đối xứng qua trục 0 kèm toggle 6/12 tháng.
  - Trục thời gian các khoản sắp đến hạn (`DueTimeline`).
  - Dự báo thời gian hoàn thành mục tiêu tài chính từ tốc độ tích lũy 90 ngày.
- **Hệ thống điều hướng 4 mục tối giản:**
  1. **Tổng quan:** Trả lời trực diện câu hỏi _"Hôm nay mình còn tiêu được bao nhiêu?"_ với con số `safeToSpendToday` khổ lớn, vòng tiến độ ngân sách, đường chi tiêu và các khoản sắp đến hạn.
  2. **Giao dịch:** Ô ghi nhanh thông minh 1 dòng (`parseQuickEntry` chạy thuần trên client), chip gợi ý 1 chạm, danh sách gom nhóm theo ngày, vuốt Sửa/Xóa trên mobile, xóa có hoàn tác 5 giây.
  3. **Kế hoạch:** Hợp nhất Quản lý Ngân sách, Mục tiêu tích lũy và Khoản định kỳ (gộp Định kỳ và Hóa đơn).
  4. **Thiết lập:** Danh sách dọc 5 mục (Ví, Danh mục, Nhãn, Gia đình, Hồ sơ cá nhân).
- **Trợ lý tài chính AI nổi (Chat FAB & Dock):**
  - Nút tròn FAB 48px cố định góc phải màn hình, mở dock 360×520px (hoặc trượt toàn màn hình trên mobile).
  - Đồng bộ trạng thái hội thoại và chuyển đổi mượt mà qua nút "Mở rộng" sang trang `#insights`.
  - Hỗ trợ đầy đủ phím tắt `Escape`, khóa tiêu điểm (Focus trap), `role="dialog"` chuẩn Accessibility.
- **Độ ổn định triển khai:**
  - Nhánh `redesign/agy` đã fast-forward merge vào `main` tại commit `d5820c5` và đã push lên GitHub.
  - Repository có `Dockerfile`, `docker-compose.yml` và Blueprint `render.yaml`; cấu hình production mặc định không tự seed tài khoản VIP demo.

---

## 2. Danh sách File Thay đổi

### 2.1. File thêm mới

| File                                           | Mục đích                                                   |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `web/src/ui/useIsPhone.ts`                     | Hook nhận diện màn hình di động theo `matchMedia`          |
| `web/src/ui/CategoryChip.tsx`                  | Viên màu danh mục chuẩn tương phản WCAG 4.5:1              |
| `web/src/lib/category-tone.ts`                 | Thuật toán ánh xạ màu người dùng về 8 tông màu dịu         |
| `web/src/lib/category-tone.test.ts`            | 14 bài kiểm thử ánh xạ màu và tương phản                   |
| `web/src/lib/safe-to-spend.ts`                 | Hàm tính toán con số chi tiêu an toàn trong ngày           |
| `web/src/lib/safe-to-spend.test.ts`            | Kiểm thử logic tính toán ngân sách và ngày còn lại         |
| `web/src/lib/obligations.ts`                   | Tổng hợp nghĩa vụ tài chính (định kỳ + hóa đơn)            |
| `web/src/lib/obligations.test.ts`              | Kiểm thử sắp xếp ưu tiên khoản đến hạn và quá hạn          |
| `web/src/lib/spend-series.ts`                  | Thuật toán xử lý chuỗi dữ liệu chi tiêu lũy kế và mốc trục |
| `web/src/lib/month.ts`                         | Tiện ích định dạng và tính toán tháng                      |
| `web/src/lib/quick-entry.ts`                   | Bộ phân tích cú pháp ghi nhanh tự nhiên (tiếng Việt)       |
| `web/src/lib/quick-entry.test.ts`              | 57 bài kiểm thử các mẫu câu thu, chi, ví, ngày             |
| `web/src/lib/group-days.ts`                    | Gom nhóm giao dịch theo từng ngày                          |
| `web/src/lib/undoable-delete.ts`               | Cơ chế trì hoãn xóa có hoàn tác (Undo toast) 5s            |
| `web/src/lib/goal-projection.ts`               | Dự báo thời gian đạt mục tiêu tích lũy                     |
| `web/src/lib/goal-projection.test.ts`          | Kiểm thử dự báo mục tiêu theo lịch sử đóng góp             |
| `web/src/app/desktop/DesktopShell.tsx`         | Vỏ giao diện máy tính với thanh bên                        |
| `web/src/app/phone/PhoneShell.tsx`             | Vỏ giao diện di động với thanh tab đáy                     |
| `web/src/features/transactions/QuickEntry.tsx` | Ô ghi nhanh 1 dòng trên máy tính                           |
| `web/src/features/transactions/QuickSheet.tsx` | Bảng ghi nhanh trượt từ đáy trên di động                   |
| `web/src/features/settings/SettingsHome.tsx`   | Màn hình danh mục cài đặt trên di động                     |
| `web/src/ui/charts/chart-math.ts`              | Thư viện toán hình học và mốc trục SVG                     |
| `web/src/ui/charts/chart-math.test.ts`         | Kiểm thử thuật toán `niceTicks`, `niceSignedTicks`         |
| `web/src/ui/charts/ChartEmpty.tsx`             | Trạng thái rỗng cho các đồ thị SVG                         |
| `web/src/ui/charts/ChartTooltip.tsx`           | Tooltip 1 dòng kẹp lề chống tràn cho biểu đồ               |
| `web/src/ui/charts/SpendLineChart.tsx`         | Biểu đồ SVG đường chi tiêu tháng và cùng kỳ                |
| `web/src/ui/charts/NetWorthChart.tsx`          | Biểu đồ SVG tài sản ròng 12 tháng (mini & full)            |
| `web/src/ui/charts/MonthlyFlowBarChart.tsx`    | Biểu đồ SVG cột thu - chi đối xứng trục 0                  |
| `web/src/ui/charts/DueTimeline.tsx`            | Biểu đồ SVG dải thời gian các khoản sắp đến hạn            |
| `web/src/features/agent/agent.test.ts`         | Kiểm thử luồng hội thoại và đồng bộ timeline Trợ lý        |
| `web/src/styles/planning.css`                  | Phong cách giao diện Kế hoạch mới                          |

### 2.2. File sửa đổi chính

| File                                                 | Nội dung thay đổi                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `web/index.html`                                     | Cập nhật tiêu đề trang, meta description theo Wallet May Cry       |
| `web/public/manifest.webmanifest`                    | Cập nhật tên ứng dụng WMC và slogan                                |
| `web/public/favicon.svg`                             | Thay biểu tượng chiếc ví ngấn lệ hỗ trợ dark mode                  |
| `web/src/styles/tokens.css`                          | Thêm 8 cặp biến màu `--cat-1..8` và `--cat-N-ink`                  |
| `web/src/styles/layout.css`                          | Tái cấu trúc khung hiển thị, 2 vỏ giao diện, đệm đáy 88px          |
| `web/src/styles/dashboard.css`                       | Bố cục lưới 12 cột Tổng quan, chống tràn ngang, CSS biểu đồ SVG    |
| `web/src/styles/features.css`                        | Sửa khối KPI, CSS cho nút chat FAB và khung dock nổi               |
| `web/src/app/AppShell.tsx`                           | Điều phối 2 vỏ, tích hợp Provider cho Trợ lý AI và FAB             |
| `web/src/app/shell-parts.tsx`                        | Thanh điều hướng, Hub tabs, logo ví ngấn lệ                        |
| `web/src/app/navigation.ts`                          | Rút gọn còn 4 mục chính và 3 nhóm hub tab                          |
| `web/src/features/dashboard/DashboardView.tsx`       | Viết lại Tổng quan với con số trung tâm, biểu đồ mới, danh sách ví |
| `web/src/features/transactions/TransactionsView.tsx` | Tích hợp ghi nhanh, gom ngày, tải trang vô tận                     |
| `web/src/features/planning/PlanningView.tsx`         | Hợp nhất Định kỳ và Hóa đơn, quản lý ngân sách và mục tiêu         |
| `web/src/features/reports/ReportsView.tsx`           | Chuyển thành tab Phân tích, tích hợp biểu đồ ròng & cột thu-chi    |
| `web/src/features/agent/AgentView.tsx`               | Hỗ trợ chế độ dock nổi, nút Mở rộng, đồng bộ Provider              |
| `web/src/features/auth/LoginScreen.tsx`              | Màn đăng nhập mới với slogan 2 dòng, ẩn mẫu sổ trên mobile         |
| `scripts/ui-e2e.mjs`                                 | Cập nhật toàn bộ bộ kiểm thử E2E tương thích giao diện mới         |

---

## 3. Các bài kiểm thử đã sửa và nguyên nhân

1. **`scripts/ui-e2e.mjs` (Thao tác xóa giao dịch):**
   - _Nguyên nhân:_ Trước đây xóa giao dịch kích hoạt hộp thoại `window.confirm()`. Từ bước 5, hệ thống áp dụng cơ chế xóa có hoàn tác (Undo Toast) 5 giây, giao diện ẩn ngay lập tức mà không bật dialog xác nhận.
   - _Đã sửa:_ Bỏ bước đợi và chấp thuận `confirm()` trong kịch bản E2E.
2. **`scripts/ui-e2e.mjs` (Nút thêm giao dịch trên Mobile):**
   - _Nguyên nhân:_ Nút `+` trên điện thoại (`#mobile-add-transaction`) nay mở bảng trượt ghi nhanh `QuickSheet` thay vì mở thẳng modal chi tiết `#transaction-modal`.
   - _Đã sửa:_ Bổ sung bước bấm vào liên kết _"Nhập chi tiết đầy đủ"_ (`#quick-open-full`) trong QuickSheet để mở modal truyền thống khi chạy test tạo giao dịch đầy đủ.
3. **`scripts/ui-e2e.mjs` (Kiểm tra tràn ngang khi đổi kích thước):**
   - _Nguyên nhân:_ Khi chuyển đổi kích thước trình duyệt sang mobile (`390x844`), React cần 1 chu kỳ để hook `useIsPhone()` cập nhật state từ `is-desktop` sang `is-phone`.
   - _Đã sửa:_ Đợi `.app.is-phone` hiển thị trước khi đo đạc `scrollWidth <= innerWidth`.
4. **`web/src/features/auth/AuthModals.tsx` & `web/src/lib/markdown.test.ts`:**
   - _Nguyên nhân:_ Linter của kỹ năng `design-taste-frontend` cấm các placeholder giả định dạng `example.com`.
   - _Đã sửa:_ Thay bằng tên miền thực tế của sản phẩm.

---

## 4. Các quyết định kỹ thuật tự đưa ra

1. **Xử lý số trơn trong bộ phân tích ghi nhanh:**
   - Các số nhỏ hơn 1000 (ví dụ: `"cà phê 45"`) được tự động hiểu là nghìn đồng (`45.000 ₫`). Khi câu có nhiều số (ví dụ: `"lương tháng 10 15tr"`), bộ phân tích ưu tiên số có đơn vị tiền tệ, giúp tránh nhận diện nhầm số tháng thành số tiền.
2. **Lồng ghép thẻ danh sách `#bill-list` và `#recurring-list`:**
   - Khi gộp Hóa đơn và Khoản định kỳ thành một bảng danh sách duy nhất, bảng được bọc trong `<div id="bill-list">` với `display: contents;`. Nhờ vậy, cả bộ chọn cũ `#bill-list` và `#recurring-list` của E2E test đều tìm thấy các phần tử mà không gây vỡ bố cục grid/table.
3. **Quản lý trùng lặp ID cho màn hình Hồ sơ:**
   - Hồ sơ người dùng vừa có thể mở dạng màn con trong Thiết lập vừa có thể mở dạng modal `#profile-modal` từ avatar góc trên. Khi modal mở, màn con tạm ngưng kết xuất biểu mẫu để tránh 2 form trùng ID `#profile-form` trong cây DOM.
4. **Giải quyết triệt để lỗi tràn ngang ở Tổng quan (Bước 11):**
   - Đo đạc chính xác cho thấy thẻ `DueTimeline` sử dụng `fallback = 640px` khiến thẻ SVG kéo bung cột phụ lên 682px trong lưới 12 cột, làm tràn trang thành 1717px. Đã điều chỉnh fallback xuống 320px, bổ sung `min-width: 0` và `max-width: 100%` cho các thẻ container và SVG.
5. **Khoảng đệm đáy 88px chống che khuất:**
   - Nút chat FAB cao 48px cách đáy 20px (cạnh trên ở 68px). Đệm đáy trang 88px đảm bảo khi cuộn xuống tận cùng, nội dung cuối cùng luôn cách mép trên nút FAB ít nhất 20px, không bị che khuất bất kỳ nút hành động hay phân trang nào.

---

## 5. Kết quả Kiểm tra Chất lượng (Verification)

| Công cụ kiểm tra        | Lệnh thực thi                                   | Kết quả                                     |
| ----------------------- | ----------------------------------------------- | ------------------------------------------- |
| **TypeScript**          | `npx tsc -p web/tsconfig.json`                  | **0 lỗi (Clean)**                           |
| **ESLint**              | `npx eslint web/src`                            | **0 lỗi, 0 cảnh báo**                       |
| **Prettier**            | `npx prettier --check web/src`                  | **100% đúng chuẩn định dạng**               |
| **Vitest (Unit Tests)** | `npx vitest run --config web/vitest.config.mts` | **13/13 test suites, 140/140 tests PASSED** |
| **Playwright UI E2E**   | `node scripts/ui-e2e.mjs`                       | Chưa chạy lại: PostgreSQL local đang tắt    |
| **Design-Taste Linter** | `lint.mjs --app web/src`                        | **0 FAIL; 15 WARN có chủ đích**             |
| **Visual inspector**    | `inspect.mjs --app http://localhost:3000`       | **0 FAIL, 0 WARN ở 1440, 768 và 390px**     |

Các cảnh báo linter còn lại là thao tác đệm số cho ngày/giờ và shadow của phần tử thực sự nổi (modal, popover, drawer, coach mark, nút chat), không phải shadow trang trí trên thẻ đứng yên. Bộ test giao diện 140/140 đã chạy lại sau khi nâng dependency. Bộ test Backend và UI E2E cần PostgreSQL; phiên rà soát ngày 23/10/2026 không thể bật Docker Desktop service do thiếu quyền hệ thống.

---

## 6. Hình ảnh Nghiệm thu

Ảnh đo kiểm mới nhất được sinh tại `.taste-skill/final/` trên máy phát triển. Đây là artifact tạm đã được đưa vào `.gitignore`; có thể tái tạo bằng inspector thay vì lưu vào repository. Hai thư mục thử nghiệm `D:\Viettel-Software-agy` và `D:\Viettel-Software-agy-loop` đã được dọn sau khi xác nhận mọi thay đổi mã nguồn đều nằm trong lịch sử Git.

### 6.1. Bảng đối chiếu Trước và Sau (Before & After)

| Màn hình                    | Trước khi làm lại                        | Sau khi hoàn thiện (Wallet May Cry)                               |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| **Màn đăng nhập (Desktop)** | Khung xanh đậm, bóng mờ, layout dày đặc  | Tối giản, logo ví ngấn lệ, slogan ấn tượng                        |
| **Tổng quan (Desktop)**     | Thẻ KPI thông thường, không rõ trọng tâm | Con số "Còn tiêu được hôm nay" khổ lớn, biểu đồ Copilot Money     |
| **Giao dịch (Desktop)**     | Bảng dữ liệu thô, tìm kiếm phức tạp      | Ô ghi nhanh 1 dòng, gom nhóm theo ngày, CategoryChip              |
| **Kế hoạch & Định kỳ**      | Tách rời 2 tab hóa đơn và định kỳ        | Hợp nhất nghĩa vụ tài chính, thẻ ngân sách viền cảnh báo vượt mức |
| **Giao diện Điện thoại**    | Vỡ layout 3 cột, ô trống, tràn ngang     | Vỏ di động hoàn chỉnh, tab đáy 4 mục, vuốt xóa/sửa mượt mà        |

---

## 7. Những việc còn lại cần lưu ý

1. Bật Docker Desktop bằng tài khoản có quyền chạy service, sau đó chạy `docker compose up -d db`, `npm test` và `npm run test:ui` để hoàn tất xác minh có database.
2. Trước lần triển khai tiếp theo, kiểm tra biến `SEED_DEMO=false` trên Render và chỉ cấp VIP cho username cụ thể bằng lệnh quản trị.
3. Sau khi nghiệm thu local, commit theo Conventional Commits rồi mới hợp nhất `redesign/polish-v2` vào `main`.
