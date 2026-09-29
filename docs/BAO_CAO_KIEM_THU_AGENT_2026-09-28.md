# Báo cáo kiểm thử Agent tài chính Sổ Mộc

> Cập nhật sau đợt nâng cấp: các mục GAP-01 đến GAP-04 bên dưới là hiện trạng tại lần kiểm tra ban đầu. Phần “Kết quả tái kiểm thử sau nâng cấp” ở cuối tài liệu ghi nhận trạng thái mới nhất.

- Thời điểm: 28/09/2026, múi giờ Asia/Saigon
- Phiên bản: `42174e3` (`feat: turn smart assistant into action agent`)
- Môi trường chính: Docker local, PostgreSQL 17, `http://localhost:3000`
- Nguyên tắc phiên kiểm thử: chỉ kiểm tra và ghi nhận; không sửa lỗi sau thời điểm người dùng yêu cầu dừng sửa.

## 1. Kết quả tự động

| Nhóm                  |     Kết quả |
| --------------------- | ----------: |
| Build TypeScript      |         Đạt |
| Unit test             |   49/49 đạt |
| Coverage statement    |      94,77% |
| Coverage branch       |      86,79% |
| Coverage function     |      94,73% |
| Coverage line         |      96,66% |
| API E2E               | 103/103 đạt |
| UI E2E                |   24/24 đạt |
| Agent E2E chuyên biệt |         Đạt |

Chuỗi Agent E2E đã kiểm tra: tạo bản nháp giao dịch → xác nhận → ghi dữ liệu → lưu hội thoại → hoàn tác.

## 2. Kiểm thử quyền hạn và trạng thái hành động

| Tình huống                                       | Kết quả                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Người dùng B đọc hội thoại của người dùng A      | Bị chặn với `NOT_FOUND`                                                                      |
| Người dùng B xác nhận hành động của người dùng A | Bị chặn với `NOT_FOUND`                                                                      |
| Xác nhận lại hành động đã thực hiện              | Bị chặn với `ACTION_NOT_PENDING`                                                             |
| Xác nhận hành động đã hủy                        | Bị chặn với `ACTION_NOT_PENDING`                                                             |
| Hoàn tác giao dịch Agent vừa tạo                 | Đạt, trạng thái `UNDONE`                                                                     |
| Giới hạn 6 yêu cầu/phút                          | Đạt; sau hai yêu cầu trước đó, bốn yêu cầu tiếp theo đạt và ba yêu cầu sau bị `RATE_LIMITED` |

Một lượt chạy thử đầu tiên không tạo được tài khoản do kịch bản thiếu email/số điện thoại. API trả `VALIDATION_ERROR` đúng thiết kế. Chạy lại với dữ liệu hợp lệ đã đạt; đây không được tính là lỗi sản phẩm.

## 3. AI, consent và ảnh hóa đơn

- Tài khoản thử mới chưa consent sử dụng chế độ nội bộ, không gửi dữ liệu sang AI bên ngoài.
- Sau khi consent, phản hồi sử dụng `deepseek` / `deepseek-flash`, không phát sinh hành động ngoài yêu cầu trò chuyện.
- Thu hồi/cấp consent có audit log.
- Endpoint đọc ảnh trả HTTP 200, nhận diện được số tiền và confidence `0.9` trên ảnh kiểm tra giao diện có chứa thông tin giao dịch.
- Chưa dùng bộ ảnh hóa đơn thực tế đa dạng, nên chưa thể kết luận độ chính xác OCR ngoài mẫu vừa thử.

## 4. Kiểm tra log

Trong log container của phiên kiểm thử:

- `secret_hits=0`: không tìm thấy chuỗi khóa dạng `sk-*`, bearer token hoặc mật khẩu thử.
- `error_hits=0`: không tìm thấy `INTERNAL_ERROR`, lỗi Prisma chưa xử lý hoặc lỗi runtime mức error.
- Ghi nhận 10 audit event liên quan Agent/AI trong phạm vi log được quét, gồm thực hiện, hủy, hoàn tác, gọi AI và đọc ảnh.
- Log HTTP chỉ ghi tên trường đầu vào, không ghi giá trị mật khẩu/token.

