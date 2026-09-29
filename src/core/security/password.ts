import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

/** Băm mật khẩu bằng bcrypt cost 12; không bao giờ lưu mật khẩu dạng rõ. */
export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password: string, passwordHash: string) => bcrypt.compare(password, passwordHash);
