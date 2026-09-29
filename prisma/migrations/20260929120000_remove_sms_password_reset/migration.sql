-- Bỏ khôi phục mật khẩu qua SMS (tùy chọn trong đề bài); chỉ còn liên kết qua email.
DELETE FROM "password_reset_tokens" WHERE "channel" = 'SMS';
ALTER TABLE "password_reset_tokens" DROP COLUMN "channel", DROP COLUMN "attempts";