## 5. Giao diện

- Mục Trợ lý thông minh chỉ hiển thị một khung Agent.
- Có danh sách hội thoại, tạo mới và xóa hội thoại.
- Có thông báo consent AI.
- Có gửi ảnh hóa đơn.
- Có thẻ xem trước hành động, nút xác nhận, hủy và hoàn tác.
- Hội thoại và hành động được lưu lại sau khi tải lại.
- UI E2E không ghi nhận lỗi JavaScript hoặc request trình duyệt.

Ảnh kiểm tra: `test-results/ui/03c-agent-desktop.png`.

## 6. Các khoảng trống ghi nhận, chưa sửa

### GAP-01 — Bộ công cụ Agent mới hỗ trợ nhóm tạo dữ liệu

Hiện Agent có các tool:

- Tạo giao dịch thu/chi.
- Tạo ví.
- Tạo danh mục.
- Tạo ngân sách.
- Tạo mục tiêu.

Chưa có tool thao tác thật cho sửa/xóa hàng loạt, chuyển khoản, chia giao dịch, giao dịch định kỳ, hóa đơn, đối soát, xuất báo cáo, quy tắc tự động, nhãn, đơn vị giao dịch hoặc nhóm gia đình. Agent vẫn có thể phân tích/trò chuyện về dữ liệu này nhưng chưa làm hộ toàn bộ các thao tác nói trên.

### GAP-02 — Hoàn tác chỉ bao phủ tài nguyên do Agent vừa tạo

Chưa có snapshot/diff tổng quát để hoàn tác cập nhật hàng loạt hoặc thay đổi phức tạp. Các hành động tạo mới hiện được hoàn tác bằng xóa mềm hoặc lưu trữ.

### GAP-03 — Chưa kiểm thử biên quota ngày

Rate limit theo phút đã kiểm tra. Quota 30 lượt AI/ngày chưa được chạy đủ đến biên để tránh tiêu tốn API không cần thiết.

### GAP-04 — OCR chưa có bộ dữ liệu đánh giá chuẩn

Luồng kỹ thuật ảnh hóa đơn hoạt động, nhưng chưa có bộ ảnh thật kèm nhãn chuẩn để đo precision/recall cho cửa hàng, tổng tiền, ngày và từng mặt hàng.

### GAP-05 — Chưa có streaming

Giao diện hiển thị trạng thái “đang suy nghĩ”, nhưng phản hồi AI chỉ xuất hiện sau khi hoàn tất, chưa truyền từng phần theo thời gian thực.

### GAP-06 — Hành động nhạy cảm chưa được triển khai

Chưa có tool xóa tài khoản, thay đổi bảo mật, chuyển tiền thật hoặc thao tác ngân hàng. Vì vậy cơ chế xác nhận mạnh/nhập lại mật khẩu cho các hành động đó chưa có tình huống để kiểm thử.

## 7. Trạng thái GitHub và production

- Commit `42174e3` đã được đẩy lên `main`.
- GitHub Actions CI hoàn tất với kết luận `success`.
- Production `https://so-moc-finance.onrender.com` trả health `UP`.
- Tại thời điểm kiểm tra, `app.js` production chưa chứa marker `setupAgentShell`; production vẫn đang phục vụ bundle cũ hoặc Render chưa hoàn tất triển khai commit mới.
- Theo yêu cầu “chưa sửa”, chưa thực hiện can thiệp cấu hình hoặc redeploy thủ công trên Render.

## 8. Kết luận tạm thời

Phần Agent đã triển khai hiện tại đạt các kiểm thử local về hội thoại, tạo giao dịch có xác nhận, lưu lịch sử, phân quyền, hủy, hoàn tác, rate limit, consent, gọi DeepSeek và nhận ảnh. Không ghi nhận lỗi runtime trong log kiểm thử. Tuy nhiên phạm vi tool vẫn chưa bao phủ toàn bộ danh sách chức năng Agent đã thống nhất và production chưa xác nhận chạy bundle mới tại thời điểm lập báo cáo.

