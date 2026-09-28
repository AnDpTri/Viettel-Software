# Thiết kế Agent tài chính Sổ Mộc

## Mục tiêu

Agent hoạt động trong một khung chat duy nhất, nói chuyện tự nhiên nhưng có thể thực hiện nghiệp vụ thật. Ngôn ngữ tự nhiên do mô hình xử lý; quyền truy cập, kiểm tra sở hữu, xác nhận và hoàn tác được backend cưỡng chế, không phụ thuộc system prompt.

## Luồng xử lý

1. Lưu câu người dùng trước khi gọi mô hình để không mất lịch sử khi AI hoặc công cụ lỗi.
2. Tải tối đa 20 tin không lỗi gần nhất, tóm tắt hội thoại và tối đa 20 ghi nhớ còn hiệu lực.
3. Gửi ngữ cảnh tối thiểu cùng khai báo công cụ native cho DeepSeek/OpenAI. Mô hình tự quyết định trả lời trực tiếp hoặc gọi công cụ; backend không phân loại chào hỏi hay ý định bằng regex.
4. Bộ điều phối thực hiện tối đa 4 vòng model–tool và 10 lời gọi công cụ. Kết quả hoặc lỗi validation của công cụ được trả lại cho mô hình để tự sửa đối số hoặc hỏi thêm tự nhiên.
5. Công cụ đọc, lịch sử, bộ nhớ, xuất dữ liệu và xem trước reset chạy ngay. Công cụ thay đổi dữ liệu tài chính chỉ tạo `AgentAction` chờ xác nhận trong 30 phút.
6. Khi xác nhận, backend kiểm tra lại người dùng sở hữu dữ liệu, thực thi trong transaction và lưu `undoData`.
7. Tin nhắn được lưu với trạng thái `PROCESSING`, `COMPLETED` hoặc `FAILED`; lần thử, lý do kết thúc và mã yêu cầu nhà cung cấp được lưu để chẩn đoán/thử lại.
8. Kết quả, lỗi nhà cung cấp và thao tác xác nhận/hủy/hoàn tác đều được audit mà không ghi secret.

## Năng lực đã triển khai

- Hội thoại tự nhiên: chào hỏi, trao đổi thông thường, hỏi khả năng, nhớ/quên dài hạn, đọc lại lịch sử, tóm tắt hội thoại dài và thử lại tin thất bại.
- Giao dịch: tìm kiếm, tạo, sửa, xóa mềm, chuyển khoản, phân loại hàng loạt và xuất CSV.
- Ví và danh mục: tạo, sửa, lưu trữ; đối soát ví bằng giao dịch điều chỉnh có xem trước.
- Ngân sách: tạo, sửa, xóa mềm.
- Mục tiêu: tạo, sửa, đóng góp, tạm dừng/tiếp tục, xóa mềm.
- Hóa đơn và định kỳ: xem hóa đơn đến hạn, tạo/thanh toán hóa đơn, tạo giao dịch định kỳ.
- Tự động hóa: tạo quy tắc phân loại dựa trên ghi chú, người nhận, tham chiếu hoặc số tiền.
- Báo cáo: tổng hợp dòng tiền theo khoảng ngày, tạo liên kết CSV có xác thực và xuất bản sao dữ liệu JSON.
- An toàn dữ liệu: xem trước phạm vi làm lại dữ liệu mà không xóa; mọi thao tác ghi tài chính vẫn chờ xác nhận.

## An toàn và riêng tư

- Không có công cụ nào được phép truy cập dữ liệu ngoài `userId` của phiên đăng nhập.
- Công cụ ghi dữ liệu luôn cần xác nhận; thao tác xóa/lưu trữ được đánh dấu rủi ro cao.
- Không gửi secret, token, mật khẩu, email hoặc số điện thoại hồ sơ cho nhà cung cấp AI. Nội dung và ghi chú do người dùng chủ động nhập được xử lý trung lập, kể cả khi có thông tin cá nhân nhạy cảm.
- Kết quả AI chỉ là đề xuất. Zod và quy tắc nghiệp vụ kiểm tra lại toàn bộ đối số tại backend.
- Lời gọi công cụ trùng trong cùng một request được tái sử dụng kết quả, tránh tạo nhiều bản xem trước ngoài ý muốn.
- CSV được tải bằng `fetch` có Bearer token; không đặt access token trong URL.

## Bộ nhớ

- Lịch sử đầy đủ nằm trong PostgreSQL và gắn với từng cuộc trò chuyện.
- Cửa sổ ngữ cảnh dùng 20 tin gần nhất, sắp xếp ổn định theo thời gian và ID.
- Mỗi 10 tin sau mốc 20, hệ thống cập nhật tóm tắt hội thoại.
- Ghi nhớ dài hạn do mô hình tạo qua công cụ khi người dùng yêu cầu, có API xem/xóa và chống tạo bản sao trùng nội dung.

## Giới hạn có chủ đích

- Chưa streaming token; phản hồi xuất hiện khi mô hình hoàn tất.
- Agent chưa tự thực hiện thao tác bảo mật tài khoản, mời thành viên gia đình hoặc xóa tài khoản.
- Import CSV và đọc ảnh hóa đơn vẫn dùng luồng chuyên biệt để người dùng kiểm tra dữ liệu trước khi tạo giao dịch.
