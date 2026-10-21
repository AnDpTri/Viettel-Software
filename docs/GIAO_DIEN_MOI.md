# Đặc tả làm lại giao diện Sổ Mộc

Tài liệu này giao toàn bộ việc làm lại giao diện cho một người (hoặc agent) không thấy cuộc trò chuyện thiết kế trước đó.
Đọc hết trước khi sửa. Mọi quyết định thiết kế dưới đây **đã chốt**; chỗ nào cần tự quyết thì ghi rõ trong báo cáo cuối.

## 1. Bối cảnh

- Ứng dụng thu chi cá nhân tiếng Việt, tên **Sổ Mộc**. Giao diện là React 19 + Vite trong `web/`, dữ liệu qua `web/src/api/`
  (TanStack Query). Máy chủ Express + Prisma ở `src/`, **không sửa**.
- Chạy thử: `npm run dev` (API, cổng 3000) và `npm run dev:web` (Vite, cổng 5173). Cần Postgres: `docker compose up -d db`,
  rồi `npx prisma migrate deploy` và `npm run db:seed`.
- Tài khoản xem thử: `demo` / `Demo@123` (ít dữ liệu). Nên tạo thêm tài khoản có dữ liệu để thấy giao diện đầy đủ: ví,
  khoảng 15 giao dịch trong tháng, 3 ngân sách, 2 mục tiêu.
- Hiện trạng đã làm lại một phần (chưa commit): bảng màu mới (`web/src/styles/tokens.css`), phông Geist, bỏ nhãn chữ hoa nhỏ,
  gradient, bóng đổ, thanh bên xanh đậm; thêm `web/src/ui/Icon.tsx`. **Nhưng bố cục, cách điều hướng và tính năng vẫn như cũ
  nên vẫn khó dùng.** Việc cần làm là làm lại bố cục và luồng dùng, không phải chỉ đổi màu.

## 2. Những thứ KHÔNG được đổi

1. **Bảng màu** trong `web/src/styles/tokens.css` (sáng và tối). Người dùng đã duyệt. Chỉ được **thêm** biến mới (xem mục 4.3).
2. Phần máy chủ, schema, API, `prisma/`.
3. Các `id` mà `scripts/ui-e2e.mjs` dùng (danh sách ở mục 9). Nếu một phần tử đổi chỗ thì giữ nguyên `id`; nếu buộc phải bỏ
   thì sửa test tương ứng và ghi vào báo cáo.
4. Tiếng Việt cho mọi chữ trên giao diện, viết hoa thường như câu.
5. `package-lock.json`: **không chạy `npm install` rồi commit file lock bị cắt**. `npm` trên Windows xóa các mục
   `@esbuild/*` tùy chọn. Nếu cần thêm gói, sửa tay `package.json` và `package-lock.json` đúng một mục như đã làm với
   `@fontsource/geist`.

## 3. Nguyên tắc thiết kế (ngắn)

