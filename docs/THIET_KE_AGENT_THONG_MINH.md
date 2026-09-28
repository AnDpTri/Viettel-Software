# Thiết kế Agent tài chính Sổ Mộc

## Mục tiêu

Agent hoạt động trong một khung chat duy nhất, nói chuyện tự nhiên nhưng có thể thực hiện nghiệp vụ thật. Ngôn ngữ tự nhiên do mô hình xử lý; quyền truy cập, kiểm tra sở hữu, xác nhận và hoàn tác được backend cưỡng chế, không phụ thuộc system prompt.

## Luồng xử lý

1. Lưu câu người dùng trước khi gọi mô hình để không mất lịch sử khi AI hoặc công cụ lỗi.
2. Bộ điều phối cục bộ xử lý chào hỏi, giới thiệu khả năng, nhắc lại hội thoại, nhớ và quên.
3. Tải tối đa 20 tin gần nhất, tóm tắt hội thoại và tối đa 20 ghi nhớ còn hiệu lực.
4. Chọn nhóm công cụ liên quan đến câu hỏi, rồi gửi prompt ngắn cùng ngữ cảnh cần thiết.
5. Công cụ chỉ đọc chạy ngay. Công cụ thay đổi dữ liệu tạo `AgentAction` chờ xác nhận trong 30 phút.
6. Khi xác nhận, backend kiểm tra lại người dùng sở hữu dữ liệu, thực thi trong transaction và lưu `undoData`.
7. Kết quả, lỗi fallback và thao tác xác nhận/hủy/hoàn tác đều được audit.

## Năng lực đã triển khai

- Hội thoại: chào hỏi, hỏi khả năng, nhớ/quên dài hạn, nhắc lại chính xác lịch sử, tóm tắt hội thoại dài.
- Giao dịch: tìm kiếm, tạo, sửa, xóa mềm, chuyển khoản, phân loại hàng loạt và xuất CSV.
- Ví và danh mục: tạo, sửa, lưu trữ; đối soát ví bằng giao dịch điều chỉnh có xem trước.
- Ngân sách: tạo, sửa, xóa mềm.
- Mục tiêu: tạo, sửa, đóng góp, tạm dừng/tiếp tục, xóa mềm.
- Hóa đơn và định kỳ: xem hóa đơn đến hạn, tạo/thanh toán hóa đơn, tạo giao dịch định kỳ.
- Tự động hóa: tạo quy tắc phân loại dựa trên ghi chú, người nhận, tham chiếu hoặc số tiền.
- Báo cáo: tổng hợp dòng tiền theo khoảng ngày và tạo liên kết CSV có xác thực.

## An toàn và riêng tư

- Không có công cụ nào được phép truy cập dữ liệu ngoài `userId` của phiên đăng nhập.
- Công cụ ghi dữ liệu luôn cần xác nhận; thao tác xóa/lưu trữ được đánh dấu rủi ro cao.
- Không gửi secret, token, mật khẩu, email hoặc số điện thoại cho nhà cung cấp AI.
- Kết quả AI chỉ là đề xuất. Zod và quy tắc nghiệp vụ kiểm tra lại toàn bộ đối số tại backend.
- Nếu câu trả lời đang hỏi bổ sung, backend loại bỏ action để tránh tình trạng vừa hỏi vừa âm thầm chuẩn bị thao tác.
- CSV được tải bằng `fetch` có Bearer token; không đặt access token trong URL.

## Bộ nhớ

- Lịch sử đầy đủ nằm trong PostgreSQL và gắn với từng cuộc trò chuyện.
- Cửa sổ ngữ cảnh dùng 20 tin gần nhất, sắp xếp ổn định theo thời gian và ID.
- Mỗi 10 tin sau mốc 20, hệ thống cập nhật tóm tắt hội thoại.
- Ghi nhớ dài hạn chỉ được tạo khi người dùng nói rõ “nhớ…”, có API xem và xóa.

## Giới hạn có chủ đích

- Chưa streaming token; phản hồi xuất hiện khi mô hình hoàn tất.
- Agent chưa tự thực hiện thao tác bảo mật tài khoản, mời thành viên gia đình hoặc xóa tài khoản.
- Import CSV và đọc ảnh hóa đơn vẫn dùng luồng chuyên biệt để người dùng kiểm tra dữ liệu trước khi tạo giao dịch.
