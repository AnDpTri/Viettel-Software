# Sổ Mộc — Hệ thống sổ thu chi cá nhân (TASK_00030)

- **Giai đoạn:** Giai đoạn 2, đào tạo kiến thức nghiệp vụ
- **Người thực hiện:** Đặng Hoàng An

Sổ Mộc là ứng dụng web giúp một người ghi chép thu chi, quản lý nhiều ví, đặt ngân sách và mục tiêu tiết kiệm, xem báo cáo, và giao việc cho trợ lý AI bằng tiếng Việt. Mọi thay đổi do AI đề xuất đều hiện bản xem trước để người dùng xác nhận, và có thể hoàn tác.

## 1. Đường dẫn chính

| Nội dung                        | Đường dẫn                                                            |
| ------------------------------- | -------------------------------------------------------------------- |
| Mã nguồn (GitHub)               | https://github.com/AnDpTri/Viettel-Software                          |
| Ứng dụng đang chạy (Render)     | https://so-moc-finance.onrender.com                                  |
| Tài liệu API (Swagger UI)       | https://so-moc-finance.onrender.com/api-docs                         |
| Đặc tả OpenAPI dạng JSON        | https://so-moc-finance.onrender.com/api-docs.json                    |
| Kiểm tra tình trạng máy chủ     | https://so-moc-finance.onrender.com/health                           |
| CI (GitHub Actions)             | https://github.com/AnDpTri/Viettel-Software/actions/workflows/ci.yml |
| Pull request refactor kiến trúc | https://github.com/AnDpTri/Viettel-Software/pull/1                   |

> Bản Render dùng gói miễn phí nên máy chủ tự ngủ khi không có truy cập. Lần mở đầu tiên có thể mất khoảng 1 phút để khởi động lại, các lần sau chạy bình thường.

## 2. Tài khoản dùng thử

