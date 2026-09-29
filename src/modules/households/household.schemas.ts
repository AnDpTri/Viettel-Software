import { z } from '../../core/http/zod';

export const householdInput = z.object({ name: z.string().trim().min(1).max(120) });
export const joinInput = z.object({ inviteCode: z.string().min(8).max(32) });