- **Một khối, một câu hỏi.** Mỗi khối trên màn hình trả lời đúng một câu ("hôm nay còn tiêu được bao nhiêu?", "tháng này
  chi vào đâu?"). Khối nào không có câu hỏi thì bỏ.
- **Màn nào cũng có một vật chính**, to hơn mọi thứ khác (ít nhất 1,3 lần con số cùng cấp).
- **Màu để cho dữ liệu, không cho khung.** Khung là mực, xám và nút chính gần đen. Chỉ có: xanh dương `--accent` cho dữ
  liệu chính, xanh lục cho khoản thu, đỏ cho vượt mức, và **viên màu danh mục** (mục 4.3).
- Khoản chi để màu mực, không tô đỏ. Khoản thu có dấu `+` và màu xanh lục.
- Không gradient, không bóng ở khối đứng yên (chỉ menu, hộp thoại, thông báo, ô chat nổi mới có bóng), không kính mờ, không
  emoji, không nhãn chữ hoa nhỏ phía trên tiêu đề, không đánh số 01/02/03, không icon trong ô màu.
- Số liệu: `font-variant-numeric: tabular-nums` (đã đặt ở `body`), căn phải trong bảng, dấu ngăn nghìn theo `vi-VN`.
- Không bịa số: mọi tổng tính từ các dòng đang hiển thị.
- Bán kính: thẻ 8px, nút/ô nhập 6px. Khoảng cách chung 12px, đệm thẻ 20px.
- Mỗi màn có một tiêu đề `h1` (đã có ở thanh trên cùng). Không lặp lại cùng chữ đó thành tiêu đề phụ ngay bên dưới.

## 4. Hai giao diện riêng: máy tính và điện thoại

### 4.1 Cách tách

- Chung: `web/src/api/`, `web/src/app/auth.tsx`, `ui-state.tsx`, `web/src/lib/`, `web/src/ui/` (Modal, Toast, Icon), theme.
- Riêng: **vỏ** (shell) và các màn. Thêm hook `useIsPhone()` (`matchMedia('(max-width: 760px)')`, lắng nghe thay đổi) trong
  `web/src/ui/`. `AppShell.tsx` chọn `DesktopShell` hoặc `PhoneShell`.
- Quy ước thư mục: `web/src/app/desktop/`, `web/src/app/phone/`. Một màn chỉ tách thành hai file khi bố cục khác thật;
  nếu giống nhau thì dùng chung một component và đổi bằng CSS. **Không sao chép logic**: hook dữ liệu, tính toán, xử lý
  gửi biểu mẫu nằm ở file dùng chung (ví dụ `features/*/use-*.ts`).
- Ngưỡng: ≤ 760px là điện thoại. 761–1100px dùng giao diện máy tính nhưng thanh bên thu thành thanh tab trên.
- Đổi cỡ cửa sổ khi đang dùng không được mất dữ liệu đang nhập (đưa trạng thái biểu mẫu lên trên nhánh `isPhone`).

### 4.2 Điều hướng mới (4 mục, cả hai giao diện)

| Mục       | Gồm                                                                 | `View` hiện có                                        |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Tổng quan | Tổng quan + Báo cáo (chọn tháng ngay trên đầu)                      | `dashboard`, `reports`                                |
| Giao dịch | Danh sách giao dịch                                                 | `transactions`                                        |
| Kế hoạch  | Ngân sách, Mục tiêu, Khoản định kỳ (gộp **Định kỳ** và **Hóa đơn**) | `budgets`, `goals`, `planning`                        |
| Thiết lập | Ví, Danh mục, Nhãn, Gia đình, Hồ sơ                                 | `wallets`, `categories`, `planning` (tags, household) |

- Trợ lý không còn là mục menu: là ô chat nổi (mục 7). Trang `insights` đầy đủ vẫn có, mở bằng liên kết "Mở rộng" trong ô chat
  và qua hash `#insights`.
- `web/src/app/navigation.ts` là nơi định nghĩa. Giữ nguyên tên `View` cũ và hash cũ (`#budgets`, `#wallets`...) để liên kết
  và test không vỡ; chỉ đổi nhóm hiển thị (`NAV_ITEMS`, `HUBS`).
- **Gộp Định kỳ và Hóa đơn**: một danh sách "Khoản định kỳ" có cột hạn tới. Khoản có hạn gần (≤ 7 ngày) được đẩy lên đầu và
  gắn chữ "Sắp đến hạn". Giữ nguyên hai API và hai biểu mẫu cũ phía sau (`#recurring-form`, `#bill-form`): chỉ gộp phần hiển thị
  và cho chọn loại khi thêm. Giữ `data-planning-tab` hoạt động với `recurring` và `bills` để test cũ chạy được.
- Thanh bên (máy tính): rộng 232px nằm trên chính nền trang, mục đang mở là viên xám trung tính (đã có CSS). Điện thoại:
  thanh tab dưới đáy 4 mục, nút **+** ghi giao dịch to ở giữa (thay `#mobile-add-transaction`, giữ `id` đó cho nút này),
  cao 56px + vùng an toàn `env(safe-area-inset-bottom)`.

### 4.3 Viên màu danh mục

- Thêm vào `tokens.css` (không sửa biến cũ) một dải 8 tông dịu, mỗi tông có `--cat-N` (nền nhạt) và `--cat-N-ink` (chữ đậm cùng
  tông), có giá trị riêng cho sáng và tối bằng `light-dark()`. Độ tương phản chữ/nền ≥ 4,5:1.
- Danh mục đã có trường `color`: **lấy màu người dùng đặt làm gốc**, ánh xạ về tông gần nhất trong 8 tông (so khoảng cách
  màu hoặc theo góc màu), không dùng màu thô. Danh mục chưa có màu thì gán tông theo thứ tự ổn định (băm `id`).
- Component `CategoryChip` (`web/src/ui/CategoryChip.tsx`): viên bo 6px, 12px chữ, nền `--cat-N`, chữ `--cat-N-ink`, không icon.
  Dùng ở: dòng giao dịch, danh sách danh mục, nhãn ngân sách, danh mục hàng đầu ở Tổng quan. **Không dùng ở nơi khác.**
- Màu ví giữ như hiện tại (chấm tròn 8px).

## 5. Tổng quan

Câu hỏi: **"Hôm nay mình còn tiêu được bao nhiêu?"**

### 5.1 Con số chính "còn tiêu được hôm nay"

Hàm thuần `safeToSpendToday(...)` trong `web/src/lib/` (có test `vitest`):

```
còn_lại_ngân_sách_tháng = Σ (hạn mức − đã dùng) của các ngân sách đang hiệu lực trong tháng, chỉ phần còn dương
hóa_đơn_sắp_tới        = Σ khoản định kỳ/hóa đơn chi có hạn từ hôm nay tới hết tháng
ngày_còn_lại           = số ngày từ hôm nay tới hết tháng (tính cả hôm nay, tối thiểu 1)
còn_tiêu_hôm_nay       = max(0, (còn_lại_ngân_sách_tháng − hóa_đơn_sắp_tới) / ngày_còn_lại)
```

- Nếu **không có ngân sách nào**: không tính; thay bằng "Tổng tài sản" làm con số chính và một lời mời "Đặt ngân sách tháng
  này" dẫn tới biểu mẫu ngân sách.
- Làm tròn xuống nghìn đồng. Dòng chú thích ngay dưới nêu cách tính bằng lời ngắn ("Còn 1.063.000 ₫ ngân sách, 9 ngày, trừ
  500.000 ₫ hóa đơn"), mọi số trong chú thích lấy từ cùng biến với con số chính (một sự kiện chỉ có một biến).
- Nếu ngân sách tháng đã vượt: hiện "Đã vượt X ₫" màu `--danger` thay cho con số.

### 5.2 Bố cục máy tính (lưới 12 cột, khoảng cách 12px, lề 32px)

```
[ Con số chính + chú thích (6 cột)      ][ Tổng tài sản · Thu · Chi · Ròng (6 cột, 2x2) ]
[ Chi tiêu tháng: đường tích lũy (8 cột) ][ Danh mục hàng đầu (4 cột)                    ]
[ Vòng ngân sách (12 cột, hàng cuộn)                                                      ]
[ Giao dịch gần đây (8 cột)              ][ Sắp đến hạn (4 cột)                           ]
```

- Chọn tháng (nút ‹ › và tên tháng) nằm ở dòng tiêu đề, bên phải. Đổi tháng thì mọi khối đổi theo. Phần "Báo cáo" cũ
  (lọc khoảng ngày, xuất CSV, đối soát ví) chuyển thành tab thứ hai "Phân tích" trong cùng mục, **giữ nguyên id**
  (`#report-currencies`, `#reconciliation-list`, `#export-csv`, `data-report-range`).
- **Đường chi tiêu**: SVG tự vẽ, đường thẳng (không làm mượt), 2px, màu `--accent`; trục y 4–5 mốc tròn; đường tham chiếu nét
  đứt cho ngân sách tháng có nhãn ở cuối; điểm "hôm nay" có nhãn. Phần sau hôm nay không vẽ. Không hiện chú giải khi chỉ có
  một đường.
- **Vòng ngân sách**: mỗi ngân sách một vòng mảnh 4px, đường kính 64px, tên danh mục bên dưới, "còn X ₫" bên dưới nữa. Vòng
  mực khi ổn, `--warning` ≥ 80%, `--danger` > 100% (và chữ "Vượt X ₫"). Không có ngân sách thì cả hàng ẩn đi và nhường chỗ.
- **Danh mục hàng đầu**: tối đa 5 dòng, mỗi dòng `CategoryChip` + số tiền căn phải + thanh 4px màu `--accent` theo tỷ lệ.
- **Giữ** `#total-balance`, `#income`, `#expense`, `#net`, `#recent-transactions`, `#wallet-preview` (xem 9).
- Thẻ "Thiết lập Sổ Mộc" (onboarding) chỉ hiện khi chưa xong và chưa tắt, nằm trên cùng, cao tối đa 120px (thu thành một
  thanh ngang có 4 bước nhỏ, không còn 4 thẻ lớn).

### 5.3 Điện thoại

Một cột, lề 16px, theo thứ tự: con số chính (cỡ 36px) và chú thích; hàng vòng ngân sách cuộn ngang (mỗi vòng 72px); đường
chi tiêu cao 160px; Thu / Chi / Ròng thành danh sách 3 dòng nhãn trái, số phải; giao dịch gần đây (5 dòng); sắp đến hạn.
Tổng tài sản là dòng đầu của danh sách trên, không phải khối riêng.

## 6. Giao dịch và ghi nhanh

### 6.1 Danh sách giao dịch

- Gom theo ngày: dòng tiêu đề ngày ("Hôm nay", "Hôm qua", "19 thg 10"), bên phải tổng chi của ngày (mực) và tổng thu nếu
  có (xanh lục). Tổng tính từ chính các dòng của ngày đó.
- Ô tìm kiếm luôn ở trên đầu; lọc nâng cao (ví, loại, khoảng ngày, danh mục) nằm trong một nút "Lọc" mở bảng nhỏ. Đếm số bộ
  lọc đang bật trên nút.
- Máy tính: mỗi dòng là một hàng bảng (ghi chú · ví · danh mục · giờ · số tiền); Sửa/Xóa hiện khi rê chuột hoặc lấy tiêu điểm
  (đã có CSS mẫu trong `features.css`, `@media (hover: hover)`).
- Điện thoại: dòng 2 lớp (ghi chú + `CategoryChip`; ví và giờ · số tiền), **vuốt trái để Xóa, vuốt phải để Sửa**, kèm
  nút `…` cho ai không vuốt được (khả năng truy cập). Xóa có hoàn tác 5 giây bằng thông báo thay vì hỏi xác nhận.
- Tải thêm khi cuộn tới cuối (hoặc nút "Tải thêm"); hiện khoảng "Hiển thị 20 trên 128".
- Giữ `#all-transactions`, `#transaction-keyword-filter`, `#apply-transaction-filter`, `#export-csv`.

### 6.2 Ô ghi nhanh

- Ô nhập một dòng ở đầu màn Giao dịch (máy tính) và trong bảng trượt từ đáy (điện thoại, mở bằng nút **+**):
  "cà phê 45k hôm qua".
- Bộ phân tích chạy **trong trình duyệt**, không gọi trợ lý AI (không tốn lượt hỏi). Hàm thuần `parseQuickEntry(text, ctx)`
  trong `web/src/lib/` kèm test `vitest` nhiều ca:
  - Số tiền: `45k`, `45 nghìn`, `45.000`, `45000`, `1tr2`, `1,5tr`, `2 triệu`, `120 ngàn`. Không có số thì báo lỗi "Chưa thấy số tiền".
  - Ngày: `hôm nay`, `hôm qua`, `hôm kia`, `thứ hai`... (gần nhất đã qua), `20/10`, `20/10/2026`. Mặc định hôm nay.
  - Loại: từ gợi ý thu (`lương`, `thưởng`, `nhận`, `thu`, `bán`) → INCOME; còn lại EXPENSE. (Chuyển ví vẫn dùng biểu mẫu đầy đủ.)
  - Danh mục: khớp tên danh mục không dấu, không phân biệt hoa thường, hoặc theo **ghi chú giống nhất trong 90 ngày gần đây**
    (cùng từ khóa → dùng lại danh mục và ví của lần trước). Không khớp thì "Chưa phân loại".
  - Ví: khớp tên ví trong câu ("bằng momo"), không thì ví dùng gần nhất.
- Trước khi lưu, hiện **bản xem trước** một dòng: số tiền, danh mục (chip), ví, ngày, ghi chú; có nút Lưu (Enter) và Sửa chi
  tiết (mở biểu mẫu đầy đủ đã điền sẵn). Sau khi lưu: thông báo "Đã ghi −45.000 ₫ · Ăn uống" kèm Hoàn tác 5 giây.
- Hàng chip gợi ý ngay dưới ô: 4–6 giao dịch hay lặp nhất 60 ngày qua (ghi chú + số tiền hay dùng nhất); một chạm là lưu
  ngay với ví và danh mục của lần đó.
- Biểu mẫu đầy đủ hiện có (`#transaction-form`, `#transaction-modal`) **giữ nguyên**, chỉ đổi bố cục: số tiền lớn ở trên,
  chip danh mục, các trường nâng cao gập sẵn. Giữ mọi `id` `#tx-*`.

## 7. Ô chat Trợ lý nổi

- Nút tròn 48px ở góc dưới bên phải (cách mép 20px; điện thoại: nằm trên thanh tab, không che nút **+**), icon `chat`
  trong `Icon.tsx`. Nút ẩn khi đang ở trang `insights` đầy đủ.
- Bấm mở khung 360×520px (điện thoại: gần toàn màn hình, bo góc trên). Dùng **cùng** bộ trợ lý hiện có: cùng lịch sử,
  hạn mức, xác nhận trước khi đổi dữ liệu. Không viết lại logic.
- Đã làm dở (chưa commit) trong `web/src/features/agent/AgentView.tsx`: thêm props `dock` và `onClose`, và component `Frame`.
  **Việc cần hoàn tất**: thêm `type ReactNode` vào import từ `react` (hiện đang thiếu nên chưa biên dịch), thêm nút/khung nổi
  vào `AppShell`, CSS cho `.agent-dock` và `.chat-fab`, nút "Mở rộng" dẫn tới `#insights`, đóng bằng Escape, trả tiêu điểm
  về nút khi đóng, `role="dialog"` kèm `aria-label`.
- Khi ô chat mở trên màn khác thì bản trang `insights` vẫn nằm trong DOM (ẩn) và hai bản trùng `id`
  (`#assistant-form`, `#assistant-question`...). Để tránh: chỉ dựng bản trang khi đang ở `insights`, hoặc đặt `id` có điều
  kiện. Test `ui-e2e` mở trợ lý qua trang đầy đủ nên phải vẫn chạy.
- Thay đổi tính năng tối thiểu: lời nhắc gợi ý ban đầu ("Tôi nên chú ý điều gì trong tháng này?") hiện thành chip.

## 8. Kế hoạch, Thiết lập

- **Kế hoạch**: thanh tab ngang 3 mục (Ngân sách · Mục tiêu · Khoản định kỳ). Ngân sách và Mục tiêu là lưới thẻ có vòng/
  thanh tiến độ; thẻ vượt mức có viền `--danger` và dòng "Vượt X ₫". Khoản định kỳ là danh sách (mục 4.2).
- **Thiết lập**: danh sách dọc bên trái (Ví · Danh mục · Nhãn · Gia đình · Hồ sơ), nội dung bên phải (máy tính); danh sách
  mục rồi đẩy sang màn con (điện thoại). Không dùng tab cho phần này.
- **Ví**: thẻ ví có chấm màu, số dư, nhãn loại; chi tiết ví mở bảng bên phải. Giữ `#all-wallets`, `#wallet-form` và nhóm `#wallet-*`.
- **Danh mục**: hai cột Thu và Chi như hiện tại, mỗi dòng có `CategoryChip`, Sửa, Xóa; có chế độ cây/danh sách (`data-category-mode`).
- **Hồ sơ**: hiện dạng màn trong Thiết lập (máy tính) thay vì hộp thoại cao; vẫn giữ `#profile-modal` mở được từ avatar để test cũ chạy.

## 9. Ràng buộc kiểm thử

`scripts/ui-e2e.mjs` dùng (Playwright, Edge) các `id` sau; cần còn tồn tại ở giao diện **máy tính** (cửa sổ 1280px trở lên):

`#login-screen #login-form #identifier #password #app #view-dashboard #total-balance #open-transaction #open-profile #theme-btn
#menu-btn #sidebar-backdrop #hub-tabs #welcome-modal #welcome-slide #welcome-title #welcome-next #welcome-skip #welcome-dots
#coach #transaction-modal #transaction-form #tx-amount #tx-note #tx-wallet #tx-category #tx-destination #tx-receipt
#tx-receipts-list #all-transactions #transaction-keyword-filter #apply-transaction-filter #recent-transactions #wallet-form
#wallet-name #wallet-type #wallet-currency #wallet-opening-balance #open-wallet #all-wallets #wallet-preview
#wallet-detail-modal #category-form #category-name #category-type #open-category #budget-form #budget-name #budget-amount
#budget-category #budget-list #open-budget #goal-form #goal-name #goal-target #goal-list #open-goal #contribution-form
#recurring-form #bill-form #tag-form #household-form #report-currencies #reconciliation-list #export-csv #notification-btn
#notification-drawer #read-all-notifications #profile-modal #profile-form #password-form #session-list #assistant-form
#assistant-question #assistant-history #agent-consent #agent-toolbar #agent-conversation #toast #logout-btn #mobile-add-transaction`

Sau mỗi bước, chạy: `npx tsc -p web/tsconfig.json`, `npx eslint web/src`, `npx prettier --check web/src`,
`npx vitest run --config web/vitest.config.mts`. Cuối cùng chạy `npm run test:ui` (cần API + Postgres đang chạy, đặt
`E2E_BASE_URL=http://localhost:5173`). Test nào phải sửa vì giao diện đổi chủ ý thì sửa và liệt kê trong báo cáo.

Ghi chú môi trường Windows: file làm việc có xuống dòng CRLF còn `.prettierrc.json` yêu cầu LF. Chạy
`npx prettier --write` trên file đã sửa trước khi commit; git tự chuẩn hóa.

## 10. Thứ tự làm (mỗi bước xong là một commit riêng, chạy bộ kiểm tra ở mục 9)

1. **Sửa dở dang.** Khối KPI hiện tại trên điện thoại hiện ba cột và một ô xám trống vì quy tắc `@media (max-width: 1100px)`
   đè quy tắc 760px (xem `.kpi-strip` trong `features.css`); mục này sẽ bị thay bởi bước 3 nên chỉ cần đảm bảo không hỏng khi
   làm tiếp. Hoàn tất mục 7 (biên dịch được). Kiểm tra chế độ tối ở mọi màn đang có.
2. **Vỏ và điều hướng**: hook `useIsPhone`, `DesktopShell`, `PhoneShell`, bốn mục (mục 4), thanh tab dưới đáy, `navigation.ts`.
3. **Viên màu danh mục**: biến màu, `CategoryChip`, hàm ánh xạ màu (mục 4.3) và test.
4. **Tổng quan** (mục 5): `safeToSpendToday` + test, đường chi tiêu, vòng ngân sách, chọn tháng, gộp Báo cáo thành tab Phân tích.
5. **Giao dịch và ghi nhanh** (mục 6): `parseQuickEntry` + test, danh sách gom ngày, vuốt trên điện thoại, chip lặp lại.
6. **Kế hoạch và Thiết lập** (mục 8), gộp Định kỳ và Hóa đơn.
7. **Ô chat nổi** hoàn chỉnh (mục 7) nếu chưa xong ở bước 1.
8. **Rà soát**: chụp ảnh ở 1440, 768, 390px, cả sáng và tối, tất cả màn; sửa lỗi lệch, tràn, trống; chạy `npm run test:ui`.

Có thể dùng skill `design-taste-frontend` và công cụ `inspect.mjs --app` nếu có, chỉ để kiểm tra các quy tắc ở mục 3; không phải
để chọn lại phong cách.

## 11. Báo cáo cuối cần có

- Danh sách file đã thêm, sửa, xóa.
- Test nào phải sửa và vì sao.
- Quyết định tự đưa ra ở những chỗ đặc tả chưa nói rõ.
- Ảnh chụp trước/sau cho: Tổng quan, Giao dịch, Kế hoạch, Thiết lập; máy tính và điện thoại; sáng và tối.
- Những gì chưa làm hoặc chưa kiểm tra, nói thẳng.
