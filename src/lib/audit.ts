import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function audit(req: Request, action: string, entityType?: string, entityId?: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog.create({ data: {
    userId: req.user?.id,
    action,
    entityType,
    entityId,
    ipAddress: req.ip?.slice(0, 64),
    userAgent: req.get('user-agent')?.slice(0, 500),
    metadata: metadata as Prisma.InputJsonValue | undefined
  } }).catch(() => undefined);
}
