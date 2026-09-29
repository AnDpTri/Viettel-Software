process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://finance:finance_secret@localhost:5432/personal_finance?schema=vitest';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.APP_URL = 'http://localhost:3000';
// Đặt rỗng trước khi config nạp dotenv: test không bao giờ dùng khóa AI hay SMTP thật trong .env của máy.
process.env.DEEPSEEK_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.BREVO_API_KEY = '';
process.env.MAIL_FROM = '';
process.env.MAIL_FROM_NAME = 'Sổ Mộc';
process.env.SMTP_FROM = 'no-reply@finance.local';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GITHUB_CLIENT_ID = 'test-github-client';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
