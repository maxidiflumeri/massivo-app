import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/auth/tenant-context';

/** 4.P — slug opaco URL-safe para webhooks. 18 bytes → 24 chars base64url. */
function generateWebhookSlug(): string {
  return `wbh_${randomBytes(18).toString('base64url')}`;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Regenera el webhookSlug de la org actual. Invalida la URL pública previa
   * de webhooks de WhatsApp; el usuario debe actualizarla en Meta tras rotar.
   */
  async regenerateWebhookSlug(): Promise<{ webhookSlug: string }> {
    const ctx = this.requireContext();
    const newSlug = generateWebhookSlug();

    const updated = await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { webhookSlug: newSlug },
      select: { webhookSlug: true },
    });

    this.logger.log(`webhookSlug regenerated for org ${ctx.organizationId}`);
    return { webhookSlug: updated.webhookSlug };
  }

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) throw new ForbiddenException('No hay contexto de tenant');
    return ctx;
  }
}
