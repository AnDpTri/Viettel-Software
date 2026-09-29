import { z } from '../../core/http/zod';

export const deleteAccountInput = z.object({ confirmation: z.literal('XOA TAI KHOAN') });