| Tên đăng nhập                    | Mật khẩu   | Ghi chú                                                                                                                                                   |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo` (hoặc `demo@example.com`) | `Demo@123` | Hạng VIP, dùng trợ lý AI không giới hạn lượt; có sẵn dữ liệu mẫu tháng 7–9/2026 (ví, giao dịch, ngân sách, mục tiêu, hóa đơn) và một hội thoại với Trợ lý |

Đây là tài khoản dùng chung nên không đổi được mật khẩu, email, số điện thoại và không xóa được. Để thử các chức năng đó (đổi mật khẩu, quên mật khẩu qua email, xóa tài khoản), anh/chị có thể đăng ký một tài khoản riêng ngay trên trang đăng nhập.

## 3. Tài liệu

| Tài liệu                                                                                                                       | Nội dung                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [README](https://github.com/AnDpTri/Viettel-Software/blob/main/README.md)                                                      | Môi trường, cách chạy bằng Docker và tại máy, biến cấu hình, tài khoản test, chuẩn API |
| [Thiết kế hệ thống](https://github.com/AnDpTri/Viettel-Software/blob/main/docs/THIET_KE_HE_THONG.md)                           | Kiến trúc, cấu trúc module, mô hình dữ liệu, bảo mật, triển khai                       |
| [Thiết kế Agent thông minh](https://github.com/AnDpTri/Viettel-Software/blob/main/docs/THIET_KE_AGENT_THONG_MINH.md)           | Cách trợ lý AI chọn công cụ, cơ chế xem trước, xác nhận và hoàn tác                    |
| [Đặc tả yêu cầu Onboarding và Agent (SRS)](https://github.com/AnDpTri/Viettel-Software/blob/main/docs/SRS_ONBOARDING_AGENT.md) | Yêu cầu có mã số, tiêu chí chấp nhận, bảng truy vết tới test                           |
| [Báo cáo kết quả](https://github.com/AnDpTri/Viettel-Software/blob/main/docs/BAO_CAO_KET_QUA.md)                               | Đối chiếu từng yêu cầu của đề bài với phần đã làm                                      |
| [Báo cáo kiểm thử Agent](https://github.com/AnDpTri/Viettel-Software/blob/main/docs/BAO_CAO_KIEM_THU_AGENT_2026-09-28.md)      | Kết quả kiểm thử trợ lý AI với nhà cung cấp AI thật                                    |

## 4. Chức năng

- **Tài khoản:** đăng ký, đăng nhập bằng tên đăng nhập hoặc email, ghi nhớ đăng nhập, quản lý phiên trên nhiều thiết bị, quên và đặt lại mật khẩu qua email, xác minh email, đăng nhập Google/GitHub (khi máy chủ có cấu hình).
- **Sổ thu chi:** ví (tiền mặt, ngân hàng, ví điện tử, thẻ tín dụng), danh mục dạng cây, giao dịch thu/chi/chuyển khoản, lọc và tìm kiếm, xuất CSV, đính kèm ảnh/PDF hóa đơn.
- **Kế hoạch:** ngân sách theo kỳ, mục tiêu tiết kiệm (góp tiền từ ví thật), giao dịch định kỳ, nhắc hóa đơn, nhãn, nhóm gia đình.
- **Báo cáo:** tổng hợp thu chi theo kỳ, theo tháng, theo danh mục; đối soát số dư từng ví; tải CSV.
- **Trợ lý AI:** hỏi đáp và giao việc bằng tiếng Việt (ví dụ "ghi 50k cà phê sáng nay"), đọc ảnh hóa đơn, ghi nhớ sở thích. Thay đổi dữ liệu luôn qua bản xem trước, xác nhận một lần cho cả nhóm và hoàn tác được.
- **Người dùng mới:** chuỗi thiết lập ban đầu (ví, nhóm thu chi, giao dịch đầu tiên) và hướng dẫn tại chỗ cho từng màn hình.

## 5. Công nghệ và kiến trúc

| Phần         | Công nghệ                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Backend      | Node.js 22, TypeScript, Express 4, Prisma 6, PostgreSQL 17, Zod 3, JWT + refresh token xoay vòng     |
| Giao diện    | React 19 + TypeScript + Vite, TanStack Query; SPA phục vụ tĩnh từ cùng máy chủ; PWA; sáng/tối        |
| Tài liệu API | OpenAPI 3 sinh tự động từ route và schema Zod                                                        |
| Kiểm thử     | Vitest + Supertest trên PostgreSQL thật, Playwright cho kiểm thử giao diện                           |
| Vận hành     | Docker nhiều stage, docker-compose (API + PostgreSQL + Mailpit), GitHub Actions, Render, email Brevo |

Backend theo kiến trúc module nhiều lớp. Mỗi nghiệp vụ nằm trong `src/modules/<tên>`, gồm schema (kiểm tra dữ liệu vào), controller (HTTP), service (quy tắc nghiệp vụ) và repository (truy cập database). Các phụ thuộc được nối qua constructor tại một điểm duy nhất là `src/container.ts`. Hạ tầng dùng chung nằm trong `src/core`: cấu hình, xử lý lỗi, bảo mật, log có cấu trúc, audit, email.

Xem nhanh trên GitHub:

- [`src/modules`](https://github.com/AnDpTri/Viettel-Software/tree/main/src/modules): các module nghiệp vụ.
- [`src/modules/agent`](https://github.com/AnDpTri/Viettel-Software/tree/main/src/modules/agent): trợ lý AI và bảng công cụ.
- [`prisma/schema.prisma`](https://github.com/AnDpTri/Viettel-Software/blob/main/prisma/schema.prisma): mô hình dữ liệu.
- [`web/src`](https://github.com/AnDpTri/Viettel-Software/tree/main/web/src): giao diện.
- [`tests`](https://github.com/AnDpTri/Viettel-Software/tree/main/tests): unit test và test API.

## 6. Kiểm thử

| Loại                                     | Kết quả gần nhất                                                      |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Unit test và test API                    | 158/158 đạt; coverage toàn bộ `src`: statements 97,6%, branches 87,2% |
| Kiểm thử đầu cuối API                    | 119/119 luồng đạt                                                     |
| Kiểm thử trợ lý AI với nhà cung cấp thật | 4/4 kịch bản đạt                                                      |
| Kiểm thử giao diện (desktop và mobile)   | 25/25 hành trình đạt, không có lỗi JavaScript                         |
| Unit test giao diện React                | 17/17 đạt (hiển thị Markdown an toàn, tự làm mới phiên, thành phần)   |

CI trên GitHub Actions tự chạy lint, kiểm tra định dạng, build, toàn bộ bộ test ở trên và build Docker image mỗi khi có thay đổi vào nhánh `main`.

## 7. Chạy tại máy

Cần Docker (có Docker Compose v2):

```bash
git clone https://github.com/AnDpTri/Viettel-Software.git
cd Viettel-Software
docker compose up --build
```

Sau khi khởi động xong:

- Giao diện: http://localhost:3000
- Swagger UI: http://localhost:3000/api-docs
- Hộp thư nhận email hệ thống (Mailpit): http://localhost:8025

Tài khoản demo được tạo sẵn như mục 2. Cách chạy không dùng Docker và danh sách biến cấu hình xem trong [README](https://github.com/AnDpTri/Viettel-Software/blob/main/README.md).

## 8. Hạn chế đã biết

- **Trợ lý AI:** cần máy chủ có khóa nhà cung cấp AI (DeepSeek hoặc OpenAI). Bản Render đã cấu hình sẵn.
- **Email:** gửi qua Brevo gói miễn phí, tối đa 300 thư mỗi ngày. Thư có thể rơi vào mục Spam.