## 8. Kết quả tái kiểm thử sau nâng cấp

Ngày tái kiểm thử: 28/09/2026.

- GAP-01 đã xử lý: tool registry tăng từ 5 công cụ tạo dữ liệu lên 28 công cụ đọc/ghi, bao phủ giao dịch, chuyển khoản, phân loại hàng loạt, ví, danh mục, ngân sách, mục tiêu, hóa đơn, định kỳ, quy tắc tự động, đối soát, tìm kiếm, tổng hợp và CSV.
- GAP-02 đã xử lý phần nghiệp vụ agent: hoàn tác hỗ trợ tạo mới, sửa, xóa mềm/lưu trữ, phân loại hàng loạt, đóng góp mục tiêu và thanh toán hóa đơn.
- GAP-03 đã xử lý: nội dung rỗng được ghi log và thử lại một lần; mọi lượt xử lý đều tạo audit với trạng thái thành công/fallback.
- GAP-04 đã xử lý: lịch sử được lấy tối đa 20 tin với thứ tự ổn định, có tóm tắt hội thoại và bộ nhớ dài hạn do người dùng chủ động tạo/xóa.
- Câu chào, hỏi khả năng, nhắc lại lịch sử, nhớ và quên được xử lý cục bộ; không còn tự động trả báo cáo 6 tháng.
- Lỗi thiếu ví/danh mục hoặc thiếu trường bắt buộc được trả thành câu hỏi làm rõ trong chat, không làm mất tin nhắn người dùng.
- UI có nút tải CSV qua request kèm Bearer token, không đặt token trong URL.

Kết quả tự động sau nâng cấp: 49 unit test, 103 API E2E, 24 UI E2E và chuỗi Agent E2E (hội thoại tự nhiên → nhớ → nhắc lịch sử → tạo bản nháp → xác nhận → hoàn tác) đều đạt. Kiểm tra trực tiếp qua DeepSeek cũng đạt với `SEARCH_TRANSACTIONS`, `EXPORT_TRANSACTIONS_CSV` và tải file có xác thực, `CREATE_BILL`, `UPDATE_TRANSACTION`, `DELETE_TRANSACTION` rủi ro cao, xác nhận và hoàn tác. Yêu cầu tạo giao dịch thiếu ví trả HTTP 200 kèm câu hỏi làm rõ và không sinh action. Không ghi nhận lỗi runtime mới trong log.

## Cập nhật hướng dẫn người mới và UI/UX

- Agent hiện có 39 công cụ native, bổ sung đọc tiến độ onboarding, danh sách ví, danh mục, hướng dẫn màn hình và tạo bộ danh mục khởi đầu có xác nhận.
- UI và Agent dùng chung trạng thái bốn bước; tài khoản mới không còn tự sinh dữ liệu tài chính. Người dùng có thể bỏ qua, tiếp tục hoặc mở lại hướng dẫn.
- Bổ sung trung tâm trợ giúp, điều hướng theo URL, biểu đồ báo cáo, tab tự động hóa, form giao dịch rút gọn, nút ghi nhanh mobile và tên thiết bị đăng nhập dễ hiểu hơn.
- Kiểm thử cuối: 60/60 unit test, coverage dòng 96,74%; 108/108 API E2E; 24/24 UI E2E; Agent E2E đạt. Không ghi nhận log mức `warn` hoặc `error` sau lượt kiểm thử cuối.

Giới hạn còn lại: phản hồi chưa streaming; import CSV, ảnh hóa đơn, chia giao dịch, quản lý nhãn/merchant, tài khoản và nhóm gia đình tiếp tục dùng màn hình/luồng chuyên biệt thay vì cho agent tự thao tác trực tiếp. Đây là giới hạn an toàn/phạm vi, không phải lỗi chức năng hiện hữu.
