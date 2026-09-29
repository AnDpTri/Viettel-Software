import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';
import { logger } from '../observability/logger';

export async function audit(
  req: Request,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  const stored = await prisma.auditLog
    .create({
      data: {
        userId: req.user?.id,
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
        userId: req.user?.id ?? null,
        username: req.user?.username ?? null,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadataFields: metadata ? Object.keys(metadata).sort() : []
      },
      'audit'
    );
  }
}
