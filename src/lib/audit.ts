import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

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
  /* v8 ignore start -- console observability is verified by Docker integration */
  if (stored && process.env.NODE_ENV !== 'test') {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'audit',
        action,
        auditId: stored.id,
        userId: req.user?.id ?? null,
        username: req.user?.username ?? null,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadataFields: metadata ? Object.keys(metadata).sort() : []
      })
    );
  }
  /* v8 ignore stop */
}
