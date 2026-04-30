import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestContext } from '@massivo/shared-types';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TrackingTokenService } from '../tracking/tracking-token.service';
import { SuppressionService } from './suppression.service';

const HTML_OK = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Desuscripción confirmada</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 16px;color:#222}h1{font-size:1.4rem}</style>
</head><body><h1>Desuscripción confirmada</h1><p>No volverás a recibir estos emails.</p></body></html>`;

const HTML_ERR = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Desuscripción</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 16px;color:#222}h1{font-size:1.4rem}</style>
</head><body><h1>Desuscripción</h1><p>Si el problema persiste, contactá al remitente directamente.</p></body></html>`;

/**
 * Endpoint público de unsubscribe. Sin Clerk: resuelve tenant del JWT del query.
 *
 * Como /track/*, NO leakea validación: token inválido devuelve 200 con la misma
 * página de "OK" (no oráculo). Solo el side-effect (persistir EmailUnsubscribe)
 * varía según el resultado de verify.
 */
@Controller()
export class UnsubscribeController {
  private readonly logger = new Logger(UnsubscribeController.name);

  constructor(
    private readonly tokens: TrackingTokenService,
    private readonly suppression: SuppressionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('unsubscribe')
  async unsubscribe(
    @Query('t') token: string,
    @Query('scope') scopeRaw: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    try {
      const payload = this.tokens.verify(token);
      const scope = scopeRaw === 'campaign' ? 'CAMPAIGN' : 'GLOBAL';
      const ctx: RequestContext = {
        userId: 'system:unsubscribe',
        organizationId: payload.o,
        teamId: payload.t,
        orgRole: 'OWNER',
        teamRole: 'ADMIN',
      };
      await TenantContext.run(ctx, async () => {
        const report = await this.prisma.scoped.emailReport.findFirst({
          where: { id: payload.r },
          select: { contact: { select: { email: true } } },
        });
        if (!report) {
          this.logger.warn(`Unsubscribe: report ${payload.r} no encontrado en tenant`);
          return;
        }
        await this.suppression.addUnsubscribe({
          email: report.contact.email,
          scope,
          campaignId: scope === 'CAMPAIGN' ? payload.c : null,
          source: 'link',
          reason: req.headers['user-agent']?.toString().slice(0, 200),
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`unsubscribe token inválido: ${msg}`);
      res.status(200).end(HTML_ERR);
      return;
    }

    res.status(200).end(HTML_OK);
  }
}
