import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';
import { logger } from '../observability/logger';

export async function audit(
  req: Request,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  /** Người thực hiện khi request chưa có `req.user` (ví dụ ngay sau đăng ký, đăng nhập, quên mật khẩu). */
  actor?: { id: string; username: string }
) {
  const user = actor ?? req.user;
  const stored = await prisma.auditLog
    .create({
      data: {
        userId: user?.id,
        action,
        entityType,
        entityId,
        ipAddress: req.ip?.slice(0, 64),
        userAgent: req.get('user-agent')?.slice(0, 500),
        metadata: metadata as Prisma.InputJsonValue | undefined
      }
    })
    .catch(() => undefined);
  if (stored) {
    logger.info(
      {
        event: 'audit',
        action,
        auditId: stored.id,
        userId: user?.id ?? null,
        username: user?.username ?? null,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadataFields: metadata ? Object.keys(metadata).sort() : []
      },
      'audit'
    );
  }
}
